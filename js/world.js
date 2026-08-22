// World: island terrain, biomes, cel sky, clouds, water, mist, vegetation, pickups, day/night.
import * as THREE from 'three';
import { makeNoise2D, fbm, clamp01, smoothstep, lerp, clamp, makeRng } from './noise.js';

export const INK = 0x14100c;

export function toonGradientMap() {
  const data = new Uint8Array([
    70, 70, 70, 255,
    150, 150, 150, 255,
    215, 215, 215, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function makeToon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...opts });
}
let GRAD = null;
export function initToon() { if (!GRAD) GRAD = toonGradientMap(); }

export const OUTLINE_MAT = null; // created in initToon (needs scene-independent material)
let _outlineMat = null;
export function outlineMaterial() {
  if (!_outlineMat) _outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, toneMapped: false });
  return _outlineMat;
}

// ---------- geometry helpers ----------
// Convert to non-indexed with per-face normals -> flat poster shading for any material.
export function flatGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export function mergeGeoms(geos) {
  const ns = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let vc = 0;
  ns.forEach(g => { vc += g.attributes.position.count; });
  const pos = new Float32Array(vc * 3);
  let o = 0;
  for (const g of ns) {
    pos.set(g.attributes.position.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals(); // non-indexed -> flat face normals
  return out;
}

// Inflate a geometry along vertex normals -> inverted-hull outline geometry.
export function inflate(geo, t = 0.05) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  }
  g.computeBoundingSphere();
  return g;
}

// A mesh + its ink outline, parented together. Geometry is flattened (poster facets).
export function celPart(geo, color, { outlineT = 0.05, mat = null, noOutline = false } = {}) {
  const g = flatGeo(geo);
  const m = new THREE.Mesh(g, mat || makeToon(color));
  if (!noOutline) {
    const om = new THREE.Mesh(inflate(g, outlineT), outlineMaterial());
    m.add(om);
  }
  return m;
}

// ---------- terrain ----------
const SIZE = 400, SEG = 120, R = 190;
const nBase = makeNoise2D(1337);
const nHigh = makeNoise2D(4242);
const nHum = makeNoise2D(9001);
const nPatch = makeNoise2D(777);

export function highlandMask(x, z) {
  const d = Math.hypot(x, z) / R;
  const hn = fbm(nHigh, x * 0.012, z * 0.012, 3);
  const m = smoothstep(0.18, 0.72, (-(x + z)) * 0.0045 + hn * 0.55 + 0.12);
  return m * smoothstep(0.18, 0.5, d);
}

export function heightAt(x, z) {
  const d = Math.hypot(x, z) / R;
  const falloff = smoothstep(1.0, 0.35, d);
  const base = fbm(nBase, x * 0.006 + 31.7, z * 0.006 + 11.3, 4) * 16 + 10;
  const high = highlandMask(x, z) * 30 * smoothstep(1.0, 0.55, d);
  return base * falloff + high - 3.5;
}

const BIOME_WATER = 'water', BIOME_BEACH = 'beach', BIOME_JUNGLE = 'jungle', BIOME_PLAINS = 'plains', BIOME_HIGHLAND = 'highland';

export function biomeAt(x, z) {
  const h = heightAt(x, z);
  if (h < 0.7) return h < -0.4 ? BIOME_WATER : BIOME_BEACH;
  if (highlandMask(x, z) > 0.55) return BIOME_HIGHLAND;
  const hum = fbm(nHum, x * 0.016, z * 0.016, 3);
  if (hum > 0.06) return BIOME_JUNGLE;
  return BIOME_PLAINS;
}

