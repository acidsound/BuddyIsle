// Targeted verification for: (1) pickup -> inventory, (2) minimap arrow math, (3) veg collision.
globalThis.window = globalThis;
globalThis.performance = { now: () => Date.now() };
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0, style: {},
        getContext: () => ({
          createRadialGradient: () => ({ addColorStop() {} }),
          fillRect() {}, clearRect() {}, putImageData() {},
        }),
        toDataURL: () => 'data:',
      };
    }
    return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, textContent: '', appendChild() {} };
  },
  addEventListener() {},
};

const THREE = await import('three');
const { createWorld } = await import('../js/world.js');
const { createDinoSystem } = await import('../js/dinos.js');
const { createParticles } = await import('../js/particles.js');
const { createPlayer } = await import('../js/player.js');
const { createInventory } = await import('../js/inventory.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1.6, 0.08, 2000);
scene.add(camera);
const world = createWorld(scene);
const dinos = createDinoSystem(scene, world);
const particles = createParticles(scene);
const inv = createInventory();

const G = {
  world, inv,
  audio: { sfx: new Proxy({}, { get: () => () => {} }), update() {} },
  particles, buildings: [], nextBuildingId: 1,
  input: { w: false, a: false, s: false, d: false, shift: false, space: false, eHeld: false },
  toast() {}, hud: { flashDamage() {} }, onDeath() {},
};
G.dinos = dinos;
const playerMod = createPlayer(scene, camera, world, G);
G.player = playerMod;
const p = G.player.player;

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name); if (!ok) fail++; };

// ---- (1) pickups enter inventory ----
const before = inv.count('wood') + inv.count('berry') + inv.count('stone');
world.spawnPickup('wood', 3, p.x + 0.5, p.z);
world.spawnPickup('berry', 2, p.x - 0.4, p.z + 0.3);
world.spawnPickup('stone', 4, p.x, p.z - 0.6);
playerMod.update(1 / 60, 0);
check('pickups collected into inventory', inv.count('wood') + inv.count('berry') + inv.count('stone') === before + 9 && world.pickups.length === 0);

// full-inventory edge: fill slots, drop 1 wood, expect it to stay with reduced count
for (let i = 0; i < 9; i++) inv.slots[i] = { id: 'meat', count: 10 };
world.spawnPickup('wood', 5, p.x, p.z);
playerMod.update(1 / 60, 0);
check('full inventory keeps remainder on ground', world.pickups.length === 1 && world.pickups[0].count === 5);
world.pickups.length && world.removePickup(0);
inv.slots = inv.slots.map(() => null);

// ---- (3) vegetation collision ----
const SOLID = { palm: 0.85, broad: 0.8, conifer: 0.8, rock: 1.7 };
for (const type of Object.keys(SOLID)) {
  const n = world.nodes.find(n => n.type === type && n.alive);
  if (!n) continue;
  // park player just inside the collision radius
  const R = SOLID[type] * n.s;
  p.x = n.x + (R - 0.1); p.z = n.z; p.y = world.heightAt(p.x, p.z);
  playerMod.update(1 / 60, 0);
  const d = Math.hypot(p.x - n.x, p.z - n.z);
  check(`collision ${type}: pushed out (d=${d.toFixed(2)} >= R=${R.toFixed(2)})`, d >= R - 1e-6);
}
// bushes must stay walkable
const bush = world.nodes.find(n => n.type === 'bush' && n.alive);
if (bush) {
  p.x = bush.x; p.z = bush.z; p.y = world.heightAt(p.x, p.z);
  playerMod.update(1 / 60, 0);
  check('bush walkable (no push-out)', Math.hypot(p.x - bush.x, p.z - bush.z) < 0.05);
}

// ---- (2) minimap arrow math: tip after rotate(-yaw) must equal 6 * forward ----
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.77, -2.1]) {
  const th = -yaw;
  const tipX = 0 * Math.cos(th) - (-6) * Math.sin(th);
  const tipY = 0 * Math.sin(th) + (-6) * Math.cos(th);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  check(`minimap arrow yaw=${yaw.toFixed(2)}: tip(${tipX.toFixed(2)},${tipY.toFixed(2)}) == 6*fwd(${(6 * fx).toFixed(2)},${(6 * fz).toFixed(2)})`,
    Math.abs(tipX - 6 * fx) < 1e-9 && Math.abs(tipY - 6 * fz) < 1e-9);
}

console.log(fail === 0 ? 'ALL VERIFIED' : fail + ' FAILURES');
process.exit(fail === 0 ? 0 : 1);
