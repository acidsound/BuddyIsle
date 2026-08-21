// Dinosaurs: procedural cel-shaded models, animation, AI, taming, combat.
import * as THREE from 'three';
import { clamp, lerpAngle, dist2d, makeRng } from './noise.js';
import { makeToon, outlineMaterial, celPart, inflate, mergeGeoms, INK } from './world.js';

const NAME_POOL = ['Biscuit', 'Chomp', 'Moss', 'Tango', 'Pebble', 'Fang', 'Sunny', 'Gnaw', 'Boulder', 'Rex', 'Nugget', 'Waffles'];

export const SPECIES = {
  raptor: {
    kind: 'theropod', label: 'Saberclaw',
    scale: 0.92, walk: 3.4, run: 10, hp: 55, dmg: 8, atkRange: 2.4, atkCd: 1.0,
    body: 0x6b8f3f, belly: 0xd8cfa0, accent: 0xff7a1a, eye: 0xffd23d,
    sil: 0x242b1c, silAccent: 0xff9a3d,
    tameFood: 'meat', tameFeeds: 4,
    loot: { meat: [2, 3] },
    hitR: 1.1, avoidWater: false,
  },
  bronto: {
    kind: 'sauropod', label: 'Mossback',
    scale: 1.55, walk: 1.9, run: 6, hp: 320, dmg: 18, atkRange: 3.4, atkCd: 1.7,
    body: 0x9a7d55, belly: 0xcfc0a0, accent: 0xffc23d, eye: 0x3a2a1a,
    sil: 0x2e2a20, silAccent: 0xffc23d,
    tameFood: 'berry', tameFeeds: 3,
    loot: { meat: [5, 8], leaf: [2, 4] },
    hitR: 3.4, avoidWater: true,
  },
  trex: {
    kind: 'theropod', label: 'Rexmaw',
    scale: 2.1, walk: 2.7, run: 11, hp: 420, dmg: 28, atkRange: 3.2, atkCd: 1.5,
    body: 0x4a5d43, belly: 0x8a9478, accent: 0xff3b30, eye: 0xff3b30,
    sil: 0x1c211a, silAccent: 0xff5040,
    tameFood: null,
    loot: { meat: [6, 10] },
    hitR: 2.6, avoidWater: true,
  },
};

// ---------- model builders ----------
function box(w, h, d, tx = 0, ty = 0, tz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(tx, ty, tz);
  return g;
}
function sph(sx, sy, sz, tx = 0, ty = 0, tz = 0) {
  const g = new THREE.SphereGeometry(1, 10, 8);
  g.scale(sx, sy, sz);
  g.translate(tx, ty, tz);
  return g;
}

