import * as THREE from 'three';
import { WORLD_LIMIT } from './constants.js';
import { angDelta, damp } from './math.js';
import { groundHeight } from './terrain.js';

const PILE_COUNT = 18;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.angle = 0.7;
    // Hull reads clearly after the camera pullback. The saw stays on the cutter point.
    this.modelScale = 1.3;
    this.radius = 1.05 * this.modelScale;
    this.cutterOffset = 1.72 * this.modelScale;
    this.speed = 0;
    this.cutMode = 'idle';
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    scene.add(this.root);
    this._buildHull();
    this._buildPile();
    this._buildRange();
    this._buildShadow();
    this.cargoLocal = new THREE.Vector3(0, 1.55, -0.55);
    this.nozzleLocal = new THREE.Vector3(0, 0.72, -1.55);
    this._cargo = new THREE.Vector3();
    this._nozzle = new THREE.Vector3();
    this.bank = 0;
    this.bob = 0;
  }

  _mat(color, extra = {}) {
    return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  }

  _buildHull() {
    const yellow = this._mat(0xffc83d);
    const belly = this._mat(0xe39a16);
    const red = this._mat(0xff4b3a, { emissive: 0x5a140c, emissiveIntensity: 0.35 });
    this.sawMat = red;
    const metal = this._mat(0xc5d0d8);
    const dark = this._mat(0x1d3d52);
    const fin = this._mat(0xf0a020);
    const glass = new THREE.MeshLambertMaterial({
      color: 0xc8fbff,
      emissive: 0x1a6a78,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.72,
      flatShading: true,
    });

    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), yellow);
    hull.scale.set(0.82, 0.58, 1.18);
    hull.position.set(0, 0.98, 0);
    this.tilt.add(hull);

    const under = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), belly);
    under.scale.set(0.72, 0.32, 1.02);
    under.position.set(0, 0.72, 0.02);
    this.tilt.add(under);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), yellow);
    nose.scale.set(0.9, 0.72, 1.2);
    nose.position.set(0, 0.96, 1.12);
    this.tilt.add(nose);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glass);
    cockpit.scale.set(0.86, 0.7, 1.05);
    cockpit.position.set(0, 1.28, 0.22);
    this.tilt.add(cockpit);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 5, 10), dark);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 1.26, 0.28);
    this.tilt.add(rim);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1.7), red);
    stripe.position.set(0, 1.05, -0.05);
    this.tilt.add(stripe);

    const finGeo = new THREE.BoxGeometry(0.72, 0.07, 0.4);
    const left = new THREE.Mesh(finGeo, fin);
    left.position.set(-0.92, 0.78, -0.2);
    left.rotation.z = 0.35;
    const right = new THREE.Mesh(finGeo, fin);
    right.position.set(0.92, 0.78, -0.2);
    right.rotation.z = -0.35;
    this.tilt.add(left, right);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.36), fin);
    tail.position.set(0, 1.15, -1.28);
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.28), fin);
    tailH.position.set(0, 0.86, -1.22);
    this.tilt.add(tail, tailH);

    this.prop = new THREE.Group();
    this.prop.position.set(0, 0.78, -1.52);
    const bladeGeo = new THREE.BoxGeometry(0.1, 0.46, 0.05);
    const propMat = this._mat(0xd5dde4);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.position.y = 0.24;
      pivot.add(blade);
      this.prop.add(pivot);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), dark);
    this.prop.add(hub);
    this.tilt.add(this.prop);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.85), metal);
    arm.position.set(0, 0.48, 1.25);
    this.tilt.add(arm);

    this.sawSpin = new THREE.Group();
    this.sawSpin.position.set(0, 0.46, this.cutterOffset);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.07, 12), red);
    this.sawSpin.add(disc);
    const toothGeo = new THREE.BoxGeometry(0.16, 0.16, 0.08);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, this._mat(0xfff1c9));
      tooth.position.set(Math.cos(a) * 0.9, 0.02, Math.sin(a) * 0.9);
      tooth.rotation.y = -a;
      this.sawSpin.add(tooth);
    }
    this.tilt.add(this.sawSpin);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.78), metal);
    floor.position.set(0, 1.32, -0.48);
    this.tilt.add(floor);
    const postGeo = new THREE.BoxGeometry(0.06, 0.28, 0.06);
    const posts = [
      [-0.46, -0.32],
      [0.46, -0.32],
      [-0.46, 0.32],
      [0.46, 0.32],
    ];
    for (const [px, pz] of posts) {
      const post = new THREE.Mesh(postGeo, dark);
      post.position.set(px, 1.48, -0.48 + pz);
      this.tilt.add(post);
    }

    const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), this._mat(0xe8fff8, { emissive: 0xc6fff4, emissiveIntensity: 0.8 }));
    lampBulb.position.set(0, 1.62, 0.35);
    this.tilt.add(lampBulb);
    this.lamp = new THREE.PointLight(0xd9fff6, 10, 18, 2);
    this.lamp.position.set(0, 1.5, 0.6);
    this.root.add(this.lamp);
    this.sawSpin.position.z = 1.72;
    this.tilt.scale.setScalar(this.modelScale);
  }

  _buildPile() {
    this.chunks = [];
    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    for (let i = 0; i < PILE_COUNT; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      const slot = pileSlot(i);
      mesh.position.set(slot.x, slot.y, slot.z);
      mesh.rotation.set(slot.rx, slot.ry, 0);
      mesh.visible = false;
      this.tilt.add(mesh);
      this.chunks.push(mesh);
    }
  }

  _buildRange() {
    this.rangePivot = new THREE.Group();
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    fill.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.rangeFill = fill;
    this.rangeRing = ring;
    this.rangePivot.add(fill, ring);
    this.scene.add(this.rangePivot);
  }

  _buildShadow() {
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 18),
      new THREE.MeshBasicMaterial({
        color: 0x042028,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(this.modelScale);
    this.scene.add(this.shadow);
  }

  placeAt(x, z) {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    const gy = groundHeight(this.x, this.z);
    this.root.position.set(this.x, gy, this.z);
  }

  /** Move to a clamped spot without clearing the slide along a gate. */
  pin(x, z) {
    this.x = x;
    this.z = z;
    const gy = groundHeight(this.x, this.z);
    this.root.position.x = x;
    this.root.position.z = z;
    this.root.position.y = gy + Math.sin(this.bob) * 0.045;
  }

  getCutterXZ() {
    return {
      x: this.x + Math.sin(this.angle) * this.cutterOffset,
      z: this.z + Math.cos(this.angle) * this.cutterOffset,
    };
  }

  getCargoWorld() {
    this.root.updateMatrixWorld(true);
    return this.tilt.localToWorld(this._cargo.copy(this.cargoLocal));
  }

  getNozzle() {
    this.root.updateMatrixWorld(true);
    return this.tilt.localToWorld(this._nozzle.copy(this.nozzleLocal));
  }

  syncPile(pieces, shown) {
    const n = Math.max(0, Math.min(this.chunks.length, shown));
    for (let i = 0; i < this.chunks.length; i++) {
      const mesh = this.chunks[i];
      const visible = i < n;
      mesh.visible = visible;
      if (!visible || pieces.length === 0) continue;
      const hex = pieces[Math.min(pieces.length - 1, Math.floor((i / n) * pieces.length))];
      mesh.material.color.setHex(hex);
    }
  }

  update(dt, move, speed, colliders, range) {
    const desiredX = move.x * speed;
    const desiredZ = move.z * speed;
    const moving = move.lengthSq() > 0.0001;
    const k = moving ? 8 : 11;
    this.vx = damp(this.vx, desiredX, k, dt);
    this.vz = damp(this.vz, desiredZ, k, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const dx = this.x - c.x;
        const dz = this.z - c.z;
        const min = this.radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        this.x += dx * push;
        this.z += dz * push;
      }
    }

    const dist = Math.hypot(this.x, this.z);
    if (dist > WORLD_LIMIT) {
      this.x *= WORLD_LIMIT / dist;
      this.z *= WORLD_LIMIT / dist;
    }

    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.45) {
      const target = Math.atan2(this.vx, this.vz);
      this.angle += angDelta(this.angle, target) * (1 - Math.exp(-10 * dt));
    }

    const gy = groundHeight(this.x, this.z);
    this.bob += dt * (2.2 + this.speed * 0.15);
    this.root.position.set(this.x, gy + Math.sin(this.bob) * 0.045, this.z);
    this.root.rotation.y = this.angle;
    const yawRate = angDelta(this._prevAngle ?? this.angle, this.angle) / Math.max(dt, 0.001);
    this._prevAngle = this.angle;
    this.bank = damp(this.bank, Math.max(-0.35, Math.min(0.35, -yawRate * 0.12)), 7, dt);
    this.tilt.rotation.z = this.bank;
    this.tilt.rotation.x = Math.min(0.18, this.speed * 0.012);

    const cutting = this.cutMode === 'cut';
    this.sawSpin.rotation.y += dt * (cutting ? 36 : 14);
    this.prop.rotation.z += dt * (6 + this.speed * 3.2);
    this.sawMat.emissive.setHex(cutting ? 0xfff0c2 : this.cutMode === 'clank' ? 0xff5a3c : 0x5a140c);
    this.sawMat.emissiveIntensity = cutting ? 0.9 : 0.35;

    const cutter = this.getCutterXZ();
    const cy = groundHeight(cutter.x, cutter.z) + 0.1;
    this.rangePivot.position.set(cutter.x, cy, cutter.z);
    this.rangePivot.scale.setScalar(Math.max(0.2, range));
    const ring = this.rangeRing.material;
    if (this.cutMode === 'cut') {
      ring.color.setHex(0xfff3b0);
      ring.opacity = 0.8;
      this.rangeFill.material.opacity = 0.12;
      this.rangeFill.material.color.setHex(0xfff6c8);
    } else if (this.cutMode === 'clank') {
      ring.color.setHex(0xff5d5d);
      ring.opacity = 0.85;
      this.rangeFill.material.opacity = 0.08;
      this.rangeFill.material.color.setHex(0xff8080);
    } else if (this.cutMode === 'full') {
      ring.color.setHex(0xffb020);
      ring.opacity = 0.7;
      this.rangeFill.material.opacity = 0.08;
      this.rangeFill.material.color.setHex(0xffb020);
    } else {
      ring.color.setHex(0xffffff);
      ring.opacity = 0.22;
      this.rangeFill.material.opacity = 0.05;
      this.rangeFill.material.color.setHex(0xffffff);
    }

    this.shadow.position.set(this.x, gy + 0.06, this.z);
    this.shadow.material.opacity = 0.2;
  }
}

function pileSlot(i) {
  const layer = Math.floor(i / 5);
  const k = i % 5;
  const a = (k / 5) * Math.PI * 2 + layer * 0.65;
  const rad = layer >= 3 ? 0.08 : 0.16 + (k % 2) * 0.1;
  return {
    x: Math.cos(a) * rad,
    y: 1.42 + layer * 0.2,
    z: -0.48 + Math.sin(a) * rad * 0.72,
    rx: ((i * 17) % 10) * 0.15,
    ry: ((i * 9) % 10) * 0.2,
  };
}
