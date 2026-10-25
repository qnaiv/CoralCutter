import * as THREE from 'three';
import { POWER_NEED } from './constants.js';
import { smoothstep } from './math.js';
import { groundHeight } from './terrain.js';

/** One oversized target per zone. Fixed spots so each is a place to return to. */
const DEFS = [
  {
    id: 'clump',
    name: 'でかい海藻',
    x: 0,
    z: -52,
    hardness: 1,
    hp: 360,
    value: 90,
    cargo: 6,
    radius: 2.15,
    block: 1.15,
    respawn: 48,
    color: 0x3dde6a,
    build: buildClump,
  },
  {
    id: 'trunk',
    name: '昆布の幹',
    x: 78,
    z: -108,
    hardness: 2,
    hp: 680,
    value: 240,
    cargo: 7,
    radius: 2.3,
    block: 1.25,
    respawn: 55,
    color: 0x168a48,
    build: buildTrunk,
  },
  {
    id: 'giant',
    name: '巨大サンゴ',
    x: -120,
    z: -190,
    hardness: 3,
    hp: 2100,
    value: 620,
    cargo: 8,
    radius: 2.5,
    block: 1.45,
    respawn: 62,
    color: 0xff5d8f,
    build: buildCoral,
  },
  {
    id: 'chest',
    name: '宝箱',
    x: 226,
    z: -138,
    hardness: 4,
    hp: 4600,
    value: 1200,
    cargo: 7,
    radius: 2.05,
    block: 1.35,
    respawn: 70,
    color: 0xc9893a,
    build: buildChest,
  },
  {
    id: 'spire',
    name: '深海の光柱',
    x: 24,
    z: -312,
    hardness: 5,
    hp: 8800,
    value: 2000,
    cargo: 8,
    radius: 2.4,
    block: 1.35,
    respawn: 80,
    color: 0x7af6ff,
    emissive: 0x1ad0ff,
    build: buildSpire,
  },
];

const HIT_GAP = 0.16;

export class BigTargets {
  constructor(scene) {
    this.scene = scene;
    this.list = DEFS.map((def) => this._make(def));
  }

  colliders() {
    return this.list.map((t) => ({ x: t.x, z: t.z, r: t.block }));
  }

