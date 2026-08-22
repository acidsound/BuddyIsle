// Species registry — Pokémon island survival edition.
// Each species maps to a GLB in assets/monsters/<slug>.glb (fetched via tools/fetch-pokemon.mjs).
// The old dinosaur keys (raptor/bronto/trex) are kept as legacy aliases so existing
// tests and save-less code paths keep working during the transition.

const LEGACY_RAPTOR = {
  kind: 'theropod', label: 'Saberclaw', legacy: true, glb: 'eevee.glb',
  scale: 0.92, walk: 3.4, run: 10, hp: 55, dmg: 8, atkRange: 2.4, atkCd: 1.0,
  body: 0x6b8f3f, belly: 0xd8cfa0, accent: 0xff7a1a, eye: 0xffd23d,
  sil: 0x242b1c, silAccent: 0xff9a3d,
  temperament: 'hostile',
  tameFood: 'meat', tameFeeds: 4,
  loot: { meat: [2, 3] },
  hitR: 1.1, avoidWater: false,
  biomes: ['jungle'],
};
const LEGACY_BRONTO = {
  kind: 'sauropod', label: 'Mossback', legacy: true, glb: 'snorlax.glb',
  scale: 1.55, walk: 1.9, run: 6, hp: 320, dmg: 18, atkRange: 3.4, atkCd: 1.7,
  body: 0x9a7d55, belly: 0xcfc0a0, accent: 0xffc23d, eye: 0x3a2a1a,
  sil: 0x2e2a20, silAccent: 0xffc23d,
  temperament: 'passive',
  tameFood: 'berry', tameFeeds: 3,
  loot: { meat: [5, 8], leaf: [2, 4] },
  hitR: 3.4, avoidWater: true,
  biomes: ['plains'],
};
const LEGACY_TREX = {
  kind: 'theropod', label: 'Rexmaw', legacy: true, glb: 'charmander.glb',
  scale: 2.1, walk: 2.7, run: 11, hp: 420, dmg: 28, atkRange: 3.2, atkCd: 1.5,
  body: 0x4a5d43, belly: 0x8a9478, accent: 0xff3b30, eye: 0xff3b30,
  sil: 0x1c211a, silAccent: 0xff5040,
  temperament: 'hostile',
  tameFood: null,
  loot: { meat: [6, 10] },
  hitR: 2.6, avoidWater: true,
  biomes: ['highland'],
};

