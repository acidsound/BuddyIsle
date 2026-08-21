// Targeted verification for dino movement/AI fixes:
// (1) idle no longer freezes a dino in place forever
// (2) a dino whose hunt target dies mid-frame stands down instead of NaN-ing its yaw
// (3) aggro from a non-player source (e.g. a trex bite) does not redirect a raptor onto the player
// (4) tamed dinos defend only against predators, not against grazing brontos
// (5) predators stop targeting a dead player instead of camping the corpse
// (6) every dino's position / yaw stays finite across many ticks
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
const step = (n = 1) => {
  for (let i = 0; i < n; i++) {
    dinos.setCameraQuat(camera.quaternion);
    dinos.update(1 / 60, {
      player, particles, audio,
      toast() {}, buildings: [], projectiles: [],
      time: i / 60, tamedMode: 'follow',
    });
  }
};
// park every dino far from the action (calm, no targets)
const park = (exclude = []) => {
  let k = 0;
  for (const d of dinos.dinos) {
    if (exclude.includes(d)) continue;
    const a = (k++ * 1.7) % (Math.PI * 2);
    d.x = Math.cos(a) * 140; d.z = Math.sin(a) * 140;
    d.home.set(d.x, 0, d.z);
    d.yaw = 0; d.state = 'wander'; d.stateT = 100; d.target = null;
    d.aggro = false; d.aggroT = 0; d.aggroPlayer = false;
    d.hp = d.maxHp; d.dead = false;
  }
};
const allFinite = () => dinos.dinos.every(d => Number.isFinite(d.x) && Number.isFinite(d.z) && Number.isFinite(d.yaw) && Number.isFinite(d.rig.root.position.x) && Number.isFinite(d.rig.root.position.z));

// ---- (1) idle must not freeze a dino ----
park();
const idleRap = dinos.dinos.find(d => d.species === 'raptor');
idleRap.x = 30; idleRap.z = 30; idleRap.home.set(30, 0, 30);
idleRap.state = 'idle'; idleRap.stateT = 0.01;
const idleBro = dinos.dinos.find(d => d.species === 'bronto');
idleBro.x = -30; idleBro.z = 30; idleBro.home.set(-30, 0, 30);
idleBro.state = 'idle'; idleBro.stateT = 0.01;
step(12);
check(`idle raptor resumes activity (state=${idleRap.state}, stateT=${idleRap.stateT.toFixed(2)})`, idleRap.stateT > 0);
check(`idle bronto resumes activity (state=${idleBro.state}, stateT=${idleBro.stateT.toFixed(2)})`, idleBro.stateT > 0 && (idleBro.state === 'graze' || idleBro.state === 'wander' || idleBro.state === 'idle'));

// ---- (2) packmate kill: dead target mid-frame must not NaN the joiner ----
park([idleRap, idleBro]);
// keep the two test-(1) dinos far away from this scenario
for (const d of [idleRap, idleBro]) {
  d.x = -150; d.z = 150; d.home.set(-150, 0, 150);
  d.state = 'wander'; d.stateT = 100; d.target = null; d.aggro = false; d.aggroPlayer = false;
}
const raptors = dinos.dinos.filter(d => d.species === 'raptor' && d !== idleRap);
const a = raptors[0], b = raptors[1];
const x = dinos.dinos.find(d => d.species === 'bronto' && d !== idleBro);
a.packId = b.packId = 0;
x.x = 10; x.z = 10; x.hp = 1; x.state = 'wander'; x.stateT = 100; x.dead = false;
a.x = 11; a.z = 10; a.state = 'hunt'; a.target = x; a.attackCd = 0;
b.x = 60; b.z = 10; b.state = 'wander'; b.stateT = 100; b.target = null;
step(1); // tick 1: a kills x, b joins the (now dead) target and must stand down same-frame
check(`hunt target died mid-frame → joiner stands down same frame (b.state=${b.state})`, b.state === 'wander' && !b.target);
step(1); // tick 2: the killer's dead target also clears
check(`killer stands down when its target is gone (a.state=${a.state})`, a.state === 'wander' && !a.target);
check('no NaN after mid-frame target death', Number.isFinite(a.yaw) && Number.isFinite(b.yaw) && Number.isFinite(a.x) && Number.isFinite(b.x));
step(60);
check('all dinos finite 1s after mid-frame kill', allFinite());

