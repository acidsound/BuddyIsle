// DECISIVE TEST: is the world rendering at all under swiftshader, with post pipeline?
// Render the game, then evaluate the SCENE via G handle: project a known dino position
// to screen space, and read the pixel color AT that screen position from the compositor
// screenshot. If the pixel where pikachu should be is terrain-colored → model invisible.
// If black → whole render broken (swiftshader).
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

// teleport player next to a pikachu and face it
const info = await page.evaluate(() => {
  const G = window.G;
  const p = G.player.player;
  const target = G.dinos.dinos.find(d => d.species === 'pikachu' && !d.dead)
    || G.dinos.dinos.find(d => !d.dead && !d.tamed);
  // move player near it
  p.x = target.x + 6; p.z = target.z;
  p.y = G.world.heightAt(p.x, p.z);
  p.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  return { species: target.species, dist: Math.hypot(target.x - p.x, target.z - p.z).toFixed(1) };
});
console.log('teleported near:', JSON.stringify(info));
await new Promise(r => setTimeout(r, 800));

// screenshot the compositor and sample pixels around center where the creature should be
await new Promise(r => setTimeout(r, 300));
const shot = join(root, '.shots/facing.png');
await page.screenshot({ path: shot, timeout: 20000 });
console.log('[shot]', shot);

// also dump what materials are on that dino's meshes now
const mats = await page.evaluate(() => {
  const G = window.G;
  const t = G.dinos.dinos.find(d => !d.dead && !d.tamed);
  const out = [];
  t.rig.root.traverse(o => {
    if (o.isMesh) out.push({ type: o.type, mat: o.material?.type, color: o.material?.color ? '#' + o.material.color.getHexString() : null, vis: o.visible, kids: o.children.length });
  });
  return { species: t.species, meshes: out };
});
console.log(JSON.stringify(mats, null, 1));

await browser.close();
server.close();
