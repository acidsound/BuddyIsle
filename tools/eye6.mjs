// The scene graph says bulbasaur is IN the scene, 4m away, visible=true, hasGltf.
// But the screen is BLACK. Under swiftshader the whole world render was black even
// for vanilla — we established that. So screenshots can't tell us about MODELS.
//
// DIFFERENT ANGLE: count what the renderer actually DRAWS. Hook drawElements/
// drawElementsInstanced and count per-frame calls + vertices. If pokemon meshes are
// drawn (thousands of verts), rendering works and it's a visibility/culling issue.
// If near-zero draws, it's a render-pipeline issue.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
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

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 360 });
await page.evaluateOnNewDocument(() => {
  window.__stats = { draws: 0, tris: 0 };
  const wrap = (proto, name, triFn) => {
    const orig = proto[name];
    proto[name] = function (...a) {
      window.__stats.draws++;
      window.__stats.tris += triFn(this, a);
      return orig.apply(this, a);
    };
  };
  // drawElements(mode, count, type, offset): count/3 triangles per call
  wrap(WebGL2RenderingContext.prototype, 'drawElements', (ctx, a) => (a[1] || 0) / 3);
  wrap(WebGL2RenderingContext.prototype, 'drawArrays', (ctx, a) => (a[1] || 0) / 3);
});
await page.goto(base, { waitUntil: 'load', timeout: 30000 });
try { await page.waitForSelector('#start.show', { timeout: 8000 }); await page.click('#start'); } catch (e) {}
await new Promise(r => setTimeout(r, 4000));
const s1 = await page.evaluate(() => ({ ...window.__stats }));
await new Promise(r => setTimeout(r, 5000));
const s2 = await page.evaluate(() => ({ ...window.__stats }));
console.log('t+4s:', JSON.stringify(s1));
console.log('t+9s:', JSON.stringify(s2));
console.log('draws in last 5s:', s2.draws - s1.draws, '| tris:', s2.tris - s1.tris);
await browser.close();
server.close();
