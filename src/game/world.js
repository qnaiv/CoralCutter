import * as THREE from 'three';
import {
  BASE_RADIUS,
  BEACON,
  PADS,
  SELL_RADIUS,
  WRECK,
  WORLD_LIMIT,
  ZONE_RINGS,
  padPosition,
} from './constants.js';
import { mulberry32, smoothstep } from './math.js';
import { groundHeight, inWreck, terrainColor } from './terrain.js';

const LABEL_FONT = '"M PLUS Rounded 1c", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
/** Fixed world size. Do not grow this on portrait or with zoom. */
const LABEL_SCALE = 2.35;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.signDefs = [];
    this.signs = [];
    this.fogShallow = new THREE.Color(0x8fe7f2);
    this.fogDeep = new THREE.Color(0x073247);
    this.fogColor = new THREE.Color(0x8fe7f2);
    scene.fog = new THREE.Fog(this.fogColor, 48, 210);
    scene.background = this.fogColor;
    this._buildLights();
    this._buildGround();
    this._buildCaustics();
    this._buildBase();
    this._buildWreck();
    this._buildRocks();
    this._buildFish();
    this._buildArrow();
    this._buildAmbientBubbles();
    this.sellPulse = 0;
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0xd8f7ff, 0.42));
    this.scene.add(new THREE.HemisphereLight(0xe7fff8, 0x6d8f55, 1.35));
    const sun = new THREE.DirectionalLight(0xfff4d2, 1.8);
    sun.position.set(30, 70, 24);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fd8ff, 0.45);
    fill.position.set(-28, 18, -16);
    this.scene.add(fill);
  }

  _buildGround() {
    const size = WORLD_LIMIT * 2 + 30;
    const seg = 72;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundHeight(x, z));
      terrainColor(x, z, color);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    mesh.receiveShadow = false;
    this.scene.add(mesh);
  }

  _buildCaustics() {
    this.caustics = [];
    for (let i = 0; i < 2; i++) {
      const tex = makeCausticTexture(i);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xd8fff6,
        transparent: true,
        opacity: i === 0 ? 0.16 : 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_LIMIT * 2, WORLD_LIMIT * 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.42;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.caustics.push({ tex, speed: i === 0 ? [0.012, 0.006] : [-0.008, 0.014] });
    }
  }

  _buildBase() {
    const stone = new THREE.MeshLambertMaterial({ color: 0xd7c094, flatShading: true });
    const trim = new THREE.MeshLambertMaterial({ color: 0x2f7f96, flatShading: true });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS + 0.4, 0.28, 28), stone);
    platform.position.y = 0.14;
    this.scene.add(platform);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(BASE_RADIUS, 0.16, 6, 28), trim);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.28;
    this.scene.add(lip);

    this.sellMat = new THREE.MeshLambertMaterial({
      color: 0xbffff3,
      emissive: 0x39d8c8,
      emissiveIntensity: 0.7,
      flatShading: true,
    });
    const sell = new THREE.Mesh(new THREE.CylinderGeometry(SELL_RADIUS, SELL_RADIUS, 0.1, 28), this.sellMat);
    sell.position.y = 0.32;
    this.scene.add(sell);
    this.sellRing = new THREE.Mesh(
      new THREE.TorusGeometry(SELL_RADIUS, 0.13, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8fff8 }),
    );
    this.sellRing.rotation.x = Math.PI / 2;
    this.sellRing.position.y = 0.42;
    this.scene.add(this.sellRing);

    this.shock = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.08, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe56a, transparent: true, opacity: 0 }),
    );
    this.shock.rotation.x = Math.PI / 2;
    this.shock.position.y = 0.5;
    this.scene.add(this.shock);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 5), trim);
      post.position.set(Math.sin(a) * (SELL_RADIUS + 0.7), 0.5, Math.cos(a) * (SELL_RADIUS + 0.7));
      this.scene.add(post);
    }

    const beaconPos = {
      x: Math.sin(BEACON.angle) * BEACON.dist,
      z: Math.cos(BEACON.angle) * BEACON.dist,
    };
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 11, 6),
      new THREE.MeshLambertMaterial({ color: 0xf4f7f8, flatShading: true }),
    );
    pole.position.set(beaconPos.x, 5.6, beaconPos.z);
    this.scene.add(pole);
    this.beaconOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xd8fff6, emissive: 0x8dffe8, emissiveIntensity: 0.9, flatShading: true }),
    );
    this.beaconOrb.position.set(beaconPos.x, 11.2, beaconPos.z);
    this.scene.add(this.beaconOrb);
    this.beaconLight = new THREE.PointLight(0xc8fff2, 28, 42, 2);
    this.beaconLight.position.copy(this.beaconOrb.position);
    this.scene.add(this.beaconLight);
    this.colliders.push({ x: beaconPos.x, z: beaconPos.z, r: 0.7 });

    this.pylons = [];
    const pylonMat = new THREE.MeshLambertMaterial({ color: 0xf4f7f8, flatShading: true });
    const lampMat = new THREE.MeshLambertMaterial({
      color: 0xfff1b0,
      emissive: 0xffc83d,
      emissiveIntensity: 0.85,
      flatShading: true,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const group = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 5), pylonMat);
      post.position.y = 1.6;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), lampMat);
      lamp.position.y = 3.3;
      group.add(post, lamp);
      group.position.set(Math.sin(a) * 11.4, 0, Math.cos(a) * 11.4);
      group.visible = false;
      this.scene.add(group);
      this.pylons.push(group);
    }

    this.padIcons = [];
    for (const pad of PADS) {
      const p = padPosition(pad);
      const color = new THREE.Color(pad.color);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.3, 0.22, 8),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25, flatShading: true }),
      );
      base.position.set(p.x, 0.4, p.z);
      this.scene.add(base);
      const icon = new THREE.Group();
      icon.position.set(p.x, 1.35, p.z);
      icon.add(iconMesh(pad.id, color));
      this.scene.add(icon);
      this.padIcons.push(icon);
      this.signDefs.push({
        text: pad.label,
        x: p.x,
        y: 1.45,
        z: p.z,
        bg: 'rgba(4, 24, 36, 0.78)',
        fg: '#ffffff',
        scale: LABEL_SCALE,
      });
    }

    this.signDefs.push(
      { text: '売却', x: 0, y: 1.15, z: 0, bg: 'rgba(8, 60, 68, 0.82)', fg: '#d9fff6', scale: LABEL_SCALE },
      { text: '昆布の森', x: 0, y: 2.2, z: -49, bg: 'rgba(12, 48, 28, 0.8)', fg: '#d8ffc8', scale: LABEL_SCALE },
      { text: 'サンゴ礁', x: 0, y: 2.2, z: -104, bg: 'rgba(70, 24, 36, 0.8)', fg: '#ffd5e0', scale: LABEL_SCALE },
      { text: '深海', x: 0, y: 2.4, z: -158, bg: 'rgba(8, 24, 48, 0.82)', fg: '#d5f2ff', scale: LABEL_SCALE },
      { text: '沈没船', x: WRECK.x, y: 3.2, z: WRECK.z, bg: 'rgba(48, 32, 16, 0.82)', fg: '#ffe7bf', scale: LABEL_SCALE },
    );

    for (const ring of ZONE_RINGS) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(ring.radius - 0.45, ring.radius + 0.45, 80),
        new THREE.MeshBasicMaterial({
          color: ring.color,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.48;
      this.scene.add(mesh);
    }
    const wreckRing = new THREE.Mesh(
      new THREE.RingGeometry(WRECK.radius - 0.4, WRECK.radius + 0.4, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    wreckRing.rotation.x = -Math.PI / 2;
    wreckRing.position.set(WRECK.x, 0.5, WRECK.z);
    this.scene.add(wreckRing);
  }

  _buildWreck() {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4428, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2416, flatShading: true });
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 2.1, 3.4), wood);
    hull.position.y = 1.05;
    hull.rotation.z = 0.22;
    group.add(hull);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 2.6), dark);
    bow.position.set(6.2, 0.55, 0.3);
    bow.rotation.z = 0.55;
    group.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 6.5, 5), dark);
    mast.position.set(-1.2, 3.4, 0);
    mast.rotation.z = 0.55;
    group.add(mast);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 2.4), dark);
      rib.position.set(-3.5 + i * 2.1, 1.3, 0);
      rib.rotation.z = 0.2;
      group.add(rib);
    }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 2.2), wood);
    cabin.position.set(-3.2, 2.1, 0.2);
    cabin.rotation.z = 0.15;
    group.add(cabin);
    group.position.set(WRECK.x, groundHeight(WRECK.x, WRECK.z), WRECK.z);
    group.rotation.y = 0.6;
    this.scene.add(group);
    this.colliders.push({ x: WRECK.x, z: WRECK.z, r: 4.2 });
    const light = new THREE.PointLight(0xffc56a, 18, 26, 2);
    light.position.set(WRECK.x, 3.2, WRECK.z);
    this.scene.add(light);
  }

  _buildRocks() {
    const rand = mulberry32(77);
    const spots = [];
    const specs = [
      { count: 20, rMin: 40, rMax: 95, sMin: 0.55, sMax: 1.15 },
      { count: 26, rMin: 100, rMax: 220, sMin: 0.9, sMax: 2.1 },
    ];
    for (const spec of specs) {
      let made = 0;
      let attempts = 0;
      while (made < spec.count && attempts < spec.count * 40) {
        attempts++;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(spec.rMin ** 2 + rand() * (spec.rMax ** 2 - spec.rMin ** 2));
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.hypot(x, z) < 18) continue;
        if (inWreck(x, z, 10)) continue;
        let ok = true;
        for (const s of spots) {
          const dx = s.x - x;
          const dz = s.z - z;
          if (dx * dx + dz * dz < 7.5 * 7.5) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const scale = spec.sMin + rand() * (spec.sMax - spec.sMin);
        spots.push({ x, z, scale, yaw: rand() * Math.PI * 2, stretch: 0.7 + rand() * 0.8 });
        made++;
      }
    }
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const y = groundHeight(s.x, s.z);
      dummy.position.set(s.x, y + s.scale * 0.25, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.scale, s.scale * s.stretch, s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const dist = Math.hypot(s.x, s.z);
      color.set(dist > 156 ? 0x6e8ea0 : dist > 100 ? 0xc48978 : 0xd9c39a);
      mesh.setColorAt(i, color);
      this.colliders.push({ x: s.x, z: s.z, r: s.scale * 0.72 });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  _buildFish() {
    const rand = mulberry32(9);
    this.fish = [];
    const bodyGeo = new THREE.ConeGeometry(0.22, 0.7, 5);
    bodyGeo.rotateX(Math.PI / 2);
    const tailGeo = new THREE.ConeGeometry(0.16, 0.28, 4);
    tailGeo.rotateX(-Math.PI / 2);
    const colors = [0xffe56a, 0xff8f7a, 0x8af3ff, 0xffffff, 0xb8ff7a];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: colors[i % colors.length],
        flatShading: true,
      });
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, mat);
      const tail = new THREE.Mesh(tailGeo, mat);
      tail.position.z = -0.42;
      group.add(body, tail);
      const band = 30 + rand() * 150;
      const a = rand() * Math.PI * 2;
      const fish = {
        mesh: group,
        x: Math.cos(a) * band,
        z: Math.sin(a) * band,
        angle: rand() * Math.PI * 2,
        speed: 1.6 + rand() * 1.8,
        phase: rand() * 6,
        age: rand() * 10,
        bandMin: Math.max(22, band - 18),
        bandMax: band + 18,
      };
      group.position.set(fish.x, 1.2, fish.z);
      this.scene.add(group);
      this.fish.push(fish);
    }
  }

  _buildArrow() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.9);
    shape.lineTo(-0.42, -0.45);
    shape.lineTo(0, -0.15);
    shape.lineTo(0.42, -0.45);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffe56a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.arrow.visible = false;
    this.arrow.renderOrder = 3;
    this.scene.add(this.arrow);
  }

  _buildAmbientBubbles() {
    const geo = new THREE.SphereGeometry(0.08, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf4fffd,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.bubbles = [];
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        ox: (Math.random() - 0.5) * 14,
        oz: (Math.random() - 0.5) * 14,
        y: Math.random() * 8,
        speed: 0.6 + Math.random() * 0.8,
      });
    }
  }

  buildSigns() {
    for (const sprite of this.signs) {
      this.scene.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.signs = this.signDefs.map((def) => {
      const sprite = makeLabel(def.text, def.bg, def.fg, def.scale);
      sprite.position.set(def.x, def.y, def.z);
      sprite.userData.baseY = def.y;
      sprite.userData.baseSX = sprite.scale.x;
      sprite.userData.baseSY = sprite.scale.y;
      this.scene.add(sprite);
      return sprite;
    });
  }

  setBaseLevel(level) {
    const shown = Math.max(0, Math.min(this.pylons.length, (level | 0) - 1));
    for (let i = 0; i < this.pylons.length; i++) this.pylons[i].visible = i < shown;
    if (this.beaconLight) this.beaconLight.intensity = 28 + shown * 6;
  }

  pulseSell() {
    this.sellPulse = 1;
  }

  update(dt, time, state) {
    for (const c of this.caustics) {
      c.tex.offset.x += dt * c.speed[0];
      c.tex.offset.y += dt * c.speed[1];
    }
    const depth = smoothDepth(state.dist);
    this.fogColor.lerpColors(this.fogShallow, this.fogDeep, depth);
    const fog = this.scene.fog;
    const span = Math.max(1, state.viewScale || 1);
    fog.near = (48 - depth * 20) * span;
    fog.far = (210 - depth * 90) * span;

    const pulse = 0.45 + Math.sin(time * 3.1) * 0.2;
    if (this.sellPulse > 0) {
      this.sellPulse = Math.max(0, this.sellPulse - dt);
      const k = this.sellPulse;
      this.sellMat.emissive.setHex(0xffe56a);
      this.sellMat.color.setHex(0xfff1a8);
      this.sellMat.emissiveIntensity = 0.4 + k;
      this.sellRing.material.color.setHex(0xffe56a);
      this.shock.scale.setScalar(1 + (1 - k) * 8);
      this.shock.material.opacity = Math.max(0, k * 0.85);
    } else {
      this.sellMat.emissive.setHex(0x39d8c8);
      this.sellMat.color.setHex(0xbffff3);
      this.sellMat.emissiveIntensity = pulse;
      this.sellRing.material.color.setHex(0xe8fff8);
      this.shock.material.opacity = 0;
    }
    this.sellRing.scale.setScalar(1 + Math.sin(time * 3) * 0.03);
    this.beaconOrb.scale.setScalar(1 + Math.sin(time * 3.4) * 0.08);
    this.beaconLight.intensity = 22 + Math.sin(time * 3.4) * 8;

    for (let i = 0; i < this.padIcons.length; i++) {
      const icon = this.padIcons[i];
      icon.position.y = 1.35 + Math.sin(time * 2 + i) * 0.1;
      icon.rotation.y = time * 0.6;
    }
    for (const sign of this.signs) {
      sign.position.y = sign.userData.baseY + Math.sin(time * 1.6 + sign.position.x) * 0.04;
      const near = Math.hypot(state.x - sign.position.x, state.z - sign.position.z);
      sign.material.opacity = smoothstep(3.4, 7.4, near);
    }

    for (const fish of this.fish) {
      fish.age += dt;
      const dx = fish.x - state.x;
      const dz = fish.z - state.z;
      if (dx * dx + dz * dz < 20) {
        fish.angle = Math.atan2(dx, dz);
      } else {
        fish.angle += Math.sin(fish.age * 0.65 + fish.phase) * dt * 0.9;
      }
      fish.x += Math.sin(fish.angle) * fish.speed * dt;
      fish.z += Math.cos(fish.angle) * fish.speed * dt;
      const fd = Math.hypot(fish.x, fish.z);
      if (fd > fish.bandMax || fd < fish.bandMin) fish.angle = Math.atan2(-fish.x, -fish.z);
      fish.mesh.position.set(fish.x, 1.15 + Math.sin(fish.age * 2.2 + fish.phase) * 0.28, fish.z);
      fish.mesh.rotation.y = fish.angle;
      fish.mesh.rotation.z = Math.sin(fish.age * 6 + fish.phase) * 0.15;
    }

    for (const b of this.bubbles) {
      b.y += dt * b.speed;
      if (b.y > 8) {
        b.y = 0;
        b.ox = (Math.random() - 0.5) * 16;
        b.oz = (Math.random() - 0.5) * 16;
      }
      b.mesh.position.set(state.x + b.ox, b.y, state.z + b.oz);
      b.mesh.material.opacity = 0.15 + (1 - b.y / 8) * 0.2;
    }

    const sellDist = state.sellDist ?? state.dist;
    const sellX = state.sellX ?? 0;
    const sellZ = state.sellZ ?? 0;
    if (state.showArrow && sellDist > 8) {
      const ang = Math.atan2(sellX - state.x, sellZ - state.z);
      const ahead = 2.7;
      const ax = state.x + Math.sin(ang) * ahead;
      const az = state.z + Math.cos(ang) * ahead;
      this.arrow.visible = true;
      this.arrow.position.set(ax, groundHeight(ax, az) + 0.2, az);
      // Shape tip is -Z after rotateX(-90°). Flip so it points along +Z at yaw 0,
      // then yaw toward the nearest sell point (atan2 matches the sub's facing).
      this.arrow.rotation.y = ang + Math.PI;
      const s = 0.72 + Math.sin(time * 6) * 0.05;
      this.arrow.scale.setScalar(s);
    } else {
      this.arrow.visible = false;
    }
  }
}

function smoothDepth(dist) {
  const t = (dist - 120) / 100;
  return Math.max(0, Math.min(1, t));
}

function iconMesh(id, color) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    flatShading: true,
  });
  if (id === 'cutter') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), mat);
    return disc;
  }
  if (id === 'tank') {
    return new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), mat);
  }
  if (id === 'propeller') {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.06), mat);
      blade.position.y = 0.16;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 3) * Math.PI * 2;
      pivot.add(blade);
      g.add(pivot);
    }
    return g;
  }
  return new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
}

function makeCausticTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  let s = 20 + seed * 97;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.55})`;
    g.lineWidth = 1.4 + rnd() * 2.4;
    g.beginPath();
    g.ellipse(rnd() * 256, rnd() * 256, 16 + rnd() * 48, 8 + rnd() * 20, rnd() * Math.PI, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6.5, 6.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeLabel(text, bg, fg, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  roundRect(ctx, 12, 18, 488, 92, 28);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = `700 64px ${LABEL_FONT}`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = 512 / 128;
  sprite.scale.set(scale * aspect * 0.42, scale * 0.42, 1);
  sprite.center.set(0.5, 1);
  sprite.renderOrder = 1;
  return sprite;
}
