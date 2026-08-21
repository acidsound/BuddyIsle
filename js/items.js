// Item definitions, crafting recipes, and procedural cel-style icon painter.

export const ITEMS = {
  wood:      { name: 'Wood',      stack: 30 },
  stone:     { name: 'Stone',     stack: 30 },
  leaf:      { name: 'Leaves',    stack: 30 },
  berry:     { name: 'Berries',   stack: 10, food: 12, tame: 'bronto' },
  meat:      { name: 'Raw Meat',  stack: 10, food: 20, tame: 'raptor' },
  cooked:    { name: 'Cooked Meat', stack: 10, food: 50 },
  bandage:   { name: 'Bandage',   stack: 10, heal: 25 },
  spear:     { name: 'Wooden Spear', stack: 1, tool: { dmg: 30, range: 3.0, speed: 1.15, dur: 30 } },
  axe:       { name: 'Stone Axe',    stack: 1, tool: { chop: 3, dur: 45 } },
  pick:      { name: 'Stone Pick',   stack: 1, tool: { mine: 3, dur: 45 } },
  wall:      { name: 'Wood Wall', stack: 10, build: 'wall' },
  fence:     { name: 'Fence',     stack: 10, build: 'fence' },
  campfire:  { name: 'Campfire',  stack: 5,  build: 'campfire' },
  torch:     { name: 'Torch',     stack: 5,  build: 'torch' },
};

export const RECIPES = [
  { id: 'spear',    name: 'Wooden Spear', cost: { wood: 3, stone: 1 }, desc: 'Melee weapon. Solid pointy thing.' },
  { id: 'axe',      name: 'Stone Axe',    cost: { wood: 2, stone: 2 }, desc: 'Chops trees 3x faster.' },
  { id: 'pick',     name: 'Stone Pick',   cost: { wood: 2, stone: 2 }, desc: 'Mines rock 3x faster.' },
  { id: 'bandage',  name: 'Bandage',      cost: { leaf: 3 },           desc: 'Heals 25 HP. Press E to use.' },
  { id: 'torch',    name: 'Torch',        cost: { wood: 2, leaf: 1 },  desc: 'Placeable light for the dark.' },
  { id: 'fence',    name: 'Fence',        cost: { wood: 2 },           desc: 'Cheap perimeter. Looks great.' },
  { id: 'wall',     name: 'Wood Wall',    cost: { wood: 4 },           desc: 'Sturdy wall for your base.' },
  { id: 'campfire', name: 'Campfire',     cost: { wood: 2, stone: 5 }, desc: 'Light + cooks raw meat.' },
];

// ---------- icon painter (48x48 canvas, flat poster shapes + ink outline) ----------
const cache = {};

function ink(ctx) { ctx.strokeStyle = '#14100c'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ink(ctx); ctx.stroke();
}
function circ(ctx, x, y, r, fill) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ink(ctx); ctx.stroke();
}
function rect(ctx, x, y, w, h, fill, r = 2) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ink(ctx); ctx.stroke();
}