function buildTheropod(spec) {
  const root = new THREE.Group();
  const rig = { root, tail: [], legs: [], arms: [] };
  const B = spec.body, A = spec.accent, BL = spec.belly, E = spec.eye;
  const part = (geo, color, opts) => {
    const m = celPart(geo, color, opts);
    root.add(m);
    return m;
  };

  rig.pelvis = part(sph(0.55, 0.5, 0.7, 0, 1.55, 0.55), B);
  rig.torso = part(sph(0.62, 0.56, 1.05, 0, 1.62, 0.1), B);
  rig.belly = part(sph(0.5, 0.42, 0.85, 0, 1.42, 0.12), BL, { noOutline: false });
  rig.chest = part(sph(0.5, 0.46, 0.6, 0, 1.68, -0.55), B);
  rig.neck1 = part(sph(0.26, 0.3, 0.34, 0, 1.98, -1.0), B);
  rig.neck2 = part(sph(0.22, 0.26, 0.3, 0, 2.3, -1.22), B);

  // head (group so it can pitch)
  const head = new THREE.Group();
  head.position.set(0, 2.58, -1.42);
  root.add(head);
  const skull = celPart(box(0.5, 0.42, 0.55), B); head.add(skull);
  const snout = celPart(box(0.34, 0.26, 0.5, 0, -0.06, 0.45), B); head.add(snout);
  const jawGeo = box(0.3, 0.13, 0.55, 0, -0.065, 0.275);
  rig.jaw = celPart(jawGeo, B);
  rig.jaw.position.set(0, -0.1, 0.14);
  head.add(rig.jaw);
  const eyes = celPart(mergeGeoms([sph(0.075, 0.075, 0.075, -0.23, 0.1, 0.18), sph(0.075, 0.075, 0.075, 0.23, 0.1, 0.18)]), E, { noOutline: true });
  eyes.userData.accent = true;
  head.add(eyes);
  const crest = celPart(box(0.12, 0.45, 0.34, 0, 0.32, -0.12), A, { noOutline: true });
  crest.userData.accent = true;
  head.add(crest);
  rig.head = head;

  // tail
  const tailDefs = [[0.34, 1.52, 1.0], [0.26, 1.38, 1.7], [0.18, 1.24, 2.3], [0.1, 1.12, 2.85]];
  for (const [r, y, z] of tailDefs) {
    const m = part(sph(r, r * 0.85, r * 1.5, 0, y, z), B);
    rig.tail.push(m);
  }

  // legs
  for (const side of [-1, 1]) {
    const thighGeo = box(0.34, 0.62, 0.46, 0, -0.31, 0);
    const thigh = part(thighGeo, B);
    thigh.position.set(side * 0.42, 1.28, 0.55);
    const shinGeo = box(0.24, 0.56, 0.3, 0, -0.28, 0);
    const shin = celPart(shinGeo, B);
    shin.position.set(0, -0.6, 0.04);
    thigh.add(shin);
    const footGeo = box(0.3, 0.14, 0.58, 0, -0.07, 0.12);
    const foot = celPart(footGeo, B);
    foot.position.set(0, -0.56, 0.05);
    shin.add(foot);
    rig.legs.push({ thigh, shin, foot });
  }

  // arms
  for (const side of [-1, 1]) {
    const armGeo = box(0.15, 0.5, 0.2, 0, -0.25, 0);
    const arm = part(armGeo, B);
    arm.position.set(side * 0.55, 1.62, -0.5);
    rig.arms.push(arm);
  }

  // back stripes + spikes (accent, no outline)
  const stripeGeos = [];
  for (let i = 0; i < 4; i++) stripeGeos.push(box(0.55 - i * 0.06, 0.07, 0.4, 0, 2.16, -0.55 + i * 0.55));
  const stripes = celPart(mergeGeoms(stripeGeos), A, { noOutline: true });
  stripes.userData.accent = true;
  root.add(stripes);
  if (spec.kind === 'theropod' && spec.label === 'Saberclaw') {
    const spikeGeos = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.ConeGeometry(0.09, 0.3, 5);
      g.translate(0, 2.2 + 0.02, -0.7 + i * 0.5);
      spikeGeos.push(g);
    }
    const spikes = celPart(mergeGeoms(spikeGeos), A, { noOutline: true });
    spikes.userData.accent = true;
    root.add(spikes);
  }

  // hp bar
  const bar = makeHpBar(2.2);
  bar.position.set(0, 3.3, 0);
  root.add(bar);
  rig.bar = bar;

  root.scale.setScalar(spec.scale);
  return rig;
}