export const SPECIES = {
  // ---- starters & common tames ----
  pikachu: {
    kind: 'pokemon', label: 'Pikachu', glb: 'pikachu.glb',
    scale: 0.85, walk: 3.6, run: 10.5, hp: 60, dmg: 9, atkRange: 2.2, atkCd: 0.9,
    body: 0xf5d442, accent: 0xe84b31, eye: 0x191919,
    sil: 0x3a3115, silAccent: 0xffe14d,
    temperament: 'neutral',           // fights back when hit, doesn't hunt you
    tameFood: 'berry', tameFeeds: 3,
    loot: { meat: [1, 2] },
    hitR: 0.9, avoidWater: true,
    biomes: ['plains'],
  },
  eevee: {
    kind: 'pokemon', label: 'Eevee', glb: 'eevee.glb',
    scale: 0.75, walk: 3.4, run: 9.5, hp: 50, dmg: 7, atkRange: 2.0, atkCd: 1.0,
    body: 0xb98a5a, accent: 0xf2e6cf, eye: 0x2a2018,
    sil: 0x35291c, silAccent: 0xd9b98a,
    temperament: 'skittish',          // flees at close range
    tameFood: 'berry', tameFeeds: 2,
    loot: { meat: [1, 2] },
    hitR: 0.8, avoidWater: true,
    biomes: ['plains', 'beach'],
  },
  squirtle: {
    kind: 'pokemon', label: 'Squirtle', glb: 'squirtle.glb',
    scale: 0.8, walk: 2.8, run: 7.5, hp: 70, dmg: 8, atkRange: 2.2, atkCd: 1.1,
    body: 0x58a8c8, accent: 0xc8a058, eye: 0x20303a,
    sil: 0x1e3a48, silAccent: 0x78c8e0,
    temperament: 'neutral',
    tameFood: 'berry', tameFeeds: 3,
    loot: { meat: [1, 2] },
    hitR: 0.85, avoidWater: false,
    biomes: ['beach'],
  },
  bulbasaur: {
    kind: 'pokemon', label: 'Bulbasaur', glb: 'bulbasaur.glb',
    scale: 0.85, walk: 2.6, run: 7, hp: 80, dmg: 8, atkRange: 2.2, atkCd: 1.2,
    body: 0x68a878, accent: 0x38704a, eye: 0xc85048,
    sil: 0x24402c, silAccent: 0x88c890,
    temperament: 'passive',           // never attacks, just grazes
    tameFood: 'berry', tameFeeds: 2,
    loot: { leaf: [2, 4] },
    hitR: 0.9, avoidWater: true,
    biomes: ['jungle'],
  },

  // ---- hostiles ----
  charmander: {
    kind: 'pokemon', label: 'Charmander', glb: 'charmander.glb',
    scale: 0.85, walk: 3.0, run: 9, hp: 65, dmg: 12, atkRange: 2.3, atkCd: 1.0,
    body: 0xf08838, accent: 0xf5d442, eye: 0x303030,
    sil: 0x4a2810, silAccent: 0xffa04d,
    temperament: 'hostile',           // hunts the player on sight
    tameFood: 'meat', tameFeeds: 4,
    loot: { meat: [2, 3] },
    hitR: 0.9, avoidWater: true,      // ironically
    biomes: ['jungle'],
  },
  haunter: {
    kind: 'pokemon', label: 'Haunter', glb: 'haunter.glb',
    scale: 1.0, walk: 3.2, run: 11, hp: 55, dmg: 15, atkRange: 2.6, atkCd: 0.9,
    body: 0x704a98, accent: 0xc8a8e8, eye: 0xf2e34a,
    sil: 0x241536, silAccent: 0xa87ae0,
    temperament: 'hostile', nightOnly: true,
    tameFood: null,
    loot: {},
    hitR: 0.95, avoidWater: true,
    biomes: ['jungle', 'highland', 'plains'],
  },

  // ---- big neutrals / specials ----
  snorlax: {
    kind: 'pokemon', label: 'Snorlax', glb: 'snorlax.glb',
    scale: 2.6, walk: 1.2, run: 4.5, hp: 380, dmg: 25, atkRange: 3.2, atkCd: 1.8,
    body: 0x2a3a58, accent: 0xe8d8b0, eye: 0x181818,
    sil: 0x161e30, silAccent: 0x8898b8,
    temperament: 'sleepy',            // mostly asleep; wakes angry if attacked
    tameFood: 'berry', tameFeeds: 6,
    loot: { meat: [4, 6], berry: [2, 4] },
    hitR: 2.4, avoidWater: true,
    biomes: ['plains'],
  },
  jigglypuff: {
    kind: 'pokemon', label: 'Jigglypuff', glb: 'jigglypuff.glb',
    scale: 0.8, walk: 2.4, run: 6.5, hp: 70, dmg: 5, atkRange: 2.4, atkCd: 2.0,
    body: 0xf0b8d0, accent: 0x48b8e8, eye: 0x38b878,
    sil: 0x4a2a3a, silAccent: 0xf8d0e4,
    temperament: 'neutral',
    tameFood: 'berry', tameFeeds: 2,
    loot: { leaf: [1, 2] },
    hitR: 0.85, avoidWater: true,
    biomes: ['jungle'],
  },
  magnemite: {
    kind: 'pokemon', label: 'Magnemite', glb: 'magnemite.glb',
    scale: 0.7, walk: 2.8, run: 8, hp: 60, dmg: 11, atkRange: 2.8, atkCd: 1.3,
    body: 0xa8b0c0, accent: 0x3868d8, eye: 0xf2f2f2,
    sil: 0x2a3040, silAccent: 0x78a8f0,
    temperament: 'territorial',       // guards rocky ground
    tameFood: null,
    loot: { stone: [2, 4] },
    hitR: 0.8, avoidWater: true,
    biomes: ['highland'],
  },
  mew: {
    kind: 'pokemon', label: 'Mew', glb: 'mew.glb',
    scale: 0.7, walk: 3.0, run: 13, hp: 100, dmg: 10, atkRange: 2.2, atkCd: 0.8,
    body: 0xf0b8c8, accent: 0x88d8f0, eye: 0x3868a8,
    sil: 0x4a3040, silAccent: 0xd8f0f8,
    temperament: 'elusive',           // extremely shy, very fast, high-value tame
    tameFood: 'berry', tameFeeds: 5,
    loot: {},
    hitR: 0.7, avoidWater: true,
    biomes: ['highland'],
  },
  magikarp: {
    kind: 'pokemon', label: 'Magikarp', glb: 'magikarp.glb',
    scale: 0.7, walk: 1.5, run: 3, hp: 20, dmg: 0, atkRange: 1.5, atkCd: 3,
    body: 0xc85838, accent: 0xf2d8a8, eye: 0xf2f2f2,
    sil: 0x40180e, silAccent: 0xe88858,
    temperament: 'harmless', aquatic: true,
    tameFood: null,
    loot: { meat: [1, 2] },
    hitR: 0.7, avoidWater: false,
    biomes: ['water', 'beach'],
  },

  // ---- legacy aliases kept for tests + transitional code ----
  raptor: {
    kind: 'theropod', label: 'Saberclaw', legacy: true, glb: 'eevee.glb',
    scale: 0.92, walk: 3.4, run: 10, hp: 55, dmg: 8, atkRange: 2.4, atkCd: 1.0,
    body: 0x6b8f3f, belly: 0xd8cfa0, accent: 0xff7a1a, eye: 0xffd23d,
    sil: 0x242b1c, silAccent: 0xff9a3d,
    temperament: 'hostile',
    tameFood: 'meat', tameFeeds: 4,
    loot: { meat: [2, 3] },
    hitR: 1.1, avoidWater: false,
    biomes: ['jungle'],
  },
  bronto: {
    kind: 'sauropod', label: 'Mossback', legacy: true, glb: 'snorlax.glb',
    scale: 1.55, walk: 1.9, run: 6, hp: 320, dmg: 18, atkRange: 3.4, atkCd: 1.7,
    body: 0x9a7d55, belly: 0xcfc0a0, accent: 0xffc23d, eye: 0x3a2a1a,
    sil: 0x2e2a20, silAccent: 0xffc23d,
    temperament: 'passive',
    tameFood: 'berry', tameFeeds: 3,
    loot: { meat: [5, 8], leaf: [2, 4] },
    hitR: 3.4, avoidWater: true,
    biomes: ['plains'],
  },
  trex: {
    kind: 'theropod', label: 'Rexmaw', legacy: true, glb: 'charmander.glb',
    scale: 2.1, walk: 2.7, run: 11, hp: 420, dmg: 28, atkRange: 3.2, atkCd: 1.5,
    body: 0x4a5d43, belly: 0x8a9478, accent: 0xff3b30, eye: 0xff3b30,
    sil: 0x1c211a, silAccent: 0xff5040,
    temperament: 'hostile',
    tameFood: null,
    loot: { meat: [6, 10] },
    hitR: 2.6, avoidWater: true,
    biomes: ['highland'],
  },
};

// Spawn table per biome (replaces the hardcoded initial population)
export const POPULATION = [
  { species: 'pikachu',    count: 3 },
  { species: 'eevee',      count: 3 },
  { species: 'bulbasaur',  count: 3 },
  { species: 'squirtle',   count: 2 },
  { species: 'charmander', count: 3 },
  { species: 'jigglypuff', count: 2 },
  { species: 'magnemite',  count: 2 },
  { species: 'haunter',    count: 2 },
  { species: 'snorlax',    count: 1 },
  { species: 'mew',        count: 1 },
];

// Legacy test population — the verify-*.mjs suites reference raptor/bronto/trex directly.
export const TEST_POPULATION = [
  { species: 'raptor', count: 7 },
  { species: 'bronto', count: 4 },
  { species: 'trex',   count: 1 },
];
