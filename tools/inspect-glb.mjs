// Inspect GLBs headlessly: animations, meshes, size. No GPU needed.
import * as THREE from 'three';
import { GLTFLoader } from '../js/vendor/GLTFLoader.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'monsters');

const loader = new GLTFLoader();
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.glb')).sort();

for (const f of files) {
  const buf = fs.readFileSync(path.join(DIR, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  const scene = gltf.scene;
  let meshes = 0, tris = 0;
  scene.traverse(o => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3(); bbox.getSize(size);
  console.log(
    f.replace('.glb').padEnd(14),
    `clips:[${gltf.animations.map(c => c.name).join(', ') || 'NONE'}]`.padEnd(60),
    `meshes:${String(meshes).padStart(2)} tris:${String(Math.round(tris)).padStart(6)}`,
    `size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`
  );
}
