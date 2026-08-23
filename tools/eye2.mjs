// eye.mjs variant that CLICKS start, walks forward, and screenshots in-game (not title).
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

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  protocolTimeout: 60000,
  args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 150)));
await page.goto(base, { waitUntil: 'load', timeout: 30000 });
// click start
try {
  await page.waitForSelector('#start.show', { timeout: 8000 });
  await page.click('#start');
} catch (e) { console.log('[no start overlay]'); }
await new Promise(r => setTimeout(r, 9000));   // let world + GLBs settle
mkdirSync(join(root, '.shots'), { recursive: true });
await page.screenshot({ path: join(root, '.shots/ingame1.png'), timeout: 20000 });
// walk toward island center
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 2500));
await page.keyboard.up('KeyW');
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: join(root, '.shots/ingame2.png'), timeout: 20000 });
console.log('[errors]', errs.slice(0, 6));
console.log('[shots] ingame1.png ingame2.png');
await browser.close();
server.close();
