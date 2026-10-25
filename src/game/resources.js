import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESOURCE_TYPES, WRECK } from './constants.js';
import { mulberry32 } from './math.js';
import { groundHeight, inWreck } from './terrain.js';

export class Resources {
  constructor(scene) {
    this.scene = scene;
    this.entities = [];
    this.groups = [];
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._white = new THREE.Color(0xffffff);
    this._red = new THREE.Color(0xff4d4d);
    this._build();
  }

  _build() {
    const rand = mulberry32(20261025);
    const geos = buildGeometries();
    const placed = [];
    const byType = new Map();

    for (const type of RESOURCE_TYPES) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        flatShading: true,
        emissive: type.id === 'deep' ? 0x1ad0ff : type.id === 'pearl' ? 0x665533 : 0x000000,
        emissiveIntensity: type.id === 'deep' ? 0.85 : type.id === 'pearl' ? 0.25 : 0,
      });
      const spots = [];
      const sample = () => {
        if (type.region === 'wreck') {
          const a = rand() * Math.PI * 2;
          const r = 5 + rand() * (WRECK.radius - 8);
          return { x: WRECK.x + Math.cos(a) * r, z: WRECK.z + Math.sin(a) * r };
        }
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(type.rMin ** 2 + rand() * (type.rMax ** 2 - type.rMin ** 2));
        return { x: Math.cos(a) * r, z: Math.sin(a) * r };
      };
      const inside = (x, z) => {
        if (type.region === 'wreck') return inWreck(x, z, WRECK.radius - 1.5);
        if (inWreck(x, z, WRECK.radius + 3)) return false;
        const dist = Math.hypot(x, z);
        return dist >= type.rMin && dist <= type.rMax;
      };
      const fits = (x, z) => {
        for (let i = 0; i < placed.length; i++) {
          const p = placed[i];
          const dx = p.x - x;
          const dz = p.z - z;
          const need = Math.max(type.minDist, p.minDist);
          if (dx * dx + dz * dz < need * need) return false;
        }
        return true;
      };
      const accept = (x, z) => {
        const spot = { x, z, minDist: type.minDist };
        placed.push(spot);
        spots.push(spot);
      };
      if (type.clusters && type.clusterSize && type.clusterRadius) {
        const sep = type.clusterRadius * 2.15;
        const centers = [];
        let attempts = 0;
        while (centers.length < type.clusters && attempts < type.clusters * 90) {
          attempts++;
          const spot = sample();
          if (!inside(spot.x, spot.z)) continue;
          let ok = true;
          for (const center of centers) {
            const dx = center.x - spot.x;
            const dz = center.z - spot.z;
            if (dx * dx + dz * dz < sep * sep) {
              ok = false;
              break;
            }
          }
          if (ok) centers.push(spot);
        }
        for (const center of centers) {
          let made = 0;
          const limit = type.clusterSize * 80;
          for (let n = 0; n < limit && made < type.clusterSize; n++) {
            const ring = n < type.clusterSize;
            const a = ring ? (n / type.clusterSize) * Math.PI * 2 + rand() * 0.5 : rand() * Math.PI * 2;
            const radial = ring ? type.clusterRadius * (0.35 + (n % 2) * 0.4) : Math.sqrt(rand()) * type.clusterRadius;
            const x = center.x + Math.cos(a) * radial;
            const z = center.z + Math.sin(a) * radial;
            if (!inside(x, z) || !fits(x, z)) continue;
            accept(x, z);
            made++;
          }
        }
      }
      let attempts = 0;
      const maxAttempts = type.count * 70;
      while (spots.length < type.count && attempts < maxAttempts) {
        attempts++;
        const spot = sample();
        if (!inside(spot.x, spot.z) || !fits(spot.x, spot.z)) continue;
        accept(spot.x, spot.z);
      }

      const mesh = new THREE.InstancedMesh(geos[type.geo], mat, Math.max(1, spots.length));
      mesh.count = spots.length;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      const entities = [];
      for (let i = 0; i < spots.length; i++) {
        const hex = type.colors[Math.floor(rand() * type.colors.length)];
        const color = new THREE.Color(hex);
        const scale = 0.86 + rand() * 0.38;
        const entity = {
          index: i,
          mesh,
          type,
          name: type.name,
          x: spots[i].x,
          z: spots[i].z,
          y: 0,
          yaw: rand() * Math.PI * 2,
          phase: rand() * Math.PI * 2,
          baseScale: scale * (type.id === 'giantKelp' ? 1.15 : 1),
          hp: type.hp,
          maxHp: type.hp,
          radius: type.radius,
          hardness: type.hardness,
          value: type.value,
          cargo: type.cargo,
          color,
          colorHex: color.getHex(),
          state: 'alive',
          fall: 0,
          grow: 1,
          respawn: 0,
          hitCd: 0,
          flash: 0,
          flashHard: false,
        };
        entities.push(entity);
        this.entities.push(entity);
        mesh.setColorAt(i, color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.groups.push({ mesh, entities });
      byType.set(type.id, spots.length);
    }
    this.counts = byType;
    this.sync(0);
  }

  harvestAround(x, z, range, damage, power, handlers) {
    const reachPad = range + 2.2;
    const reachPad2 = reachPad * reachPad;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.state !== 'alive' || e.hitCd > 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      if (dx * dx + dz * dz > reachPad2) continue;
      const reach = range + e.radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (power < e.hardness) {
        e.hitCd = 0.32;
        e.flash = 1;
        e.flashHard = true;
        handlers.onReject(e, 'hard');
        continue;
      }
      if (!handlers.canTake(e.cargo)) {
        e.hitCd = 0.35;
        handlers.onReject(e, 'full');
        continue;
      }
      e.hitCd = 0.09;
      e.hp -= damage;
      e.flash = 1;
      e.flashHard = false;
      const killed = e.hp <= 0;
      if (killed) {
        e.hp = 0;
        e.state = 'falling';
        e.fall = 0;
      }
      handlers.onHit(e, killed);
    }
  }

  update(dt, time, focus) {
    this._focus = focus || null;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.hitCd > 0) e.hitCd = Math.max(0, e.hitCd - dt);
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 4.5);
      if (e.state === 'falling') {
        e.fall += dt / 0.32;
        if (e.fall >= 1) {
          e.state = 'gone';
          e.respawn = e.type.respawn * (0.85 + (i % 5) * 0.05);
        }
      } else if (e.state === 'gone') {
        e.respawn -= dt;
        if (e.respawn <= 0) {
          e.state = 'growing';
          e.grow = 0;
          e.hp = e.maxHp;
          e.flash = 0;
        }
      } else if (e.state === 'growing') {
        e.grow += dt / 0.38;
        if (e.grow >= 1) {
          e.grow = 1;
          e.state = 'alive';
        }
      }
    }
    this.sync(time, this._focus);
  }

  sync(time, focus) {
    const dummy = this._dummy;
    const tint = this._color;
    const fx = focus?.x ?? 0;
    const fz = focus?.z ?? 0;
    const cull = focus ? 78 * 78 : Infinity;
    for (let g = 0; g < this.groups.length; g++) {
      const group = this.groups[g];
      const { mesh, entities } = group;
      let dirty = false;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        const dx = e.x - fx;
        const dz = e.z - fz;
        const idle = e.state === 'alive' && e.flash <= 0;
        if (idle && dx * dx + dz * dz > cull) continue;
        dirty = true;
        const sway =
          Math.sin(time * e.type.swaySpeed + e.phase) *
          e.type.swayAmp *
          (e.state === 'alive' ? 1 : 0.25);
        let scale = e.baseScale;
        let pitch = sway;
        let roll = sway * 0.35;
        if (e.state === 'alive') {
          scale *= 0.82 + 0.18 * (e.hp / e.maxHp);
        } else if (e.state === 'falling') {
          const t = Math.min(1, e.fall);
          scale *= Math.max(0.001, 1 - t * t);
          pitch = t * 1.5;
          roll = t * 0.5;
        } else if (e.state === 'growing') {
          const t = Math.min(1, e.grow);
          const s = t * t * (3 - 2 * t);
          scale *= Math.max(0.001, s);
        } else {
          scale = 0.001;
        }
        const y = e.state === 'gone' ? -8 : groundHeight(e.x, e.z);
        e.y = y;
        dummy.position.set(e.x, y, e.z);
        dummy.rotation.set(pitch, e.yaw, roll);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.copy(e.color);
        if (e.flash > 0) tint.lerp(e.flashHard ? this._red : this._white, e.flash * 0.85);
        mesh.setColorAt(i, tint);
      }
      if (!dirty) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

function merge(parts) {
  const normalized = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const geo = mergeGeometries(normalized);
  for (const part of parts) part.dispose();
  for (const part of normalized) {
    if (!parts.includes(part)) part.dispose();
  }
  if (!geo) throw new Error('failed to merge plant geometry');
  return geo;
}

function coneUp(radius, height, seg) {
  const g = new THREE.ConeGeometry(radius, height, seg);
  g.translate(0, height / 2, 0);
  return g;
}

function seaweedGeo(height, width, blades, spread, bend) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const lower = new THREE.BoxGeometry(width, height * 0.55, width * 0.32);
    lower.translate(0, height * 0.275, 0);
    const upper = new THREE.BoxGeometry(width * 0.72, height * 0.55, width * 0.26);
    upper.translate(0, height * 0.25, 0);
    upper.rotateX(bend);
    upper.translate(0, height * 0.5, 0);
    for (const g of [lower, upper]) {
      g.rotateY(a);
      g.translate(Math.sin(a) * spread, 0, Math.cos(a) * spread);
      parts.push(g);
    }
  }
  return merge(parts);
}

