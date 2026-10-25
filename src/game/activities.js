import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SELL_RADIUS, WRECK } from './constants.js';
import { ACTIVITIES, WORLD } from './economy.js';
import { damp, mulberry32, smoothstep } from './math.js';
import { groundHeight, inWreck } from './terrain.js';

const CLAMS = ACTIVITIES.clams;
const DIGS = ACTIVITIES.digs;
const TOWS = ACTIVITIES.tows;
const FISH = ACTIVITIES.fish;
const FIXED_PICKUPS = ACTIVITIES.fixedPickups;
const AVOID = ACTIVITIES.avoid;

const PICKUP_LOOK = {
  starfish: { colors: [0xff7a45, 0xffb03a, 0xff6b8a], geo: 'starfish' },
  sandShell: { colors: [0xf4e2c4, 0xfff1d6, 0xe7c39a], geo: 'sandShell' },
  grape: { colors: [0x3d9a4a, 0x2f8f62, 0x67c45a], geo: 'grape' },
  crystal: { colors: [0x7af6ff, 0xb07bff, 0x4d7dff], geo: 'crystal', emissive: 0x1ad0ff },
};

const PICKUP_DEFS = ACTIVITIES.pickups.map((entry) => ({ ...entry, ...PICKUP_LOOK[entry.id] }));

export const CLEARINGS = [
  ...CLAMS.map((spot) => ({ x: spot.x, z: spot.z, minDist: 3.6 })),
  ...DIGS.map((spot) => ({ x: spot.x, z: spot.z, minDist: 3 })),
  ...TOWS.map((spot) => ({ x: spot.x, z: spot.z, minDist: 3.6 })),
  ...FIXED_PICKUPS.map((spot) => ({ x: spot.x, z: spot.z, minDist: 2.3 })),
];

const VACUUM_REACH = 1.7;
const DIG_REACH = 2.25;
const DIG_TIME = 1.1;
const CLAM_CYCLE = 6.8;
const OPEN_AT = 0.62;