  harvestAround(x, z, range, damage, power, handlers) {
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.state !== 'alive' || t.hitCd > 0) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      const reach = range + t.radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (power < t.hardness) {
        t.hitCd = 0.34;
        t.flash = 1;
        t.flashHard = true;
        t.wobble = Math.max(t.wobble, 0.45);
        handlers.onReject(t, 'hard');
        continue;
      }
      const killing = t.hp - damage <= 0;
      if (killing && !handlers.canTake(t.cargo)) {
        t.hitCd = 0.35;
        t.hp = Math.max(1, t.hp);
        handlers.onReject(t, 'full');
        continue;
      }
      t.hitCd = HIT_GAP;
      t.hp -= damage;
      t.flash = 1;
      t.flashHard = false;
      t.wobble = 1;
      const killed = t.hp <= 0;
      if (killed) {
        t.hp = 0;
        t.state = 'falling';
        t.fall = 0;
      }
      handlers.onHit(t, killed);
      t.barDirty = true;
    }
  }

  update(dt, time, player) {
    const power = player?.power ?? 1;
    const px = player?.x ?? 0;
    const pz = player?.z ?? 0;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.hitCd > 0) t.hitCd = Math.max(0, t.hitCd - dt);
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 4.2);
      if (t.wobble > 0) t.wobble = Math.max(0, t.wobble - dt * 2.4);
      if (t.state === 'falling') {
        t.fall += dt / 0.42;
        if (t.fall >= 1) {
          t.state = 'gone';
          t.respawnLeft = t.respawn;
        }
      } else if (t.state === 'gone') {
        t.respawnLeft -= dt;
        if (t.respawnLeft <= 0) {
          t.state = 'growing';
          t.grow = 0;
          t.hp = t.maxHp;
          t.flash = 0;
          t.barDirty = true;
        }
      } else if (t.state === 'growing') {
        t.grow += dt / 0.45;
        if (t.grow >= 1) {
          t.grow = 1;
          t.state = 'alive';
        }
      }

      let scale = 1;
      if (t.state === 'falling') scale = Math.max(0.001, 1 - Math.min(1, t.fall) ** 2);
      else if (t.state === 'growing') {
        const u = Math.min(1, t.grow);
        scale = Math.max(0.001, u * u * (3 - 2 * u));
      } else if (t.state === 'gone') scale = 0.001;
      const punch = 1 + t.wobble * 0.07;
      t.root.scale.setScalar(scale * punch);
      const wob = Math.sin(time * 26 + i) * t.wobble * 0.22;
      t.pivot.rotation.z = wob;
      t.pivot.rotation.x = Math.cos(time * 21 + i) * t.wobble * 0.1;
      t.mat.emissiveIntensity = (t.baseEmissive || 0) + t.flash * 0.9;
      t.mat.emissive.setHex(t.flash > 0.05 ? (t.flashHard ? 0xff3344 : 0xfff4d2) : t.baseEmissiveHex);

      const near = Math.hypot(px - t.x, pz - t.z);
      const alive = t.state === 'alive';
      const locked = alive && power < t.hardness;
      const showBar = alive && !locked && (t.hp < t.maxHp || near < 14);
      t.bar.visible = showBar && scale > 0.2;
      t.lock.visible = locked && scale > 0.2;
      if (t.bar.visible && (t.barDirty || t.flash > 0)) {
        paintBar(t.barCanvas, t.barCtx, t.hp / t.maxHp);
        t.barTex.needsUpdate = true;
        t.barDirty = false;
      }
      const bob = Math.sin(time * 1.8 + i) * 0.05;
      t.bar.position.y = t.crown + bob;
      t.lock.position.y = t.crown + 0.42 + bob;
    }
  }

  _make(def) {
    const root = new THREE.Group();
    const y = groundHeight(def.x, def.z);
    root.position.set(def.x, y, def.z);
    const pivot = new THREE.Group();
    root.add(pivot);
    const mat = new THREE.MeshLambertMaterial({
      color: def.color,
      emissive: def.emissive || 0x000000,
      emissiveIntensity: def.emissive ? 0.65 : 0,
      flatShading: true,
    });
    const body = def.build(mat);
    pivot.add(body);
    const crown = body.userData.crown || 2.4;
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 128;
    barCanvas.height = 24;
    const barCtx = barCanvas.getContext('2d');
    const barTex = new THREE.CanvasTexture(barCanvas);
    barTex.colorSpace = THREE.SRGBColorSpace;
    paintBar(barCanvas, barCtx, 1);
    const bar = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: barTex, transparent: true, depthWrite: false, depthTest: false }),
    );
    bar.scale.set(1.45, 0.27, 1);
    bar.position.y = crown;
    bar.visible = false;
    bar.renderOrder = 2;
    root.add(bar);
    const lockCanvas = lockTexture(POWER_NEED[def.hardness]);
    const lockTex = new THREE.CanvasTexture(lockCanvas);
    lockTex.colorSpace = THREE.SRGBColorSpace;
    const lock = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: lockTex, transparent: true, depthWrite: false, depthTest: false }),
    );
    lock.scale.set(1.05, 0.42, 1);
    lock.position.y = crown + 0.42;
    lock.visible = def.hardness > 1;
    lock.renderOrder = 2;
    root.add(lock);
    this.scene.add(root);
    return {
      ...def,
      need: POWER_NEED[def.hardness],
      maxHp: def.hp,
      hp: def.hp,
      colorHex: def.color,
      prize: true,
      state: 'alive',
      hitCd: 0,
      flash: 0,
      flashHard: false,
      wobble: 0,
      fall: 0,
      grow: 1,
      respawnLeft: 0,
      y,
      root,
      pivot,
      mat,
      bar,
      lock,
      barCanvas,
      barCtx,
      barTex,
      barDirty: true,
      crown,
      baseEmissive: def.emissive ? 0.65 : 0,
      baseEmissiveHex: def.emissive || 0x000000,
    };
  }
}