const painters = {
  wood(ctx) {
    ctx.save(); ctx.translate(24, 24); ctx.rotate(-0.5);
    rect(ctx, -16, -6, 32, 12, '#a06a35');
    circ(ctx, 16, 0, 6, '#d9a866');
    ctx.beginPath(); ctx.arc(16, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#a06a35'; ctx.fill();
    ctx.restore();
  },
  stone(ctx) {
    poly(ctx, [[10, 34], [6, 20], [16, 10], [32, 12], [40, 26], [30, 38]], '#8d949c');
    poly(ctx, [[16, 10], [32, 12], [26, 22]], '#aab2ba');
  },
  leaf(ctx) {
    poly(ctx, [[24, 6], [38, 18], [34, 38], [24, 44], [14, 38], [10, 18]], '#5f9e42');
    ctx.beginPath(); ctx.moveTo(24, 44); ctx.lineTo(24, 10); ink(ctx); ctx.stroke();
  },
  berry(ctx) {
    circ(ctx, 17, 28, 9, '#d8452e');
    circ(ctx, 31, 28, 9, '#e8563a');
    circ(ctx, 24, 16, 9, '#c23a26');
    poly(ctx, [[24, 10], [30, 4], [26, 12]], '#5f9e42');
  },
  meat(ctx) {
    poly(ctx, [[10, 30], [20, 14], [34, 12], [40, 22], [30, 34], [16, 38]], '#b5432c');
    circ(ctx, 36, 34, 5, '#e8e2d2');
    circ(ctx, 36, 34, 2, '#b5432c');
  },
  cooked(ctx) {
    poly(ctx, [[10, 30], [20, 14], [34, 12], [40, 22], [30, 34], [16, 38]], '#8a3a1e');
    poly(ctx, [[14, 26], [22, 16], [32, 15]], '#c25a2e');
    circ(ctx, 36, 34, 5, '#e8e2d2');
  },
  bandage(ctx) {
    rect(ctx, 8, 18, 32, 12, '#e8e2d2');
    rect(ctx, 18, 8, 12, 32, '#e8e2d2');
    ctx.fillStyle = '#c9c2ae';
    ctx.fillRect(21, 21, 3, 3); ctx.fillRect(26, 21, 3, 3); ctx.fillRect(21, 26, 3, 3); ctx.fillRect(26, 26, 3, 3);
  },
  spear(ctx) {
    ctx.save(); ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
    rect(ctx, -3, -14, 6, 30, '#a06a35');
    poly(ctx, [[-6, -14], [0, -26], [6, -14]], '#c8cdd2');
    ctx.restore();
  },
  axe(ctx) {
    ctx.save(); ctx.translate(24, 26); ctx.rotate(-Math.PI / 4);
    rect(ctx, -2.5, -10, 5, 26, '#a06a35');
    poly(ctx, [[-2, -20], [10, -16], [10, -6], [-2, -8]], '#8d949c');
    ctx.restore();
  },
  pick(ctx) {
    ctx.save(); ctx.translate(24, 26); ctx.rotate(-Math.PI / 4);
    rect(ctx, -2.5, -10, 5, 26, '#a06a35');
    poly(ctx, [[-14, -12], [0, -20], [14, -12], [0, -14]], '#8d949c');
    ctx.restore();
  },
  wall(ctx) {
    rect(ctx, 8, 10, 32, 30, '#b07a3f');
    ctx.strokeStyle = '#14100c'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(40, 20); ctx.moveTo(8, 30); ctx.lineTo(40, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(24, 20); ctx.moveTo(16, 20); ctx.lineTo(16, 30); ctx.moveTo(32, 20); ctx.lineTo(32, 30); ctx.stroke();
  },
  fence(ctx) {
    rect(ctx, 10, 12, 6, 26, '#b07a3f');
    rect(ctx, 32, 12, 6, 26, '#b07a3f');
    rect(ctx, 6, 18, 36, 5, '#c89055');
    rect(ctx, 6, 28, 36, 5, '#c89055');
  },
  campfire(ctx) {
    poly(ctx, [[10, 38], [38, 38], [33, 44], [15, 44]], '#8d949c');
    poly(ctx, [[24, 8], [32, 22], [28, 20], [34, 34], [24, 28], [14, 34], [20, 20], [16, 22]], '#f5a623');
    poly(ctx, [[24, 16], [28, 24], [24, 32], [20, 24]], '#ffd75e');
  },
  torch(ctx) {
    rect(ctx, 20, 18, 8, 24, '#a06a35');
    poly(ctx, [[24, 4], [31, 14], [27, 12], [30, 20], [24, 16], [18, 20], [21, 12], [17, 14]], '#f5a623');
  },
};

export function itemIcon(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 48, 48);
  (painters[id] || painters.stone)(ctx);
  cache[id] = c.toDataURL();
  return cache[id];
}
