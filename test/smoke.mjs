// Headless smoke test: world gen, dinos, particles, player tick.
globalThis.window = globalThis;
globalThis.performance = { now: () => Date.now() };
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        style: {},
        getContext: () => ({
          createRadialGradient: () => ({ addColorStop() {} }),
          fillRect() {}, clearRect() {},
          putImageData() {},
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
const { createDinoSystem, SPECIES } = await import('../js/dinos.js');
const { createParticles } = await import('../js/particles.js');
const { createPlayer } = await import('../js/player.js');
const { createInventory } = await import('../js/inventory.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1.6, 0.08, 2000);
scene.add(camera);

console.log('--- world ---');
const world = createWorld(scene);
console.log('height(0,0) =', world.heightAt(0, 0).toFixed(2));
console.log('height(-120,-120) =', world.heightAt(-120, -120).toFixed(2));
console.log('biome(0,0) =', world.biomeAt(0, 0));
console.log('biome(-120,-120) =', world.biomeAt(-120, -120));
// biome distribution
const dist = {};
for (let i = 0; i < 4000; i++) {
  const x = (Math.random() - 0.5) * 360, z = (Math.random() - 0.5) * 360;
  const b = world.biomeAt(x, z);
  dist[b] = (dist[b] || 0) + 1;
}
console.log('biome distribution:', dist);
console.log('nodes =', world.nodes.length);
const byType = {};
for (const n of world.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
console.log('node types:', byType);

console.log('--- particles ---');
const particles = createParticles(scene);
particles.emit('dust', new THREE.Vector3(0, 1, 0), ['#8a6a3f']);
particles.update(1 / 60);

console.log('--- dinos ---');
const dinos = createDinoSystem(scene, world);
console.log('dino count =', dinos.dinos.length);
const bySpecies = {};
for (const d of dinos.dinos) bySpecies[d.species] = (bySpecies[d.species] || 0) + 1;
console.log('species:', bySpecies);

const inv = createInventory();
inv.add('wood', 4); inv.add('stone', 2);
inv.add('spear', 1); inv.add('axe', 1);

const G = {
  world, inv,
  audio: { sfx: new Proxy({}, { get: () => () => {} }), update() {} },
  particles,
  buildings: [],
  nextBuildingId: 1,
  input: { w: true, a: false, s: false, d: false, shift: false, space: false, eHeld: false },
  toast: m => console.log('  toast:', m),
  hud: { flashDamage() {} },
  onDeath: () => console.log('  DEATH'),
};
G.dinos = dinos;

const playerMod = createPlayer(scene, camera, world, G);
G.player = playerMod;

console.log('--- 600 ticks (10s sim) ---');
let damageEvents = 0;
const origTake = G.player.player.takeDamage;
G.player.player.takeDamage = (...a) => { damageEvents++; origTake(...a); };
for (let i = 0; i < 600; i++) {
  const t = 0.375 + (i / 60) / 360;
  const p = G.player.player;
  playerMod.update(1 / 60, i / 60);
  dinos.setCameraQuat(camera.quaternion);
  dinos.update(1 / 60, {
    player: p, particles, audio: G.audio,
    toast: G.toast, buildings: G.buildings,
    projectiles: p.projectiles, time: i / 60,
  });
  world.update(1 / 60, t % 1, p.x, p.z, G.buildings);
  particles.update(1 / 60);
}
const p = G.player.player;
console.log('player pos:', p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1), 'health:', p.health.toFixed(0), 'dmg events:', damageEvents);
console.log('dino states:', dinos.dinos.map(d => `${d.species}:${d.state}${d.tamed ? ':tamed' : ''}`).join(' '));

console.log('--- combat test ---');
// put player next to a raptor and attack
const rap = dinos.dinos.find(d => d.species === 'raptor' && !d.dead);
if (rap) {
  p.x = rap.x + 1.5; p.z = rap.z; p.yaw = Math.atan2(rap.x - p.x, rap.z - p.z);
  for (let i = 0; i < 120; i++) {
    playerMod.attack();
    playerMod.update(1 / 60, 100 + i / 60);
    dinos.update(1 / 60, { player: p, particles, audio: G.audio, toast: G.toast, buildings: G.buildings, projectiles: p.projectiles, time: 100 + i / 60 });
  }
  console.log('raptor hp after attacks:', rap.hp, 'aggro:', rap.aggro, 'state:', rap.state);
}

console.log('--- taming test ---');
const br = dinos.dinos.find(d => d.species === 'bronto' && !d.dead);
if (br) {
  inv.select(0);
  inv.slots[0] = { id: 'berry', count: 5 };
  const r2 = dinos.feed(br, 'berry', { particles, audio: G.audio, toast: G.toast });
  console.log('feed ok:', r2, 'progress:', br.tameProgress);
  dinos.feed(br, 'berry', { particles, audio: G.audio, toast: G.toast });
  dinos.feed(br, 'berry', { particles, audio: G.audio, toast: G.toast });
  console.log('tamed:', br.tamed, 'name:', br.name);
}

console.log('--- building test ---');
inv.slots[1] = { id: 'campfire', count: 2 };
inv.select(1);
const dir = new THREE.Vector3();
camera.getWorldDirection(dir);
const hit = world.rayToGround(camera.position, dir, 26);
console.log('rayToGround:', hit ? hit.point.toArray().map(v => v.toFixed(1)) : null);
if (hit) {
  // simulate placement by calling contextAction with ghost valid: force ghost via player internals is private; test placeBuilding indirectly:
  console.log('buildings before:', G.buildings.length);
}
console.log('--- inventory craft test ---');
inv.slots[2] = { id: 'wood', count: 3 };
inv.slots[3] = { id: 'stone', count: 2 };
console.log('craft spear:', inv.craft('spear'));
console.log('slots:', inv.slots.map(s => s ? `${s.id}x${s.count}` : '-').join(' '));

console.log('--- night sky test ---');
world.update(1 / 60, 0.0, 0, 0, []); // midnight
world.update(1 / 60, 0.5, 0, 0, []); // noon
console.log('OK — all smoke tests passed');