export class Activities {
  constructor(scene) {
    this.scene = scene;
    this.hooked = null;
    this.nag = -10;
    this._dummy = new THREE.Object3D();
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
    this.cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1, 6),
      new THREE.MeshLambertMaterial({ color: 0xdfe7ee }),
    );
    this.cable.visible = false;
    this.cable.frustumCulled = false;
    scene.add(this.cable);
    this.pickups = [];
    this.pickupGroups = [];
    this.fish = [];
    this.clams = [];
    this.digs = [];
    this.tows = [];
    this._buildPickups();
    this._buildFish();
    this._buildClams();
    this._buildDigs();
    this._buildTows();
  }

  get drag() {
    return this.hooked ? this.hooked.drag : 1;
  }

  update(dt, time, ctx) {
    this.notePlayer(ctx.player.x, ctx.player.z);
    this._syncPickups(dt, time);
    this._animateFish(dt, time);
    this._animateClams(dt, time);
    this._animateDigs(dt, time);
    this._animateTows(dt, time);
    if (!ctx.started) return;
    this._vacuum(ctx);
    this._catchFish(ctx);
    this._cutClams(ctx);
    this._dig(dt, ctx);
    this._tow(dt, time, ctx);
  }

  _vacuum(ctx) {
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const reach2 = VACUUM_REACH * VACUUM_REACH;
    for (let i = 0; i < this.pickups.length; i++) {
      const item = this.pickups[i];
      if (item.state !== 'ready') continue;
      const dx = item.x - px;
      const dz = item.z - pz;
      if (dx * dx + dz * dz > reach2) continue;
      const ok = ctx.onLoot(this._loot(item, item.name, item.value, 1), {
        sfx: 'pickup',
        chunks: 2,
      });
      if (!ok) continue;
      item.state = 'wait';
      item.timer = item.respawn;
    }
  }

  _catchFish(ctx) {
    const cutter = ctx.player.getCutterXZ();
    const reach = ctx.cutter.range * 0.85;
    const reach2 = reach * reach;
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      if (fish.state !== 'ready' || fish.pinned) continue;
      const dx = fish.x - cutter.x;
      const dz = fish.z - cutter.z;
      if (dx * dx + dz * dz > reach2) continue;
      const ok = ctx.onLoot(this._loot(fish, fish.name, fish.value, 1), {
        sfx: 'catch',
        chunks: 2,
        bubbles: 8,
        toast: true,
        contact: 'cut',
        shake: 0.08,
      });
      if (!ok) continue;
      fish.state = 'wait';
      fish.timer = 16;
      fish.root.visible = false;
      fish.pinned = false;
    }
  }

  _cutClams(ctx) {
    const cutter = ctx.player.getCutterXZ();
    for (let i = 0; i < this.clams.length; i++) {
      const clam = this.clams[i];
      if (clam.state !== 'ready' || clam.hitCd > 0) continue;
      const dx = clam.x - cutter.x;
      const dz = clam.z - cutter.z;
      const reach = ctx.cutter.range + 0.55;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (ctx.cutter.power < clam.hardness) {
        clam.hitCd = 0.34;
        clam.flash = 1;
        ctx.onReject(clam, 'hard');
        continue;
      }
      if (clam.open < OPEN_AT) {
        clam.hitCd = 0.42;
        clam.flash = 1;
        ctx.onReject(clam, 'closed');
        continue;
      }
      const ok = ctx.onLoot(this._loot(clam, '真珠', clam.value, 1, 0xfff6ea), {
        sfx: 'pearl',
        chunks: 4,
        bubbles: 6,
        toast: true,
        contact: 'cut',
        shake: 0.22,
        buzz: 16,
      });
      if (!ok) continue;
      clam.state = 'wait';
      clam.timer = clam.respawn;
      clam.root.visible = false;
    }
  }

  _dig(dt, ctx) {
    const px = ctx.player.x;
    const pz = ctx.player.z;
    for (let i = 0; i < this.digs.length; i++) {
      const dig = this.digs[i];
      if (dig.state !== 'ready') continue;
      const dx = dig.x - px;
      const dz = dig.z - pz;
      const near = dx * dx + dz * dz <= DIG_REACH * DIG_REACH;
      if (near) {
        if (!ctx.canTake(1)) {
          ctx.onReject(dig, 'full');
        } else {
          dig.progress = Math.min(1, dig.progress + dt / DIG_TIME);
          if (dig.progress >= 1) {
            const ok = ctx.onLoot(this._loot(dig, dig.name, dig.value, 1, dig.color), {
              sfx: 'dig',
              chunks: 5,
              bubbles: 4,
              toast: true,
              contact: 'cut',
              shake: 0.16,
              buzz: 12,
            });
            if (ok) {
              dig.state = 'wait';
              dig.timer = dig.respawn;
              dig.progress = 0;
              dig.root.visible = false;
            } else {
              dig.progress = 0.92;
            }
          }
        }
      } else if (dig.progress > 0) {
        dig.progress = Math.max(0, dig.progress - dt * 0.85);
      }
      const show = dig.state === 'ready' && dig.progress > 0.02;
      dig.bar.visible = show;
      if (show) {
        paintBar(dig.barCanvas, dig.barCtx, dig.progress);
        dig.barTex.needsUpdate = true;
      }
    }
  }

  _tow(dt, time, ctx) {
    const player = ctx.player;
    if (!this.hooked) this._tryHook(time, ctx);
    else if (this._nearOtherTow(player)) {
      if (time > this.nag + 2.6) {
        this.nag = time;
        ctx.toast('引いている最中だ', 'info');
      }
    }
    const tow = this.hooked;
    if (!tow) {
      this.cable.visible = false;
      return;
    }
    const back = 3.55;
    const tx = player.x - Math.sin(player.angle) * back;
    const tz = player.z - Math.cos(player.angle) * back;
    tow.x = damp(tow.x, tx, 7, dt);
    tow.z = damp(tow.z, tz, 7, dt);
    tow.y = groundHeight(tow.x, tow.z);
    tow.root.position.set(tow.x, tow.y, tow.z);
    tow.root.rotation.y = player.angle;
    const hx = player.x - Math.sin(player.angle) * 1.75;
    const hz = player.z - Math.cos(player.angle) * 1.75;
    this._placeCable(hx, tow.y + 0.95, hz, tow.x, tow.y + tow.hookY, tow.z);
    if (Math.hypot(player.x, player.z) < SELL_RADIUS) this._sellTow(ctx);
  }

  _tryHook(time, ctx) {
    const player = ctx.player;
    const reach = player.radius + 1.15;
    const reach2 = reach * reach;
    for (let i = 0; i < this.tows.length; i++) {
      const tow = this.tows[i];
      if (tow.state !== 'ready') continue;
      const dx = tow.x - player.x;
      const dz = tow.z - player.z;
      if (dx * dx + dz * dz > reach2) continue;
      this.hooked = tow;
      tow.state = 'towed';
      ctx.audio.playSfx('tow');
      ctx.fx.sparks(tow.x, tow.y + 0.6, tow.z);
      ctx.toast(`${tow.name}を繋いだ。基地まで引こう`, 'info');
      this.nag = time;
      return;
    }
  }

  _nearOtherTow(player) {
    const reach = player.radius + 1.15;
    const reach2 = reach * reach;
    for (let i = 0; i < this.tows.length; i++) {
      const tow = this.tows[i];
      if (tow === this.hooked || tow.state !== 'ready') continue;
      const dx = tow.x - player.x;
      const dz = tow.z - player.z;
      if (dx * dx + dz * dz <= reach2) return true;
    }
    return false;
  }

  _sellTow(ctx) {
    const tow = this.hooked;
    if (!tow) return;
    ctx.onTowSold(tow);
    tow.state = 'wait';
    tow.timer = tow.respawn;
    tow.root.visible = false;
    this.hooked = null;
    this.cable.visible = false;
  }

  _syncPickups(dt, time) {
    const dummy = this._dummy;
    for (let g = 0; g < this.pickupGroups.length; g++) {
      const group = this.pickupGroups[g];
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i];
        if (item.state === 'wait') {
          item.timer -= dt;
          if (item.timer <= 0) {
            item.state = 'grow';
            item.grow = 0;
          }
        } else if (item.state === 'grow') {
          item.grow += dt / 0.35;
          if (item.grow >= 1) {
            item.grow = 1;
            item.state = 'ready';
          }
        }
        let scale = item.base;
        if (item.state === 'wait') scale = 0.001;
        else if (item.state === 'grow') scale *= Math.max(0.001, item.grow);
        const bob = Math.sin(time * 2.1 + item.phase) * 0.05;
        dummy.position.set(item.x, item.y + bob, item.z);
        dummy.rotation.set(0, item.yaw + time * 0.15, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        group.mesh.setMatrixAt(i, dummy.matrix);
      }
      group.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _animateFish(dt, time) {
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      if (fish.state === 'wait') {
        fish.timer -= dt;
        if (fish.timer <= 0) {
          fish.state = 'ready';
          fish.x = fish.homeX;
          fish.z = fish.homeZ;
          fish.root.visible = true;
        }
        continue;
      }
      const awayX = fish.x - fish.playerX;
      const awayZ = fish.z - fish.playerZ;
      if (!fish.pinned && awayX * awayX + awayZ * awayZ > 95 * 95) {
        fish.root.visible = false;
        continue;
      }
      fish.root.visible = true;
      let vx = 0;
      let vz = 0;
      if (!fish.pinned) {
        const dx = fish.x - fish.playerX;
        const dz = fish.z - fish.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist < 9 && dist > 0.05) {
          vx = (dx / dist) * 6.5;
          vz = (dz / dist) * 6.5;
        } else {
          fish.heading += Math.sin(time * 0.65 + fish.phase) * dt * 0.9;
          vx = Math.sin(fish.heading) * 1.7;
          vz = Math.cos(fish.heading) * 1.7;
        }
        const hx = fish.x - fish.homeX;
        const hz = fish.z - fish.homeZ;
        const home = Math.hypot(hx, hz);
        if (home > fish.homeR && home > 0.001) {
          vx -= (hx / home) * 3.4;
          vz -= (hz / home) * 3.4;
        }
        fish.x += vx * dt;
        fish.z += vz * dt;
      }
      fish.y = groundHeight(fish.x, fish.z) + 1.15 + Math.sin(time * 2.4 + fish.phase) * 0.14;
      fish.root.position.set(fish.x, fish.y, fish.z);
      if (fish.pinned) fish.root.rotation.y = Math.PI;
      else if (vx * vx + vz * vz > 0.04) fish.root.rotation.y = Math.atan2(vx, vz);
      fish.tail.rotation.y = Math.sin(time * 8 + fish.phase) * 0.45;
    }
  }

  _animateClams(dt, time) {
    for (let i = 0; i < this.clams.length; i++) {
      const clam = this.clams[i];
      if (clam.hitCd > 0) clam.hitCd = Math.max(0, clam.hitCd - dt);
      if (clam.state === 'wait') {
        clam.timer -= dt;
        if (clam.timer <= 0) {
          clam.state = 'ready';
          clam.grow = 0;
          clam.root.visible = true;
        }
        continue;
      }
      clam.grow = Math.min(1, clam.grow + dt / 0.4);
      const wave = Math.sin(time * ((Math.PI * 2) / CLAM_CYCLE) + clam.phase);
      clam.open = clam.holdOpen != null ? clam.holdOpen : smoothstep(-0.05, 0.62, wave);
      clam.hinge.rotation.x = -clam.open * 1.15;
      clam.pearlMat.emissiveIntensity = 0.15 + clam.open * 0.7;
      clam.shell.emissive.setHex(clam.flash > 0.02 ? 0xff3344 : 0x000000);
      clam.shell.emissiveIntensity = clam.flash > 0 ? clam.flash * 0.85 : 0;
      if (clam.flash > 0) clam.flash = Math.max(0, clam.flash - dt * 4.2);
      const s = clam.baseScale * Math.max(0.001, clam.grow);
      clam.root.scale.setScalar(s);
    }
  }

  _animateDigs(dt, time) {
    for (let i = 0; i < this.digs.length; i++) {
      const dig = this.digs[i];
      if (dig.state === 'wait') {
        dig.timer -= dt;
        if (dig.timer <= 0) {
          dig.state = 'ready';
          dig.progress = 0;
          dig.root.visible = true;
        }
        continue;
      }
      for (let s = 0; s < dig.sparkles.length; s++) {
        const spark = dig.sparkles[s];
        const a = time * 1.7 + s * 2.1;
        spark.position.set(Math.cos(a) * 0.72, 0.55 + Math.sin(time * 3.1 + s) * 0.28, Math.sin(a) * 0.72);
        spark.rotation.y = time * 2 + s;
      }
      dig.bar.position.y = 1.15 + Math.sin(time * 1.8 + i) * 0.04;
    }
  }

  _animateTows(dt, time) {
    for (let i = 0; i < this.tows.length; i++) {
      const tow = this.tows[i];
      if (tow.state === 'wait') {
        tow.timer -= dt;
        if (tow.timer <= 0) {
          tow.state = 'ready';
          tow.x = tow.homeX;
          tow.z = tow.homeZ;
          tow.y = groundHeight(tow.x, tow.z);
          tow.root.position.set(tow.x, tow.y, tow.z);
          tow.root.rotation.y = tow.yaw;
          tow.root.visible = true;
        }
        continue;
      }
      if (tow.state === 'ready') {
        tow.root.position.y = tow.y + Math.sin(time * 1.4 + i) * 0.04;
      }
    }
  }

  notePlayer(x, z) {
    for (let i = 0; i < this.fish.length; i++) {
      this.fish[i].playerX = x;
      this.fish[i].playerZ = z;
    }
  }

  _placeCable(x1, y1, z1, x2, y2, z2) {
    this._dir.set(x2 - x1, y2 - y1, z2 - z1);
    const len = this._dir.length();
    if (len < 0.05) {
      this.cable.visible = false;
      return;
    }
    this._dir.multiplyScalar(1 / len);
    this.cable.visible = true;
    this.cable.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    this.cable.quaternion.setFromUnitVectors(this._up, this._dir);
    this.cable.scale.set(1, len, 1);
  }

  _loot(src, name, value, cargo, colorHex) {
    return {
      name,
      value,
      cargo,
      colorHex: colorHex ?? src.colorHex ?? src.color,
      x: src.x,
      y: src.y || 0,
      z: src.z,
    };
  }

  _buildPickups() {
    const rand = mulberry32(20261026);
    const geos = pickupGeos();
    const lists = new Map(PICKUP_DEFS.map((def) => [def.id, []]));
    const occupied = CLEARINGS.map((spot) => ({ x: spot.x, z: spot.z, minDist: spot.minDist }));
    for (let i = 0; i < FIXED_PICKUPS.length; i++) {
      const spot = FIXED_PICKUPS[i];
      lists.get(spot.type).push({
        x: spot.x,
        z: spot.z,
        yaw: rand() * Math.PI * 2,
        color: PICKUP_DEFS.find((def) => def.id === spot.type).colors[i % 3],
      });
    }
    for (let d = 0; d < PICKUP_DEFS.length; d++) {
      const def = PICKUP_DEFS[d];
      const list = lists.get(def.id);
      let attempts = 0;
      while (list.length < def.count && attempts < def.count * 50) {
        attempts += 1;
        const spot = sampleRegion(rand, def.region);
        if (!spot || blocked(spot.x, spot.z, occupied, 2.35)) continue;
        occupied.push({ x: spot.x, z: spot.z, minDist: 2.35 });
        list.push({
          x: spot.x,
          z: spot.z,
          yaw: rand() * Math.PI * 2,
          color: def.colors[Math.floor(rand() * def.colors.length)],
        });
      }
      if (list.length === 0) continue;
      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        flatShading: true,
        emissive: def.emissive || 0x000000,
        emissiveIntensity: def.emissive ? 0.8 : 0,
      });
      const mesh = new THREE.InstancedMesh(geos[def.geo], mat, list.length);
      mesh.count = list.length;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      const items = [];
      for (let i = 0; i < list.length; i++) {
        const color = new THREE.Color(list[i].color);
        const item = {
          x: list[i].x,
          z: list[i].z,
          y: groundHeight(list[i].x, list[i].z) + 0.06,
          yaw: list[i].yaw,
          phase: rand() * Math.PI * 2,
          base: 1.15 + rand() * 0.35,
          name: def.name,
          value: def.value,
          colorHex: color.getHex(),
          respawn: def.respawn,
          state: 'ready',
          timer: 0,
          grow: 1,
        };
        items.push(item);
        this.pickups.push(item);
        mesh.setColorAt(i, color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.pickupGroups.push({ mesh, items });
    }
  }

  _buildFish() {
    for (let i = 0; i < FISH.length; i++) {
      const def = FISH[i];
      const built = buildFish(def.color);
      const y = groundHeight(def.x, def.z) + 1.15;
      built.root.position.set(def.x, y, def.z);
      built.root.scale.setScalar(1.65);
      this.scene.add(built.root);
      this.fish.push({
        ...def,
        homeX: def.x,
        homeZ: def.z,
        x: def.x,
        z: def.z,
        y,
        heading: i * 0.7,
        phase: i * 1.3,
        playerX: 0,
        playerZ: 0,
        pinned: false,
        state: 'ready',
        timer: 0,
        root: built.root,
        tail: built.tail,
        colorHex: def.color,
      });
    }
  }

  _buildClams() {
    for (let i = 0; i < CLAMS.length; i++) {
      const def = CLAMS[i];
      const built = buildClam();
      const y = groundHeight(def.x, def.z);
      built.root.position.set(def.x, y, def.z);
      built.root.rotation.y = i * 0.9;
      this.scene.add(built.root);
      this.clams.push({
        ...def,
        x: def.x,
        z: def.z,
        y,
        open: 0,
        holdOpen: null,
        hitCd: 0,
        flash: 0,
        grow: 1,
        timer: 0,
        state: 'ready',
        baseScale: 1.9,
        root: built.root,
        hinge: built.hinge,
        shell: built.shell,
        pearlMat: built.pearlMat,
      });
    }
  }

  _buildDigs() {
    for (let i = 0; i < DIGS.length; i++) {
      const def = DIGS[i];
      const built = buildDig();
      const y = groundHeight(def.x, def.z);
      built.root.position.set(def.x, y, def.z);
      this.scene.add(built.root);
      this.digs.push({
        ...def,
        x: def.x,
        z: def.z,
        y,
        progress: 0,
        state: 'ready',
        timer: 0,
        root: built.root,
        sparkles: built.sparkles,
        bar: built.bar,
        barCanvas: built.barCanvas,
        barCtx: built.barCtx,
        barTex: built.barTex,
      });
    }
  }

  _buildTows() {
    for (let i = 0; i < TOWS.length; i++) {
      const def = TOWS[i];
      const built = buildTow(def.kind);
      const y = groundHeight(def.x, def.z);
      built.root.position.set(def.x, y, def.z);
      built.root.rotation.y = i * 0.8;
      this.scene.add(built.root);
      this.tows.push({
        ...def,
        homeX: def.x,
        homeZ: def.z,
        x: def.x,
        z: def.z,
        y,
        yaw: i * 0.8,
        hookY: built.hookY,
        state: 'ready',
        timer: 0,
        root: built.root,
      });
    }
  }
}

