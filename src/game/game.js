import * as THREE from 'three';
import { AudioBus } from './audio.js';
import {
  CUTTER_LEVELS,
  PADS,
  POWER_NEED,
  PRICE_LEVELS,
  PROP_LEVELS,
  TANK_LEVELS,
  UPGRADE_RADIUS,
  UPGRADES,
  WRECK,
  cutterStats,
  nearestPad,
  padPosition,
  priceMult,
  propSpeed,
  tankCapacity,
} from './constants.js';
import { cameraRig } from './cameraRig.js';
import { features } from './features.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { clamp, damp, smoothstep } from './math.js';
import { Player } from './player.js';
import { Resources } from './resources.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { zoneAt } from './terrain.js';
import { UI } from './ui.js';
import { World } from './world.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.save = loadSave();
    this.money = this.save.money;
    this.displayMoney = this.money;
    this.levels = {
      cutter: clamp(this.save.levels.cutter, 1, CUTTER_LEVELS.length),
      tank: clamp(this.save.levels.tank, 1, TANK_LEVELS.length),
      propeller: clamp(this.save.levels.propeller, 1, PROP_LEVELS.length),
      price: clamp(this.save.levels.price, 1, PRICE_LEVELS.length),
    };
    this.stats = { ...this.save.stats };
    this.tank = { cargo: 0, value: 0, pieces: [], warned: false };
    this.started = false;
    this.playTime = 0;
    this.time = 0;
    this.zone = zoneAt(0, 0);
    this.wasInside = true;
    this.emptyHintShown = false;
    this.nudgeCut = false;
    this.movedOnce = false;
    this.combo = 0;
    this.comboTime = -10;
    this.hardHintAt = -10;
    this.statusHint = '';
    this.statusUntil = 0;
    this.fullHintAt = -10;
    this.shake = 0;
    this.frameCutMode = 'idle';
    this.bubbleAcc = 0;
    this.debug = new URLSearchParams(location.search).has('debug');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 480);
    this.camera.position.set(12, 18, 16);
    this.curLook = new THREE.Vector3(0, 0.4, 0);
    this.desiredCam = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._move = new THREE.Vector3();

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      const el = document.getElementById('gl-error');
      if (el) el.hidden = false;
      throw error;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x8fe7f2, 1);
    app.prepend(this.renderer.domElement);

    this.world = new World(this.scene);
    this.resources = new Resources(this.scene);
    this.player = new Player(this.scene);
    this.fx = new FX(this.scene);
    this.audio = new AudioBus();
    this.audio.setMuted(this.save.mute);
    this.input = new Input();
    this.input.unlock = () => this.audio.unlock();
    this.ui = new UI();
    this.ui.setTitleStats(this.snapshot());
    this.ui.onStart = () => this.startPlay();
    this.ui.onReset = () => this.reset();
    this.ui.onToggleMute = () => this.toggleMute();
    this.ui.onBuy = (id) => this.buy(id);
    this.ui.muteBtn.textContent = this.audio.muted ? '音OFF' : '音ON';
    this.harvest = {
      canTake: (cost) => this.tank.cargo + cost <= tankCapacity(this.levels.tank),
      onHit: (entity, killed) => this.onHit(entity, killed),
      onReject: (entity, reason) => this.onReject(entity, reason),
    };

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    window.addEventListener('beforeunload', () => this.persist());
    this.resize();

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.world.buildSigns());
    }
    this.world.buildSigns();

    if (this.debug) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.id = 'fps';
      this.fpsEl.textContent = 'FPS';
      document.body.appendChild(this.fpsEl);
      window.__coral = this;
    }
    this.fpsAcc = 0;
    this.fpsFrames = 0;
  }

  snapshot() {
    return {
      version: 1,
      money: this.money,
      levels: { ...this.levels },
      stats: { ...this.stats },
      mute: this.audio.muted,
    };
  }

  persist() {
    writeSave(this.snapshot());
  }

  start() {
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);
    });
  }

  startPlay() {
    if (this.started) return;
    this.started = true;
    this.input.enabled = true;
    this.audio.unlock();
    this.ui.showPlaying();
    this.playTime = 0;
    this.ui.toast('海藻を刈って、基地の円で売ろう', 'info');
  }

  reset() {
    if (!window.confirm('セーブデータを消して最初から始めますか？')) return;
    clearSave();
    window.location.reload();
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.muteBtn.textContent = this.audio.muted ? '音OFF' : '音ON';
    this.persist();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.applyRig();
    const mobile = Math.min(w, h) < 820;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
    this.renderer.setSize(w, h, false);
  }

  applyRig() {
    const rig = cameraRig(this.camera.aspect || 1);
    this.rig = rig;
    this.camera.fov = rig.fov;
    this.camera.updateProjectionMatrix();
  }

  computeMove(axis) {
    if (!axis) return this._move.set(0, 0, 0);
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    if (this._forward.lengthSq() < 1e-5) this._forward.set(0, 0, -1);
    this._forward.normalize();
    this._right.crossVectors(this._forward, this._up).normalize();
    this._move.copy(this._right).multiplyScalar(axis.x).addScaledVector(this._forward, -axis.y);
    if (this._move.lengthSq() > 1) this._move.normalize();
    return this._move;
  }

  registerContact(mode) {
    const rank = { idle: 0, full: 1, clank: 2, cut: 3 };
    if ((rank[mode] ?? 0) > (rank[this.frameCutMode] ?? 0)) this.frameCutMode = mode;
  }

  onHit(entity, killed) {
    this.registerContact('cut');
    if (!killed) {
      this.audio.cut();
      return;
    }
    if (this.time - this.comboTime < 0.7) this.combo += 1;
    else this.combo = 1;
    this.comboTime = this.time;
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    const bonus = Math.min(0.3, Math.max(0, this.combo - 1) * 0.03);
    const gain = Math.round(entity.value * (1 + bonus));
    this.tank.cargo += entity.cargo;
    this.tank.value += gain;
    this.tank.pieces.push(entity.colorHex);
    if (this.tank.pieces.length > 36) this.tank.pieces.shift();
    this.stats.cut += 1;
    const big = entity.maxHp >= 40;
    if (big) this.audio.shatter();
    else this.audio.cut();
    this.fx.chunks(entity.x, entity.y + 0.7, entity.z, entity.colorHex, big ? 6 : 3);
    if (big) {
      this.shake = Math.max(this.shake, 0.3);
      buzz(14);
    }
    const cap = tankCapacity(this.levels.tank);
    if (this.tank.cargo >= cap && !this.tank.warned) {
      this.tank.warned = true;
      this.ui.toast('タンクが満タン！基地に戻ろう', 'info');
      this.audio.full();
    }
  }

  onReject(entity, reason) {
    if (reason === 'hard') {
      this.registerContact('clank');
      this.audio.clank();
      this.fx.sparks(entity.x, entity.y + 0.7, entity.z);
      if (this.time > this.hardHintAt + 1.7) {
        this.hardHintAt = this.time;
        const need = POWER_NEED[entity.hardness];
        const text = `${entity.name}はまだ切れない。カッターLv${need}が必要`;
        this.ui.toast(text, 'bad');
        this.setHint(text, 3.6);
      }
      return;
    }
    this.registerContact('full');
    if (this.time > this.fullHintAt + 2.4) {
      this.fullHintAt = this.time;
      this.ui.toast('タンクがいっぱいだ。基地で売ろう', 'info');
    }
  }

  setHint(text, seconds = 3.2) {
    this.statusHint = text;
    this.statusUntil = this.time + seconds;
  }

  trySell() {
    const inside = Math.hypot(this.player.x, this.player.z) < 6;
    if (inside && !this.wasInside) this.onEnterSell();
    this.wasInside = inside;
  }

  onEnterSell() {
    if (this.tank.cargo <= 0) {
      if (!this.emptyHintShown && this.stats.cut === 0) {
        this.emptyHintShown = true;
        this.ui.toast('海藻を刈ってから、この円に戻ると売れる', 'info');
      }
      return;
    }
    const payout = Math.max(1, Math.round(this.tank.value * priceMult(this.levels.price)));
    this.money += payout;
    this.stats.earned += payout;
    this.tank.cargo = 0;
    this.tank.value = 0;
    this.tank.pieces.length = 0;
    this.tank.warned = false;
    this.combo = 0;
    this.ui.toast(`売却 +${payout.toLocaleString('ja-JP')}`, 'good');
    this.ui.bumpMoney();
    this.audio.sell();
    this.fx.coins(this.player.x, 1.3, this.player.z);
    this.fx.bubbles(this.player.x, 0.6, this.player.z, 12);
    this.world.pulseSell();
    this.shake = Math.max(this.shake, 0.48);
    buzz(28);
    this.persist();
  }

  buy(id) {
    if (Math.hypot(this.player.x, this.player.z) > UPGRADE_RADIUS) return;
    const def = UPGRADES.find((entry) => entry.id === id);
    if (!def) return;
    const level = this.levels[id];
    if (level >= def.max) return;
    const cost = def.cost(level);
    if (cost == null || this.money < cost) return;
    this.money -= cost;
    this.levels[id] += 1;
    let message = `${def.name}を強化した`;
    if (id === 'cutter') message = CUTTER_LEVELS[this.levels.cutter - 1].shout || message;
    if (id === 'tank') message = `タンク容量 ${tankCapacity(this.levels.tank)}`;
    if (id === 'propeller') message = '速度が上がった！';
    if (id === 'price') message = `売値が ×${priceMult(this.levels.price).toFixed(2)} になった`;
    this.ui.toast(message, 'good');
    this.ui.bumpMoney();
    this.audio.buy();
    const pad = PADS.find((entry) => entry.id === id);
    if (pad) {
      const pos = padPosition(pad);
      this.fx.sparks(pos.x, 1.2, pos.z);
      this.fx.bubbles(pos.x, 0.8, pos.z, 6);
    }
    this.shake = Math.max(this.shake, 0.16);
    buzz(12);
    this.persist();
  }

  update(dt) {
    this.time += dt;
    if (this.started) this.playTime += dt;
    const axis = this.started ? this.input.axis() : null;
    const move = this.started ? this.computeMove(axis) : this._move.set(0, 0, 0);
    const speed = propSpeed(this.levels.propeller);
    const cutter = cutterStats(this.levels.cutter);
    this.player.cutMode = this.frameCutMode;
    this.player.update(dt, move, speed, this.world.colliders, cutter.range);

    if (this.started) {
      if (!this.movedOnce && this.player.speed > 1.2) this.movedOnce = true;
      const zone = zoneAt(this.player.x, this.player.z);
      if (zone.id !== this.zone.id) {
        const prev = this.zone;
        this.zone = zone;
        if (zone.rank > prev.rank) this.ui.toast(zone.enter, 'info');
      }
      this.trySell();
      this.frameCutMode = 'idle';
      const cpos = this.player.getCutterXZ();
      this.resources.harvestAround(cpos.x, cpos.z, cutter.range, cutter.damage, cutter.power, this.harvest);
      if (features.autoVacuum && features.vacuumRadius > 0) {
        this.resources.harvestAround(
          this.player.x,
          this.player.z,
          features.vacuumRadius,
          cutter.damage,
          cutter.power,
          this.harvest,
        );
      }
      if (this.stats.cut === 0 && !this.nudgeCut && this.playTime > 6) {
        this.nudgeCut = true;
        this.ui.toast('海藻に触れると刈れる', 'info');
      }
      const cap = tankCapacity(this.levels.tank);
      if (this.tank.cargo < cap) this.tank.warned = false;
      this.bubbleAcc += dt;
      if (this.bubbleAcc > 0.09 && this.player.speed > 2) {
        this.bubbleAcc = 0;
        const nozzle = this.player.getNozzle();
        this.fx.bubbles(nozzle.x, nozzle.y, nozzle.z, 1);
      }
    }

    this.resources.update(dt, this.time);
    const dist = Math.hypot(this.player.x, this.player.z);
    const cap = tankCapacity(this.levels.tank);
    this.world.update(dt, this.time, {
      x: this.player.x,
      z: this.player.z,
      dist,
      showArrow: this.started && cap > 0 && this.tank.cargo / cap >= 0.75,
      viewScale: this.rig?.distScale ?? 1,
      indicatorScale: this.rig?.indicatorScale ?? 1,
    });
    const shown = cap > 0 ? Math.round((this.tank.cargo / cap) * this.player.chunks.length) : 0;
    this.player.syncPile(this.tank.pieces, shown);
    const home = this.player.getCargoWorld();
    this.fx.update(dt, home);

    const depth = smoothstep(120, 220, dist);
    this.player.lamp.intensity = 8 + depth * 34;
    this.player.lamp.distance = 16 + depth * 12;

    this.updateCamera(dt);
    this.displayMoney = damp(this.displayMoney, this.money, 9, dt);
    if (Math.abs(this.displayMoney - this.money) < 0.5) this.displayMoney = this.money;

    if (this.started) {
      this.ui.sync({
        money: this.displayMoney,
        rawMoney: this.money,
        cutterLevel: this.levels.cutter,
        tankLevel: this.levels.tank,
        propLevel: this.levels.propeller,
        priceLevel: this.levels.price,
        tankCargo: this.tank.cargo,
        tankCap: cap,
        payout: Math.round(this.tank.value * priceMult(this.levels.price)),
        zone: this.zone.name,
        dist,
        combo: this.combo,
        comboAge: this.time - this.comboTime,
        atBase: dist < UPGRADE_RADIUS,
        nearPad: nearestPad(this.player.x, this.player.z),
        x: this.player.x,
        z: this.player.z,
        angle: this.player.angle,
        wreckX: WRECK.x,
        wreckZ: WRECK.z,
        muted: this.audio.muted,
        showMoveHint: !this.movedOnce && this.playTime > 0.3,
        pointer: this.input.pointer,
        hint: this.time < this.statusUntil ? this.statusHint : '',
      });
    }

    this.renderer.render(this.scene, this.camera);
    if (this.debug) {
      this.fpsAcc += dt;
      this.fpsFrames += 1;
      if (this.fpsAcc >= 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
    }
  }

  updateCamera(dt) {
    const rig = this.rig || cameraRig(this.camera.aspect || 1);
    if (!this.started) {
      const ang = this.time * 0.18;
      const orbit = 16 * rig.distScale;
      this.desiredCam.set(Math.sin(ang) * orbit, rig.height * 0.78, Math.cos(ang) * orbit);
      this.lookAt.set(0, 0.6, 0);
    } else {
      this.desiredCam.set(this.player.x, rig.height, this.player.z + rig.back);
      this.lookAt.set(this.player.x, rig.lookY, this.player.z + rig.lift);
    }
    const follow = 1 - Math.exp(-3.4 * dt);
    this.camera.position.lerp(this.desiredCam, follow);
    this.curLook.lerp(this.lookAt, follow);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.35;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.7);
    }
    this.camera.lookAt(this.curLook);
  }
}

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not available */
  }
}
