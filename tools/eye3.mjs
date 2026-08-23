// The world renders BLACK under swiftshader (known). But we can still verify the SCENE GRAPH:
// hook into the game, count GLB models actually in the three scene vs procedural rigs.
// Also: force the post-pipeline off and readPixels is useless on swiftshader... 
// Instead: verify via scene graph introspection through window.G debug handle.
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
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 120)));
await page.goto(base, { waitUntil: 'load', timeout: 30000 });
try { await page.waitForSelector('#start.show', { timeout: 8000 }); await page.click('#start'); } catch (e) {}
await new Promise(r => setTimeout(r, 10000));

const report = await page.evaluate(() => {
  const G = window.G;
  if (!G) return { err: 'no window.G' };
  const counts = {};
  let glbRigs = 0, procRigs = 0;
  for (const d of G.dinos.dinos) {
    counts[d.species] = (counts[d.species] || 0) + 1;
    if (d.rig.gltfModel) glbRigs++; else procRigs++;
  }
  // count scene children by type
  const types = {};
  G.scene.traverse(o => { const t = o.type; types[t] = (types[t] || 0) + 1; });
  return { dinos: counts, glbRigs, procRigs, sceneObjects: Object.keys(types).length, groups: types.Group };
});
console.log(JSON.stringify(report, null, 1));
console.log('errors:', errs.slice(0, 5));
await browser.close();
server.close();