function blocked(x, z, occupied, minDist) {
  for (let i = 0; i < AVOID.length; i++) {
    const spot = AVOID[i];
    const dx = spot.x - x;
    const dz = spot.z - z;
    if (dx * dx + dz * dz < spot.r * spot.r) return true;
  }
  for (let i = 0; i < occupied.length; i++) {
    const spot = occupied[i];
    const dx = spot.x - x;
    const dz = spot.z - z;
    const need = Math.max(minDist, spot.minDist || minDist);
    if (dx * dx + dz * dz < need * need) return true;
  }
  return false;
}

function sampleRegion(rand, region) {
  const a = rand() * Math.PI * 2;
  let rMin = 18;
  let rMax = WORLD.shallow - 4;
  if (region === 'kelp') {
    rMin = WORLD.shallow + 6;
    rMax = WORLD.kelp - 6;
  } else if (region === 'deep') {
    rMin = WORLD.coral + 8;
    rMax = WORLD.limit - 12;
  }
  const r = Math.sqrt(rMin * rMin + rand() * (rMax * rMax - rMin * rMin));
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  if (region !== 'deep' && inWreck(x, z, WRECK.radius + 4)) return null;
  return { x, z };
}

function paintBar(canvas, ctx, ratio) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(4, 20, 28, 0.82)';
  roundRect(ctx, 2, 6, w - 4, 12, 6);
  ctx.fill();
  const span = Math.max(0, Math.min(1, ratio)) * (w - 10);
  ctx.fillStyle = '#ffc83d';
  if (span > 1) {
    roundRect(ctx, 5, 8, span, 8, 4);
    ctx.fill();
  }
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