function buildSauropod(spec) {
  const root = new THREE.Group();
  const rig = { root, tail: [], legs: [] };
  const B = spec.body, A = spec.accent, BL = spec.belly, E = spec.eye;
  const part = (geo, color, opts) => { const m = celPart(geo, color, opts); root.add(m); return m; };

  rig.body = part(sph(1.15, 1.0, 1.75, 0, 2.0, 0), B);
  rig.belly = part(sph(1.0, 0.85, 1.5, 0, 1.75, 0.05), BL);
  // neck
  const neckDefs = [[0.42, 2.7, -1.5], [0.38, 3.15, -1.9], [0.33, 3.6, -2.2], [0.28, 4.05, -2.42]];
  rig.neck = [];
  for (const [r, y, z] of neckDefs) {
    const m = part(sph(r, r * 1.1, r * 1.25, 0, y, z), B);
    rig.neck.push(m);
  }
  const head = new THREE.Group();
  head.position.set(0, 4.42, -2.6);
  root.add(head);
  head.add(celPart(box(0.5, 0.46, 0.62), B));
  head.add(celPart(box(0.36, 0.3, 0.45, 0, -0.06, 0.42), B));
  const jawGeo = box(0.32, 0.1, 0.4, 0, -0.05, 0.2);
  rig.jaw = celPart(jawGeo, B);
  rig.jaw.position.set(0, -0.16, 0.1);
  head.add(rig.jaw);
  const eyes = celPart(mergeGeoms([sph(0.08, 0.08, 0.08, -0.26, 0.1, 0.2), sph(0.08, 0.08, 0.08, 0.26, 0.1, 0.2)]), E, { noOutline: true });
  eyes.userData.accent = true;
  head.add(eyes);
  const ears = celPart(mergeGeoms([
    new THREE.ConeGeometry(0.1, 0.22, 5).translate(-0.28, 0.3, -0.15),
    new THREE.ConeGeometry(0.1, 0.22, 5).translate(0.28, 0.3, -0.15),
  ]), B, { noOutline: true });
  head.add(ears);
  rig.head = head;

  // tail
  const tailDefs = [[0.5, 2.0, 1.4], [0.4, 1.8, 2.3], [0.3, 1.55, 3.1], [0.2, 1.3, 3.8], [0.1, 1.12, 4.4]];
  for (const [r, y, z] of tailDefs) {
    const m = part(sph(r, r * 0.85, r * 1.5, 0, y, z), B);
    rig.tail.push(m);
  }

  // legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const legGeo = box(0.62, 2.0, 0.68, 0, -1.0, 0);
    const leg = part(legGeo, B);
    leg.position.set(sx * 0.82, 2.0, sz * 1.05);
    rig.legs.push({ thigh: leg, shin: null, foot: null });
  }

  // back stripes
  const stripeGeos = [];
  for (let i = 0; i < 5; i++) stripeGeos.push(box(0.95 - i * 0.08, 0.09, 0.55, 0, 2.98, -0.9 + i * 0.55));
  const stripes = celPart(mergeGeoms(stripeGeos), A, { noOutline: true });
  stripes.userData.accent = true;
  root.add(stripes);

  const bar = makeHpBar(3.4);
  bar.position.set(0, 5.6, 0);
  root.add(bar);
  rig.bar = bar;

  root.scale.setScalar(spec.scale);
  return rig;
}

function makeHpBar(w) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.22), new THREE.MeshBasicMaterial({ color: INK, toneMapped: false, transparent: true, opacity: 0.85 }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xe5484d, toneMapped: false }));
  fg.position.z = 0.001;
  g.add(bg); g.add(fg);
  g.visible = false;
  g.userData = { fg, w };
  return g;
}

// ---------- dino factory ----------
let nextId = 1;
export function createDino(scene, speciesKey, x, z, world, rng) {
  const spec = SPECIES[speciesKey];
  const rig = spec.kind === 'theropod' ? buildTheropod(spec) : buildSauropod(spec);
  const root = rig.root;
  root.position.set(x, world.heightAt(x, z), z);
  scene.add(root);

  // blob shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(spec.hitR * 0.95, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // materials for silhouette swapping
  const mats = {
    body: makeToon(spec.body),
    belly: makeToon(spec.belly),
    accent: makeToon(spec.accent),
    eye: makeToon(spec.eye),
    sil: makeToon(spec.sil),
    silAccent: makeToon(spec.silAccent),
  };
  const partList = [];
  root.traverse(o => {
    if (o.isMesh && o.material && o.material.isMeshToonMaterial) {
      partList.push({ mesh: o, accent: !!o.userData.accent, orig: o.material });
    }
  });

  const dino = {
    id: nextId++,
    species: speciesKey,
    spec, rig, root, shadow, partList, mats,
    x, z,
    yaw: rng() * Math.PI * 2,
    hp: spec.hp, maxHp: spec.hp,
    state: 'wander', stateT: 0,
    wanderPt: null,
    target: null,
    tamed: false, name: null,
    tameProgress: 0,
    aggro: false, aggroT: 0,
    attackT: 0, attackCd: 0,
    dead: false, deathT: 0, deathDir: 1,
    silMode: false,
    phase: rng() * 10,
    speed: 0,
    home: new THREE.Vector3(x, 0, z),
    roamR: 26,
    roarCd: 2 + rng() * 4,
    feedFxT: 0,
    packId: speciesKey === 'raptor' ? Math.floor(rng() * 3) : -1,
  };
  applySilhouette(dino, false);
  return dino;
}

function applySilhouette(dino, sil) {
  dino.silMode = sil;
  for (const p of dino.partList) {
    p.mesh.material = sil ? (p.accent ? dino.mats.silAccent : dino.mats.sil) : p.orig;
  }
}