// ---- (3) aggro source: a trex bite must not send a raptor at the player ----
park();
player.x = 0; player.z = 0; player.dead = false;
const aggRap = dinos.dinos.find(d => d.species === 'raptor' && d !== a && d !== b);
aggRap.x = -30; aggRap.z = 0; aggRap.home.set(-30, 0, 0);
aggRap.state = 'wander'; aggRap.stateT = 100; aggRap.target = null;
aggRap.aggro = true; aggRap.aggroT = 20; aggRap.aggroPlayer = false; // bitten by a trex, not the player
step(1);
check(`raptor aggro'd by trex does NOT hunt the player (state=${aggRap.state})`, aggRap.state !== 'hunt' && aggRap.target === null);

// ---- (4) tamed defense: predators only ----
park();
player.x = 0; player.z = 0;
const tame = dinos.dinos.find(d => d.species === 'raptor' && d !== a && d !== b && d !== aggRap);
const grazer = dinos.dinos.find(d => d.species === 'bronto');
tame.x = 5; tame.z = 0; tame.home.set(5, 0, 0);
tame.tamed = true; tame.name = 'Testy'; tame.state = 'follow'; tame.target = null; tame.aggro = false;
grazer.x = 10; grazer.z = 0; grazer.home.set(10, 0, 0);
grazer.state = 'wander'; grazer.stateT = 100; grazer.dead = false; grazer.tamed = false;
step(1);
check(`tamed raptor ignores a nearby bronto (state=${tame.state})`, tame.state === 'follow' && tame.target === null);
// ...but still defends against a real predator
const predator = dinos.dinos.find(d => d.species === 'raptor' && d !== tame);
predator.x = 12; predator.z = 0; predator.home.set(12, 0, 0);
predator.state = 'wander'; predator.stateT = 100; predator.dead = false; predator.tamed = false; predator.aggro = false;
step(1);
check(`tamed raptor hunts a wild raptor near the player (state=${tame.state})`, tame.state === 'hunt' && tame.target === predator);

// ---- (5) a trex biting a LIVE player must deal damage via takeDamage, not crash ----
park();
player.x = 0; player.z = 0; player.dead = false;
const biteRex = dinos.dinos.find(d => d.species === 'trex');
biteRex.x = 1; biteRex.z = 0; biteRex.home.set(1, 0, 0);
biteRex.state = 'hunt'; biteRex.target = null; biteRex.attackCd = 0;
let bites = 0;
player.takeDamage = () => { bites++; };
step(2); // 1 unit away — inside atkRange 3.2
check(`trex bites a live player through takeDamage (bites=${bites})`, bites >= 1);
player.takeDamage = () => {};
biteRex.state = 'wander'; biteRex.target = null;

// ---- (5b) dead player is no longer a target ----
park();
player.dead = true;
const rex = dinos.dinos.find(d => d.species === 'trex');
rex.x = 10; rex.z = 0; rex.home.set(10, 0, 0);
rex.state = 'wander'; rex.stateT = 100; rex.target = null; rex.aggro = false;
step(1);
check(`trex ignores a dead player's corpse (state=${rex.state})`, rex.state !== 'hunt');
player.dead = false;

// ---- (6) long-run finiteness ----
step(300);
check('all dino positions/yaw finite after 5s of simulation', allFinite());

console.log(fail === 0 ? 'ALL DINO MOVEMENT VERIFIED' : fail + ' FAILURES');
process.exit(fail === 0 ? 0 : 1);