function makeBar() {
  const barCanvas = document.createElement('canvas');
  barCanvas.width = 128;
  barCanvas.height = 24;
  const barCtx = barCanvas.getContext('2d');
  const barTex = new THREE.CanvasTexture(barCanvas);
  barTex.colorSpace = THREE.SRGBColorSpace;
  paintBar(barCanvas, barCtx, 0);
  const bar = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: barTex, transparent: true, depthWrite: false, depthTest: false }),
  );
  bar.scale.set(1.45, 0.27, 1);
  bar.position.y = 1.15;
  bar.visible = false;
  bar.renderOrder = 2;
  return { bar, barCanvas, barCtx, barTex };
}

function buildFish(color) {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 6), mat);
  body.scale.set(0.62, 0.78, 1.45);
  const tailPivot = new THREE.Group();
  tailPivot.position.z = -0.34;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), mat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.12;
  tailPivot.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.16), mat);
  fin.position.set(0, 0.2, -0.02);
  root.add(body, tailPivot, fin);
  return { root, tail: tailPivot };
}

function buildClam() {
  const root = new THREE.Group();
  const shell = new THREE.MeshLambertMaterial({ color: 0xf3d7b0, flatShading: true });
  const lip = new THREE.MeshLambertMaterial({ color: 0xfff6ea, flatShading: true });
  const pearlMat = new THREE.MeshLambertMaterial({
    color: 0xfff6ea,
    emissive: 0x886644,
    emissiveIntensity: 0.45,
    flatShading: true,
  });
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.78, 8, 6), shell);
  lower.scale.set(1.2, 0.4, 0.95);
  lower.position.y = 0.24;
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.36, -0.46);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.74, 8, 6), shell);
  upper.scale.set(1.16, 0.36, 0.92);
  upper.position.set(0, 0.1, 0.46);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.46, 8), lip);
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(0, 0.04, 0.4);
  hinge.add(upper, inner);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), pearlMat);
  pearl.position.set(0.04, 0.36, 0.02);
  root.add(lower, hinge, pearl);
  return { root, hinge, shell, pearlMat };
}

