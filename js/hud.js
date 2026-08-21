// HUD: DOM panels, bars, hotbar, minimap, prompts, crafting, toasts, overlays.
import { ITEMS, RECIPES, itemIcon } from './items.js';

const MM_COLORS = {
  water: '#3a7ca5', beach: '#e8d7a2', jungle: '#3e7c3a', plains: '#b3a94e', highland: '#5d8a80',
};

export function createHud(G) {
  const $ = id => document.getElementById(id);
  const el = {
    hp: $('bar-hp'), st: $('bar-st'), hu: $('bar-hu'), wt: $('bar-wt'),
    hotbar: $('hotbar'),
    minimap: $('minimap'),
    time: $('time-label'), biome: $('biome-label'),
    prompt: $('prompt'),
    gatherWrap: $('gather-wrap'), gatherFill: $('gather-fill'),
    tameWrap: $('tame-wrap'), tameFill: $('tame-fill'), tameLabel: $('tame-label'),
    craft: $('craft'), craftList: $('craft-list'),
    toast: $('toast'),
    vignette: $('vignette'),
    start: $('start'), dead: $('dead'), pause: $('pause'), help: $('help'),
    tamedCount: $('tamed-count'), tamedMode: $('tamed-mode'),
  };

  // ---------- hotbar ----------
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.innerHTML = '<img alt=""><span class="cnt"></span><div class="dur"><i></i></div>';
    s.addEventListener('mousedown', e => {
      e.stopPropagation();
      G.inv.select(i);
    });
    el.hotbar.appendChild(s);
    slots.push(s);
  }
  function refreshHotbar() {
    for (let i = 0; i < 9; i++) {
      const it = G.inv.slots[i];
      const img = slots[i].querySelector('img');
      const cnt = slots[i].querySelector('.cnt');
      const durWrap = slots[i].querySelector('.dur');
      const durBar = slots[i].querySelector('.dur i');
      if (it) {
        img.src = itemIcon(it.id);
        img.style.display = '';
        cnt.textContent = it.count > 1 ? it.count : '';
        slots[i].title = `${ITEMS[it.id].name}${it.count > 1 ? ' ×' + it.count : ''}`;
        const tool = ITEMS[it.id].tool;
        if (tool && tool.dur && it.dur != null) {
          durWrap.style.display = '';
          durBar.style.width = Math.max(2, (it.dur / tool.dur) * 100) + '%';
          durBar.style.background = it.dur <= tool.dur * 0.25 ? '#e5484d' : '';
        } else {
          durWrap.style.display = 'none';
        }
      } else {
        img.style.display = 'none';
        cnt.textContent = '';
        slots[i].title = '';
        durWrap.style.display = 'none';
      }
      slots[i].classList.toggle('sel', G.inv.selected === i);
    }
    G.player.setHandTool(G.inv.selectedItem() ? G.inv.selectedItem().id : null);
  }

  // ---------- minimap base ----------
  const mmSize = 150;
  const base = document.createElement('canvas');
  base.width = base.height = 128;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(128, 128);
  for (let py = 0; py < 128; py++) {
    for (let px = 0; px < 128; px++) {
      const wx = (px / 128 - 0.5) * 400;
      const wz = (py / 128 - 0.5) * 400;
      const b = G.world.biomeAt(wx, wz);
      const c = MM_COLORS[b] || '#000';
      const i = (py * 128 + px) * 4;
      img.data[i] = parseInt(c.slice(1, 3), 16);
      img.data[i + 1] = parseInt(c.slice(3, 5), 16);
      img.data[i + 2] = parseInt(c.slice(5, 7), 16);
      img.data[i + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);
  const mctx = el.minimap.getContext('2d');

  function drawMinimap() {
    mctx.clearRect(0, 0, mmSize, mmSize);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(base, 0, 0, mmSize, mmSize);
    const toMap = (x, z) => [(x + 200) / 400 * mmSize, (z + 200) / 400 * mmSize];
    // dinos
    for (const d of G.dinos.dinos) {
      if (d.dead) continue;
      const [mx, my] = toMap(d.x, d.z);
      let col = '#e8e2d2';
      if (d.tamed) col = '#7ac74f';
      else if (d.state === 'hunt' || d.aggro) col = '#ff5040';
      mctx.fillStyle = col;
      const r = d.species === 'bronto' ? 4 : d.species === 'trex' ? 3.5 : 2.5;
      mctx.beginPath();
      mctx.arc(mx, my, r, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#14100c';
      mctx.lineWidth = 1;
      mctx.stroke();
    }
    // player arrow
    const [px, py] = toMap(G.player.player.x, G.player.player.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(-G.player.player.yaw);
    mctx.fillStyle = '#ffffff';
    mctx.strokeStyle = '#14100c';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4.5, 5);
    mctx.lineTo(0, 2.5);
    mctx.lineTo(-4.5, 5);
    mctx.closePath();
    mctx.fill();
    mctx.stroke();
    mctx.restore();
  }

  // ---------- prompt ----------
  let lastPrompt = '';
  function setPrompt(text, cls = '') {
    if (text === lastPrompt) return;
    lastPrompt = text;
    if (text) {
      el.prompt.textContent = text;
      el.prompt.className = 'show ' + cls;
    } else {
      el.prompt.className = '';
    }
  }

  function computePrompt() {
    const p = G.player.player;
    const sel = G.inv.selectedItem();
    const gs = G.player.ghostState();
    // 1. building ghost — explain why placement fails
    if (sel && sel.build) {
      if (!gs.pos) setPrompt('Aim at the ground to place it', 'bad');
      else setPrompt(gs.valid ? `E — Place ${sel.name}` : 'Cannot place here', gs.valid ? '' : 'bad');
      return;
    }
    const dirX = -Math.sin(p.yaw), dirZ = -Math.cos(p.yaw);
    // 2. feeding a dino you are looking at
    const dino = G.dinos.findNearestDino(p.x, p.z, dirX, dirZ, 9);
    if (dino && sel && sel.food) {
      setPrompt(`F — Throw ${sel.name} to ${dino.tamed ? dino.name : 'the ' + dino.spec.label.toLowerCase()}`);
      return;
    }
    // 3. cooking at a nearby campfire
    const fire = G.buildings.find(b => b.type === 'campfire' && Math.hypot(b.x - p.x, b.z - p.z) < 3.6);
    if (fire && G.inv.count('meat') > 0) { setPrompt('E — Cook meat'); return; }
    // 4. eating/using selected food — unless you are picking berries off a bush
    const node = G.player.findNode ? G.player.findNode() : null;
    if (sel && (sel.food || sel.heal) && !(node && node.type === 'bush' && sel.food)) {
      setPrompt(sel.food ? `E — Eat ${sel.name}  ·  F — Throw` : `E — Use ${sel.name}`);
      return;
    }
    // 5. gather node you are looking at
    if (node) {
      const label = { palm: 'Chop palm', broad: 'Chop tree', conifer: 'Chop pine', rock: 'Mine rock', bush: 'Pick berries' }[node.type];
      setPrompt(`Hold E — ${label}`);
      return;
    }
    // 6. drink from the shallows
    const nearWater = p.inWater || G.world.heightAt(p.x, p.z) < 0.75;
    if (nearWater && !(sel && (sel.food || sel.heal))) { setPrompt('E — Drink water'); return; }
    // 7. tamed dinos
    if (G.dinos.tamedCount() > 0) { setPrompt('G — Follow/Stay · T — Call'); return; }
    setPrompt('');
  }

  // ---------- crafting ----------
  function buildCraft() {
    el.craftList.innerHTML = '';
    for (const r of RECIPES) {
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.dataset.id = r.id;
      const costHtml = Object.entries(r.cost).map(([id, n]) =>
        `<span class="cost" data-item="${id}"><img src="${itemIcon(id)}"><b>${n}</b></span>`).join('');
      row.innerHTML = `<img class="cicon" src="${itemIcon(r.id)}"><div class="cinfo"><div class="cname">${r.name}</div><div class="cdesc">${r.desc}</div></div><div class="ccost">${costHtml}</div>`;
      row.title = r.desc;
      row.addEventListener('click', () => {
        if (G.inv.craft(r.id)) {
          G.audio.sfx.craft();
          G.hud.toast(`Crafted ${r.name}`);
          refreshHotbar();
          updateCraftAfford();
        } else {
          G.hud.toast('Missing materials');
        }
      });
      el.craftList.appendChild(row);
    }
  }
  function updateCraftAfford() {
    for (const row of el.craftList.children) {
      const r = RECIPES.find(x => x.id === row.dataset.id);
      let ok = true;
      for (const [id, n] of Object.entries(r.cost)) {
        const have = G.inv.count(id);
        const chip = row.querySelector(`[data-item="${id}"]`);
        if (chip) chip.classList.toggle('lack', have < n);
        if (have < n) ok = false;
      }
      row.classList.toggle('can', ok);
    }
  }
  function setCraft(open) {
    el.craft.classList.toggle('show', open);
    if (open) updateCraftAfford();
  }

  // ---------- toast ----------
  let toastT = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    toastT = 2.6;
  }

  // ---------- damage vignette ----------
  let vigT = 0;
  function flashDamage() { vigT = 0.55; }

  // ---------- onboarding hints (shown once) ----------
  const hints = { gather: false, craft: false, night: false, water: false, hunger: false, tame: false };

  // ---------- main update ----------
  let mmT = 0;
  function update(dt, G2) {
    const p = G.player.player;
    el.hp.style.width = p.health + '%';
    el.st.style.width = p.stamina + '%';
    el.hu.style.width = p.hunger + '%';
    el.wt.style.width = p.water + '%';
    el.hp.parentElement.classList.toggle('low', p.health < 30);
    el.hu.parentElement.classList.toggle('low', p.hunger < 25);
    el.wt.parentElement.classList.toggle('low', p.water < 25);

    // time
    const t = G2.time.t;
    const day = G2.time.day;
    const hours = Math.floor(t * 24);
    const mins = Math.floor((t * 24 - hours) * 60);
    const icon = t > 0.27 && t < 0.73 ? '☀' : '☾';
    el.time.textContent = `${icon} Day ${day} — ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const biome = G2.world.biomeAt(p.x, p.z);
    el.biome.textContent = { jungle: 'Sunbaked Jungle', plains: 'Golden Plains', highland: 'Misty Highlands', beach: 'Coastline', water: 'Shallows' }[biome] || '';

    computePrompt();

    // gather bar
    const g = G.player.player.gather;
    if (g.node) {
      el.gatherWrap.classList.add('show');
      el.gatherFill.style.width = Math.min(100, (g.progress / g.node.hp) * 100) + '%';
    } else {
      el.gatherWrap.classList.remove('show');
    }

    // tame bar
    if (G2.tameFocus && G2.tameFocus.t > 0) {
      const d = G2.tameFocus.dino;
      if (d.tamed || d.dead) G2.tameFocus = null;
      else {
        el.tameWrap.classList.add('show');
        el.tameFill.style.width = d.tameProgress + '%';
        el.tameLabel.textContent = `Taming ${d.spec.label} — ${Math.floor(d.tameProgress)}%`;
      }
    } else {
      el.tameWrap.classList.remove('show');
    }

    // toast
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) el.toast.classList.remove('show');
    }
    // vignette
    if (vigT > 0) {
      vigT -= dt;
      el.vignette.style.opacity = Math.max(0, vigT / 0.55) * 0.55;
    } else {
      el.vignette.style.opacity = p.health < 30 ? 0.25 + 0.1 * Math.sin(G2.timeAbs * 4) : 0;
    }

    el.tamedCount.textContent = G.dinos.tamedCount();
    el.tamedMode.textContent = G.tamedMode === 'stay' ? 'STAY' : 'FOLLOW';

    // onboarding hints
    if (G2.started && G2.timeAbs > 12 && !hints.gather) { hints.gather = true; toast('Hold E on trees, rocks and bushes to gather materials.'); }
    if (!hints.craft && G.inv.count('wood') >= 3 && G.inv.count('stone') >= 1) { hints.craft = true; toast('Press C to open crafting.'); }
    if (!hints.night && G2.time.t > 0.78 && G2.timeAbs > 45) { hints.night = true; toast('Night is falling — build a campfire or torch to stay safe.'); }
    if (!hints.water && p.water < 45) { hints.water = true; toast('You are thirsty — stand in the shallows and press E to drink.'); }
    if (!hints.hunger && p.hunger < 45) { hints.hunger = true; toast('You are hungry — eat berries or cooked meat.'); }
    if (!hints.tame && (G.inv.count('meat') > 0 || G.inv.count('berry') > 0)) {
      hints.tame = true;
      toast('Tame dinos: select food and press F to throw it — Saberclaws eat meat, Mossbacks eat berries.');
    }

    mmT -= dt;
    if (mmT <= 0) { mmT = 0.12; drawMinimap(); }
  }

  buildCraft();
  refreshHotbar();

  return {
    update,
    toast,
    flashDamage,
    refreshHotbar,
    setCraft,
    craftOpen: () => el.craft.classList.contains('show'),
    setOverlay(name) {
      el.start.classList.toggle('show', name === 'start');
      el.dead.classList.toggle('show', name === 'dead');
      el.pause.classList.toggle('show', name === 'pause');
      el.help.classList.toggle('show', name === 'help');
    },
  };
}
