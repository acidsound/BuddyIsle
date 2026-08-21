// Inventory: 9 hotbar slots, stacking, crafting.
import { ITEMS, RECIPES } from './items.js';

export function createInventory() {
  const slots = new Array(9).fill(null);
  let selected = 0;
  let version = 0;
  const bump = () => { version++; };

  function count(id) {
    let n = 0;
    for (const s of slots) if (s && s.id === id) n += s.count;
    return n;
  }

  function add(id, n) {
    const def = ITEMS[id];
    const stack = def ? def.stack : 1;
    let rem = n;
    for (let i = 0; i < 9 && rem > 0; i++) {
      const s = slots[i];
      if (s && s.id === id && s.count < stack) {
        const take = Math.min(stack - s.count, rem);
        s.count += take; rem -= take;
      }
    }
    for (let i = 0; i < 9 && rem > 0; i++) {
      if (!slots[i]) {
        const take = Math.min(stack, rem);
        slots[i] = { id, count: take };
        rem -= take;
      }
    }
    bump();
    return rem;
  }

  function consume(id, n) {
    let rem = n;
    for (let i = 8; i >= 0 && rem > 0; i--) {
      const s = slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, rem);
        s.count -= take; rem -= take;
        if (s.count <= 0) slots[i] = null;
      }
    }
    bump();
  }

  function consumeSelected(n) {
    const s = slots[selected];
    if (s) consume(s.id, n);
  }

  function selectedItem() {
    const s = slots[selected];
    return s ? ITEMS[s.id] : null;
  }

  function craft(id) {
    const r = RECIPES.find(x => x.id === id);
    if (!r) return false;
    for (const [cid, n] of Object.entries(r.cost)) if (count(cid) < n) return false;
    for (const [cid, n] of Object.entries(r.cost)) consume(cid, n);
    add(id, 1);
    return true;
  }

  return {
    slots,
    get selected() { return selected; },
    get version() { return version; },
    select(i) { selected = ((i % 9) + 9) % 9; bump(); },
    count, add, consume, consumeSelected, selectedItem, craft,
  };
}
