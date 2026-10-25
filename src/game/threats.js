import * as THREE from 'three';
import { WORLD_LIMIT, WRECK } from './constants.js';
import { groundHeight } from './terrain.js';

/**
 * Cargo thieves. One at a time, and only while the tank has something to lose.
 *
 * Deep coral is 620 coins and 4 cargo (about 155 a slot), in groves past
 * the depth gate. A hit takes at most 8 slots or about 30% of the tank,
 * roughly two plants, so a miss still leaves the trip worth taking.
 * Dodging the ring avoids it. Cutting the thief on the way out returns the
 * loot plus THREAT.recoverBonus. There is no health bar and no wrecking the sub.
 */
export const THREAT = {
  minCargo: 4,
  stealFraction: 0.3,
  stealMin: 3,
  stealMax: 8,
  recoverBonus: 0.22,
  deepGap: [22, 34],
  wreckGap: [48, 70],
  telegraph: 1.15,
  attack: 0.48,
  carryTime: 5.2,
  fleeSpeed: 15.5,
  lungeSpeed: 30,
  touch: 1.55,
  grab: 2.65,
};

const NAMES = { angler: 'アンコウ', squid: 'イカ', octopus: 'タコ' };

export function threatName(kind) {
  return NAMES[kind] || '敵';
}

export class Threats {
  constructor(scene) {
    this.scene = scene;
    this.active = null;
    this.cooldown = 16;
    this.pendingGap = 0;
  }

  enterZone() {
    this.cooldown = Math.max(this.cooldown, 9);
  }

  marker() {
    const enemy = this.active;
    if (!enemy) return null;
    const hot = enemy.state === 'telegraph' || enemy.state === 'attack';
    return { x: enemy.x, z: enemy.z, hot };
  }

  /** Freeze a visible wind-up for screenshots and debugging. */
  forceTelegraph(kind, px, pz) {
    this._clear(false);
    const enemy = this._make(kind, px, pz - 9, 'deep');
    enemy.state = 'telegraph';
    enemy.stateTime = 0.48;
    enemy.hold = true;
    enemy.lockX = px;
    enemy.lockZ = pz - 2.3;
    this.active = enemy;
    this._place(enemy, 0);
  }

  update(dt, ctx) {
    if (this.active) {
      this._tick(dt, ctx);
      return;
    }
    if (!ctx.playing) return;
    if (ctx.zone !== 'deep' && ctx.zone !== 'wreck') return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (ctx.cargo < THREAT.minCargo) {
      this.cooldown = 5;
      return;
    }
    if (ctx.zone === 'wreck' && Math.random() > 0.4) {
      this.cooldown = 18;
      return;
    }
    const kind = ctx.zone === 'wreck' ? 'octopus' : Math.random() < 0.55 ? 'angler' : 'squid';
    this._spawn(kind, ctx);
  }

  _spawn(kind, ctx) {
    const spot = spawnPoint(kind, ctx.x, ctx.z);
    const enemy = this._make(kind, spot.x, spot.z, ctx.zone);
    enemy.state = 'approach';
    enemy.stateTime = 0;
    this.active = enemy;
    const gap = ctx.zone === 'wreck' ? THREAT.wreckGap : THREAT.deepGap;
    this.pendingGap = gap[0] + Math.random() * (gap[1] - gap[0]);
  }

