import * as THREE from 'three';

function makePool(scene, count, build) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const { mesh, mat } = build();
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    items.push({
      mesh,
      mat,
      life: 0,
      max: 1,
      age: 0,
      phase: 0,
      size: 1,
      mode: 'pop',
      vel: new THREE.Vector3(),
      pos: new THREE.Vector3(),
    });
  }
  return items;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.cursor = { suck: 0, coin: 0, bubble: 0, spark: 0 };
    const chunkGeo = new THREE.IcosahedronGeometry(0.16, 0);
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.055, 7);
    const bubbleGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.pools = {
      suck: makePool(scene, 48, () => {
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
        return { mesh: new THREE.Mesh(chunkGeo, mat), mat };
      }),
      coin: makePool(scene, 24, () => {
        const mat = new THREE.MeshLambertMaterial({
          color: 0xffd15a,
          emissive: 0x8a5a00,
          emissiveIntensity: 0.4,
          flatShading: true,
        });
        return { mesh: new THREE.Mesh(coinGeo, mat), mat };
      }),
      bubble: makePool(scene, 32, () => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xe7fff8,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        });
        return { mesh: new THREE.Mesh(bubbleGeo, mat), mat };
      }),
      spark: makePool(scene, 24, () => {
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff1c2 });
        return { mesh: new THREE.Mesh(sparkGeo, mat), mat };
      }),
    };
  }

  grab(kind) {
    const pool = this.pools[kind];
    const start = this.cursor[kind] || 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[(start + i) % pool.length];
      if (p.life <= 0) {
        this.cursor[kind] = (start + i + 1) % pool.length;
        return p;
      }
    }
    this.cursor[kind] = (start + 1) % pool.length;
    return pool[start];
  }

  spawn(kind, x, y, z, color, opts) {
    const p = this.grab(kind);
    p.mode = opts.mode ?? kind;
    p.life = p.max = opts.life ?? 0.8;
    p.age = 0;
    p.phase = Math.random() * 6.28;
    p.size = opts.size ?? 1;
    p.pos.set(x, y, z);
    p.vel.set(opts.vx ?? 0, opts.vy ?? 0, opts.vz ?? 0);
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    p.mesh.scale.setScalar(p.size);
    p.mat.color.setHex(color);
    if (p.mat.emissive && opts.emissive != null) p.mat.emissive.setHex(opts.emissive);
    if (p.mat.transparent) p.mat.opacity = opts.opacity ?? 0.45;
    return p;
  }

  chunks(x, y, z, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2.2 + Math.random() * 2.6;
      this.spawn('suck', x, y, z, color, {
        mode: 'suck',
        life: 0.95,
        size: 0.85 + Math.random() * 0.55,
        vx: Math.cos(a) * s,
        vy: 2.2 + Math.random() * 2.4,
        vz: Math.sin(a) * s,
      });
    }
  }

  coins(x, y, z) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
      const s = 2.4 + Math.random() * 3.2;
      this.spawn('coin', x, y, z, 0xffd15a, {
        mode: 'coin',
        life: 1.2,
        size: 0.85 + Math.random() * 0.4,
        vx: Math.cos(a) * s,
        vy: 5.5 + Math.random() * 3.5,
        vz: Math.sin(a) * s,
        emissive: 0x8a5a00,
      });
    }
  }

  bubbles(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      this.spawn('bubble', x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, 0xe9fff8, {
        mode: 'bubble',
        life: 0.9 + Math.random() * 0.4,
        size: 0.7 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.2 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.6,
        opacity: 0.4,
      });
    }
  }

  sparks(x, y, z) {
    for (let i = 0; i < 7; i++) {
      this.spawn('spark', x, y, z, i % 2 ? 0xfff6d0 : 0xffb15a, {
        mode: 'spark',
        life: 0.22 + Math.random() * 0.12,
        size: 0.7 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 7,
        vy: 1 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 7,
      });
    }
  }

  update(dt, home) {
    const kinds = Object.keys(this.pools);
    for (let k = 0; k < kinds.length; k++) {
      const pool = this.pools[kinds[k]];
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        p.age += dt;
        if (p.mode === 'suck') {
          p.vel.y -= 10 * dt;
          if (p.age > 0.07 && home) {
            const dx = home.x - p.pos.x;
            const dy = home.y - p.pos.y;
            const dz = home.z - p.pos.z;
            const dist = Math.hypot(dx, dy, dz) || 0.001;
            const pull = 14 + p.age * 26;
            p.vel.x += (dx / dist) * pull * dt;
            p.vel.y += (dy / dist) * pull * dt;
            p.vel.z += (dz / dist) * pull * dt;
            if (dist < 0.5) p.life = 0;
          }
        } else if (p.mode === 'coin') {
          p.vel.y -= 17 * dt;
          if (p.pos.y < homeGround(p.pos.x, p.pos.z)) {
            p.pos.y = homeGround(p.pos.x, p.pos.z);
            p.vel.y = Math.abs(p.vel.y) * 0.42;
            p.vel.x *= 0.84;
            p.vel.z *= 0.84;
          }
          p.mesh.rotation.x += dt * 7;
          p.mesh.rotation.y += dt * 9;
        } else if (p.mode === 'bubble') {
          p.vel.y += 1.2 * dt;
          p.pos.x += Math.sin(p.age * 3 + p.phase) * dt * 0.35;
          p.mat.opacity = Math.max(0, (p.life / p.max) * 0.45);
        } else if (p.mode === 'spark') {
          p.vel.y -= 6 * dt;
          p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5));
        }
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.position.copy(p.pos);
        const fade = Math.max(0, p.life / p.max);
        const s = p.mode === 'suck' ? p.size : p.size * (0.55 + fade * 0.45);
        p.mesh.scale.setScalar(Math.max(0.001, s));
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }
}

function homeGround(x, z) {
  return 0.45 + Math.min(0.4, Math.hypot(x, z) * 0);
}