// ---------- AI ----------
function findTarget(dino, all, player, world) {
  // returns {kind:'dino'|'player', obj, dist}
  let best = null;
  if (dino.species === 'trex') {
    // nearest bronto or player
    for (const o of all) {
      if (o === dino || o.dead || o.tamed) continue;
      if (o.species !== 'bronto') continue;
      const d = dist2d(dino.x, dino.z, o.x, o.z);
      if (d < 55 && (!best || d < best.dist)) best = { kind: 'dino', obj: o, dist: d };
    }
    const pd = dist2d(dino.x, dino.z, player.x, player.z);
    if (pd < 42 && (!best || pd < best.dist)) best = { kind: 'player', obj: player, dist: pd };
    return best;
  }
  if (dino.species === 'raptor') {
    for (const o of all) {
      if (o === dino || o.dead || o.tamed) continue;
      if (o.species === 'trex') continue;
      const d = dist2d(dino.x, dino.z, o.x, o.z);
      if (d < 48 && (!best || d < best.dist)) best = { kind: 'dino', obj: o, dist: d };
    }
    if (dino.aggro) {
      const pd = dist2d(dino.x, dino.z, player.x, player.z);
      if (pd < 45 && (!best || pd < best.dist * 0.75)) best = { kind: 'player', obj: player, dist: pd };
    }
    return best;
  }
  return null;
}

function threatForBronto(dino, all, player) {
  for (const o of all) {
    if (o === dino || o.dead || o.tamed) continue;
    if (o.species === 'trex' || o.species === 'raptor') {
      if (dist2d(dino.x, dino.z, o.x, o.z) < 30) return o;
    }
  }
  const pd = dist2d(dino.x, dino.z, player.x, player.z);
  if (pd < 15) return player;
  return null;
}

function moveTo(dino, tx, tz, speed, dt, world) {
  const dx = tx - dino.x, dz = tz - dino.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) { dino.speed = 0; return; }
  const desired = Math.atan2(dx, dz);
  dino.yaw = lerpAngle(dino.yaw, desired, Math.min(1, dt * 3.5));
  dino.speed = speed;
  let nx = dino.x + Math.sin(dino.yaw) * speed * dt;
  let nz = dino.z + Math.cos(dino.yaw) * speed * dt;
  // avoid water
  if (world.heightAt(nx, nz) < 0.5 && dino.spec.avoidWater) {
    // steer toward higher ground
    let bestH = -999, bdx = 0, bdz = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const hx = dino.x + Math.sin(ang) * 6, hz = dino.z + Math.cos(ang) * 6;
      const h = world.heightAt(hx, hz);
      if (h > bestH) { bestH = h; bdx = Math.sin(ang); bdz = Math.cos(ang); }
    }
    nx = dino.x + bdx * speed * dt;
    nz = dino.z + bdz * speed * dt;
    dino.yaw = lerpAngle(dino.yaw, Math.atan2(bdx, bdz), Math.min(1, dt * 2));
  }
  // stay on island
  const dc = Math.hypot(nx, nz);
  if (dc > 178) {
    const k = 178 / dc;
    nx *= k; nz *= k;
  }
  dino.x = nx; dino.z = nz;
}