  _tick(dt, ctx) {
    const enemy = this.active;
    if (!enemy.hold) enemy.stateTime += dt;
    if (enemy.state === 'approach') {
      this._home(enemy, ctx.x, ctx.z, 3.4, dt, 7.2);
      const left = ctx.zone !== 'deep' && ctx.zone !== 'wreck';
      if (!enemy.hold && left) {
        enemy.state = 'leave';
        enemy.stateTime = 0;
      } else if (!enemy.hold && (enemy.stateTime > 1.05 || dist(enemy, ctx.x, ctx.z) < 7.4)) {
        this._beginTelegraph(enemy, ctx);
      }
    } else if (enemy.state === 'telegraph') {
      if (enemy.kind !== 'octopus') this._face(enemy, enemy.lockX, enemy.lockZ);
      if (!enemy.hold && enemy.stateTime >= THREAT.telegraph) {
        enemy.state = 'attack';
        enemy.stateTime = 0;
        enemy.struck = false;
      }
    } else if (enemy.state === 'attack') {
      const prevX = enemy.x;
      const prevZ = enemy.z;
      if (enemy.kind === 'octopus') {
        if (!enemy.struck && enemy.stateTime > THREAT.attack * 0.6 && dist(enemy, ctx.x, ctx.z) < THREAT.grab) {
          this._hit(enemy, ctx);
        }
      } else {
        this._face(enemy, enemy.lockX, enemy.lockZ);
        const dx = enemy.lockX - enemy.x;
        const dz = enemy.lockZ - enemy.z;
        const span = Math.hypot(dx, dz) || 1;
        const step = THREAT.lungeSpeed * dt;
        enemy.x += (dx / span) * step;
        enemy.z += (dz / span) * step;
        if (!enemy.struck && segmentHits(prevX, prevZ, enemy.x, enemy.z, ctx.x, ctx.z, THREAT.touch)) {
          this._hit(enemy, ctx);
        }
      }
      if (!enemy.hold && enemy.stateTime >= THREAT.attack) {
        enemy.state = enemy.stolen ? 'carry' : 'leave';
        enemy.stateTime = 0;
      }
    } else if (enemy.state === 'carry') {
      this._flee(enemy, ctx, THREAT.fleeSpeed, dt);
      if (this._cut(enemy, ctx)) {
        const stolen = enemy.stolen;
        this._clear(true);
        ctx.onRecover(stolen);
        return;
      }
      if (!enemy.hold && (enemy.stateTime >= THREAT.carryTime || dist(enemy, ctx.x, ctx.z) > 32)) {
        this._clear(true);
        return;
      }
    } else if (enemy.state === 'leave') {
      this._flee(enemy, ctx, 12, dt);
      if (!enemy.hold && (enemy.stateTime > 1.7 || dist(enemy, ctx.x, ctx.z) > 26)) {
        this._clear(true);
        return;
      }
    }
    if (this.active) this._place(this.active, ctx.time || 0);
  }

  _beginTelegraph(enemy, ctx) {
    enemy.state = 'telegraph';
    enemy.stateTime = 0;
    if (enemy.kind === 'octopus') {
      enemy.lockX = enemy.x;
      enemy.lockZ = enemy.z;
    } else {
      enemy.lockX = ctx.x;
      enemy.lockZ = ctx.z;
    }
    ctx.onWarn();
  }

  _hit(enemy, ctx) {
    enemy.struck = true;
    const stolen = ctx.onSteal(enemy.kind);
    if (!stolen) return;
    enemy.stolen = stolen;
    enemy.loot.visible = true;
    enemy.loot.material.color.setHex(stolen.color);
  }

  _cut(enemy, ctx) {
    const reach = (ctx.cutterRange || 2) + 1.05;
    if (Math.hypot(enemy.x - ctx.cutterX, enemy.z - ctx.cutterZ) <= reach) return true;
    return Math.hypot(enemy.x - ctx.x, enemy.z - ctx.z) <= 1.75;
  }

  _home(enemy, px, pz, speed, dt, standOff) {
    const dx = px - enemy.x;
    const dz = pz - enemy.z;
    const span = Math.hypot(dx, dz) || 1;
    if (span > standOff) {
      enemy.x += (dx / span) * speed * dt;
      enemy.z += (dz / span) * speed * dt;
    }
    this._face(enemy, px, pz);
  }

  _flee(enemy, ctx, speed, dt) {
    const dx = enemy.x - ctx.x;
    const dz = enemy.z - ctx.z;
    const span = Math.hypot(dx, dz) || 1;
    enemy.x += (dx / span) * speed * dt;
    enemy.z += (dz / span) * speed * dt;
    enemy.angle = Math.atan2(dx, dz);
  }

  _face(enemy, x, z) {
    enemy.angle = Math.atan2(x - enemy.x, z - enemy.z);
  }

