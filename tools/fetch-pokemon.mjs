// Fetch animated low-poly Pokémon GLBs from poly.pizza into assets/monsters/.
//
// No browser needed: the .glb preview URL is embedded in each model page's HTML
// (https://static.poly.pizza/<uuid>.glb) and static.poly.pizza is not Cloudflare-gated.
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

// poly.pizza/m/<id> -> slug
const MODELS = {
  pikachu:    '9Apgj-wpfgb',
  charmander: 'd6Ar6_NHbgS',
  squirtle:   'b9AHRGUN8jM',
  bulbasaur:  'aQA7Ls8Y79f',
  snorlax:    '2Rocc4_ltUy',
  eevee:      '62QYyQZtnMl',
  jigglypuff: '2yQA0j-YAj6',
  mew:        '3riRBivJah7',
  haunter:    'e4shTQwFTFk',
  magikarp:   '5RqQmne01WF',
  magnemite:  '4ps4-cVyDax',
  pokeball:   '5XpesCyaPe-',
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function fetchModel(slug, id) {
  const dest = path.join(OUT, `${slug}.glb`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
    console.log(`✓ ${slug}: already exists, skipping`);
    return true;
  }
  console.log(`→ ${slug} (https://poly.pizza/m/${id})`);
  const html = await (await fetch(`https://poly.pizza/m/${id}`, {
    headers: { 'user-agent': UA },
  })).text();
  const m = html.match(/https:\/\/static\.poly\.pizza\/[^"'\s]+\.glb/i);
  if (!m) {
    console.error(`  ✗ ${slug}: no .glb URL in page HTML`);
    return false;
  }
  const res = await fetch(m[0], { headers: { 'user-agent': UA } });
  if (!res.ok) {
    console.error(`  ✗ ${slug}: download failed (${res.status})`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ saved ${dest} (${(buf.length / 1024).toFixed(0)} KB) [${m[0]}]`);
  return true;
}

const only = process.argv.slice(2);
const targets = only.length ? only.filter(s => MODELS[s]) : Object.keys(MODELS);
if (targets.length === 0) {
  console.error('No matching slugs. Available:', Object.keys(MODELS).join(', '));
  process.exit(1);
}

let ok = 0;
for (const slug of targets) {
  try {
    if (await fetchModel(slug, MODELS[slug])) ok++;
    await new Promise(r => setTimeout(r, 1500)); // be polite
  } catch (e) {
    console.error(`  ✗ ${slug}: ${e.message.slice(0, 120)}`);
  }
}
console.log(`\nDone: ${ok}/${targets.length} saved to assets/monsters/`);
console.log('Next: git add assets/monsters && git commit && git push');
