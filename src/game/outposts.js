import * as THREE from 'three';
import { groundHeight } from './terrain.js';

export class Outposts {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.list = [];
    this.radius = 5.2;
  }

  load(saved) {
    for (const spot of saved || []) this._spawn(spot.x, spot.z);
  }

  serialize() {
    return this.list.map((entry) => ({ x: entry.x, z: entry.z }));
  }

  setSellRadius(radius) {
    this.radius = radius;
    for (const entry of this.list) {
      entry.ring.scale.set(radius, radius, 1);
    }
  }

  add(x, z) {
    return this._spawn(x, z);
  }

  contains(x, z) {
    for (const entry of this.list) {
      if (Math.hypot(x - entry.x, z - entry.z) < this.radius) return entry;
    }
    return null;
  }

  nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const entry of this.list) {
      const dist = Math.hypot(x - entry.x, z - entry.z);
      if (dist < bestD) {
        bestD = dist;
        best = entry;
      }
    }
    return best ? { x: best.x, z: best.z, d: bestD, ref: best } : null;
  }

  update(dt, time) {
    for (const entry of this.list) {
      entry.bulb.position.y = 2.45 + Math.sin(time * 2.2 + entry.x) * 0.07;
      if (entry.pulse > 0) {
        entry.pulse = Math.max(0, entry.pulse - dt);
        const wave = 1 + (entry.pulse / 0.45) * 0.14;
        entry.ring.scale.set(this.radius * wave, this.radius * wave, 1);
      }
    }
  }

  _spawn(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 2.2, 6),
      new THREE.MeshLambertMaterial({ color: 0xe7f7ff, flatShading: true }),
    );
    pole.position.y = 1.1;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 8, 6),
      new THREE.MeshLambertMaterial({
        color: 0xd8fbff,
        emissive: 0x39d8ff,
        emissiveIntensity: 1,
        flatShading: true,
      }),
    );
    bulb.position.y = 2.45;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.08, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x7af6ff }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;
    ring.scale.set(this.radius, this.radius, 1);
    const light = new THREE.PointLight(0x7af6ff, 18, 20, 2);
    light.position.y = 2.6;
    group.add(pole, bulb, ring, light);
    group.position.set(x, groundHeight(x, z), z);
    this.scene.add(group);
    const collider = { x, z, r: 0.45 };
    this.colliders?.push(collider);
    const entry = { x, z, group, ring, bulb, pulse: 0, collider };
    this.list.push(entry);
    return entry;
  }
}