function paintBar(canvas, ctx, ratio) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(4, 20, 28, 0.82)';
  roundRect(ctx, 2, 6, w - 4, 12, 6);
  ctx.fill();
  const span = Math.max(0, Math.min(1, ratio)) * (w - 10);
  ctx.fillStyle = ratio < 0.35 ? '#ff5a3c' : ratio < 0.7 ? '#ffc83d' : '#3ee0a2';
  if (span > 1) {
    roundRect(ctx, 5, 8, span, 8, 4);
    ctx.fill();
  }
}

function lockTexture(level) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 160, 64);
  ctx.fillStyle = 'rgba(4, 20, 28, 0.88)';
  roundRect(ctx, 4, 10, 152, 44, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffe56a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(36, 30, 9, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffe56a';
  roundRect(ctx, 26, 30, 20, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#fff6d4';
  ctx.font = '700 28px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Lv${level}`, 56, 33);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function buildClump(mat) {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const h = 1.5 + (i % 3) * 0.55;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, h, 0.16), mat);
    const a = (i / 8) * Math.PI * 2;
    blade.position.set(Math.sin(a) * 0.72, h / 2, Math.cos(a) * 0.72);
    blade.rotation.z = Math.sin(a) * 0.28;
    blade.rotation.x = Math.cos(a) * 0.18;
    g.add(blade);
  }
  g.userData.crown = 2.5;
  return g;
}

function buildTrunk(mat) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.6, 6), mat);
  trunk.position.y = 1.8;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.1), mat);
    const a = (i / 5) * Math.PI * 2;
    frond.position.set(Math.sin(a) * 0.45, 3.15, Math.cos(a) * 0.45);
    frond.rotation.z = Math.sin(a) * 0.7;
    frond.rotation.x = Math.cos(a) * 0.4;
    g.add(frond);
  }
  g.userData.crown = 4.1;
  return g;
}

function buildCoral(mat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.45, 6), mat);
  base.position.y = 0.22;
  g.add(base);
  for (let i = 0; i < 6; i++) {
    const h = 1.5 + (i % 2) * 0.7;
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.28, h, 5), mat);
    const a = (i / 6) * Math.PI * 2;
    arm.position.set(Math.sin(a) * 0.55, 0.55 + h / 2, Math.cos(a) * 0.55);
    arm.rotation.z = Math.sin(a) * 0.35;
    g.add(arm);
  }
  g.userData.crown = 3.1;
  return g;
}

function buildChest(mat) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.15), mat);
  box.position.y = 0.5;
  g.add(box);
  const lidMat = mat;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.38, 1.22), lidMat);
  lid.position.y = 1.12;
  g.add(lid);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(1.82, 0.12, 1.26),
    new THREE.MeshLambertMaterial({ color: 0xffe56a, emissive: 0x8a5a00, emissiveIntensity: 0.35, flatShading: true }),
  );
  band.position.y = 0.78;
  g.add(band);
  g.userData.crown = 1.7;
  return g;
}

function buildSpire(mat) {
  const g = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 2.2, 6), mat);
  stalk.position.y = 1.1;
  g.add(stalk);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), mat);
  core.position.y = 2.5;
  g.add(core);
  for (let i = 0; i < 4; i++) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat);
    const a = (i / 4) * Math.PI * 2;
    gem.position.set(Math.sin(a) * 0.55, 3.15, Math.cos(a) * 0.55);
    g.add(gem);
  }
  g.userData.crown = 3.7;
  return g;
}
