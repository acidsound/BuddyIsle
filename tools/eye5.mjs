// The pikachu was found but not VISIBLE on screen. Teleport + aim precisely,
// then check: 1) is the dino's root in the scene? 2) project its position to NDC.
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
await page.setViewport({ width: 960, height: 540 });
await page.goto(base, { waitUntil: 'load', timeout: 30000 });
try { await page.waitForSelector('#start.show', { timeout: 8000 }); await page.click('#start'); } catch (e) {}
await new Promise(r => setTimeout(r, 9000));

const info = await page.evaluate(() => {
  const G = window.G;
  const p = G.player.player;
  // find nearest non-tamed dino
  let target = null, bd = 1e9;
  for (const d of G.dinos.dinos) {
    if (d.dead) continue;
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (dist < bd) { bd = dist; target = d; }
  }
  if (!target) return { err: 'no dinos' };
  // teleport right in front of it
  p.x = target.x; p.z = target.z + 4;
  p.y = G.world.heightAt(p.x, p.z);
  p.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z)); // face it
  p.pitch = -0.15;
  // verify scene graph containment
  let inScene = false, sceneObj = G.scene;
  sceneObj.traverse(o => { if (o === target.rig.root) inScene = true; });
  const wp = target.rig.root.position.clone();
  return {
    species: target.species,
    playerDist: Math.hypot(target.x - p.x, target.z - p.z).toFixed(1),
    rigPos: { x: wp.x.toFixed(1), y: wp.y.toFixed(1), z: wp.z.toFixed(1) },
    terrainY: G.world.heightAt(target.x, target.z).toFixed(1),
    inScene,
    hasGltf: !!target.rig.gltfModel,
    meshCount: (() => { let n = 0; target.rig.root.traverse(o => { if (o.isMesh) n++; }); return n; })(),
    visibleFlag: target.rig.root.visible,
  };
});
console.log(JSON.stringify(info, null, 1));
await new Promise(r => setTimeout(r, 500));
const shot = join(root, '.shots/facing2.png');
await page.screenshot({ path: shot, timeout: 20000 });
console.log('[shot]', shot);
await browser.close();
server.close();