function separateDinos(dinos, dt) {
  for (let i = 0; i < dinos.length; i++) {
    for (let j = i + 1; j < dinos.length; j++) {
      const a = dinos[i], b = dinos[j];
      if (a.dead || b.dead) continue;
      const minD = (a.spec.hitR + b.spec.hitR) * 0.75;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 0.01) {
        const push = (minD - d) * 0.5 * Math.min(1, dt * 6);
        const ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
}

function pushOutOfBuildings(dino, buildings) {
  for (const b of buildings) {
    if (!b.solid) continue;
    const hw = b.hw + dino.spec.hitR * 0.5, hd = b.hd + dino.spec.hitR * 0.5;
    if (Math.abs(dino.x - b.x) < hw && Math.abs(dino.z - b.z) < hd) {
      const ox = hw - Math.abs(dino.x - b.x);
      const oz = hd - Math.abs(dino.z - b.z);
      if (ox < oz) dino.x += (dino.x > b.x ? ox : -ox);
      else dino.z += (dino.z > b.z ? oz : -oz);
    }
  }
}

// ---------- public module ----------
export function createDinoSystem(scene, world) {
  const rng = makeRng(424242);
  const dinos = [];

  function spawnAt(key, x, z) {
    const d = createDino(scene, key, x, z, world, rng);
    dinos.push(d);
    return d;
  }

  function findSpawn(biomes, minH, maxH, tries = 300) {
    for (let i = 0; i < tries; i++) {
      const x = (rng() - 0.5) * 300, z = (rng() - 0.5) * 300;
      const h = world.heightAt(x, z);
      if (h < minH || h > maxH) continue;
      if (!biomes.includes(world.biomeAt(x, z))) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // initial population
  const t1 = findSpawn(['highland', 'plains'], 8, 40);
  spawnAt('trex', t1.x, t1.z);
  for (let i = 0; i < 4; i++) {
    const p = findSpawn(['plains', 'jungle'], 1.5, 16);
    spawnAt('bronto', p.x, p.z);
  }
  for (let i = 0; i < 7; i++) {
    const p = findSpawn(['jungle'], 1.5, 14);
    spawnAt('raptor', p.x, p.z);
  }

  const tamedOffsets = new Map();

  function damageDino(dino, dmg, fromX, fromZ, ctx) {
    if (dino.dead) return;
    dino.hp -= dmg;
    const p = new THREE.Vector3(dino.x, world.heightAt(dino.x, dino.z) + 1.2 * dino.spec.scale, dino.z);
    ctx.particles.emit('blood', p);
    ctx.audio.sfx.hitDino();
    if (!dino.tamed) {
      dino.aggro = true;
      dino.aggroT = 20;
      if (dino.species === 'bronto') dino.state = 'flee';
    } else {
      dino.aggro = true;
      dino.aggroT = 12;
    }
    if (dino.hp <= 0) {
      dino.dead = true;
      dino.deathT = 0;
      dino.deathDir = Math.random() < 0.5 ? 1 : -1;
      ctx.audio.sfx.roar(dino.species);
      world.spawnLoot({ x: dino.x, z: dino.z }, dino.spec.loot);
      if (dino.tamed) ctx.toast(`${dino.name} was killed...`);
    }
  }

  function feed(dino, foodId, ctx) {
    if (dino.dead) return false;
    if (dino.tamed) {
      ctx.particles.emit('heart', new THREE.Vector3(dino.x, world.heightAt(dino.x, dino.z) + 1.5 * dino.spec.scale, dino.z));
      ctx.audio.sfx.heart();
      return true;
    }
    if (dino.state === 'flee') { ctx.toast('It is too spooked to take food.'); return false; }
    if (!dino.spec.tameFood) {
      if (foodId === 'meat' && dino.species === 'trex') {
        dino.aggro = true; dino.aggroT = 30; dino.state = 'hunt'; dino.target = null;
        ctx.toast('The Rexmaw is not interested... in YOU.');
      } else {
        ctx.toast(`The ${dino.spec.label} ignores that.`);
      }
      return false;
    }
    if (foodId !== dino.spec.tameFood) {
      ctx.toast(`The ${dino.spec.label} turns up its nose at that.`);
      return false;
    }
    dino.tameProgress += 100 / dino.spec.tameFeeds;
    dino.feedFxT = 0.5;
    if (ctx.onFed) ctx.onFed(dino);
    ctx.particles.emit('heart', new THREE.Vector3(dino.x, world.heightAt(dino.x, dino.z) + 1.5 * dino.spec.scale, dino.z));
    ctx.audio.sfx.heart();
    if (dino.tameProgress >= 100) {
      dino.tamed = true;
      dino.name = NAME_POOL[(Math.random() * NAME_POOL.length) | 0];
      dino.aggro = false;
      dino.state = 'follow';
      ctx.audio.sfx.tame();
      ctx.toast(`${dino.name} the ${dino.spec.label} has joined you!`);
    } else {
      ctx.toast(`Taming... ${Math.floor(dino.tameProgress)}%`);
    }
    return true;
  }

  function update(dt, ctx) {
    const { player, particles, audio, toast, buildings, projectiles } = ctx;
    const time = ctx.time;

    // projectiles (food) hit dinos
    for (const pr of projectiles) {
      if (pr.dead) continue;
      for (const d of dinos) {
        if (d.dead) continue;
        const hy = world.heightAt(d.x, d.z) + d.spec.hitR * 0.8;
        const dx = pr.x - d.x, dy = pr.y - hy, dz = pr.z - d.z;
        if (dx * dx + dy * dy + dz * dz < (d.spec.hitR + 0.4) ** 2) {
          pr.dead = true;
          feed(d, pr.item, ctx);
          break;
        }
      }
    }

    for (const d of dinos) {
      if (d.dead) {
        d.deathT += dt;
        const k = Math.min(1, d.deathT / 0.7);
        d.rig.root.rotation.z = k * 1.5 * d.deathDir;
        d.rig.root.position.y = world.heightAt(d.x, d.z) - k * 0.35;
        if (d.deathT > 6) {
          scene.remove(d.root);
          scene.remove(d.shadow);
          const i = dinos.indexOf(d);
          if (i >= 0) dinos.splice(i, 1);
        }
        continue;
      }

      const playerDist = dist2d(d.x, d.z, player.x, player.z);
      d.stateT -= dt;
      d.attackCd -= dt;
      d.feedFxT -= dt;
      if (d.aggro) {
        d.aggroT -= dt;
        if (d.aggroT <= 0) d.aggro = false;
      }
      d.roarCd -= dt;

      // --- decide state ---
      if (d.tamed) {
        // defense: hostile near player
        let threat = null;
        for (const o of dinos) {
          if (o === d || o.dead || o.tamed) continue;
          const od = dist2d(d.x, d.z, o.x, o.z);
          if (od < 14 || dist2d(o.x, o.z, player.x, player.z) < 16) { threat = o; break; }
        }
        if (threat) { d.state = 'hunt'; d.target = threat; }
        else if (d.aggro) { d.state = 'hunt'; d.target = null; } // angry at player
        else d.state = 'follow';
      } else if (d.species === 'bronto') {
        const t = threatForBronto(d, dinos, player);
        if (t) { d.state = 'flee'; d.target = t; }
        else d.state = d.state === 'flee' ? 'graze' : d.state;
        if (d.state === 'graze' && d.stateT <= 0) {
          d.state = Math.random() < 0.5 ? 'graze' : 'wander';
          d.stateT = 3 + Math.random() * 4;
          if (d.state === 'wander') {
            const a = Math.random() * Math.PI * 2;
            d.wanderPt = { x: d.home.x + Math.cos(a) * 14, z: d.home.z + Math.sin(a) * 14 };
          }
        }
      } else {
        // raptor / trex
        if (d.aggro && playerDist < 48) { d.state = 'hunt'; d.target = null; }
        else {
          const t = findTarget(d, dinos, player, world);
          if (t) { d.state = 'hunt'; d.target = t.obj; }
          else {
            // pack follow: if a packmate is hunting, join
            let joined = false;
            if (d.species === 'raptor') {
              for (const o of dinos) {
                if (o === d || o.dead || o.tamed || o.packId !== d.packId) continue;
                if (o.state === 'hunt' && dist2d(d.x, d.z, o.x, o.z) < 70) {
                  d.state = 'hunt'; d.target = o.target; joined = true; break;
                }
              }
            }
            if (!joined) {
              if (d.state === 'hunt' && (!d.target || d.target.dead)) d.state = 'wander';
              if (d.state === 'wander' && d.stateT <= 0) {
                d.state = Math.random() < 0.6 ? 'wander' : 'idle';
                d.stateT = 2 + Math.random() * 4;
                if (d.state === 'wander') {
                  const a = Math.random() * Math.PI * 2;
                  const r = 8 + Math.random() * d.roamR;
                  d.wanderPt = { x: d.home.x + Math.cos(a) * r, z: d.home.z + Math.sin(a) * r };
                }
              }
            }
          }
        }
        if (d.hp < d.maxHp * 0.22 && d.state !== 'flee') { d.state = 'flee'; d.target = null; }
      }

      // --- act ---
      let speed = 0;
      if (d.state === 'hunt') {
        let tx, tz, isPlayer = false;
        if (d.target && d.target.dead) { d.state = 'wander'; d.stateT = 0; }
        else if (d.target) { tx = d.target.x; tz = d.target.z; }
        else { tx = player.x; tz = player.z; isPlayer = true; }
        const d2 = dist2d(d.x, d.z, tx, tz);
        if (d2 > d.spec.atkRange) {
          moveTo(d, tx, tz, d.spec.run, dt, world);
        } else {
          dinoFace(d, tx, tz, dt);
          if (d.attackCd <= 0) {
            d.attackT = 0.35;
            d.attackCd = d.spec.atkCd;
            if (isPlayer) {
              player.takeDamage(d.spec.dmg, d.x, d.z);
            } else if (d.target) {
              damageDino(d.target, d.spec.dmg, d.x, d.z, ctx);
            }
            if (d2 < 60) audio.sfx.roar(d.species);
          }
        }
        if (d.roarCd <= 0 && d2 < 70) {
          d.roarCd = d.species === 'trex' ? 6 + Math.random() * 4 : 3 + Math.random() * 3;
          if (d2 < 65) audio.sfx.roar(d.species);
        }
      } else if (d.state === 'flee') {
        let tx, tz;
        if (d.target && !d.target.dead) {
          const a = Math.atan2(d.x - d.target.x, d.z - d.target.z);
          tx = d.x + Math.sin(a) * 20; tz = d.z + Math.cos(a) * 20;
        } else {
          const a = Math.atan2(d.x - player.x, d.z - player.z);
          tx = d.x + Math.sin(a) * 20; tz = d.z + Math.cos(a) * 20;
        }
        moveTo(d, tx, tz, d.spec.run, dt, world);
        if (d.target) {
          const td = dist2d(d.x, d.z, d.target.x, d.target.z);
          if (td > 45 || (d.target.dead)) { d.state = d.species === 'bronto' ? 'graze' : 'wander'; d.stateT = 0; d.target = null; }
        } else if (playerDist > 45) { d.state = d.species === 'bronto' ? 'graze' : 'wander'; d.stateT = 0; }
      } else if (d.state === 'follow') {
        // orbit behind player
        let idx = 0;
        for (const o of dinos) if (o.tamed && o !== d) idx++;
        const ang = player.yaw + Math.PI + (idx % 3) * 2.1 - 1.0;
        const rad = 2.4 + (idx % 3) * 1.1;
        const tx = player.x + Math.sin(ang) * rad;
        const tz = player.z + Math.cos(ang) * rad;
        const d2 = dist2d(d.x, d.z, tx, tz);
        if (d2 > 1.2) moveTo(d, tx, tz, d2 > 7 ? d.spec.run : d.spec.walk, dt, world);
        else dinoFace(d, player.x, player.z, dt);
      } else if (d.state === 'wander') {
        if (!d.wanderPt) { d.stateT = 0; }
        else {
          const d2 = dist2d(d.x, d.z, d.wanderPt.x, d.wanderPt.z);
          if (d2 < 1.5) { d.state = 'idle'; d.stateT = 1.5 + Math.random() * 3; }
          else moveTo(d, d.wanderPt.x, d.wanderPt.z, d.spec.walk * 0.7, dt, world);
        }
      } else if (d.state === 'graze') {
        // stand and nibble
        if (Math.random() < dt * 0.5) {
          const hy = world.heightAt(d.x, d.z);
          particles.emit('leaves', new THREE.Vector3(d.x + Math.sin(d.yaw) * 1.5, hy + 0.5, d.z + Math.cos(d.yaw) * 1.5));
        }
      }
      // idle: nothing

      // ground + buildings
      const hy = world.heightAt(d.x, d.z);
      d.rig.root.position.set(d.x, hy, d.z);
      d.rig.root.rotation.y = d.yaw;
      d.shadow.position.set(d.x, hy + 0.06, d.z);

      // silhouette LOD / threat
      const threat = (d.state === 'hunt' && (!d.target || d.target === player)) || (d.aggro && playerDist < 30);
      const sil = playerDist > 78 || (threat && playerDist > 26);
      if (sil !== d.silMode) applySilhouette(d, sil);

      // hp bar
      const bar = d.rig.bar;
      if (!d.tamed && d.hp < d.maxHp) {
        bar.visible = true;
        bar.quaternion.copy(cameraQuat);
        const r = d.hp / d.maxHp;
        bar.userData.fg.scale.x = Math.max(0.001, r);
        bar.userData.fg.position.x = -(1 - r) * bar.userData.w * 0.5;
      } else if (d.tamed && d.tameProgress < 100) {
        bar.visible = true;
        bar.quaternion.copy(cameraQuat);
        bar.userData.fg.material.color.set(0x7ac74f);
        const r = d.tameProgress / 100;
        bar.userData.fg.scale.x = Math.max(0.001, r);
        bar.userData.fg.position.x = -(1 - r) * bar.userData.w * 0.5;
      } else {
        bar.visible = false;
        if (bar.userData.fg) bar.userData.fg.material.color.set(0xe5484d);
      }

      // animate
      animateDino(d, dt, speed, ctx);
    }

    separateDinos(dinos, dt);
    for (const d of dinos) if (!d.dead) pushOutOfBuildings(d, buildings);
  }

  let cameraQuat = new THREE.Quaternion();
  function setCameraQuat(q) { cameraQuat = q; }

  function dinoFace(d, tx, tz, dt) {
    d.yaw = lerpAngle(d.yaw, Math.atan2(tx - d.x, tz - d.z), Math.min(1, dt * 4));
    d.speed = 0;
  }

  function animateDino(d, dt, speed, ctx) {
    const r = d.rig;
    const run = d.spec.run;
    const moveAmt = clamp(speed / run, 0, 1);
    d.phase += dt * (1.2 + speed * 0.75);
    const ph = d.phase;

    // legs
    for (let i = 0; i < r.legs.length; i++) {
      const L = r.legs[i];
      const off = i % 2 === 0 ? 0 : Math.PI;
      const swing = Math.sin(ph * 2 + off) * 0.65 * moveAmt;
      L.thigh.rotation.x = swing;
      if (L.shin) {
        L.shin.rotation.x = (1 - Math.cos(ph * 2 + off)) * 0.55 * moveAmt;
        L.foot.rotation.x = -L.shin.rotation.x * 0.7;
      }
    }
    // tail
    for (let i = 0; i < r.tail.length; i++) {
      r.tail[i].rotation.x = Math.sin(ph * 1.6 + i * 0.55) * 0.1 * (0.35 + moveAmt);
      r.tail[i].rotation.y = Math.sin(ph * 0.9 + i * 0.4) * 0.09 * (0.3 + moveAmt);
    }
    // head
    let headPitch = Math.sin(ph * 1.3) * 0.05 * moveAmt;
    if (d.state === 'graze') headPitch = 0.55 + Math.sin(ph * 2.2) * 0.06;
    if (d.state === 'follow') headPitch = 0.12;
    r.head.rotation.x = headPitch;
    r.head.rotation.y = Math.sin(ph * 0.7) * 0.08 * moveAmt;
    // breathing
    const breathe = 1 + Math.sin(ph * 1.1) * 0.02;
    if (r.torso) r.torso.scale.y = breathe;
    if (r.body) r.body.scale.y = breathe;
    // body bob
    r.root.position.y = world.heightAt(d.x, d.z) + Math.sin(ph * 4) * 0.05 * moveAmt * d.spec.scale;
    // attack snap
    if (d.attackT > 0) {
      d.attackT -= dt;
      const k = Math.sin((1 - d.attackT / 0.35) * Math.PI);
      r.jaw.rotation.x = -1.05 * k;
      r.head.rotation.x = headPitch - 0.25 * k;
      if (r.arms) for (const a of r.arms) a.rotation.x = -0.9 * k;
    } else {
      r.jaw.rotation.x = 0;
      if (r.arms) for (const a of r.arms) a.rotation.x = Math.sin(ph * 2) * 0.15 * moveAmt;
    }
  }

  function findNearestDino(x, z, dirX, dirZ, maxDist) {
    let best = null, bestD = maxDist;
    const len = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / len, dz = dirZ / len;
    for (const d of dinos) {
      if (d.dead) continue;
      const ox = d.x - x, oz = d.z - z;
      const dist = Math.hypot(ox, oz);
      if (dist > maxDist) continue;
      const dot = (ox / dist) * dx + (oz / dist) * dz;
      if (dot < 0.35) continue;
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  function damageNearestInArc(x, y, z, dirX, dirZ, range, dmg, ctx) {
    let hitAny = false;
    for (const d of dinos) {
      if (d.dead) continue;
      const ox = d.x - x, oz = d.z - z;
      const dist = Math.hypot(ox, oz);
      if (dist > range + d.spec.hitR) continue;
      const dot = (ox / (dist || 1)) * dirX + (oz / (dist || 1)) * dirZ;
      if (dot < 0.3) continue;
      damageDino(d, dmg, x, z, ctx);
      hitAny = true;
    }
    return hitAny;
  }

  function callTamed() {
    let any = false;
    for (const d of dinos) {
      if (d.tamed && !d.dead) {
        d.state = 'follow';
        d.stateT = 0;
        d.aggro = false;
        any = true;
      }
    }
    return any;
  }

  function tamedCount() {
    let n = 0;
    for (const d of dinos) if (d.tamed && !d.dead) n++;
    return n;
  }

  return {
    dinos,
    update,
    setCameraQuat,
    findNearestDino,
    damageNearestInArc,
    damageDino,
    feed,
    callTamed,
    tamedCount,
    spawnAt,
  };
}
