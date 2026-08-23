// Hook ALL draw paths including instanced (vegetation uses InstancedMesh).
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
  window.__s = { draws: 0, tris: 0 };
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, tris) => {
    const orig = P[name];
    P[name] = function (...a) {
      window.__s.draws++;
      window.__s.tris += tris(this, a);
      return orig.apply(this, a);
    };
  };
  wrap('drawElements', (c, a) => (a[1] || 0) / 3);
  wrap('drawArrays', (c, a) => (a[1] || 0) / 3);
  wrap('drawElementsInstanced', (c, a) => ((a[1] || 0) / 3) * (a[4] || 1));
  wrap('drawArraysInstanced', (c, a) => ((a[1] || 0) / 3) * (a[4] || 1));
});
await page.goto(base, { waitUntil: 'load', timeout: 30000 });
try { await page.waitForSelector('#start.show', { timeout: 8000 }); await page.click('#start'); } catch (e) {}
await new Promise(r => setTimeout(r, 4000));
const s1 = await page.evaluate(() => ({ ...window.__s }));
await new Promise(r => setTimeout(r, 5000));
const s2 = await page.evaluate(() => ({ ...window.__s }));
console.log('t+4s:', JSON.stringify(s1));
console.log('t+9s:', JSON.stringify(s2));
console.log('last5s draws:', s2.draws - s1.draws, '| tris:', s2.tris - s1.tris);
await browser.close();
server.close();