  _place(enemy, time) {
    const y = groundHeight(enemy.x, enemy.z);
    enemy.group.position.set(enemy.x, y, enemy.z);
    enemy.group.rotation.y = enemy.angle;
    const bob = Math.sin(time * 3.2 + enemy.phase) * 0.07;
    enemy.body.position.y = enemy.bodyY + bob;
    const warning = enemy.state === 'telegraph' || enemy.state === 'attack';
    const pulse = 0.5 + 0.5 * Math.sin(time * 14);
    enemy.ring.visible = warning;
    enemy.streak.visible = warning && enemy.kind !== 'octopus';
    if (warning) {
      const lockY = groundHeight(enemy.lockX, enemy.lockZ);
      const tighten = enemy.state === 'telegraph' ? enemy.stateTime / THREAT.telegraph : 1;
      const scale = enemy.kind === 'octopus' ? 1.05 + pulse * 0.08 : 1.2 - tighten * 0.28;
      enemy.ring.position.set(enemy.lockX, lockY + 0.16, enemy.lockZ);
      enemy.ring.scale.set(scale, scale, 1);
      enemy.ring.material.opacity = 0.55 + pulse * 0.4;
      const dx = enemy.lockX - enemy.x;
      const dz = enemy.lockZ - enemy.z;
      const span = Math.hypot(dx, dz);
      enemy.streak.position.set((enemy.x + enemy.lockX) / 2, y + 0.1, (enemy.z + enemy.lockZ) / 2);
      enemy.streak.rotation.y = Math.atan2(dx, dz);
      enemy.streak.scale.set(0.42, 1, Math.max(0.3, span));
      enemy.streak.material.opacity = 0.28 + pulse * 0.2;
    }
    const flare = warning ? 1.4 + pulse * 0.7 : enemy.state === 'approach' ? 0.85 : 0.25;
    if (enemy.lure) {
      enemy.lure.scale.setScalar(0.85 + (warning ? pulse * 0.45 : 0));
      enemy.light.intensity = warning ? 16 + pulse * 10 : enemy.state === 'approach' ? 5 : 0;
    } else if (enemy.light) {
      enemy.light.intensity = warning ? 8 + pulse * 6 : 0;
    }
    enemy.glow.emissiveIntensity = flare;
    enemy.loot.visible = Boolean(enemy.stolen);
    if (enemy.stolen) enemy.loot.rotation.y = time * 4;
  }

  _make(kind, x, z, zone) {
    const group = new THREE.Group();
    const builders = { angler: buildAngler, squid: buildSquid, octopus: buildOctopus };
    const built = builders[kind]();
    group.add(built.body);
    const loot = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe56a }),
    );
    loot.position.y = 1.7;
    loot.visible = false;
    group.add(loot);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.55, 0.12, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 2;
    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 1),
      new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    streak.visible = false;
    streak.renderOrder = 2;
    this.scene.add(group);
    this.scene.add(ring);
    this.scene.add(streak);
    return {
      kind,
      zone,
      x,
      z,
      angle: 0,
      phase: Math.random() * Math.PI * 2,
      state: 'approach',
      stateTime: 0,
      hold: false,
      struck: false,
      stolen: null,
      lockX: x,
      lockZ: z,
      group,
      body: built.body,
      bodyY: built.bodyY,
      lure: built.lure,
      glow: built.glow,
      light: built.light,
      loot,
      ring,
      streak,
    };
  }

  _clear(armCooldown) {
    const enemy = this.active;
    if (!enemy) return;
    this.scene.remove(enemy.group);
    this.scene.remove(enemy.ring);
    this.scene.remove(enemy.streak);
    disposeObject(enemy.group);
    enemy.ring.geometry.dispose();
    enemy.ring.material.dispose();
    enemy.streak.geometry.dispose();
    enemy.streak.material.dispose();
    this.active = null;
    if (armCooldown) this.cooldown = this.pendingGap || 24;
    this.pendingGap = 0;
  }
}

