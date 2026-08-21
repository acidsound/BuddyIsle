// Chunky flat illustrated particles: two InstancedMesh pools (quads + blobs), per-instance color.
import * as THREE from 'three';

const MAX_QUADS = 400;
const MAX_BLOBS = 200;

export function createParticles(scene) {
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  function makePool(geo, max) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      dummy.position.set(0, -1000, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.set(0xffffff));
    }
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return { mesh, items: new Array(max).fill(null), cursor: 0 };
  }

  const quadGeo = new THREE.PlaneGeometry(1, 1);
  const blobGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const quads = makePool(quadGeo, MAX_QUADS);
  const blobs = makePool(blobGeo, MAX_BLOBS);

  function spawn({ pos, count = 4, colors, size = 0.18, speed = 2, up = 2.5, gravity = 9, life = 0.9, shape = 'quad', spin = 6, spread = 1 }) {
    const pool = shape === 'blob' ? blobs : quads;
    for (let i = 0; i < count; i++) {
      const idx = pool.cursor; pool.cursor = (pool.cursor + 1) % pool.mesh.count;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed * spread;
      pool.items[idx] = {
        x: pos.x + (Math.random() - 0.5) * 0.3,
        y: pos.y + (Math.random() - 0.5) * 0.2,
        z: pos.z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * r,
        vy: up * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * r,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * spin,
        size: size * (0.7 + Math.random() * 0.6),
        t: 0,
        life: life * (0.7 + Math.random() * 0.6),
        g: gravity,
        color: colors[(Math.random() * colors.length) | 0],
      };
    }
  }

  const presets = {
    dust: (pos, colors) => spawn({ pos, count: 3, colors, size: 0.16, speed: 1.2, up: 1.6, gravity: 4, life: 0.7, spin: 5 }),
    leaves: (pos) => spawn({ pos, count: 6, colors: ['#4f9448', '#3e7c3a', '#6fae54'], size: 0.16, speed: 2.2, up: 2.5, gravity: 6, life: 1.1, spin: 8 }),
    wood: (pos) => spawn({ pos, count: 5, colors: ['#a06a35', '#7d4f26', '#c89055'], size: 0.13, speed: 2.5, up: 3, gravity: 10, life: 0.8, spin: 9 }),
    stone: (pos) => spawn({ pos, count: 5, colors: ['#8d949c', '#6f767e', '#aab2ba'], size: 0.14, speed: 2.5, up: 3, gravity: 10, life: 0.8, spin: 9 }),
    blood: (pos) => spawn({ pos, count: 6, colors: ['#b3241f', '#8f1a16', '#d8452e'], size: 0.15, speed: 2.8, up: 2.5, gravity: 11, life: 0.7, shape: 'blob' }),
    splash: (pos) => spawn({ pos, count: 7, colors: ['#eaf6f8', '#9fd3dd', '#6fc3c9'], size: 0.17, speed: 2, up: 4, gravity: 12, life: 0.6, spin: 4 }),
    berry: (pos) => spawn({ pos, count: 5, colors: ['#d8452e', '#e8563a', '#5f9e42'], size: 0.12, speed: 2, up: 3, gravity: 9, life: 0.8, shape: 'blob' }),
    heart: (pos) => spawn({ pos, count: 3, colors: ['#ff6b9d', '#ff8fb3'], size: 0.2, speed: 0.6, up: 1.6, gravity: -1.2, life: 1.2, shape: 'blob', spin: 2 }),
    fire: (pos) => spawn({ pos, count: 2, colors: ['#f5a623', '#ffd75e', '#e8563a'], size: 0.22, speed: 0.4, up: 2.2, gravity: -0.5, life: 0.55, spin: 6 }),
    smoke: (pos) => spawn({ pos, count: 1, colors: ['#9aa5a8', '#7d8a8e'], size: 0.25, speed: 0.3, up: 1.4, gravity: -0.3, life: 1.4, spin: 2 }),
    steam: (pos) => spawn({ pos, count: 1, colors: ['#e8f0f2', '#cfdde0'], size: 0.2, speed: 0.25, up: 1.2, gravity: -0.2, life: 1.2, spin: 2 }),
    spark: (pos) => spawn({ pos, count: 4, colors: ['#ffd75e', '#fff3c4'], size: 0.1, speed: 3, up: 2, gravity: 8, life: 0.4, spin: 10 }),
  };

  function emit(name, pos, extra) {
    if (presets[name]) presets[name](pos, extra);
  }

  function update(dt) {
    for (const pool of [quads, blobs]) {
      let dirty = false;
      for (let i = 0; i < pool.items.length; i++) {
        const it = pool.items[i];
        if (!it) continue;
        it.t += dt;
        if (it.t >= it.life) {
          pool.items[i] = null;
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.0001);
          dummy.updateMatrix();
          pool.mesh.setMatrixAt(i, dummy.matrix);
          dirty = true;
          continue;
        }
        it.vy -= it.g * dt;
        it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
        it.rot += it.vr * dt;
        const k = it.t / it.life;
        const s = it.size * (k > 0.7 ? (1 - k) / 0.3 : 1);
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rot * 0.7, it.rot, it.rot * 0.3);
        dummy.scale.setScalar(Math.max(0.001, s));
        dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, dummy.matrix);
        col.set(it.color);
        pool.mesh.setColorAt(i, col);
        dirty = true;
      }
      if (dirty) {
        pool.mesh.instanceMatrix.needsUpdate = true;
        if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  return { spawn, emit, update };
}
