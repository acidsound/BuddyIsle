// Verify: berry throw must out-range a bronto's 15m flee radius so taming is possible.
// Old speed 15 reached only ~10.7m (never hit a bronto standing > 15m away).
// New speed 30 must reach a grazing bronto at 17m from the player.
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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1.6, 0.08, 2000);
scene.add(camera);
const world = createWorld(scene);
const dinos = createDinoSystem(scene, world);
const particles = createParticles(scene);

const player = { x: 0, z: 0, y: 0, yaw: 0, dead: false, takeDamage() {} };
const audio = { sfx: new Proxy({}, { get: () => () => {} }) };

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name); if (!ok) fail++; };

// park all dinos far away
let k = 0;
for (const d of dinos.dinos) {
  const a = (k++ * 1.7) % (Math.PI * 2);
  d.x = Math.cos(a) * 140; d.z = Math.sin(a) * 140;
  d.home.set(d.x, 0, d.z);
  d.yaw = 0; d.state = 'wander'; d.stateT = 100; d.target = null;
  d.aggro = false; d.aggroPlayer = false;
}

// ---- (1) flee radius is 15m — confirm a player 17m away does NOT spook a bronto ----
const bro = dinos.dinos.find(d => d.species === 'bronto');
bro.x = 0; bro.z = 17; bro.home.set(0, 0, 17);   // 17m straight ahead of the player
bro.state = 'graze'; bro.stateT = 100; bro.target = null;
player.x = 0; player.z = 0; player.y = world.heightAt(0, 0);
player.dead = false;
// step once so the AI re-evaluates the bronto state
dinos.setCameraQuat(camera.quaternion);
dinos.update(1 / 60, {
  player, particles, audio,
  toast() {}, buildings: [], projectiles: [],
  time: 0, tamedMode: 'follow',
});
check(`bronto 17m away does not flee (state=${bro.state})`, bro.state !== 'flee');

// ---- (2) a berry thrown at speed 30 must physically hit that grazing bronto ----
const pr = {
  x: 0, y: world.heightAt(0, 0) + 1.55, z: 0,
  vx: 0, vz: 30, vy: 3.2,
  item: 'berry', dead: false,
};
let hit = false, landedZ = 0;
for (let i = 0; i < 180; i++) {
  pr.vy -= 15 * (1 / 60);
  pr.x += pr.vx * (1 / 60); pr.y += pr.vy * (1 / 60); pr.z += pr.vz * (1 / 60);
  const hy = world.heightAt(bro.x, bro.z) + bro.spec.hitR * 0.8;
  const dx = pr.x - bro.x, dy = pr.y - hy, dz = pr.z - bro.z;
  if (dx * dx + dy * dy + dz * dz < (bro.spec.hitR + 0.4) ** 2) { hit = true; landedZ = pr.z; break; }
  if (pr.y < world.heightAt(pr.x, pr.z) + 0.1) { landedZ = pr.z; break; }
}
check(`berry thrown from 17m hits the grazing bronto (hit=${hit})`, hit);
// the berry only needs to reach within the dino's hit radius (3.4+0.4) of its center
check(`impact lands a real throw near the target (z=${landedZ.toFixed(1)})`, landedZ > 5 && landedZ < 30);

console.log(fail === 0 ? 'TAMING RANGE VERIFIED' : fail + ' FAILURES');
process.exit(fail === 0 ? 0 : 1);
