import * as THREE from 'three';

/**
 * Ferries part of the tank to the nearest sell point.
 * The timer and the flight both freeze while the document is hidden,
 * and nothing is delivered for time spent away. Cargo in the air is not saved.
 */
export class CargoDrone {
  constructor(scene) {
    this.scene = scene;
    this.flying = false;
    this.timer = 0;
    this.x = 0;
    this.z = 0;
    this.destX = 0;
    this.destZ = 0;
    this.takenValue = 0;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.28, 0.95),
      new THREE.MeshLambertMaterial({ color: 0xffc83d, flatShading: true }),
    );
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0xd8fbff, emissive: 0x39d8ff, emissiveIntensity: 0.8, flatShading: true }),
    );
    eye.position.set(0, 0.16, 0.28);
    this.group.add(body, eye);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt, ctx) {
    if (!ctx.active) return;
    if (!ctx.stats) {
      this.flying = false;
      this.timer = 0;
      this.takenValue = 0;
      this.group.visible = false;
      return;
    }
    if (this.flying) {
      const dx = this.destX - this.x;
      const dz = this.destZ - this.z;
      const dist = Math.hypot(dx, dz);
      const step = ctx.stats.speed * dt;
      if (dist <= Math.max(step, 0.6)) {
        const value = this.takenValue;
        const x = this.destX;
        const z = this.destZ;
        this.flying = false;
        this.takenValue = 0;
        this.group.visible = false;
        if (value > 0) ctx.onDeliver(value, x, z);
        return;
      }
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
      this.group.visible = true;
      this.group.position.set(this.x, 2.35 + Math.sin(ctx.time * 9) * 0.12, this.z);
      this.group.rotation.y = Math.atan2(dx, dz);
      return;
    }
    if (ctx.inside) {
      this.timer = 0;
      return;
    }
    this.timer += dt;
    if (this.timer < ctx.stats.interval) return;
    const cargo = ctx.tank.cargo;
    const take = Math.floor(cargo * ctx.stats.fraction);
    if (take < 1) return;
    const ratio = take / cargo;
    this.takenValue = ctx.tank.value * ratio;
    ctx.tank.cargo -= take;
    ctx.tank.value *= 1 - ratio;
    if (ctx.tank.cargo <= 0) {
      ctx.tank.cargo = 0;
      ctx.tank.value = 0;
      ctx.tank.pieces.length = 0;
      ctx.tank.warned = false;
    } else {
      const drop = Math.min(ctx.tank.pieces.length, Math.round(ctx.tank.pieces.length * ratio));
      if (drop > 0) ctx.tank.pieces.splice(0, drop);
    }
    this.destX = ctx.dest.x;
    this.destZ = ctx.dest.z;
    this.x = ctx.x;
    this.z = ctx.z;
    this.flying = true;
    this.timer = 0;
    this.group.visible = true;
    this.group.position.set(this.x, 2.35, this.z);
  }
}
