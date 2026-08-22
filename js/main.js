// Main: renderer, scene, input, game loop, wiring.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createDinoSystem } from './dinos.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createParticles } from './particles.js';
import { createInventory } from './inventory.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 2000);
camera.rotation.order = 'YXZ';
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- modules ----------
const audio = createAudio();
const particles = createParticles(scene);
const world = createWorld(scene);
world.bindParticles(pos => {
  particles.emit('fire', pos);
  if (Math.random() < 0.35) particles.emit('smoke', new THREE.Vector3(pos.x, pos.y + 0.4, pos.z));
});
const inv = createInventory();
// starter kit
inv.add('wood', 4);
inv.add('stone', 2);

// ---------- post pipeline (poster grade + vignette + hit flash) ----------
// Full-screen quad pass: cel games live or die by their color grade.
const POST_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
uniform sampler2D tScene;
uniform float uVig, uFlash, uNight, uSunset, uWater;
uniform vec3 uTint;
varying vec2 vUv;
void main(){
  vec3 col = texture2D(tScene, vUv).rgb;
  // poster grade: lift shadows slightly warm, cool the highlights, snap saturation
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.18);                       // saturation snap
  col = col * vec3(1.04, 1.0, 0.94) + vec3(0.012, 0.006, 0.02); // warm mids, cool-lifted blacks
  col = mix(col, col * uTint, 0.35);                     // biome/time tint
  // chunky comic vignette
  vec2 d = vUv - 0.5;
  float vig = 1.0 - dot(d, d) * uVig;
  col *= clamp(vig, 0.0, 1.0);
  // damage flash
  col = mix(col, vec3(0.85, 0.12, 0.10), uFlash * 0.45);
  gl_FragColor = vec4(col, 1.0);
}`;
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const rtA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 0 });
const postUniforms = {
  tScene: { value: rtA.texture },
  uVig: { value: 0.55 },
  uFlash: { value: 0 },
  uNight: { value: 0 },
  uSunset: { value: 0 },
  uWater: { value: 0 },
  uTint: { value: new THREE.Vector3(1, 1, 1) },
};
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: postUniforms, depthTest: false, depthWrite: false,
})));
window.addEventListener('resize', () => { rtA.setSize(window.innerWidth, window.innerHeight); });

const G = {
  scene, camera, renderer,
  world, inv, audio, particles,
  buildings: [],
  nextBuildingId: 1,
  input: { w: false, a: false, s: false, d: false, shift: false, space: false, eHeld: false },
  time: { t: 0.375, day: 1, dayLength: 360 },
  timeAbs: 0,
  tameFocus: null,
  tamedMode: 'follow',
  helpOpen: false,
  helpPrev: null,
  started: false,
  paused: false,
  // game feel (juice)
  fx: {
    shakeT: 0, shakeAmp: 0,      // camera shake
    hitstopT: 0,                 // freeze frames on heavy hits
    flash: 0,                    // damage flash 0..1
    baseFov: 74,
  },
  addShake(amp, dur = 0.3) { const f = G.fx; f.shakeAmp = Math.max(f.shakeAmp, amp); f.shakeT = Math.max(f.shakeT, dur); },
  hitStop(dur = 0.06) { G.fx.hitstopT = Math.max(G.fx.hitstopT, dur); },
  damageFlash(strength = 1) { G.fx.flash = Math.max(G.fx.flash, strength); },
  onDeath() {
    // AAA survival consequence: your inventory drops where you fell
    const p = G.player.player;
    for (const s of G.inv.slots) {
      if (!s) continue;
      G.world.spawnPickup(s.id, s.count, p.x + (Math.random() - 0.5) * 2.5, p.z + (Math.random() - 0.5) * 2.5);
    }
    G.inv.clear();
    G.hud.toast('You dropped everything you were carrying.');
    G.hud.setOverlay('dead');
    if (document.pointerLockElement) safeExitLock();
  },
};

const dinos = createDinoSystem(scene, world);
G.dinos = dinos;

const playerMod = createPlayer(scene, camera, world, G);
G.player = playerMod;

const hud = createHud(G);
G.hud = hud;

// frame the island from the spawn point for the title screen
{
  const p0 = G.player.player;
  camera.position.set(p0.x, p0.y + 1.7, p0.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p0.yaw;
}

// ---------- pointer lock ----------
// Chrome refuses to re-acquire pointer lock within ~1.25s of exiting it and
// rejects the request promise (which surfaces as an uncaught SecurityError).
let lastLockExit = 0;
const LOCK_RETRY_MS = 1250;

function safeExitLock() {
  lastLockExit = performance.now();
  try {
    const p = document.exitPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* already unlocked */ }
}

function acquireLock() {
  if (document.pointerLockElement === canvas) return;
  const wait = LOCK_RETRY_MS - (performance.now() - lastLockExit);
  if (wait > 0) {
    setTimeout(acquireLock, wait);
    return;
  }
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* not allowed right now; ignored */ }
}

// ---------- in-game controls help (? key) ----------
function toggleHelp() {
  if (G.helpOpen) {
    G.helpOpen = false;
    hud.setOverlay(G.helpPrev);
    const resume = G.helpPrev === null;
    G.helpPrev = null;
    if (resume && !G.paused) acquireLock();
  } else if (G.started && !G.player.player.dead) {
    if (hud.craftOpen()) hud.setCraft(false);
    G.helpOpen = true;
    G.helpPrev = G.paused ? 'pause' : null;
    hud.setOverlay('help');
    safeExitLock();
  }
}

// ---------- input ----------
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const c = e.code;
  if (c === 'KeyW') G.input.w = true;
  if (c === 'KeyA') G.input.a = true;
  if (c === 'KeyS') G.input.s = true;
  if (c === 'KeyD') G.input.d = true;
  if (c === 'ShiftLeft' || c === 'ShiftRight') G.input.shift = true;
  if (c === 'Space') { G.input.space = true; e.preventDefault(); }
  // ESC closes the craft panel before anything else
  if (c === 'Escape' && hud.craftOpen()) {
    hud.setCraft(false);
    acquireLock();
    return;
  }
  // ESC closes the in-game help
  if (c === 'Escape' && G.helpOpen) {
    toggleHelp();
    return;
  }
  // ? (or /) toggles the in-game controls help
  if ((e.key === '?' || e.key === '/') && G.started) {
    toggleHelp();
    return;
  }
  if (!G.started || G.paused || G.helpOpen) return;
  if (c === 'KeyE') {
    G.input.eHeld = true;
    if (!hud.craftOpen()) playerMod.contextAction();
  }
  if (c === 'KeyF' && !hud.craftOpen()) playerMod.feed();
  if (c === 'KeyC') {
    const open = hud.craftOpen();
    hud.setCraft(!open);
    if (open) acquireLock();
    else safeExitLock();
  }
  if (c === 'KeyG' && !hud.craftOpen()) {
    G.tamedMode = G.tamedMode === 'follow' ? 'stay' : 'follow';
    if (G.tamedMode === 'follow') dinos.callTamed();
    hud.toast(G.tamedMode === 'follow' ? 'Tamed dinos: FOLLOW' : 'Tamed dinos: STAY');
  }
  if (c === 'KeyZ' && !hud.craftOpen()) {
    const t = G.time.t;
    if (t > 0.25 && t < 0.75) {
      hud.toast('You can only sleep at night.');
    } else {
      G.time.t = 0.30;
      G.time.day += 1;
      G.player.player.stamina = 100;
      G.player.player.hunger = Math.max(0, G.player.player.hunger - 8);
      G.player.player.water = Math.max(0, G.player.player.water - 12);
      audio.sfx.sleep();
      hud.toast('You slept until morning ☀');
    }
  }
  if (c === 'KeyT' && !hud.craftOpen()) {
    if (dinos.callTamed()) hud.toast('Your dinos are coming!');
    else hud.toast('You have no tamed dinos yet.');
  }
  if (c === 'KeyM') {
    const m = audio.toggleMute();
    hud.toast(m ? 'Muted' : 'Sound on');
  }
  if (c.startsWith('Digit')) {
    const n = parseInt(c.slice(5), 10);
    if (n >= 1 && n <= 9) {
      inv.select(n - 1);
      hud.refreshHotbar();
    }
  }
});
window.addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'KeyW') G.input.w = false;
  if (c === 'KeyA') G.input.a = false;
  if (c === 'KeyS') G.input.s = false;
  if (c === 'KeyD') G.input.d = false;
  if (c === 'ShiftLeft' || c === 'ShiftRight') G.input.shift = false;
  if (c === 'Space') G.input.space = false;
  if (c === 'KeyE') G.input.eHeld = false;
});

window.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (!G.started || G.paused || G.helpOpen) return;
  if (hud.craftOpen()) return;
  if (document.pointerLockElement !== canvas) {
    acquireLock();
    return;
  }
  playerMod.attack();
});

window.addEventListener('wheel', e => {
  if (!G.started || G.paused || G.helpOpen) return;
  if (hud.craftOpen()) return;
  inv.select(inv.selected + (e.deltaY > 0 ? 1 : -1));
  hud.refreshHotbar();
});

window.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  const sens = 0.0021;
  G.player.player.yaw -= e.movementX * sens;
  G.player.player.pitch -= e.movementY * sens;
  G.player.player.pitch = Math.max(-1.45, Math.min(1.45, G.player.player.pitch));
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    lastLockExit = performance.now();
    if (G.started && !G.player.player.dead && !hud.craftOpen() && !G.helpOpen) {
      G.paused = true;
      hud.setOverlay('pause');
      document.getElementById('pause-mute').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
    }
  }
  if (locked) {
    G.paused = false;
    hud.setOverlay(null);
  }
});

// ---------- overlays ----------
document.getElementById('start').addEventListener('click', () => {
  audio.init();
  G.started = true;
  hud.setOverlay(null);
  acquireLock();
});
document.getElementById('dead').addEventListener('click', () => {
  playerMod.respawn();
  hud.setOverlay(null);
  acquireLock();
});
document.getElementById('pause').addEventListener('click', () => {
  acquireLock();
});
document.getElementById('pause-mute').addEventListener('click', e => {
  e.stopPropagation();
  const m = audio.toggleMute();
  document.getElementById('pause-mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
});
document.getElementById('help').addEventListener('click', () => {
  toggleHelp();
});

// ---------- food projectile meshes ----------
const projMeshes = new Map();
const PROJ_COLORS = { berry: 0xd8452e, meat: 0xb5432c, cooked: 0x8a3a1e };
function updateProjectiles(dt) {
  const alive = new Set();
  for (const pr of G.player.player.projectiles) {
    alive.add(pr);
    if (!projMeshes.has(pr)) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.13, 0),
        new THREE.MeshBasicMaterial({ color: PROJ_COLORS[pr.item] || 0xffffff })
      );
      scene.add(m);
      projMeshes.set(pr, m);
    }
    const m = projMeshes.get(pr);
    m.position.set(pr.x, pr.y, pr.z);
    m.rotation.x += dt * 8;
    m.rotation.y += dt * 6;
  }
  for (const [pr, m] of projMeshes) {
    if (!alive.has(pr)) {
      scene.remove(m);
      projMeshes.delete(pr);
    }
  }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // crafting is a menu: freeze the simulation while it is open
  if (!G.started || G.paused || hud.craftOpen() || G.helpOpen) {
    // idle render so the world is visible behind overlays
    world.update(0.016, G.time.t, G.player.player.x, G.player.player.z, G.buildings);
    particles.update(0.016);
    if (!G.started) camera.rotation.y += 0.016 * 0.05; // slow pan behind the title
    renderer.setRenderTarget(rtA);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    updatePostFx(0.016, G.player.player);
    renderer.render(postScene, postCam);
    return;
  }

  G.timeAbs += dt;
  G.time.t += dt / G.time.dayLength;
  if (G.time.t >= 1) { G.time.t -= 1; G.time.day++; }

  const p = G.player.player;
  playerMod.update(dt, G.timeAbs);

  dinos.setCameraQuat(camera.quaternion);
  dinos.update(dt, {
    player: p,
    particles,
    audio,
    toast: m => hud.toast(m),
    buildings: G.buildings,
    projectiles: p.projectiles,
    time: G.timeAbs,
    tamedMode: G.tamedMode,
    onFed: d => { G.tameFocus = { dino: d, t: 5 }; },
  });

  world.update(dt, G.time.t, p.x, p.z, G.buildings);
  particles.update(dt);
  updateProjectiles(dt);
  audio.update(dt, world.getEnv());

  if (G.tameFocus) {
    G.tameFocus.t -= dt;
    if (G.tameFocus.t <= 0) G.tameFocus = null;
  }

  hud.update(dt, G);
  hud.refreshHotbar();
  // post pipeline: scene -> rtA -> graded/vignetted screen (__NOPOST__ bypass)
  if (window.__NOPOST__) { renderer.render(scene, camera); return; }
  renderer.setRenderTarget(rtA);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  updatePostFx(dt, p);
  renderer.render(postScene, postCam);
}
requestAnimationFrame(frame);

// ---------- post-fx uniform driver ----------
let flashT = 0;
function updatePostFx(dt, p) {
  const env = world.getEnv();
  const u = postUniforms;
  // biome + time tint (warm jungle/plains day, cool misty highlands, cold night)
  const tint = u.uTint.value;
  if (env.highland) tint.set(0.92, 1.0, 1.08);
  else if (env.jungle) tint.set(1.06, 1.02, 0.9);
  else if (env.beach) tint.set(1.05, 1.03, 0.95);
  else if (env.plains) tint.set(1.04, 1.0, 0.92);
  else tint.set(1, 1, 1);
  if (env.night > 0) { tint.x *= 1 - 0.25 * env.night; tint.y *= 1 - 0.15 * env.night; tint.z *= 1; }
  if (env.sunset > 0) { tint.x += 0.12 * env.sunset; tint.y *= 1 - 0.05 * env.sunset; }
  // vignette breathes with danger
  u.uVig.value = 0.55 + (p.health < 30 ? 0.5 : 0);
  // damage flash decay
  flashT = Math.max(0, flashT - dt * 2.2);
  u.uFlash.value = flashT;
}
// expose for player damage hook
window.__damageFlash = () => { flashT = 1; };
