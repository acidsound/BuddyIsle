import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
try { await page.waitForSelector('#start.show', { timeout: 8000 }); await page.click('#start'); } catch (e) {}
await new Promise(r => setTimeout(r, 5000));
// count rAF over 2s
const frames = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  function cb() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(cb); else res(n); }
  requestAnimationFrame(cb);
}));
console.log('rAF in 2s:', frames, '| fps:', (frames / 2).toFixed(1));
await browser.close();
server.close();