function coralGeo(scale, branches) {
  const parts = [];
  const trunk = coneUp(0.28 * scale, 1.05 * scale, 5);
  parts.push(trunk);
  for (let i = 0; i < branches; i++) {
    const b = coneUp(0.15 * scale, 0.72 * scale, 4);
    const a = (i / branches) * Math.PI * 2;
    b.rotateZ(0.75);
    b.rotateY(a);
    b.translate(Math.sin(a) * 0.12 * scale, 0.72 * scale, Math.cos(a) * 0.12 * scale);
    parts.push(b);
  }
  return merge(parts);
}

function shellGeo() {
  const fan = new THREE.ConeGeometry(0.62, 0.2, 7);
  fan.rotateX(Math.PI / 2);
  fan.translate(0, 0.16, 0);
  const fan2 = new THREE.ConeGeometry(0.38, 0.14, 6);
  fan2.rotateX(Math.PI / 2);
  fan2.translate(0.08, 0.28, 0.04);
  return merge([fan, fan2]);
}

function pearlGeo() {
  const orb = new THREE.SphereGeometry(0.28, 7, 6);
  orb.translate(0, 0.36, 0);
  const orb2 = new THREE.SphereGeometry(0.14, 6, 5);
  orb2.translate(0.2, 0.22, 0.08);
  const fan = new THREE.ConeGeometry(0.46, 0.14, 6);
  fan.rotateX(Math.PI / 2);
  fan.translate(0, 0.1, 0);
  return merge([fan, orb, orb2]);
}

function deepGeo() {
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.08, 0.14, 0.45, 5);
  stalk.translate(0, 0.22, 0);
  parts.push(stalk);
  const core = new THREE.IcosahedronGeometry(0.42, 0);
  core.translate(0, 0.62, 0);
  parts.push(core);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.IcosahedronGeometry(0.2, 0);
    const a = (i / 4) * Math.PI * 2;
    s.translate(Math.sin(a) * 0.36, 0.92 + (i % 2) * 0.12, Math.cos(a) * 0.36);
    parts.push(s);
  }
  return merge(parts);
}

function buildGeometries() {
  return {
    seaweed: seaweedGeo(1.7, 0.16, 4, 0.16, 0.45),
    kelp: seaweedGeo(2.8, 0.22, 5, 0.22, 0.35),
    giantKelp: seaweedGeo(4.1, 0.32, 6, 0.32, 0.28),
    coral: coralGeo(1, 5),
    bigCoral: coralGeo(1.45, 7),
    shell: shellGeo(),
    pearl: pearlGeo(),
    deep: deepGeo(),
  };
}