const PALETTES = {
  [BIOME_WATER]: ['#33709c', '#2c6390'],
  [BIOME_BEACH]: ['#e8d7a2', '#dcc78f', '#d1bd82'],
  [BIOME_JUNGLE]: ['#3e7c3a', '#4a8a42', '#356e33', '#558f45'],
  [BIOME_PLAINS]: ['#b3a94e', '#a89e48', '#bdb258', '#99a044'],
  [BIOME_HIGHLAND]: ['#5d8a80', '#527d78', '#6a948a', '#4a6f72'],
};
const _pc = {};
function palColor(biome) {
  if (!_pc[biome]) _pc[biome] = PALETTES[biome].map(c => new THREE.Color(c));
  return _pc[biome];
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const CLIFF = new THREE.Color('#6b6257');
  const CLIFF_DARK = new THREE.Color('#574f45');
  // slope sampling helper (analytic finite difference on heightAt)
  function slopeAt(x, z) {
    const e = 1.2;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e); // tan of slope angle
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const b = biomeAt(x, z);
    const pal = palColor(b);
    const n = fbm(nPatch, x * 0.05, z * 0.05, 2);
    const idx = clamp(Math.floor((n * 0.5 + 0.5) * pal.length), 0, pal.length - 1);
    c.copy(pal[idx]);
    // steep faces read as painted cliff rock — big silhouette win over rolling hills
    const s = slopeAt(x, z);
    if (s > 0.55 && h > 1.5) {
      const k = Math.min(1, (s - 0.55) / 0.65);
      c.copy(CLIFF).lerp(CLIFF_DARK, fbm(nPatch, x * 0.09 + 90, z * 0.09, 2) * 0.5 + 0.5);
      c.lerp(pal[idx], Math.max(0, 1 - k) * 0.35);
    } else {
      const shade = 0.94 + 0.12 * (fbm(nPatch, x * 0.11 + 50, z * 0.11 + 50, 2) * 0.5 + 0.5);
      c.multiplyScalar(shade);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
  return new THREE.Mesh(flat, mat);
}

// ---------- water ----------
function buildWater() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 48, 48);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    const col = h > -0.6 ? '#7fd4d9' : h > -3 ? '#4aa3c0' : '#2f6a94';
    c.set(col);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const flat = geo.toNonIndexed();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.userData.base = flat.attributes.position.array.slice();
  return mesh;
}