function spawnPoint(kind, px, pz) {
  if (kind === 'octopus') {
    const dx = WRECK.x - px;
    const dz = WRECK.z - pz;
    const span = Math.hypot(dx, dz) || 1;
    return { x: px + (dx / span) * 6.2, z: pz + (dz / span) * 6.2 };
  }
  const aim = Math.PI + (Math.random() - 0.5) * 1.7;
  const reach = 9 + Math.random() * 2.2;
  let x = px + Math.sin(aim) * reach;
  let z = pz + Math.cos(aim) * reach;
  if (Math.hypot(x, z) > WORLD_LIMIT - 6) {
    x = px - Math.sin(aim) * reach;
    z = pz - Math.cos(aim) * reach;
  }
  return { x, z };
}

function dist(enemy, x, z) {
  return Math.hypot(enemy.x - x, enemy.z - z);
}

function segmentHits(x0, z0, x1, z1, px, pz, radius) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-6) t = ((px - x0) * dx + (pz - z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + dx * t;
  const cz = z0 + dz * t;
  return Math.hypot(px - cx, pz - cz) <= radius;
}

function lambert(color, emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 0.4 : 0, flatShading: true });
}

function buildAngler() {
  const body = new THREE.Group();
  const glow = lambert(0x1a2740, 0x142033);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 7, 6), glow);
  hull.scale.set(1.05, 0.62, 1.45);
  hull.position.y = 0.72;
  body.add(hull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), lambert(0x101828));
  jaw.position.set(0, 0.48, 0.72);
  body.add(jaw);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), eyeMat);
  eye.position.set(0.24, 0.86, 0.48);
  body.add(eye);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.85, 5), lambert(0x243044));
  stalk.position.set(0, 1.25, 0.35);
  stalk.rotation.x = 0.5;
  body.add(stalk);
  const lure = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 7, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  );
  lure.position.set(0, 1.62, 0.62);
  body.add(lure);
  const light = new THREE.PointLight(0xffcc66, 0, 16, 2);
  light.position.copy(lure.position);
  body.add(light);
  return { body, bodyY: 0, lure, glow, light };
}

function buildSquid() {
  const body = new THREE.Group();
  const glow = lambert(0x3a2a62, 0x2a1848);
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.62, 7, 6), glow);
  mantle.scale.set(0.75, 0.7, 1.55);
  mantle.position.set(0, 0.85, -0.15);
  body.add(mantle);
  const finMat = lambert(0x6a4a9a, 0x3a2060);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.55), finMat);
    fin.position.set(side * 0.55, 0.95, -0.35);
    fin.rotation.z = side * -0.4;
    body.add(fin);
  }
  const armMat = lambert(0x4c3478);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 5), armMat);
    const a = -0.5 + i * 0.33;
    arm.position.set(Math.sin(a) * 0.22, 0.45, 0.7);
    arm.rotation.x = 1.2;
    arm.rotation.z = a;
    body.add(arm);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), new THREE.MeshBasicMaterial({ color: 0xfff6ea }));
  eye.position.set(0.16, 0.95, 0.35);
  body.add(eye);
  const light = new THREE.PointLight(0xc49bff, 0, 12, 2);
  light.position.set(0, 1.1, 0.2);
  body.add(light);
  return { body, bodyY: 0, lure: null, glow, light };
}

function buildOctopus() {
  const body = new THREE.Group();
  const glow = lambert(0xc4543a, 0x6a2418);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 7, 6), glow);
  head.scale.set(1.05, 0.82, 1);
  head.position.y = 0.78;
  body.add(head);
  const armMat = lambert(0xa84432);
  for (let i = 0; i < 6; i++) {
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.85, 5), armMat);
    const a = (i / 6) * Math.PI * 2;
    arm.position.set(Math.sin(a) * 0.42, 0.32, Math.cos(a) * 0.42);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -a;
    body.add(arm);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }));
  eye.position.set(0.16, 0.92, 0.4);
  body.add(eye);
  const light = new THREE.PointLight(0xff7a55, 0, 11, 2);
  light.position.set(0, 1.1, 0.2);
  body.add(light);
  return { body, bodyY: 0, lure: null, glow, light };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (!child.material) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) material.dispose();
  });
}
