// tools/eye.mjs — headless browser "eyes" for visual observation.
// Usage:
//   node tools/eye.mjs shot [out.png] [--t=5]      # screenshot after t seconds of gameplay
//   node tools/eye.mjs probe                       # dump WebGL/renderer info + game state
//   node tools/eye.mjs watch --frames=6            # burst screenshots over time
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// GPU backends to try, best-first. On macOS the only real-GPU ANGLE backend is
// "metal"; "gl" is unsupported there and can hard-crash (panic) the browser
// process. SwiftShader is the safe software fallback.
const GPU_PROFILES = [
  { name: 'gpu-metal', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] },
  { name: 'gpu-gl', args: ['--use-gl=angle', '--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] },
  { name: 'swiftshader', args: ['--enable-unsafe-swiftshader'] },
];
const COMMON_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--window-size=1280,720',
];

async function launchProfile(profile) {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 60000,
    args: [...profile.args, ...COMMON_ARGS],
    defaultViewport: { width: 1280, height: 720 },
  });
  // Verify the browser actually survived startup and WebGL works; a GPU panic
  // usually kills the process here or on first getContext call.
  const page = await browser.newPage();
  const ok = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  }).catch(() => false);
  if (!ok) { await browser.close().catch(() => {}); return null; }
  await page.close();
  return browser;
}

async function launch() {
  let lastErr;
  for (const profile of GPU_PROFILES) {
    try {
      const b = await launchProfile(profile);
      if (b) { console.error(`[gpu] using profile: ${profile.name}`); return b; }
      console.error(`[gpu] profile "${profile.name}" failed WebGL check, falling back...`);
    } catch (e) {
      lastErr = e;
      console.error(`[gpu] profile "${profile.name}" crashed: ${String(e.message).slice(0, 120)}`);
    }
  }
  throw new Error(`all GPU profiles failed${lastErr ? ': ' + lastErr.message : ''}`);
}

function arg(name, dflt) {
  const a = process.argv.find(s => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : dflt;
}
const posArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const cmd = posArgs[0] || 'shot';

// Never leave orphan chrome processes behind on unexpected exits.
let browser;
process.on('SIGINT', () => { browser?.close().catch(() => {}); process.exit(130); });
process.on('unhandledRejection', e => { console.error('[fatal]', e?.message || e); browser?.close().catch(() => {}); server.close(); process.exit(1); });

try {
  browser = await launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  page.on('error', () => { /* renderer gone (e.g. GPU crash) — don't throw */ });
  await page.goto(base, { waitUntil: 'load', timeout: 30000 });

  const waitSec = Number(arg('t', '4'));
  await new Promise(r => setTimeout(r, waitSec * 1000));

  const info = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl2: !!c.getContext('webgl2'),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null),
      title: document.title,
      hasCanvas: !!document.querySelector('canvas'),
      fpsText: document.body?.innerText?.match(/FPS[:\s]*[\d.]+/)?.[0] || null,
    };
  }).catch(e => ({ evalError: e.message }));
  console.log('[env]', JSON.stringify(info));
  console.log('[errors]', logs.filter(l => /error|PAGEERROR/i.test(l)).slice(0, 10));

  mkdirSync(join(root, '.shots'), { recursive: true });
  if (cmd === 'probe') {
    console.log('[console]', logs.slice(-20));
  } else if (cmd === 'watch') {
    const frames = Number(arg('frames', '6'));
    for (let i = 0; i < frames; i++) {
      const out = `.shots/frame-${String(i).padStart(2, '0')}.png`;
      await page.screenshot({ path: join(root, out), timeout: 20000 }).catch(e => console.error('[shot-fail]', e.message));
      console.log('[shot]', out);
      await new Promise(r => setTimeout(r, 1500));
    }
  } else {
    const out = posArgs[1] || '.shots/shot.png';
    await page.screenshot({ path: join(root, out), timeout: 20000 });
    console.log('[shot]', out);
  }
} finally {
  await browser?.close().catch(() => {});
  server.close();
}
