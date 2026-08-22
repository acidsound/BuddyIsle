// Verify every species GLB reference exists on disk.
import { SPECIES } from '../js/species.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'monsters');
const missing = new Set();
for (const [key, s] of Object.entries(SPECIES)) {
  if (s.glb && !fs.existsSync(path.join(DIR, s.glb))) missing.add(`${key} -> ${s.glb}`);
}
console.log('total species:', Object.keys(SPECIES).length);
console.log('missing GLBs:', missing.size ? [...missing].join(', ') : 'none');