function buildDig() {
  const root = new THREE.Group();
  const sand = new THREE.MeshLambertMaterial({ color: 0xe6c27a, flatShading: true });
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), sand);
  mound.scale.set(1.45, 0.42, 1.25);
  mound.position.y = 0.16;
  root.add(mound);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff4b0 });
  const sparkles = [];
  for (let i = 0; i < 3; i++) {
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), sparkMat);
    root.add(spark);
    sparkles.push(spark);
  }
  const bar = makeBar();
  root.add(bar.bar);
  return { root, sparkles, ...bar };
}

function buildTow(kind) {
  const root = new THREE.Group();
  if (kind === 'crate') {
    const wood = new THREE.MeshLambertMaterial({ color: 0xc9893a, flatShading: true });
    const band = new THREE.MeshLambertMaterial({ color: 0x6e4a28, flatShading: true });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.25), wood);
    box.position.y = 0.62;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.12, 1.32), band);
    strap.position.y = 0.7;
    root.add(box, strap);
    return { root, hookY: 1.15 };
  }
  if (kind === 'anchor') {
    const metal = new THREE.MeshLambertMaterial({ color: 0x4a5560, flatShading: true });
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.7, 6), metal);
    shank.position.y = 0.95;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 10), metal);
    ring.position.y = 1.85;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.12), metal);
    stock.position.y = 0.28;
    root.add(shank, ring, stock);
    return { root, hookY: 1.9 };
  }
  if (kind === 'statue') {
    const stone = new THREE.MeshLambertMaterial({ color: 0xd9d3c5, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.28, 6), stone);
    base.position.y = 0.16;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.42), stone);
    body.position.y = 0.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 6), stone);
    head.position.y = 1.52;
    root.add(base, body, head);
    return { root, hookY: 1.7 };
  }
  const slab = new THREE.MeshLambertMaterial({
    color: 0x7af6ff,
    emissive: 0x1ad0ff,
    emissiveIntensity: 0.65,
    flatShading: true,
  });
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.35, 0.16), slab);
  tablet.position.y = 0.75;
  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.16, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x245868, flatShading: true }),
  );
  foot.position.y = 0.08;
  root.add(tablet, foot);
  return { root, hookY: 1.35 };
}

