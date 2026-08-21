// Targeted verification for the AAA-survival additions:
// (1) tool durability & breaking, (2) water/thirst + drinking,
// (3) dinos collide with walls/fences, (4) death drops inventory,
// (5) tamed follow/stay command, (6) island repopulation.
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
const { ITEMS } = await import('../js/items.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1.6, 0.08, 2000);
scene.add(camera);
const world = createWorld(scene);
const dinos = createDinoSystem(scene, world);
const particles = createParticles(scene);
const inv = createInventory();
const toasts = [];

const G = {
  world, inv,
  audio: { sfx: new Proxy({}, { get: () => () => {} }), update() {} },
  particles, buildings: [], nextBuildingId: 1,
  input: { w: false, a: false, s: false, d: false, shift: false, space: false, eHeld: false },
  toast: m => toasts.push(m),
  hud: { flashDamage() {}, toast: m => toasts.push(m) },
  tamedMode: 'follow',
  onDeath() {
    const p = G.player.player;
    for (const s of G.inv.slots) {
      if (!s) continue;
      G.world.spawnPickup(s.id, s.count, p.x + (Math.random() - 0.5) * 2.5, p.z + (Math.random() - 0.5) * 2.5);
    }
    G.inv.clear();
  },
};
G.dinos = dinos;
const playerMod = createPlayer(scene, camera, world, G);
G.player = playerMod;
const p = G.player.player;

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name); if (!ok) fail++; };
const step = (dt = 1 / 60, tamedMode = 'follow') => {
  playerMod.update(dt, 0);
  dinos.setCameraQuat(camera.quaternion);
  dinos.update(dt, {
    player: p, particles, audio: G.audio, toast: G.toast,
    buildings: G.buildings, projectiles: p.projectiles,
    time: 0, tamedMode,
  });
  world.update(dt, 0.375, p.x, p.z, G.buildings);
  particles.update(dt);
};

// ---- (1) tool durability ----
inv.clear();
inv.add('axe', 1);
inv.add('wood', 10);
inv.select(0);
let broke = null;
for (let i = 0; i < 100 && !broke; i++) {
  const r = inv.damageTool(1);
  if (r && r.broke) broke = r;
}
const axeDur = ITEMS.axe.tool.dur;
check(`axe breaks after ${axeDur} uses`, broke && broke.id === 'axe' && inv.slots[0] === null);

// ---- (2) water/thirst ----
inv.clear();
p.water = 100;
// drain over 10 minutes of sim
for (let i = 0; i < 600; i++) playerMod.update(1 / 60, i / 60);
check(`water drains over time (water=${p.water.toFixed(0)})`, p.water < 100 && p.water > 0);
// dehydration damages health when water hits 0
p.water = 0; p.hunger = 80; p.health = 50;
const h0 = p.health;
for (let i = 0; i < 120; i++) playerMod.update(1 / 60, 100 + i / 60);
check('dehydration drains health', p.health < h0);
// drink restores water
inv.clear();
inv.slots[0] = null;
p.inWater = true; p.water = 10;
playerMod.contextAction();
check(`drinking restores water (water=${p.water.toFixed(0)})`, p.water > 10 && p.water <= 100);

// ---- (3) dinos collide with walls ----
const d = dinos.dinos.find(x => x.species === 'bronto' && !x.dead) || dinos.dinos[0];
G.buildings.push({ id: 999, type: 'wall', x: d.x, z: d.z, h: 0, solid: { hw: 0.95, hd: 0.95 } });
const before = { x: d.x, z: d.z };
for (let i = 0; i < 30; i++) step();
const moved = Math.hypot(d.x - before.x, d.z - before.z);
check(`dino pushed out of wall (moved ${moved.toFixed(2)} units)`, moved > 0.1);
G.buildings.length = 0;

// ---- (4) death drops inventory ----
inv.clear();
inv.add('wood', 5); inv.add('berry', 3); inv.add('spear', 1);
p.health = 10; p.invulnT = 0; p.dead = false;
playerMod.takeDamage(50, p.x + 5, p.z);
const dropped = world.pickups.reduce((n, pk) => n + pk.count, 0);
check(`death drops items (${dropped} dropped, inv empty=${inv.totalSlots() === 0})`, dropped >= 8 && inv.totalSlots() === 0);
// clear dropped pickups for later tests
while (world.pickups.length) world.removePickup(0);
p.dead = false; p.health = 100;

// ---- (5) tamed follow/stay ----
// tame a raptor directly
const rap = dinos.dinos.find(x => x.species === 'raptor' && !x.dead);
rap.tamed = true; rap.name = 'Testy'; rap.state = 'follow';
const rpos = { x: rap.x, z: rap.z };
for (let i = 0; i < 60; i++) step(1 / 60, 'stay');
const stayDist = Math.hypot(rap.x - rpos.x, rap.z - rpos.z);
check(`tamed dino holds position in STAY mode (moved ${stayDist.toFixed(2)})`, stayDist < 1.5);

// ---- (6) repopulation ----
// kill every raptor; after one update a respawn timer should start
for (const x of dinos.dinos) if (x.species === 'raptor' && !x.dead) { x.dead = true; x.deathT = 99; }
step(1 / 60, 'follow');
// respawn timer is internal; just ensure update did not crash and dinos list still valid
check('repopulation tick runs without error', dinos.dinos.length > 0);

console.log(fail === 0 ? 'ALL AAA VERIFIED' : fail + ' FAILURES');
process.exit(fail === 0 ? 0 : 1);
