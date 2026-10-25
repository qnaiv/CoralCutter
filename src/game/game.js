import * as THREE from 'three';
import { AudioBus } from './audio.js';
import {
  CUTTER_LEVELS,
  DEPTH_LEVELS,
  PADS,
  POWER_NEED,
  PRICE_LEVELS,
  PROP_LEVELS,
  SELL_RADIUS,
  TANK_LEVELS,
  UPGRADE_RADIUS,
  UPGRADES,
  WORLD,
  WORLD_LIMIT,
  WRECK,
  cutterStats,
  nearestPad,
  padPosition,
  priceMult,
  propSpeed,
  tankCapacity,
} from './constants.js';
import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN, cameraRig } from './cameraRig.js';
import { CargoDrone } from './drone.js';
import {
  BASE_MAX,
  FACILITIES,
  accessAt,
  baseUpgradeCost,
  containPosition,
  droneStats,
  nextGateHint,
  facilityCost,
  outpostArrival,
  outpostBlocked,
  outpostBuildCost,
  outpostCap,
  outpostSellRadius,
  processMult,
  warpCooldown,
} from './economy.js';
import { applyFacilityFeatures, features } from './features.js';
import { Outposts } from './outposts.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { clamp, damp, smoothstep } from './math.js';
import { Player } from './player.js';
import { Resources } from './resources.js';
import { BigTargets } from './targets.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { zoneAt, zoneForPlayer } from './terrain.js';
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
      depth: clamp(this.save.levels.depth || 1, 1, DEPTH_LEVELS.length),
    };
    this.stats = { ...this.save.stats };
    this.baseLevel = clamp(this.save.baseLevel || 1, 1, BASE_MAX);
    this.facilities = { ...this.save.facilities };
    this.viewZoom = clamp(this.save.viewZoom ?? 1, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
    this.zoom = this.viewZoom;
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
    this.gateHintAt = -10;
    this.inFarDeep = false;
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
    this.targets = new BigTargets(this.scene);
    this.outposts = new Outposts(this.scene, this.world.colliders);
    this.outposts.load(this.save.outposts);
    this.outposts.setSellRadius(outpostSellRadius(this.facilities.outpost));
    this.drone = new CargoDrone(this.scene);
    this.warpReadyAt = 0;
    this.world.setBaseLevel(this.baseLevel);
    this.world.colliders.push(...this.targets.colliders());
    this.player = new Player(this.scene);
    this.fx = new FX(this.scene);
    this.audio = new AudioBus();
    this.audio.setMuted(this.save.mute);
    this.audio.setLevels(this.save.bgm / 100, this.save.se / 100);
    this.audio.setZone(this.zone.id);
    this.input = new Input();
    this.input.unlock = () => this.audio.unlock();
    this.input.onZoom = (factor) => this.nudgeZoom(factor);
    this.input.onZoomEnd = () => this.persist();
    this.ui = new UI();
    this.ui.setTitleStats(this.snapshot());
    this.ui.onStart = () => this.startPlay();
    this.ui.onReset = () => this.reset();
    this.ui.onToggleMute = () => this.toggleMute();
    this.ui.onBuy = (id) => this.buy(id);
    this.ui.onFacility = (id) => this.buyFacility(id);
    this.ui.onBase = () => this.upgradeBase();
    this.ui.onWarp = (index) => this.warpTo(index);
    this.ui.onBuild = () => this.placeOutpost();
    this.ui.onWarpHome = () => this.warpHome();
    this.ui.onDeny = () => {
      this.audio.unlock();
      this.audio.playSfx('deny');
    };
    this.ui.onUi = () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
    };
    this.ui.setVolumes(this.save.bgm, this.save.se);
    this.ui.onVolumes = (bgm, se) => {
      this.audio.unlock();
      this.audio.setLevels(bgm / 100, se / 100);
      this.persist();
    };
    this.ui.muteBtn.textContent = this.audio.muted ? '音OFF' : '音ON';
    this.harvest = {
      canTake: (cost) => this.tank.cargo + cost <= tankCapacity(this.levels.tank),
      onHit: (entity, killed) => this.onHit(entity, killed),
      onReject: (entity, reason) => this.onReject(entity, reason),
    };

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.persist();
        this.audio.pause();
      } else {
        this.audio.resume();
      }
    });
    window.addEventListener('pagehide', () => this.audio.pause());
    window.addEventListener('pageshow', () => this.audio.resume());
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
      version: 3,
      money: this.money,
      levels: { ...this.levels },
      baseLevel: this.baseLevel,
      facilities: { ...this.facilities },
      outposts: this.outposts.serialize(),
      stats: { ...this.stats },
      mute: this.audio.muted,
      bgm: Math.round(this.audio.bgm * 100),
      se: Math.round(this.audio.se * 100),
      viewZoom: this.viewZoom,
    };
  }

  nudgeZoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = clamp(this.viewZoom * factor, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
    if (Math.abs(next - this.viewZoom) < 0.0004) return;
    this.viewZoom = next;
    clearTimeout(this._zoomSave);
    this._zoomSave = setTimeout(() => this.persist(), 280);
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
    this.audio.setZone(this.zone.id);
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
    const next = !this.audio.muted;
    this.audio.unlock();
    if (next) {
      this.audio.playSfx('ui');
      this.audio.setMuted(true);
    } else {
      this.audio.setMuted(false, true);
      this.audio.playSfx('ui');
    }
    this.ui.muteBtn.textContent = this.audio.muted ? '音OFF' : '音ON';
    this.persist();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.applyRig();
    const mobile = Math.min(w, h) < 820;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
    this.renderer.setSize(w, h, false);
  }

  applyRig() {
    const rig = cameraRig(this.camera.aspect || 1, this.zoom ?? 1);
    this.rig = rig;
    if (this.camera.fov !== rig.fov) {
      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
    }
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
      this.audio.playSfx(entity.prize ? 'bigHit' : 'cut');
      return;
    }
    if (this.time - this.comboTime < 0.7) this.combo += 1;
    else this.combo = 1;
    this.comboTime = this.time;
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    const bonus = Math.min(0.3, Math.max(0, this.combo - 1) * 0.03);
    const mult = entity.prize ? 1 : processMult(this.facilities.process, entity.type?.id);
    const gain = Math.round(entity.value * (1 + bonus) * mult);
    this.tank.cargo += entity.cargo;
    this.tank.value += gain;
    this.tank.pieces.push(entity.colorHex);
    if (this.tank.pieces.length > 36) this.tank.pieces.shift();
    this.stats.cut += 1;
    if (entity.prize) {
      for (let i = 0; i < 8; i++) this.tank.pieces.push(entity.colorHex);
      if (this.tank.pieces.length > 36) this.tank.pieces.splice(0, this.tank.pieces.length - 36);
      this.audio.playSfx('bigBreak');
      this.fx.chunks(entity.x, entity.y + 1.2, entity.z, entity.colorHex, 12);
      this.fx.coins(entity.x, entity.y + 1.4, entity.z);
      this.fx.bubbles(entity.x, entity.y + 0.6, entity.z, 16);
      this.shake = Math.max(this.shake, 0.62);
      this.ui.toast(`${entity.name} +${gain.toLocaleString('ja-JP')}`, 'good');
      buzz(30);
    } else {
      const big = entity.maxHp >= 40;
      if (big) this.audio.playSfx('shatter');
      else this.audio.playSfx('cut');
      this.audio.playSfx('pickup');
      this.fx.chunks(entity.x, entity.y + 0.7, entity.z, entity.colorHex, big ? 6 : 3);
      if (big) {
        this.shake = Math.max(this.shake, 0.3);
        buzz(14);
      }
    }
    const cap = tankCapacity(this.levels.tank);
    if (this.tank.cargo >= cap && !this.tank.warned) {
      this.tank.warned = true;
      this.ui.toast('タンクが満タン！基地に戻ろう', 'info');
      this.audio.playSfx('full');
    }
  }

  onReject(entity, reason) {
    if (reason === 'hard') {
      this.registerContact('clank');
      this.audio.playSfx('clank');
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

  insideSell(x, z) {
    if (Math.hypot(x, z) < SELL_RADIUS) return { kind: 'base', x: 0, z: 0 };
    const hit = this.outposts.contains(x, z);
    if (hit) return { kind: 'outpost', x: hit.x, z: hit.z, ref: hit };
    return null;
  }

  nearestSellPoint(x, z) {
    let best = { x: 0, z: 0, d: Math.hypot(x, z), name: '基地' };
    for (const entry of this.outposts.list) {
      const dist = Math.hypot(x - entry.x, z - entry.z);
      if (dist < best.d) best = { x: entry.x, z: entry.z, d: dist, name: '前線', ref: entry };
    }
    return best;
  }

  trySell() {
    const hit = this.insideSell(this.player.x, this.player.z);
    if (hit && !this.wasInside) this.onEnterSell(hit);
    this.wasInside = Boolean(hit);
  }

  onEnterSell(hit) {
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
    this.audio.playSfx('sell');
    this.fx.coins(this.player.x, 1.3, this.player.z);
    this.fx.bubbles(this.player.x, 0.6, this.player.z, 12);
    if (hit?.kind === 'outpost' && hit.ref) hit.ref.pulse = 0.45;
    else this.world.pulseSell();
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
    if (cost == null) return;
    if (this.money < cost) {
      this.audio.unlock();
      this.audio.playSfx('deny');
      return;
    }
    this.money -= cost;
    this.levels[id] += 1;
    let message = `${def.name}を強化した`;
    if (id === 'cutter') message = CUTTER_LEVELS[this.levels.cutter - 1].shout || message;
    if (id === 'depth') {
      const row = DEPTH_LEVELS[this.levels.depth - 1];
      message = this.levels.cutter >= row.cutter
        ? `${row.reach}まで進める`
        : `深度Lv${this.levels.depth}（${row.reach}はカッターLv${row.cutter}も）`;
    }
    if (id === 'tank') message = `タンク容量 ${tankCapacity(this.levels.tank)}`;
    if (id === 'propeller') message = '速度が上がった！';
    if (id === 'price') message = `売値が ×${priceMult(this.levels.price).toFixed(2)} になった`;
    this.ui.toast(message, 'good');
    this.ui.bumpMoney();
    this.audio.playSfx('buy');
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

  atMainBase() {
    return Math.hypot(this.player.x, this.player.z) <= UPGRADE_RADIUS;
  }

  upgradeBase() {
    if (!this.atMainBase()) return;
    const cost = baseUpgradeCost(this.baseLevel);
    if (cost == null) return;
    if (this.money < cost) {
      this.audio.unlock();
      this.audio.playSfx('deny');
      return;
    }
    this.money -= cost;
    this.baseLevel += 1;
    this.world.setBaseLevel(this.baseLevel);
    this.ui.toast(`拠点Lv${this.baseLevel}`, 'good');
    this.ui.bumpMoney();
    this.audio.playSfx('buy');
    this.fx.bubbles(0, 1, 0, 10);
    this.shake = Math.max(this.shake, 0.2);
    buzz(12);
    this.persist();
  }

  buyFacility(id) {
    if (!this.atMainBase()) return;
    const def = FACILITIES.find((entry) => entry.id === id);
    if (!def) return;
    if (this.baseLevel < def.need) {
      this.audio.playSfx('deny');
      return;
    }
    const level = this.facilities[id] || 0;
    if (level >= def.max) return;
    const cost = facilityCost(def, level);
    if (cost == null) return;
    if (this.money < cost) {
      this.audio.unlock();
      this.audio.playSfx('deny');
      return;
    }
    this.money -= cost;
    this.facilities[id] = level + 1;
    if (id === 'outpost') this.outposts.setSellRadius(outpostSellRadius(this.facilities.outpost));
    this.ui.toast(`${def.name} Lv${this.facilities[id]}`, 'good');
    this.ui.bumpMoney();
    this.audio.playSfx('buy');
    this.fx.bubbles(this.player.x, 1, this.player.z, 8);
    this.shake = Math.max(this.shake, 0.16);
    buzz(12);
    this.persist();
  }

  placeOutpost() {
    const cap = outpostCap(this.baseLevel, this.facilities.outpost);
    if (this.facilities.outpost < 1 || this.outposts.list.length >= cap) return;
    const x = this.player.x;
    const z = this.player.z;
    if (outpostBlocked(x, z, this.outposts.list, WORLD_LIMIT, this.world.colliders)) return;
    const cost = outpostBuildCost(this.outposts.list.length, this.facilities.outpost);
    if (this.money < cost) {
      this.audio.unlock();
      this.audio.playSfx('deny');
      return;
    }
    this.money -= cost;
    this.outposts.add(x, z);
    this.ui.toast('前線基地を建てた', 'good');
    this.ui.bumpMoney();
    this.audio.playSfx('buy');
    this.fx.bubbles(x, 1.2, z, 10);
    this.shake = Math.max(this.shake, 0.2);
    buzz(16);
    this.persist();
  }

  holdAtGate() {
    const gate = containPosition(this.player.x, this.player.z, this.levels.cutter, this.levels.depth);
    if (!gate.blocked) return;
    this.player.pin(gate.x, gate.z);
    if (gate.ring) shedRadial(this.player);
    if (gate.wreck) shedToward(this.player, WRECK.x, WRECK.z);
    if (this.time - this.gateHintAt > 3.4 && gate.message) {
      this.gateHintAt = this.time;
      this.ui.toast(gate.message, 'info');
      this.audio.playSfx('deny');
    }
  }

  movePlayer(x, z) {
    const gate = containPosition(x, z, this.levels.cutter, this.levels.depth);
    this.player.placeAt(gate.x, gate.z);
    this.wasInside = Boolean(this.insideSell(gate.x, gate.z));
    const zone = zoneForPlayer(gate.x, gate.z, this.levels.cutter, this.levels.depth);
    if (zone.id !== this.zone.id) {
      this.zone = zone;
      this.audio.setZone(zone.id);
    }
  }

  armWarp() {
    this.warpReadyAt = this.time + warpCooldown(this.facilities.warp);
  }

  warpTo(index) {
    if (!this.atMainBase()) return;
    if (this.facilities.warp < 1) return;
    if (this.time < this.warpReadyAt) {
      this.audio.playSfx('deny');
      return;
    }
    const entry = this.outposts.list[index];
    if (!entry) return;
    const spot = this.warpLanding(entry);
    if (!spot) {
      this.ui.toast(nextGateHint(this.levels.cutter, this.levels.depth), 'info');
      this.audio.playSfx('deny');
      return;
    }
    this.movePlayer(spot.x, spot.z);
    this.armWarp();
    this.ui.toast('前線基地へ', 'info');
    this.audio.playSfx('zone', { deeper: true });
  }

  warpLanding(outpost) {
    const outward = outpostArrival(outpost, this.outposts.radius);
    if (!containPosition(outward.x, outward.z, this.levels.cutter, this.levels.depth).blocked) return outward;
    const len = Math.hypot(outpost.x, outpost.z) || 1;
    const gap = this.outposts.radius + 8;
    const inward = {
      x: outpost.x - (outpost.x / len) * gap,
      z: outpost.z - (outpost.z / len) * gap,
    };
    if (!containPosition(inward.x, inward.z, this.levels.cutter, this.levels.depth).blocked) return inward;
    return null;
  }

  warpHome() {
    if (this.facilities.warp < 3) return;
    if (this.time < this.warpReadyAt) {
      this.audio.playSfx('deny');
      return;
    }
    const near = this.outposts.nearest(this.player.x, this.player.z);
    if (!near || near.d > 14) return;
    const dist = Math.hypot(this.player.x, this.player.z) || 1;
    this.movePlayer((this.player.x / dist) * 10, (this.player.z / dist) * 10);
    this.armWarp();
    this.ui.toast('基地へ戻った', 'info');
    this.audio.playSfx('zone', { deeper: false });
  }

  deliverDrone(value, x, z) {
    const payout = Math.max(1, Math.round(value * priceMult(this.levels.price)));
    this.money += payout;
    this.stats.earned += payout;
    this.ui.toast(`ドローン +${payout.toLocaleString('ja-JP')}`, 'good');
    this.ui.bumpMoney();
    this.audio.playSfx('sell');
    this.fx.coins(x, 1.6, z);
    this.persist();
  }

  sonarMarkers() {
    const level = this.facilities.sonar || 0;
    if (level < 1) return [];
    const marks = [];
    for (const target of this.targets.list) {
      if (target.state === 'gone') continue;
      marks.push({ x: target.x, z: target.z, kind: 'big' });
    }
    if (level >= 2) {
      const rares = [];
      for (const entity of this.resources.entities) {
        if (entity.state !== 'alive') continue;
        if (entity.type?.id !== 'pearl' && !entity.type?.rare) continue;
        rares.push({
          x: entity.x,
          z: entity.z,
          kind: 'rare',
          d: Math.hypot(entity.x - this.player.x, entity.z - this.player.z),
        });
      }
      rares.sort((a, b) => a.d - b.d);
      for (const rare of rares.slice(0, 6)) marks.push(rare);
    }
    if (level >= 3 && this.activities?.digs) {
      const digs = Array.isArray(this.activities.digs) ? this.activities.digs : [];
      for (const dig of digs) {
        if (!dig || dig.done || dig.state === 'done' || dig.state === 'gone') continue;
        if (!Number.isFinite(dig.x) || !Number.isFinite(dig.z)) continue;
        marks.push({ x: dig.x, z: dig.z, kind: 'dig' });
      }
    }
    return marks;
  }

  update(dt) {
    this.time += dt;
    this.zoom = damp(this.zoom, this.viewZoom, 12, dt);
    if (Math.abs(this.zoom - this.viewZoom) < 0.0005) this.zoom = this.viewZoom;
    this.applyRig();
    if (this.started) this.playTime += dt;
    const axis = this.started ? this.input.axis() : null;
    const move = this.started ? this.computeMove(axis) : this._move.set(0, 0, 0);
    const speed = propSpeed(this.levels.propeller);
    const cutter = cutterStats(this.levels.cutter);
    this.player.cutMode = this.frameCutMode;
    this.player.update(dt, move, speed, this.world.colliders, cutter.range);
    if (this.started) this.holdAtGate();

    if (this.started) {
      if (!this.movedOnce && this.player.speed > 1.2) this.movedOnce = true;
      const zone = zoneForPlayer(this.player.x, this.player.z, this.levels.cutter, this.levels.depth);
      const access = accessAt(this.levels.cutter, this.levels.depth);
      const far = Math.hypot(this.player.x, this.player.z) > WORLD.innerDeep + 0.35 && access.radius > WORLD.innerDeep;
      if (zone.id !== this.zone.id) {
        const prev = this.zone;
        const deeper = zone.rank > prev.rank;
        this.zone = zone;
        this.audio.setZone(zone.id);
        this.audio.playSfx('zone', { deeper });
        if (deeper) this.ui.toast(zone.enter, 'info');
        this.inFarDeep = zone.id === 'deep' && far;
      } else if (zone.id === 'deep' && far && !this.inFarDeep) {
        this.inFarDeep = true;
        this.ui.toast('深海の奥へ入った', 'info');
        this.audio.playSfx('zone', { deeper: true });
      } else if (!far) {
        this.inFarDeep = false;
      }
      this.trySell();
      this.frameCutMode = 'idle';
      applyFacilityFeatures(this.facilities);
      const cpos = this.player.getCutterXZ();
      this.resources.harvestAround(cpos.x, cpos.z, cutter.range, cutter.damage, cutter.power, this.harvest);
      this.targets.harvestAround(cpos.x, cpos.z, cutter.range, cutter.damage, cutter.power, this.harvest);
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
      this.drone.update(dt, {
        active: document.visibilityState !== 'hidden',
        stats: droneStats(this.facilities.drone),
        tank: this.tank,
        x: this.player.x,
        z: this.player.z,
        inside: Boolean(this.insideSell(this.player.x, this.player.z)),
        time: this.time,
        dest: this.nearestSellPoint(this.player.x, this.player.z),
        onDeliver: (value, x, z) => this.deliverDrone(value, x, z),
      });
    }

    this.outposts.update(dt, this.time);
    this.resources.update(dt, this.time, { x: this.player.x, z: this.player.z });
    this.targets.update(dt, this.time, {
      x: this.player.x,
      z: this.player.z,
      power: cutter.power,
    });
    const dist = Math.hypot(this.player.x, this.player.z);
    const sell = this.nearestSellPoint(this.player.x, this.player.z);
    const cap = tankCapacity(this.levels.tank);
    this.world.update(dt, this.time, {
      x: this.player.x,
      z: this.player.z,
      dist,
      sellX: sell.x,
      sellZ: sell.z,
      sellDist: sell.d,
      showArrow: this.started && cap > 0 && this.tank.cargo / cap >= 0.75,
      viewScale: this.rig?.distScale ?? 1,
      indicatorScale: this.rig?.indicatorScale ?? 1,
    });
    const shown = cap > 0 ? Math.round((this.tank.cargo / cap) * this.player.chunks.length) : 0;
    this.player.syncPile(this.tank.pieces, shown);
    const home = this.player.getCargoWorld();
    this.fx.update(dt, home);

    const depth = smoothstep(220, 380, dist);
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
        depthLevel: this.levels.depth,
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
        baseLevel: this.baseLevel,
        facilities: this.facilities,
        outposts: this.outposts.list,
        outpostCap: outpostCap(this.baseLevel, this.facilities.outpost),
        canBuild:
          this.facilities.outpost >= 1 &&
          this.outposts.list.length < outpostCap(this.baseLevel, this.facilities.outpost) &&
          !outpostBlocked(this.player.x, this.player.z, this.outposts.list, WORLD_LIMIT, this.world.colliders),
        buildCost: outpostBuildCost(this.outposts.list.length, this.facilities.outpost),
        buildBroke: this.money < outpostBuildCost(this.outposts.list.length, this.facilities.outpost),
        sellDist: sell.d,
        sellName: sell.name,
        showWarpHome: (this.facilities.warp || 0) >= 3 && (this.outposts.nearest(this.player.x, this.player.z)?.d ?? 99) <= 14,
        warpCd: Math.max(0, this.warpReadyAt - this.time),
        sonar: this.sonarMarkers(),
      });
    }

    this.audio.update();
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
    const rig = this.rig || cameraRig(this.camera.aspect || 1, this.zoom ?? 1);
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

function shedRadial(player) {
  const dist = Math.hypot(player.x, player.z) || 1;
  const rx = player.x / dist;
  const rz = player.z / dist;
  const radial = player.vx * rx + player.vz * rz;
  if (radial > 0) {
    player.vx -= radial * rx;
    player.vz -= radial * rz;
  }
}

function shedToward(player, x, z) {
  const dx = x - player.x;
  const dz = z - player.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ix = dx / dist;
  const iz = dz / dist;
  const inward = player.vx * ix + player.vz * iz;
  if (inward > 0) {
    player.vx -= inward * ix;
    player.vz -= inward * iz;
  }
}

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not available */
  }
}
