// Fetch animated low-poly Pokémon GLBs from poly.pizza into assets/monsters/.
//
// Why: poly.pizza sits behind Cloudflare, which blocks datacenter IPs (our OCI box).
// Running this on a residential machine passes automatically — the script drives a REAL
// installed Chrome (not bundled Chromium), waits out any challenge, captures the .glb the
// site itself loads for the 3D preview, and saves it.
//
// Usage:
//   cd tools && npm i puppeteer-core && node fetch-pokemon.mjs            # all models
//   node fetch-pokemon.mjs pikachu charmander                            # subset by slug
//
// Output: ../assets/monsters/<slug>.glb  (committed back to the repo)

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'monsters');

// poly.pizza/m/<id> -> slug
const MODELS = {
  pikachu:    '9Apgj-wpfgb',
  charmander: 'd6Ar6_NHbgS',
  squirtle:   'b9AHRGUN8jM',
  bulbasaur:  'aQA7Ls8Y79f',
  snorlax:    '2Rocc4_ltUy',
  eevee:      '62QYyQZtnMl',
  jigglypuff: '7b534937-7e64-43c0-8dd8-3c54bb924334',
  mew:        '3riRBivJah7',
  haunter:    'e4shTQwFTFk',
  magikarp:   '5RqQmne01WF',
  magnemite:  '4ps4-cVyDax',
  pokeball:   '5XpesCyaPe-',
};

function findChrome() {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('Installed Chrome not found. Edit findChrome() paths.');
}

async function waitForChallenge(page, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const title = await page.title().catch(() => '');
    if (!/just a moment|attention required/i.test(title)) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function fetchModel(browser, slug, id) {
  const dest = path.join(OUT, `${slug}.glb`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
    console.log(`✓ ${slug}: already exists, skipping`);
    return true;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const captured = [];
  page.on('response', async res => {
    try {
      const url = res.url();
      if (/\.glb(\?|$)/i.test(url) && res.status() === 200) {
        const buf = await res.buffer();
        captured.push({ url, buf });
      }
    } catch { /* aborted previews etc */ }
  });

  console.log(`→ ${slug} (https://poly.pizza/m/${id})`);
  await page.goto(`https://poly.pizza/m/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!(await waitForChallenge(page))) {
    console.error(`  ✗ ${slug}: Cloudflare challenge did not clear`);
    await page.close();
    return false;
  }

  // The preview canvas loads the .glb directly — give it a moment, then nudge a download
  // click in case the preview is lazy.
  await new Promise(r => setTimeout(r, 6000));
  try {
    const clicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('a,button')];
      const el = els.find(e => /download/i.test(e.textContent) || /download/i.test(e.href || ''));
      if (el) { el.click(); return true; }
      return false;
    });
    if (clicked) await new Promise(r => setTimeout(r, 8000));
  } catch { /* ignore */ }

  // Fallback: harvest any anchor/static link and fetch it inside the page context
  if (captured.length === 0) {
    const link = await page.evaluate(async () => {
      const m = document.documentElement.innerHTML.match(/https:\/\/[^"'\s]+\.glb/i);
      if (!m) return null;
      const res = await fetch(m[0], { credentials: 'include' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    });
    if (link) captured.push({ url: '(page fetch)', buf: Buffer.from(link, 'base64') });
  }

  await page.close();
  if (captured.length === 0) {
    console.error(`  ✗ ${slug}: no .glb captured`);
    return false;
  }
  const best = captured.sort((a, b) => b.buf.length - a.buf.length)[0];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(dest, best.buf);
  console.log(`  ✓ saved ${dest} (${(best.buf.length / 1024).toFixed(0)} KB)`);
  return true;
}

const only = process.argv.slice(2);
const targets = only.length ? only.filter(s => MODELS[s]) : Object.keys(MODELS);
if (targets.length === 0) {
  console.error('No matching slugs. Available:', Object.keys(MODELS).join(', '));
  process.exit(1);
}

const browser = await puppeteer.launch({
  headless: false,                    // headed passes Cloudflare far more reliably
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 800 },
});

let ok = 0;
for (const slug of targets) {
  try {
    if (await fetchModel(browser, slug, MODELS[slug])) ok++;
  } catch (e) {
    console.error(`  ✗ ${slug}: ${e.message.slice(0, 120)}`);
  }
}
await browser.close();
console.log(`\nDone: ${ok}/${targets.length} saved to assets/monsters/`);
console.log('Next: git add assets/monsters && git commit && git push');
