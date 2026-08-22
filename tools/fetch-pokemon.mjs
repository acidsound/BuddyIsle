// Fetch animated low-poly Pokémon GLBs from the official poly.pizza API into assets/monsters/.
//
// Auth: set POLYPIZZA_API_KEY in your environment (or ~/.env). Get a key at
// https://poly.pizza/settings/dashboard — requests use the `x-auth-token` header.
//
// Usage:
//   cd tools && node fetch-pokemon.mjs            # all models
//   node fetch-pokemon.mjs pikachu charmander     # subset by slug
//
// Output: ../assets/monsters/<slug>.glb  (committed back to the repo)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'monsters');

const KEY = process.env.POLYPIZZA_API_KEY;
if (!KEY) {
  console.error('POLYPIZZA_API_KEY not set. Add it to your env or ~/.env:');
  console.error('  POLYPIZZA_API_KEY=<your key>');
  process.exit(1);
}

// slug -> search term (resolved via /v1.1/search)
const MODELS = {
  pikachu:    'pikachu',
  charmander: 'charmander',
  squirtle:   'squirtle',
  bulbasaur:  'bulbasaur',
  snorlax:    'snorlax',
  eevee:      'eevee',
  jigglypuff: 'jigglypuff',
  mew:        'mew',
  haunter:    'haunter',
  magikarp:   'magikarp',
  magnemite:  'magnemite',
  pokeball:   'pokeball',
};

async function api(pathname) {
  const res = await fetch(`https://api.poly.pizza/v1.1/${pathname}`, {
    headers: { 'x-auth-token': KEY },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function resolveModel(term) {
  const data = await api(`search/${encodeURIComponent(term)}`);
  const results = data.results || data.models || [];
  // exact-title match first, then first hit
  return results.find(m => (m.Title || '').toLowerCase() === term) || results[0] || null;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

const only = process.argv.slice(2);
const targets = only.length ? only.filter(s => MODELS[s]) : Object.keys(MODELS);
if (targets.length === 0) {
  console.error('No matching slugs. Available:', Object.keys(MODELS).join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
for (const slug of targets) {
  const dest = path.join(OUT, `${slug}.glb`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
    console.log(`✓ ${slug}: already exists, skipping`);
    ok++;
    continue;
  }
  try {
    const model = await resolveModel(MODELS[slug]);
    if (!model || !model.Download) throw new Error('no download URL');
    const bytes = await download(model.Download, dest);
    console.log(`✓ ${slug}: ${(bytes / 1024).toFixed(0)} KB  [${model.Title} by ${model.Creator?.Username}]`);
    ok++;
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message.slice(0, 100)}`);
  }
}
console.log(`\nDone: ${ok}/${targets.length} in assets/monsters/`);
console.log('Next: git add assets/monsters && git commit && git push');
