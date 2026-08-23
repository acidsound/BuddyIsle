// Player: FPS movement, head-bob, hands, combat, gathering, building, feeding, survival stats.
import * as THREE from 'three';
import { clamp, lerpAngle } from './noise.js';
import { makeToon, celPart, mergeGeoms, INK } from './world.js';
import { ITEMS } from './items.js';

const EYE = 1.7;
const DUST_COLORS = {
  jungle: ['#8a6a3f', '#6b4f2e', '#4f7a3a'],
  plains: ['#c2a860', '#a89050', '#b0a050'],
  highland: ['#8a9aa5', '#6f8090', '#9aa8b0'],
  beach: ['#e0cf9a', '#cdbb85'],
  water: ['#eaf6f8', '#9fd3dd'],
};

export function createPlayer(scene, camera, world, ctx) {
  const rng = Math.random;
  // find beach spawn
  let sx = 0, sz = 160;
  outer:
  for (let r = 0; r < 120; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const x = Math.cos(a) * (120 + r * 0.3), z = Math.sin(a) * (120 + r * 0.3);
      const h = world.heightAt(x, z);
      if (h > 0.15 && h < 2 && world.biomeAt(x, z) === 'beach') { sx = x; sz = z; break outer; }
    }
  }

  const player = {
    x: sx, z: sz, y: world.heightAt(sx, sz),
    yaw: Math.atan2(-sx, -sz) + Math.PI, // face island center
    pitch: 0,
    velY: 0, onGround: true,
    health: 100, stamina: 100, hunger: 100, water: 100,
    bobPhase: 0, moveAmt: 0,
    swayX: 0, swayZ: 0,
    dead: false, invulnT: 0,
    inWater: false,
    footT: 0,
    pickupToastT: 0, fullToastT: 0,
    attack: { cd: 0, t: 0 },
    gather: { node: null, progress: 0, fxT: 0 },
    cook: null,
    sprinting: false,
    hand: { group: null, tool: null, swingT: 0, gatherT: 0 },
    projectiles: [],
  };

  // toast helper: G.hud.toast in-game, ctx.toast in headless tests
  const toastMsg = m => {
    if (ctx.hud && ctx.hud.toast) ctx.hud.toast(m);
    else if (ctx.toast) ctx.toast(m);
  };

  // ---------- hands ----------
  // Rounded, chunky first-person hand: capsule-ish forearm + mitten palm.
  // Low segment counts keep it stylistically flat; the old box-fingers read as noise at FPS range.
  const hand = new THREE.Group();
  hand.position.set(0.34, -0.36, -0.6);
  hand.rotation.set(0.1, -0.12, 0);
  camera.add(hand);

  const skin = 0xd9a066;
  const sleeve = 0x5a6d8a;
  // sleeve cuff — slightly wider than the wrist so it reads as a pushed-up sleeve
  const forearm = celPart(new THREE.CylinderGeometry(0.085, 0.075, 0.34, 10), sleeve);
  forearm.position.set(0.02, -0.1, 0.22);
  forearm.rotation.x = 0.5;
  hand.add(forearm);
  // palm: flattened rounded box (sphere squashed) reads softer than a sharp box
  const palm = celPart((() => {
    const g = new THREE.SphereGeometry(0.11, 12, 8);
    g.scale(1.0, 0.45, 1.15);
    return g;
  })(), skin);
  hand.add(palm);
  // thumb: small angled capsule hugging the palm side
  const thumb = celPart(new THREE.CapsuleGeometry(0.028, 0.09, 3, 8), skin, { outlineT: 0.012 });
  thumb.position.set(0.1, -0.01, -0.05);
  thumb.rotation.set(0.5, 0, -0.7);
  hand.add(thumb);

  // tool meshes
  function makeSpear() {
    const g = new THREE.Group();
    const shaft = celPart(new THREE.CylinderGeometry(0.032, 0.038, 1.25, 7), 0xa06a35);
    shaft.rotation.x = Math.PI / 2 - 0.12;
    g.add(shaft);
    const tip = celPart(new THREE.ConeGeometry(0.07, 0.3, 7), 0xc8cdd2);
    tip.rotation.x = Math.PI / 2 - 0.12;
    tip.position.set(0, 0.05, -0.78);
    g.add(tip);
    return g;
  }
  function makeAxe() {
    const g = new THREE.Group();
    const shaft = celPart(new THREE.CylinderGeometry(0.032, 0.038, 0.95, 7), 0xa06a35);
    shaft.rotation.x = Math.PI / 2 - 0.15;
    g.add(shaft);
    const head = celPart(new THREE.BoxGeometry(0.06, 0.2, 0.26), 0x8d949c);
    head.position.set(0, 0.06, -0.52);
    head.rotation.x = 0.3;
    g.add(head);
    return g;
  }
  function makePick() {
    const g = new THREE.Group();
    const shaft = celPart(new THREE.CylinderGeometry(0.032, 0.038, 0.95, 7), 0xa06a35);
    shaft.rotation.x = Math.PI / 2 - 0.15;
    g.add(shaft);
    const head = celPart(new THREE.BoxGeometry(0.4, 0.07, 0.14), 0x8d949c);
    head.position.set(0, 0.08, -0.48);
    head.rotation.z = 0.25;
    g.add(head);
    return g;
  }
  function makeTorch() {
    const g = new THREE.Group();
    const shaft = celPart(new THREE.CylinderGeometry(0.035, 0.045, 0.7, 7), 0xa06a35);
    shaft.rotation.x = Math.PI / 2 - 0.1;
    g.add(shaft);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 6), new THREE.MeshBasicMaterial({ color: 0xffd75e, toneMapped: false }));
    flame.position.set(0, 0.08, -0.42);
    g.add(flame);
    const light = new THREE.PointLight(0xffa04d, 1.6, 15, 2);
    light.position.set(0, 0.12, -0.42);
    g.add(light);
    g.userData.flame = flame;
    return g;
  }
  function makeFoodBlob(color) {
    const g = new THREE.Group();
    const m = celPart(new THREE.IcosahedronGeometry(0.09, 0), color, { outlineT: 0.015 });
    m.position.set(0, 0.02, -0.16);
    g.add(m);
    return g;
  }

  const toolBuilders = {
    spear: makeSpear, axe: makeAxe, pick: makePick, torch: makeTorch,
    berry: () => makeFoodBlob(0xd8452e), meat: () => makeFoodBlob(0xb5432c),
    cooked: () => makeFoodBlob(0x8a3a1e), bandage: () => makeFoodBlob(0xe8e2d2),
  };

  let lastToolId = null;
  function setHandTool(itemId) {
    if (itemId === lastToolId) return;
    lastToolId = itemId;
    if (player.hand.tool) {
      hand.remove(player.hand.tool);
      player.hand.tool = null;
    }
    if (!itemId) return;
    const def = ITEMS[itemId];
    if (def.tool) {
      const b = toolBuilders[itemId];
      if (b) { player.hand.tool = b(); hand.add(player.hand.tool); }
    } else if (def.build === 'torch') {
      // hold a lit torch while placing one — it lights your way at night
      player.hand.tool = makeTorch();
      hand.add(player.hand.tool);
    } else if (def.food || def.heal) {
      player.hand.tool = makeFoodBlob(itemId === 'berry' ? 0xd8452e : itemId === 'cooked' ? 0x8a3a1e : itemId === 'meat' ? 0xb5432c : 0xe8e2d2);
      hand.add(player.hand.tool);
    }
    // buildings: empty hand (ghost preview shows)
  }

  // ---------- building ghost ----------
  const ghostMats = {
    ok: new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.4, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.45, depthWrite: false }),
  };
  const ghostShapes = {
    wall: new THREE.BoxGeometry(1.8, 2.2, 0.35),
    fence: new THREE.BoxGeometry(1.6, 1.1, 0.2),
    campfire: new THREE.CylinderGeometry(0.8, 0.8, 0.5, 8),
    torch: new THREE.CylinderGeometry(0.15, 0.15, 2.0, 6),
  };
  const ghosts = {};
  for (const k of Object.keys(ghostShapes)) {
    const m = new THREE.Mesh(ghostShapes[k], ghostMats.ok);
    m.visible = false;
    scene.add(m);
    ghosts[k] = m;
  }
  const ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ghostRing.rotation.x = -Math.PI / 2;
  ghostRing.visible = false;
  scene.add(ghostRing);

  let ghostPos = null, ghostValid = false;

  function updateGhost(dt) {
    const sel = ctx.inv.selectedItem();
    const isBuild = sel && sel.build;
    for (const k of Object.keys(ghosts)) ghosts[k].visible = false;
    ghostRing.visible = false;
    ghostPos = null; ghostValid = false;
    if (!isBuild) return;
    const camPos = camera.position;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const hit = world.rayToGround(camPos, dir, 26);
    if (!hit) return;
    const gx = Math.round(hit.point.x / 2) * 2;
    const gz = Math.round(hit.point.z / 2) * 2;
    const h = world.heightAt(gx, gz);
    const dPlayer = Math.hypot(gx - player.x, gz - player.z);
    let valid = h > 0.6 && dPlayer < 26;
    if (valid) {
      for (const d of ctx.dinos.dinos) {
        if (d.dead) continue;
        if (Math.hypot(d.x - gx, d.z - gz) < d.spec.hitR + 1.2) { valid = false; break; }
      }
    }
    if (valid) {
      for (const b of ctx.buildings) {
        if (Math.hypot(b.x - gx, b.z - gz) < 1.9) { valid = false; break; }
      }
    }
    ghostPos = { x: gx, z: gz, h };
    ghostValid = valid;
    const g = ghosts[sel.build];
    g.visible = true;
    g.material = valid ? ghostMats.ok : ghostMats.bad;
    g.position.set(gx, h + (sel.build === 'torch' ? 1.0 : sel.build === 'campfire' ? 0.25 : sel.build === 'fence' ? 0.55 : 1.1), gz);
    if (sel.build === 'wall') g.rotation.y = Math.atan2(player.x - gx, player.z - gz);
    ghostRing.visible = true;
    ghostRing.position.set(gx, h + 0.08, gz);
    ghostRing.material.color.set(valid ? 0xf5b942 : 0xe5484d);
  }

  function placeBuilding() {
    const sel = ctx.inv.selectedItem();
    if (!sel || !sel.build || !ghostPos || !ghostValid) return false;
    const { x, z, h } = ghostPos;
    const b = { id: ctx.nextBuildingId++, type: sel.build, x, z, h, solid: null, light: null, lightBase: 0, fire: null };
    const grp = new THREE.Group();
    grp.position.set(x, h, z);
    if (b.type === 'wall') {
      const m = celPart(new THREE.BoxGeometry(1.8, 2.2, 0.35), 0xb07a3f, { outlineT: 0.05 });
      grp.add(m);
      const cap = celPart(new THREE.BoxGeometry(1.95, 0.14, 0.5), 0x8a5a33, { outlineT: 0.04 });
      cap.position.y = 1.16;
      grp.add(cap);
      grp.rotation.y = Math.atan2(player.x - x, player.z - z);
      b.solid = { hw: 0.95, hd: 0.95 };
    } else if (b.type === 'fence') {
      const postGeo = new THREE.BoxGeometry(0.14, 1.15, 0.14);
      for (const px of [-0.75, 0.75]) {
        const p = celPart(postGeo, 0xb07a3f, { outlineT: 0.03 });
        p.position.set(px, 0.57, 0);
        grp.add(p);
      }
      for (const ry of [0.4, 0.8]) {
        const rail = celPart(new THREE.BoxGeometry(1.6, 0.12, 0.08), 0xc89055, { outlineT: 0.025 });
        rail.position.y = ry;
        grp.add(rail);
      }
      grp.rotation.y = Math.atan2(player.x - x, player.z - z);
      b.solid = { hw: 0.85, hd: 0.5 };
    } else if (b.type === 'campfire') {
      const ring = celPart(new THREE.DodecahedronGeometry(0.85, 0), 0x8d949c, { outlineT: 0.05 });
      ring.scale.set(1, 0.3, 1);
      ring.position.y = 0.12;
      grp.add(ring);
      for (let i = 0; i < 3; i++) {
        const log = celPart(new THREE.CylinderGeometry(0.09, 0.11, 0.8, 6), 0x7d4f26, { outlineT: 0.03 });
        log.rotation.z = Math.PI / 2 - 0.2;
        log.rotation.y = (i / 3) * Math.PI * 2;
        log.position.y = 0.32;
        grp.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.75, 7), new THREE.MeshBasicMaterial({ color: 0xf5a623, toneMapped: false }));
      flame.position.y = 0.62;
      grp.add(flame);
      const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 7), new THREE.MeshBasicMaterial({ color: 0xffd75e, toneMapped: false }));
      flame2.position.y = 0.55;
      grp.add(flame2);
      const light = new THREE.PointLight(0xff9d4d, 1.5, 20, 2);
      light.position.y = 1.1;
      grp.add(light);
      b.light = light; b.lightBase = 1.5;
      b.fire = { pos: new THREE.Vector3(x, h + 0.5, z) };
      b.flames = [flame, flame2];
    } else if (b.type === 'torch') {
      const pole = celPart(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 6), 0x7d4f26, { outlineT: 0.03 });
      pole.position.y = 1.0;
      grp.add(pole);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xf5a623, toneMapped: false }));
      flame.position.y = 2.15;
      grp.add(flame);
      const light = new THREE.PointLight(0xffa04d, 1.3, 16, 2);
      light.position.y = 2.3;
      grp.add(light);
      b.light = light; b.lightBase = 1.3;
      b.fire = { pos: new THREE.Vector3(x, h + 2.1, z) };
      b.flames = [flame];
    }
    scene.add(grp);
    b.mesh = grp;
    ctx.buildings.push(b);
    ctx.audio.sfx.place();
    ctx.particles.emit('spark', new THREE.Vector3(x, h + 0.5, z));
    return true;
  }

  // ---------- combat ----------
  function wearTool() {
    const res = ctx.inv.damageTool(1);
    if (res && res.broke) {
      ctx.audio.sfx.breakTool();
      toastMsg(`Your ${ITEMS[res.id].name} broke!`);
    }
  }

  function attack() {
    if (player.dead || player.attack.cd > 0) return;
    const sel = ctx.inv.selectedItem();
    const tool = sel && sel.tool ? sel.tool : null;
    const dmg = tool ? tool.dmg : 8;
    const range = tool ? tool.range : 1.9;
    player.attack.cd = tool ? 0.55 / tool.speed : 0.5;
    player.attack.t = 0.12;
    player.hand.swingT = 0.3;
    ctx.audio.sfx.swing();
    if (tool) wearTool();
    player._pendingHit = { dmg, range };
  }

  // ---------- gathering ----------
  // collision radii for solid vegetation (tree trunks + rocks); bushes are walkable
  const SOLID_R = { palm: 0.85, broad: 0.8, conifer: 0.8, rock: 1.7 };

  function findNode() {
    let best = null, bestD = 1e9;
    const dirX = -Math.sin(player.yaw), dirZ = -Math.cos(player.yaw);
    for (const n of world.nodes) {
      if (!n.alive) continue;
      if (n.type === 'bush' && !n.berriesAlive) continue;
      const spec = VEG_RADIUS[n.type] || 1.2;
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (d > spec + 2.4) continue;
      const ox = n.x - player.x, oz = n.z - player.z;
      const dot = (ox / (d || 1)) * dirX + (oz / (d || 1)) * dirZ;
      if (dot < 0.25) continue;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }
  const VEG_RADIUS = { palm: 1.5, broad: 1.4, conifer: 1.4, rock: 1.2, bush: 1.0 };

  function updateGathering(dt) {
    const g = player.gather;
    if (!ctx.input.eHeld) { g.node = null; g.progress = 0; return; }
    const n = findNode();
    if (!n) { g.node = null; g.progress = 0; return; }
    if (g.node !== n) { g.node = n; g.progress = 0; }
    const sel = ctx.inv.selectedItem();
    let mult = 1;
    if (sel && sel.tool) {
      if (sel.tool.chop && n.type !== 'rock') mult *= sel.tool.chop;
      if (sel.tool.mine && n.type === 'rock') mult *= sel.tool.mine;
    }
    g.progress += dt * 13 * mult;
    g.fxT -= dt;
    const hy = world.heightAt(n.x, n.z);
    if (g.fxT <= 0) {
      g.fxT = 0.14;
      const p = new THREE.Vector3(n.x + (Math.random() - 0.5), hy + 1.2, n.z + (Math.random() - 0.5));
      if (n.type === 'rock') { ctx.particles.emit('stone', p); ctx.audio.sfx.mine(); }
      else if (n.type === 'bush') { ctx.particles.emit('berry', p); ctx.audio.sfx.pick(); }
      else { ctx.particles.emit('wood', p); ctx.particles.emit('leaves', p); ctx.audio.sfx.chop(); }
    }
    if (g.progress >= n.hp) {
      const drops = n.type === 'bush'
        ? { berry: [2, 4] }
        : { palm: { wood: [4, 7], leaf: [2, 4] }, broad: { wood: [3, 6] }, conifer: { wood: [3, 6] }, rock: { stone: [3, 6] } }[n.type];
      world.spawnLoot({ x: n.x, z: n.z }, drops);
      const toolUsed = sel && sel.tool && ((sel.tool.chop && n.type !== 'rock') || (sel.tool.mine && n.type === 'rock'));
      if (toolUsed) wearTool();
      ctx.audio.sfx.breakNode();
      const p = new THREE.Vector3(n.x, hy + 1.2, n.z);
      if (n.type === 'rock') ctx.particles.emit('stone', p);
      else if (n.type === 'bush') ctx.particles.emit('berry', p);
      else { ctx.particles.emit('wood', p); ctx.particles.emit('leaves', p); }
      if (n.type === 'bush') {
        n.berriesAlive = false;
        n.respawnT = 90;
      } else {
        n.alive = false;
        n.grow = 0;
        n.respawnT = 150;
        n.hp = n.maxHp;
      }
      world.updateNode(n);
      g.node = null;
      g.progress = 0;
    }
  }

  // ---------- feeding ----------
  function feed() {
    if (player.dead) return;
    const sel = ctx.inv.selectedItem();
    if (!sel || !sel.food) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // Toss the food far enough to reach a skittish herbivore. A bronto flees as
    // soon as the player is within 15m, so a short toss (~10.7m at speed 15) can
    // never land on it — taming would be impossible. At speed 30 the throw
    // reaches ~21.5m, comfortably beyond the flee radius, so you can feed a
    // grazing bronto from a safe distance.
    const dino = ctx.dinos.findNearestDino(player.x, player.z, dir.x, dir.z, 26);
    const speed = 30;
    const v = dir.clone().multiplyScalar(speed);
    v.y += 3.2;
    player.projectiles.push({
      x: player.x + dir.x * 0.8, y: player.y + EYE - 0.15, z: player.z + dir.z * 0.8,
      vx: v.x, vy: v.y, vz: v.z,
      item: ctx.inv.selectedId(), dead: false,
    });
    ctx.inv.consumeSelected(1);
    ctx.audio.sfx.throwFood();
    player.hand.swingT = 0.25;
    if (dino) toastMsg(`Fed ${dino.tamed ? dino.name : 'the ' + dino.spec.label.toLowerCase()}`);
  }

  // ---------- context action ----------
  function drink() {
    if (player.water >= 99.5) { toastMsg('You are not thirsty.'); return; }
    player.water = clamp(player.water + 40, 0, 100);
    player.stamina = clamp(player.stamina - 6, 0, 100);
    ctx.particles.emit('splash', new THREE.Vector3(player.x, 0.25, player.z));
    ctx.audio.sfx.splash();
    ctx.audio.sfx.drink();
    toastMsg('Drank water');
  }

  function nearWater() {
    return player.inWater || world.heightAt(player.x, player.z) < 0.75;
  }

  function contextAction() {
    if (player.dead) return;
    const sel = ctx.inv.selectedItem();
    // 1. place building
    if (sel && sel.build) {
      if (ghostPos && ghostValid) {
        placeBuilding();
        ctx.inv.consumeSelected(1);
      } else if (!ghostPos) {
        toastMsg('Aim at the ground to place it');
      } else {
        toastMsg('Cannot place here');
      }
      return;
    }
    // 2. cook at campfire
    const nearFire = ctx.buildings.find(b => b.type === 'campfire' && Math.hypot(b.x - player.x, b.z - player.z) < 3.6);
    if (nearFire && ctx.inv.count('meat') > 0 && (!sel || sel.id === 'meat')) {
      ctx.inv.consume('meat', 1);
      ctx.inv.add('cooked', 1);
      ctx.audio.sfx.cook();
      ctx.particles.emit('steam', new THREE.Vector3(nearFire.x, nearFire.h + 1, nearFire.z));
      toastMsg('Cooked meat!');
      return;
    }
    // 3. eat / use selected food — unless you are picking berries off a bush
    const node = findNode();
    const canEat = sel && (sel.food || sel.heal);
    if (canEat && !(node && node.type === 'bush' && sel.food)) {
      if (sel.food) {
        player.hunger = clamp(player.hunger + sel.food, 0, 100);
        player.water = clamp(player.water + (sel.id === 'berry' ? 6 : sel.id === 'cooked' ? 4 : 0), 0, 100);
        ctx.inv.consumeSelected(1);
        ctx.audio.sfx.eat();
        toastMsg(`Ate ${sel.name} (+${sel.food} food)`);
      } else if (sel.heal) {
        player.health = clamp(player.health + sel.heal, 0, 100);
        ctx.inv.consumeSelected(1);
        ctx.audio.sfx.heal();
        toastMsg(`Used ${sel.name} (+${sel.heal} HP)`);
      }
      return;
    }
    // 4. gather node (hold E) — progress is driven by updateGathering while E is held
    if (node) return;
    // 5. drink from the shallows
    if (nearWater()) { drink(); return; }
  }

  // ---------- damage / death ----------
  function takeDamage(dmg, fromX, fromZ) {
    if (player.dead || player.invulnT > 0) return;
    player.health -= dmg;
    player.swayX += (Math.random() - 0.5) * 0.3;
    player.swayZ += (Math.random() - 0.5) * 0.22;
    const dx = player.x - fromX, dz = player.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    player.x += (dx / d) * 1.2;
    player.z += (dz / d) * 1.2;
    ctx.audio.sfx.hurt();
    ctx.hud.flashDamage();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      ctx.onDeath();
    }
  }

  function respawn() {
    player.x = sx; player.z = sz;
    player.y = world.heightAt(sx, sz);
    player.health = 100;
    player.hunger = Math.max(player.hunger, 50);
    player.water = 100;
    player.stamina = 100;
    player.dead = false;
    player.invulnT = 5;
    for (const d of ctx.dinos.dinos) { d.aggro = false; d.aggroPlayer = false; d.state = 'wander'; d.stateT = 0; }
  }
  player.takeDamage = takeDamage;

  // ---------- main update ----------
  function update(dt, time) {
    const input = ctx.input;
    if (player.dead) return;
    player.invulnT = Math.max(0, player.invulnT - dt);
    player.attack.cd = Math.max(0, player.attack.cd - dt);

    // active hit frame
    if (player.attack.t > 0) {
      player.attack.t -= dt;
      if (player.attack.t <= 0 && player._pendingHit) {
        const dirX = -Math.sin(player.yaw), dirZ = -Math.cos(player.yaw);
        ctx.dinos.damageNearestInArc(player.x, player.y, player.z, dirX, dirZ, player._pendingHit.range, player._pendingHit.dmg, ctx);
        player._pendingHit = null;
      }
    }

    // movement
    const f = (input.w ? 1 : 0) - (input.s ? 1 : 0);
    const s = (input.d ? 1 : 0) - (input.a ? 1 : 0);
    let mx = -Math.sin(player.yaw) * f + Math.cos(player.yaw) * s;
    let mz = -Math.cos(player.yaw) * f - Math.sin(player.yaw) * s;
    const ml = Math.hypot(mx, mz);
    const wantsSprint = input.shift && f > 0 && player.stamina > 1;
    player.sprinting = wantsSprint;
    const groundY = world.heightAt(player.x, player.z);
    const depth = groundY;
    player.inWater = depth < 0.35;
    let speed = wantsSprint ? 8.6 : 5.0;
    if (player.inWater) speed *= depth < -1.0 ? 0.4 : 0.6;
    if (ml > 0) {
      mx /= ml; mz /= ml;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.moveAmt = wantsSprint ? 1 : 0.55;
    } else {
      player.moveAmt = 0;
    }
    // expose actual movement for the pet-follow logic: pets only trail while
    // the player is genuinely moving. lastMovePos updates ONLY while moving,
    // so when the player stops (or just spins the camera) partners anchor to
    // where they last followed from instead of swinging around the player.
    player.isMoving = ml > 0;
    if (ml > 0) {
      player.lastMovePos = { x: player.x, z: player.z, yaw: player.yaw };
    } else if (!player.lastMovePos) {
      player.lastMovePos = { x: player.x, z: player.z, yaw: player.yaw };
    }
    // island bound
    const dc = Math.hypot(player.x, player.z);
    if (dc > 184) {
      const k = 184 / dc;
      player.x *= k; player.z *= k;
      if (Math.random() < dt * 0.5) toastMsg('Stay on the island!');
    }
    // building collision
    for (const b of ctx.buildings) {
      if (!b.solid) continue;
      const hw = b.solid.hw + 0.45, hd = b.solid.hd + 0.45;
      if (Math.abs(player.x - b.x) < hw && Math.abs(player.z - b.z) < hd) {
        const ox = hw - Math.abs(player.x - b.x);
        const oz = hd - Math.abs(player.z - b.z);
        if (ox < oz) player.x += (player.x > b.x ? ox : -ox);
        else player.z += (player.z > b.z ? oz : -oz);
      }
    }
    // vegetation collision (trees & rocks block; bushes are walkable)
    for (const n of world.nodes) {
      if (!n.alive) continue;
      const base = SOLID_R[n.type];
      if (!base) continue;
      const R = base * n.s;
      const dx = player.x - n.x, dz = player.z - n.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1e-4;
        const push = (R - d) / d;
        player.x += dx * push;
        player.z += dz * push;
      }
    }
    // collect dropped pickups
    player.pickupToastT = Math.max(0, player.pickupToastT - dt);
    player.fullToastT = Math.max(0, player.fullToastT - dt);
    let collected = null, fullMsg = false;
    for (let i = world.pickups.length - 1; i >= 0; i--) {
      const pk = world.pickups[i];
      if (Math.hypot(pk.x - player.x, pk.z - player.z) < 1.7) {
        const rem = ctx.inv.add(pk.item, pk.count);
        if (rem <= 0) {
          world.removePickup(i);
          ctx.audio.sfx.pick();
          collected = collected || {};
          collected[pk.item] = (collected[pk.item] || 0) + pk.count;
        } else {
          pk.count = rem; // inventory full — keep the rest on the ground
          fullMsg = true;
        }
      }
    }
    if (collected && player.pickupToastT <= 0) {
      player.pickupToastT = 1.2;
      const parts = Object.entries(collected).map(([id, n]) => `${ITEMS[id].name} ×${n}`);
      toastMsg(`Picked up ${parts.join(', ')}`);
    }
    if (fullMsg && player.fullToastT <= 0) {
      player.fullToastT = 2.5;
      toastMsg('Inventory full!');
    }
    // vertical
    const gy = Math.max(world.heightAt(player.x, player.z), -1.3);
    if (player.onGround) {
      if (input.space && player.stamina > 5) {
        player.velY = 8.2;
        player.onGround = false;
        player.stamina -= 6;
      } else {
        player.y = gy;
      }
    }
    if (!player.onGround) {
      player.velY -= 23 * dt;
      player.y += player.velY * dt;
      if (player.y <= gy) {
        player.y = gy;
        player.onGround = true;
        player.velY = 0;
        if (player.inWater) ctx.particles.emit('splash', new THREE.Vector3(player.x, 0.2, player.z));
      }
    }

    // head bob
    if (player.moveAmt > 0 && player.onGround) {
      player.bobPhase += dt * speed * 1.55;
    }
    const bobY = Math.sin(player.bobPhase * 2) * 0.05 * player.moveAmt;
    const bobX = Math.cos(player.bobPhase) * 0.035 * player.moveAmt;
    // sway decay
    player.swayX *= Math.exp(-3.2 * dt);
    player.swayZ *= Math.exp(-3.2 * dt);
    camera.position.set(player.x + bobX, player.y + EYE + bobY, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + player.swayX;
    camera.rotation.z = player.swayZ;

    // footsteps + dust
    if (player.moveAmt > 0 && player.onGround) {
      player.footT -= dt * (wantsSprint ? 1.7 : 1);
      if (player.footT <= 0) {
        player.footT = 0.42;
        const biome = world.biomeAt(player.x, player.z);
        const colors = DUST_COLORS[biome] || DUST_COLORS.plains;
        if (player.inWater) {
          ctx.particles.emit('splash', new THREE.Vector3(player.x, 0.15, player.z));
          ctx.audio.sfx.splash();
        } else {
          ctx.particles.emit('dust', new THREE.Vector3(player.x, player.y + 0.1, player.z), colors);
          ctx.audio.sfx.footstep(biome === 'beach' ? 'sand' : biome === 'highland' ? 'rock' : 'grass');
        }
      }
    }

    // survival
    player.hunger = clamp(player.hunger - dt * 0.13, 0, 100);
    player.water = clamp(player.water - dt * 0.11, 0, 100);
    const starving = player.hunger <= 0, dehydrated = player.water <= 0;
    if (starving || dehydrated) {
      player.health = Math.max(0, player.health - dt * (starving && dehydrated ? 2.4 : 1.3));
    }
    if (wantsSprint) player.stamina = clamp(player.stamina - dt * 13, 0, 100);
    else player.stamina = clamp(player.stamina + dt * 9, 0, 100);
    if (player.hunger > 60 && player.water > 50 && player.health < 100) player.health = clamp(player.health + dt * 1.4, 0, 100);

    // gathering
    updateGathering(dt);

    // projectiles
    for (const pr of player.projectiles) {
      if (pr.dead) continue;
      pr.vy -= 15 * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
      if (pr.y < world.heightAt(pr.x, pr.z) + 0.1) pr.dead = true;
    }
    player.projectiles = player.projectiles.filter(p => !p.dead);

    // hand animation
    const h = player.hand;
    if (h.swingT > 0) {
      h.swingT -= dt;
      const k = 1 - Math.max(0, h.swingT) / 0.3;
      hand.rotation.x = 0.1 - Math.sin(k * Math.PI) * 1.25;
    } else if (player.gather.node) {
      hand.rotation.x = 0.1 - 0.5 + Math.sin(time * 15) * 0.22;
    } else {
      hand.rotation.x += (0.1 - hand.rotation.x) * Math.min(1, dt * 10);
    }
    if (h.tool && h.tool.userData && h.tool.userData.flame) {
      h.tool.userData.flame.scale.y = 0.85 + 0.3 * Math.sin(time * 13);
    }

    // ghost
    updateGhost(dt);
  }

  return {
    player,
    update,
    attack,
    feed,
    contextAction,
    takeDamage,
    respawn,
    setHandTool,
    findNode,
    ghostState: () => ({ pos: ghostPos, valid: ghostValid }),
  };
}