function merge(parts) {
  const normalized = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const geo = mergeGeometries(normalized);
  for (const part of parts) part.dispose();
  for (const part of normalized) {
    if (!parts.includes(part)) part.dispose();
  }
  if (!geo) throw new Error('failed to merge pickup geometry');
  return geo;
}

function pickupGeos() {
  return {
    starfish: starfishGeo(),
    sandShell: sandShellGeo(),
    grape: grapeGeo(),
    crystal: crystalGeo(),
  };
}

function starfishGeo() {
  const parts = [];
  const core = new THREE.SphereGeometry(0.18, 6, 5);
  core.scale(1, 0.45, 1);
  core.translate(0, 0.08, 0);
  parts.push(core);
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.ConeGeometry(0.1, 0.55, 4);
    const a = (i / 5) * Math.PI * 2;
    arm.rotateX(Math.PI / 2);
    arm.rotateY(a);
    arm.translate(Math.sin(a) * 0.32, 0.08, Math.cos(a) * 0.32);
    parts.push(arm);
  }
  return merge(parts);
}

function sandShellGeo() {
  const fan = new THREE.ConeGeometry(0.36, 0.14, 6);
  fan.rotateX(Math.PI / 2);
  fan.translate(0, 0.1, 0);
  return fan.index ? fan.toNonIndexed() : fan;
}

function grapeGeo() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.03, 0.03, 0.38, 4);
  stem.translate(0, 0.42, 0);
  parts.push(stem);
  for (let i = 0; i < 6; i++) {
    const berry = new THREE.SphereGeometry(0.11, 5, 4);
    const a = (i / 6) * Math.PI * 2;
    berry.translate(Math.sin(a) * 0.14, 0.16 + (i % 2) * 0.12, Math.cos(a) * 0.14);
    parts.push(berry);
  }
  return merge(parts);
}

function crystalGeo() {
  const a = new THREE.OctahedronGeometry(0.32, 0);
  a.translate(0, 0.36, 0);
  const b = new THREE.OctahedronGeometry(0.16, 0);
  b.translate(0.2, 0.22, 0.06);
  return merge([a, b]);
}