// ---------- sky ----------
const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
uniform vec3 uSunDir;
uniform float uDay, uSunset, uNight;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld);
  float h = clamp(dir.y, 0.0, 1.0);
  float q = floor(h * 16.0) / 16.0;
  float k = smoothstep(0.0, 0.55, q);
  vec3 day = mix(vec3(0.78, 0.92, 0.95), vec3(0.24, 0.56, 0.85), k);
  vec3 sun = mix(vec3(1.0, 0.62, 0.30), vec3(0.36, 0.42, 0.68), k);
  vec3 night = mix(vec3(0.10, 0.16, 0.28), vec3(0.04, 0.07, 0.16), k);
  vec3 col = mix(day, sun, uSunset);
  col = mix(col, night, uNight);
  float sd = dot(dir, normalize(uSunDir));
  if (sd > 0.9992) col = vec3(1.0, 0.95, 0.72);
  else if (sd > 0.9955) col = mix(col, vec3(1.0, 0.85, 0.5), 0.4);
  float md = dot(dir, -normalize(uSunDir));
  if (uNight > 0.4 && md > 0.9993) col = vec3(0.88, 0.92, 1.0);
  else if (uNight > 0.4 && md > 0.9975) col = mix(col, vec3(0.8, 0.85, 1.0), 0.35);
  gl_FragColor = vec4(col, 1.0);
}`;

function buildSky() {
  const geo = new THREE.SphereGeometry(820, 24, 16);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: 1 }, uSunset: { value: 0 }, uNight: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function buildStars() {
  const rng = makeRng(555);
  const n = 420;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const e = Math.asin(rng() * 0.95 + 0.05);
    pos[i * 3] = Math.cos(a) * Math.cos(e) * 800;
    pos[i * 3 + 1] = Math.sin(e) * 800;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 800;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  return new THREE.Points(geo, mat);
}

// ---------- clouds ----------
function makeCloudGeo(rng) {
  const puffs = 4 + Math.floor(rng() * 4);
  const geos = [];
  for (let i = 0; i < puffs; i++) {
    const r = 3.5 + rng() * 5;
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.scale(1, 0.42 + rng() * 0.15, 0.8);
    g.translate((i - puffs / 2) * r * 0.9 + (rng() - 0.5) * 2, (rng() - 0.5) * 1.5, (rng() - 0.5) * 3);
    geos.push(g);
  }
  return mergeGeoms(geos);
}

function buildClouds() {
  const rng = makeRng(888);
  const clouds = [];
  for (let i = 0; i < 11; i++) {
    const geo = makeCloudGeo(rng);
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: GRAD });
    const mesh = new THREE.Mesh(geo, mat);
    const om = new THREE.Mesh(inflate(geo, 0.12), outlineMaterial());
    mesh.add(om);
    mesh.position.set((rng() - 0.5) * 700, 70 + rng() * 35, (rng() - 0.5) * 700);
    mesh.userData.speed = 0.6 + rng() * 0.8;
    clouds.push(mesh);
  }
  return clouds;
}

// ---------- mist (highland) ----------
function makeMistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function buildMist() {
  const tex = makeMistTexture();
  const rng = makeRng(31);
  const mists = [];
  let tries = 0;
  while (mists.length < 10 && tries < 400) {
    tries++;
    const x = (rng() - 0.5) * 320, z = (rng() - 0.5) * 320;
    if (biomeAt(x, z) !== BIOME_HIGHLAND) continue;
    const h = heightAt(x, z);
    if (h < 8) continue;
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xcfe3ea, transparent: true, opacity: 0.16, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const sc = 26 + rng() * 34;
    s.scale.set(sc, sc * 0.4, 1);
    s.position.set(x, h + 2 + rng() * 3, z);
    s.userData = { baseX: x, t: rng() * 100 };
    mists.push(s);
  }
  return mists;
}

// ---------- vegetation ----------
const VEG = {
  palm:    { biome: [BIOME_JUNGLE], minH: 0.8, maxH: 15, count: 66, radius: 1.5, hp: 60, drops: { wood: [4, 7], leaf: [2, 4] } },
  broad:   { biome: [BIOME_PLAINS], minH: 0.8, maxH: 16, count: 42, radius: 1.4, hp: 50, drops: { wood: [3, 6] } },
  conifer: { biome: [BIOME_HIGHLAND], minH: 2, maxH: 40, count: 48, radius: 1.4, hp: 50, drops: { wood: [3, 6] } },
  rock:    { biome: [BIOME_JUNGLE, BIOME_PLAINS, BIOME_HIGHLAND, BIOME_BEACH], minH: 0.8, maxH: 45, count: 52, radius: 1.2, hp: 70, drops: { stone: [3, 6] } },
  bush:    { biome: [BIOME_JUNGLE, BIOME_PLAINS], minH: 0.8, maxH: 14, count: 44, radius: 1.0, hp: 10, drops: { berry: [2, 4] } },
};

function vegGeos() {
  const palmTrunk = mergeGeoms([
    (() => { const g = new THREE.CylinderGeometry(0.3, 0.38, 1.7, 7); g.translate(0, 0.85, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.26, 0.3, 1.6, 7); g.rotateZ(0.09); g.translate(0.06, 2.05, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.2, 0.25, 1.5, 7); g.rotateZ(0.18); g.translate(0.2, 3.25, 0); return g; })(),
  ]);
  const frondGeos = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.BoxGeometry(0.24, 0.07, 2.0);
    g.translate(0, 0, 1.0);
    g.rotateX(0.55 + (i % 3) * 0.18);
    g.rotateY((i / 6) * Math.PI * 2 + 0.3);
    g.translate(0.22, 4.05, 0);
    frondGeos.push(g);
  }
  const palmFrond = mergeGeoms(frondGeos);

  const broadTrunk = (() => { const g = new THREE.CylinderGeometry(0.22, 0.32, 2.3, 7); g.translate(0, 1.15, 0); return g; })();
  const broadCanopy = mergeGeoms([
    (() => { const g = new THREE.SphereGeometry(1.5, 9, 7); g.translate(0, 3.3, 0); return g; })(),
    (() => { const g = new THREE.SphereGeometry(1.1, 8, 6); g.translate(0.95, 2.9, 0.35); return g; })(),
    (() => { const g = new THREE.SphereGeometry(1.0, 8, 6); g.translate(-0.85, 3.05, -0.4); return g; })(),
    (() => { const g = new THREE.SphereGeometry(0.9, 8, 6); g.translate(0.2, 4.25, -0.2); return g; })(),
  ]);

  const coniferTrunk = (() => { const g = new THREE.CylinderGeometry(0.18, 0.28, 1.7, 7); g.translate(0, 0.85, 0); return g; })();
  const coniferTiers = mergeGeoms([
    (() => { const g = new THREE.ConeGeometry(1.55, 2.3, 8); g.translate(0, 2.3, 0); return g; })(),
    (() => { const g = new THREE.ConeGeometry(1.2, 2.0, 8); g.translate(0, 3.5, 0); return g; })(),
    (() => { const g = new THREE.ConeGeometry(0.85, 1.8, 8); g.translate(0, 4.6, 0); return g; })(),
  ]);

  const rockGeo = mergeGeoms([
    (() => { const g = new THREE.DodecahedronGeometry(1, 0); g.scale(1.25, 0.95, 1.1); g.translate(0, 0.75, 0); return g; })(),
    (() => { const g = new THREE.DodecahedronGeometry(0.55, 0); g.scale(1.1, 0.8, 1); g.translate(0.75, 0.4, 0.4); return g; })(),
  ]);

  const bushBody = mergeGeoms([
    (() => { const g = new THREE.SphereGeometry(0.78, 8, 6); g.scale(1.25, 0.9, 1.25); g.translate(0, 0.55, 0); return g; })(),
    (() => { const g = new THREE.SphereGeometry(0.55, 7, 5); g.translate(0.55, 0.42, 0.35); return g; })(),
  ]);
  const berryPts = [[0.3, 0.95, 0.5], [-0.45, 0.85, 0.4], [0.1, 1.05, -0.45], [0.75, 0.7, 0.5]];
  const bushBerry = mergeGeoms(berryPts.map(p => {
    const g = new THREE.SphereGeometry(0.13, 6, 5);
    g.translate(p[0], p[1], p[2]);
    return g;
  }));

  return {
    palm: { trunk: { geo: palmTrunk, color: 0x8a5a33 }, frond: { geo: palmFrond, color: 0x3e8a3a } },
    broad: { trunk: { geo: broadTrunk, color: 0x7d4f26 }, canopy: { geo: broadCanopy, color: 0x55944a } },
    conifer: { trunk: { geo: coniferTrunk, color: 0x6b4a2e }, tiers: { geo: coniferTiers, color: 0x3f7a63 } },
    rock: { rock: { geo: rockGeo, color: 0x8d949c } },
    bush: { body: { geo: bushBody, color: 0x4f9448 }, berry: { geo: bushBerry, color: 0xd8452e } },
  };
}

// ---------- pickups ----------
const PICKUP_GEO = {
  wood: { geo: (() => { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 7); g.rotateZ(Math.PI / 2); return g; })(), color: 0xa06a35 },
  stone: { geo: new THREE.DodecahedronGeometry(0.22, 0), color: 0x8d949c },
  leaf: { geo: new THREE.IcosahedronGeometry(0.2, 0), color: 0x5f9e42 },
  berry: { geo: new THREE.SphereGeometry(0.18, 7, 6), color: 0xd8452e },
  meat: { geo: new THREE.IcosahedronGeometry(0.22, 0), color: 0xb5432c },
  cooked: { geo: new THREE.IcosahedronGeometry(0.22, 0), color: 0x8a3a1e },
};

// ---------- world object ----------
export function createWorld(scene) {
  initToon();
  const rng = makeRng(20260820);

  const terrain = buildTerrain();
  scene.add(terrain);
  const water = buildWater();
  scene.add(water);
  const sky = buildSky();
  scene.add(sky);
  const stars = buildStars();
  scene.add(stars);
  const clouds = buildClouds();
  clouds.forEach(c => scene.add(c));
  const mists = buildMist();
  mists.forEach(m => scene.add(m));

  // lights
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.3);
  scene.add(sunLight); scene.add(sunLight.target);
  const moonLight = new THREE.DirectionalLight(0x7a90c9, 0);
  moonLight.position.set(-100, 150, 60);
  scene.add(moonLight);
  const hemi = new THREE.HemisphereLight(0xbfe3ef, 0x4a5d3a, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xcfe8ef, 60, 260);

  // fireflies (jungle, night)
  const ffRng = makeRng(99);
  const ffPos = new Float32Array(60 * 3);
  let fi = 0, ftries = 0;
  while (fi < 60 && ftries < 500) {
    ftries++;
    const x = (ffRng() - 0.5) * 300, z = (ffRng() - 0.5) * 300;
    if (biomeAt(x, z) !== BIOME_JUNGLE) continue;
    const h = heightAt(x, z);
    if (h < 1) continue;
    ffPos[fi * 3] = x; ffPos[fi * 3 + 1] = h + 0.5 + ffRng() * 1.5; ffPos[fi * 3 + 2] = z;
    fi++;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos.slice(0, fi * 3), 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xffe77a, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(fireflies);

  // vegetation nodes
  const geos = vegGeos();
  const nodes = [];
  const placed = [];
  function placeNodes(spec, type) {
    const partNames = Object.keys(geos[type]);
    const list = [];
    let tries = 0;
    while (list.length < spec.count && tries < spec.count * 40) {
      tries++;
      const x = (rng() - 0.5) * 330, z = (rng() - 0.5) * 330;
      const h = heightAt(x, z);
      if (h < spec.minH || h > spec.maxH) continue;
      const b = biomeAt(x, z);
      if (!spec.biome.includes(b)) continue;
      let ok = true;
      for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < 5.5) { ok = false; break; }
      if (!ok) continue;
      placed.push({ x, z });
      list.push({
        type, x, z, h,
        yaw: rng() * Math.PI * 2,
        s: 0.85 + rng() * 0.45,
        alive: true, grow: 1, respawnT: 0,
        berriesAlive: true,
        hp: spec.hp, maxHp: spec.hp,
      });
    }
    const parts = {};
    for (const pn of partNames) {
      parts[pn] = {
        toon: new THREE.InstancedMesh(geos[type][pn].geo, makeToon(geos[type][pn].color), Math.max(1, list.length)),
        outline: new THREE.InstancedMesh(inflate(geos[type][pn].geo, 0.055), outlineMaterial(), Math.max(1, list.length)),
      };
      parts[pn].toon.count = list.length;
      parts[pn].outline.count = list.length;
      parts[pn].toon.frustumCulled = false;
      parts[pn].outline.frustumCulled = false;
      scene.add(parts[pn].toon);
      scene.add(parts[pn].outline);
    }
    for (let i = 0; i < list.length; i++) {
      list[i].inst = {};
      list[i].partNames = partNames;
      for (const pn of partNames) list[i].inst[pn] = i;
      nodes.push(list[i]);
    }
    return { list, parts };
  }

  const vegGroups = {};
  for (const type of Object.keys(VEG)) vegGroups[type] = placeNodes(VEG[type], type);

  const dummy = new THREE.Object3D();
  function setNodeMatrix(node, scaleMul) {
    const g = node.grow * (node.alive ? 1 : 0) * scaleMul;
    const s = Math.max(0.0001, node.s * g);
    const grp = vegGroups[node.type];
    for (const pn of node.partNames) {
      const hidden = (pn === 'berry' && !node.berriesAlive) || !node.alive;
      dummy.position.set(node.x, node.h, node.z);
      dummy.rotation.set(0, node.yaw, 0);
      dummy.scale.setScalar(hidden ? 0.0001 : s);
      dummy.updateMatrix();
      grp.parts[pn].toon.setMatrixAt(node.inst[pn], dummy.matrix);
      grp.parts[pn].outline.setMatrixAt(node.inst[pn], dummy.matrix);
    }
    for (const pn of node.partNames) {
      grp.parts[pn].toon.instanceMatrix.needsUpdate = true;
      grp.parts[pn].outline.instanceMatrix.needsUpdate = true;
    }
  }
  for (const n of nodes) setNodeMatrix(n, 1);

  // pickups
  const pickups = [];
  const pickupDummy = new THREE.Object3D();
  function spawnPickup(item, count, x, z) {
    const def = PICKUP_GEO[item] || PICKUP_GEO.stone;
    const mesh = celPart(def.geo, def.color, { outlineT: 0.03 });
    const h = heightAt(x, z);
    mesh.position.set(x, Math.max(h, 0) + 0.35, z);
    scene.add(mesh);
    pickups.push({ item, count, mesh, t: rng() * 10, x, z, h: Math.max(h, 0) });
  }
  function spawnLoot(pos, drops) {
    for (const [item, [a, b]] of Object.entries(drops)) {
      const n = a + Math.floor(rng() * (b - a + 1));
      const ang = rng() * Math.PI * 2, r = 0.6 + rng() * 0.9;
      spawnPickup(item, n, pos.x + Math.cos(ang) * r, pos.z + Math.sin(ang) * r);
    }
  }

  // ray to ground (analytic march)
  function rayToGround(origin, dir, maxDist = 80) {
    let px = origin.x, py = origin.y, pz = origin.z;
    for (let t = 0.4; t < maxDist; t += 0.35) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < heightAt(x, z)) return { point: new THREE.Vector3(px, (py + y) / 2, pz), t: t - 0.35 };
      px = x; py = y; pz = z;
    }
    return null;
  }

  // ---------- day/night ----------
  const sunDir = new THREE.Vector3();
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();
  let env = { night: 0, daylight: 1, sunset: 0, highland: false, jungle: false, plains: false, beach: false };

  function updateSky(t, playerX, playerZ) {
    const ang = Math.PI * 2 * (t - 0.25);
    sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang), -0.35).normalize();
    const elev = sunDir.y;
    const daylight = smoothstep(-0.12, 0.3, elev);
    const night = 1 - smoothstep(-0.28, 0.02, elev);
    const sunset = clamp01(Math.pow(1 - Math.abs(elev), 2.2) * (elev > -0.4 ? 1.4 : 0));
    sky.material.uniforms.uSunDir.value.copy(sunDir);
    sky.material.uniforms.uDay.value = daylight;
    sky.material.uniforms.uSunset.value = sunset;
    sky.material.uniforms.uNight.value = night;
    stars.material.opacity = night * 0.9;

    sunLight.position.copy(sunDir).multiplyScalar(240);
    sunLight.intensity = 1.45 * daylight;
    moonLight.position.copy(sunDir).multiplyScalar(-240);
    moonLight.intensity = 0.32 * night;

    _c1.set(0x14243d); _c2.set(0xbfe3ef);
    hemi.color.copy(_c1).lerp(_c2, daylight);
    hemi.color.lerp(_c1.set(0xff9d5c), sunset * 0.5);
    _c1.set(0x11181c); _c2.set(0x55683f);
    hemi.groundColor.copy(_c1).lerp(_c2, daylight);
    hemi.intensity = 0.32 + 0.62 * daylight;

    _c1.set(0x16263f); _c2.set(0xcfe8ef);
    scene.fog.color.copy(_c1).lerp(_c2, daylight);
    scene.fog.color.lerp(_c1.set(0xff9d5c), sunset * 0.45);
    const b = biomeAt(playerX, playerZ);
    if (b === BIOME_HIGHLAND) { scene.fog.color.lerp(_c1.set(0xa8c4cc), 0.5); scene.fog.near = 34; scene.fog.far = 190; }
    else { scene.fog.near = 60; scene.fog.far = 260; }

    for (const c of clouds) {
      c.material.color.set(0xffffff).lerp(_c1.set(0x2a3a55), night);
    }
    fireflies.material.opacity = night * (b === BIOME_JUNGLE ? 0.95 : 0.35);
    env = { night, daylight, sunset, highland: b === BIOME_HIGHLAND, jungle: b === BIOME_JUNGLE, plains: b === BIOME_PLAINS, beach: b === BIOME_BEACH };
  }

  // ---------- update ----------
  let time = 0;
  function update(dt, t, playerX, playerZ, buildings) {
    time += dt;
    updateSky(t, playerX, playerZ);

    // water waves
    const pos = water.geometry.attributes.position;
    const base = water.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, 0.16 * Math.sin(x * 0.22 + time * 1.4) + 0.1 * Math.sin(z * 0.29 + time * 0.9) + 0.06 * Math.sin((x + z) * 0.15 + time * 0.6));
    }
    pos.needsUpdate = true;
    water.geometry.computeVertexNormals();

    // clouds
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 380) c.position.x = -380;
    }
    // mist
    for (const m of mists) {
      m.userData.t += dt;
      m.position.x = m.userData.baseX + Math.sin(m.userData.t * 0.05) * 14;
      m.material.opacity = 0.13 + 0.05 * Math.sin(m.userData.t * 0.11);
    }
    // fireflies bob
    fireflies.position.y = Math.sin(time * 0.7) * 0.4;

    // node regrowth
    for (const n of nodes) {
      if (!n.alive && n.respawnT > 0) {
        n.respawnT -= dt;
        if (n.respawnT <= 0) { n.alive = true; n.grow = 0; n.hp = n.maxHp; }
      }
      if (n.alive && n.grow < 1) {
        n.grow = Math.min(1, n.grow + dt * 0.5);
        setNodeMatrix(n, 1);
      }
      if (n.type === 'bush' && !n.berriesAlive && n.respawnT > 0) {
        n.respawnT -= dt;
        if (n.respawnT <= 0) { n.berriesAlive = true; setNodeMatrix(n, 1); }
      }
    }

    // pickups bob
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      p.mesh.position.y = p.h + 0.35 + Math.sin(p.t * 2.6) * 0.09;
      p.mesh.rotation.y = p.t * 1.5;
    }

    // campfire / torch flames
    for (const b of buildings) {
      if (b.fire && Math.random() < dt * 22) {
        emitFire(b.fire.pos);
      }
      if (b.light) {
        b.light.intensity = b.lightBase * (0.8 + 0.35 * Math.sin(time * 11 + b.id) * Math.sin(time * 7.3));
      }
    }
  }

  const firePool = [];
  function emitFire(pos) {
    // delegated to particles via callback
    if (firePool.cb) firePool.cb(pos);
  }
  function bindParticles(emitFn) { firePool.cb = emitFn; }

  return {
    SIZE, R,
    heightAt, biomeAt, rayToGround,
    nodes, pickups,
    spawnPickup, spawnLoot,
    updateNode: n => setNodeMatrix(n, 1),
    removePickup(i) { scene.remove(pickups[i].mesh); pickups.splice(i, 1); },
    update, bindParticles,
    getEnv() { return env; },
    sunDir,
  };
}
