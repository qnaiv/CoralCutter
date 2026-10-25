import {
  LANDMARKS,
  MAP_VIEW,
  UPGRADES,
  WORLD_LIMIT,
  WRECK,
  ZONE_RINGS,
  buyLabel,
  canCutText,
  objectiveFor,
} from './constants.js';
import { FACILITIES, baseNextText, baseUpgradeCost, facilityCost, facilityNext, facilityStat } from './economy.js';
import { formatNum as formatNumber } from './math.js';

export class UI {
  constructor() {
    this.title = document.getElementById('title');
    this.hud = document.getElementById('hud');
    this.moneyEl = document.getElementById('money-value');
    this.objectiveEl = document.getElementById('objective');
    this.canCutEl = document.getElementById('can-cut');
    this.zoneEl = document.getElementById('zone-pill');
    this.tankText = document.getElementById('tank-text');
    this.tankFill = document.getElementById('tank-fill');
    this.payoutEl = document.getElementById('payout');
    this.navEl = document.getElementById('nav-hint');
    this.toastEl = document.getElementById('toast');
    this.statusHint = document.getElementById('status-hint');
    this.comboEl = document.getElementById('combo');
    this.upgrade = document.getElementById('upgrade');
    this.cards = document.getElementById('upgrade-cards');
    this.fullBanner = document.getElementById('full-banner');
    this.moveHint = document.getElementById('move-hint');
    this.muteBtn = document.getElementById('mute');
    this.settingsBtn = document.getElementById('audio-settings');
    this.popover = document.getElementById('audio-popover');
    this.bgmSlider = document.getElementById('bgm-volume');
    this.seSlider = document.getElementById('se-volume');
    this.bgmValue = document.getElementById('bgm-volume-value');
    this.seValue = document.getElementById('se-volume-value');
    this.stick = document.getElementById('stick');
    this.nub = document.getElementById('stick-nub');
    this.titleStats = document.getElementById('title-stats');
    this.startBtn = document.getElementById('start');
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.buildBtn = document.getElementById('build-outpost');
    this.warpBtn = document.getElementById('warp-home');
    this.tabButtons = [...document.querySelectorAll('.sheet-tabs [data-tab]')];
    this.tab = 'gear';
    this.cardKey = '';
    this.onStart = null;
    this.onReset = null;
    this.onToggleMute = null;
    this.onBuy = null;
    this.onFacility = null;
    this.onBase = null;
    this.onWarp = null;
    this.onBuild = null;
    this.onWarpHome = null;
    this.onDeny = null;
    this.onUi = null;
    this.onVolumes = null;

    this.startBtn.addEventListener('click', () => {
      this.onUi?.();
      this.onStart?.();
    });
    document.getElementById('reset').addEventListener('click', () => {
      this.onUi?.();
      this.onReset?.();
    });
    this.muteBtn.addEventListener('click', () => this.onToggleMute?.());
    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this.popover.hidden;
      this.popover.hidden = !open;
      this.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    this.popover.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.bgmSlider.addEventListener('input', () => this.emitVolumes());
    this.seSlider.addEventListener('input', () => this.emitVolumes());
    this.seSlider.addEventListener('change', () => this.onUi?.());
    document.addEventListener('pointerdown', (e) => {
      if (this.popover.hidden) return;
      if (this.settingsBtn.contains(e.target) || this.popover.contains(e.target)) return;
      this.popover.hidden = true;
      this.settingsBtn.setAttribute('aria-expanded', 'false');
    });
    for (const btn of this.tabButtons) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.tab === btn.dataset.tab) return;
        this.tab = btn.dataset.tab;
        this.cardKey = '';
        this.onUi?.();
      });
    }
    this.cards.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-buy], [data-facility], [data-base], [data-warp]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.broke === '1') {
        this.onDeny?.();
        return;
      }
      if (btn.dataset.buy) this.onBuy?.(btn.dataset.buy);
      else if (btn.dataset.facility) this.onFacility?.(btn.dataset.facility);
      else if (btn.dataset.base) this.onBase?.();
      else if (btn.dataset.warp != null) this.onWarp?.(Number(btn.dataset.warp));
    });
    const pressWorld = (btn, fire) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.broke === '1') {
          this.onDeny?.();
          return;
        }
        fire();
      });
    };
    pressWorld(this.buildBtn, () => this.onBuild?.());
    pressWorld(this.warpBtn, () => this.onWarpHome?.());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.hud.classList.contains('playing')) {
        this.onUi?.();
        this.onStart?.();
      }
    });
  }

  setVolumes(bgm, se) {
    this.bgmSlider.value = String(bgm);
    this.seSlider.value = String(se);
    this.bgmValue.textContent = String(bgm);
    this.seValue.textContent = String(se);
  }

  emitVolumes() {
    const bgm = Number(this.bgmSlider.value);
    const se = Number(this.seSlider.value);
    this.bgmValue.textContent = String(bgm);
    this.seValue.textContent = String(se);
    this.onVolumes?.(bgm, se);
  }

  setTitleStats(save) {
    const played = save.money > 0 || save.stats.earned > 0 || save.stats.cut > 0;
    this.startBtn.textContent = played ? 'つづきから' : 'もぐる';
    if (!played) {
      this.titleStats.textContent = '';
      return;
    }
    const baseBit = save.baseLevel > 1 ? `　拠点Lv${save.baseLevel}` : '';
    this.titleStats.textContent = `所持金 ${formatNumber(save.money)}　累計売却 ${formatNumber(save.stats.earned)}　ベストコンボ ${save.stats.bestCombo}${baseBit}`;
  }

  showPlaying() {
    this.title.hidden = true;
    this.hud.hidden = false;
    this.hud.classList.add('playing');
  }

  bumpMoney() {
    this.moneyEl.classList.remove('pop');
    void this.moneyEl.offsetWidth;
    this.moneyEl.classList.add('pop');
  }

  toast(text, kind = 'info') {
    const item = document.createElement('div');
    item.className = `toast-item ${kind}`;
    item.textContent = text;
    this.toastEl.appendChild(item);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => item.remove(), 2400);
  }

  sync(state) {
    this.moneyEl.textContent = formatNumber(state.money);
    this.objectiveEl.textContent = objectiveFor(state.cutterLevel, state.depthLevel);
    this.canCutEl.textContent = canCutText(state.cutterLevel);
    this.zoneEl.textContent = state.zone;
    const ratio = state.tankCap > 0 ? state.tankCargo / state.tankCap : 0;
    this.tankText.textContent = `${state.tankCargo} / ${state.tankCap}`;
    this.tankFill.style.width = `${Math.min(100, ratio * 100)}%`;
    this.tankFill.dataset.level = ratio > 0.92 ? 'hot' : ratio > 0.7 ? 'warm' : 'ok';
    if (state.tankCargo > 0) {
      this.payoutEl.hidden = false;
      this.payoutEl.textContent = `売却予定 ${formatNumber(state.payout)}`;
    } else {
      this.payoutEl.hidden = true;
    }
    const sellDist = state.sellDist ?? state.dist;
    if (ratio >= 0.45 && sellDist > 12) {
      this.navEl.hidden = false;
      this.navEl.textContent = `${state.sellName || '基地'}まで ${Math.round(sellDist)}m`;
    } else {
      this.navEl.hidden = true;
    }
    this.fullBanner.hidden = !(ratio >= 1);
    if (state.hint) {
      this.statusHint.hidden = false;
      if (this.statusHint.textContent !== state.hint) this.statusHint.textContent = state.hint;
    } else {
      this.statusHint.hidden = true;
    }
    this.moveHint.hidden = !state.showMoveHint;
    this.muteBtn.textContent = state.muted ? '音OFF' : '音ON';
    this.hud.classList.toggle('at-base', state.atBase);
    this.upgrade.hidden = !state.atBase;
    const showBuild = Boolean(state.canBuild && !state.atBase);
    this.buildBtn.hidden = !showBuild;
    this.hud.classList.toggle('has-build', showBuild);
    if (showBuild) {
      this.buildBtn.textContent = `建てる ${formatNumber(state.buildCost)}`;
      const broke = Boolean(state.buildBroke);
      this.buildBtn.classList.toggle('is-broke', broke);
      this.buildBtn.dataset.broke = broke ? '1' : '';
    }
    const showWarp = Boolean(state.showWarpHome && !state.atBase);
    this.warpBtn.hidden = !showWarp;
    if (showWarp) {
      const waiting = state.warpCd > 0;
      this.warpBtn.textContent = waiting ? 'ワープ待機' : '基地へワープ';
      this.warpBtn.classList.toggle('is-broke', waiting);
      this.warpBtn.dataset.broke = waiting ? '1' : '';
    }
    for (const btn of this.tabButtons) {
      const on = btn.dataset.tab === this.tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }

    if (state.combo >= 2 && state.comboAge < 0.9) {
      const fade = state.comboAge < 0.5 ? 1 : Math.max(0, 1 - (state.comboAge - 0.5) / 0.4);
      this.comboEl.hidden = false;
      this.comboEl.textContent = `x${state.combo} コンボ`;
      this.comboEl.style.opacity = String(fade);
      this.comboEl.style.fontSize = `${Math.min(64, 32 + state.combo * 2)}px`;
    } else {
      this.comboEl.hidden = true;
    }

    const fac = state.facilities || {};
    const key = [
      this.tab,
      state.rawMoney,
      state.cutterLevel,
      state.depthLevel,
      state.tankLevel,
      state.propLevel,
      state.priceLevel,
      state.nearPad,
      state.baseLevel,
      fac.outpost,
      fac.vacuum,
      fac.drone,
      fac.process,
      fac.sonar,
      fac.warp,
      state.outposts?.length ?? 0,
      state.outpostCap,
      state.warpCd > 0 ? Math.ceil(state.warpCd) : 0,
    ].join('|');
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.renderCards(state);
    }
    this.drawMap(state);
    this.updateStick(state.pointer);
  }

  renderCards(state) {
    if (this.tab === 'facility') {
      this.renderFacilities(state);
      return;
    }
    if (this.tab === 'base') {
      this.renderBase(state);
      return;
    }
    this.renderGear(state);
  }

  renderGear(state) {
    const levels = {
      cutter: state.cutterLevel,
      depth: state.depthLevel,
      tank: state.tankLevel,
      propeller: state.propLevel,
      price: state.priceLevel,
    };
    let recommend = null;
    for (const def of UPGRADES) {
      const level = levels[def.id];
      const cost = def.cost(level);
      if (level < def.max && cost != null && state.rawMoney >= cost) {
        recommend = def.id;
        break;
      }
    }
    this.cards.replaceChildren();
    for (const def of UPGRADES) {
      const level = levels[def.id];
      const maxed = level >= def.max;
      const cost = def.cost(level);
      const afford = !maxed && cost != null && state.rawMoney >= cost;
      const broke = !maxed && !afford;
      const card = document.createElement('article');
      card.className = 'card';
      if (state.nearPad === def.id) card.classList.add('near');
      if (recommend === def.id) card.classList.add('recommend');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.buy = def.id;
      button.disabled = maxed;
      button.classList.toggle('is-broke', broke);
      button.dataset.broke = broke ? '1' : '';
      if (broke) button.setAttribute('aria-disabled', 'true');
      button.textContent = buyLabel(cost, state.rawMoney, maxed);
      button.style.background = afford ? def.color : '#3c5563';
      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = def.name;
      name.style.color = def.color;
      const lv = document.createElement('div');
      lv.className = 'card-lv';
      lv.textContent = `Lv.${level}`;
      const top = document.createElement('div');
      top.className = 'card-top';
      top.append(name, lv);
      const stat = document.createElement('div');
      stat.className = 'card-stat';
      stat.textContent = def.stat(level);
      const next = document.createElement('div');
      next.className = 'card-next';
      next.textContent = def.next(level);
      card.append(top, stat, next);
      if (recommend === def.id) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = 'おすすめ';
        card.append(badge);
      }
      card.append(button);
      this.cards.append(card);
    }
  }

  renderFacilities(state) {
    const owned = state.facilities || {};
    let recommend = null;
    for (const def of FACILITIES) {
      const level = owned[def.id] || 0;
      const cost = facilityCost(def, level);
      if (state.baseLevel >= def.need && level < def.max && cost != null && state.rawMoney >= cost) {
        recommend = def.id;
        break;
      }
    }
    this.cards.replaceChildren();
    for (const def of FACILITIES) {
      const level = owned[def.id] || 0;
      const locked = state.baseLevel < def.need;
      const maxed = level >= def.max;
      const cost = facilityCost(def, level);
      const afford = !locked && !maxed && cost != null && state.rawMoney >= cost;
      const broke = !locked && !maxed && !afford;
      const card = document.createElement('article');
      card.className = 'card';
      if (locked) card.classList.add('is-locked');
      if (recommend === def.id) card.classList.add('recommend');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.facility = def.id;
      button.disabled = locked || maxed;
      button.classList.toggle('is-broke', broke);
      button.dataset.broke = broke ? '1' : '';
      if (locked) button.textContent = `拠点Lv${def.need}`;
      else if (maxed) button.textContent = '最大';
      else if (broke) button.textContent = `${formatNumber(cost)} 不足`;
      else button.textContent = `${level === 0 ? '建設' : '強化'} ${formatNumber(cost)}`;
      button.style.background = afford ? def.color : '#3c5563';
      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = def.name;
      name.style.color = def.color;
      const lv = document.createElement('div');
      lv.className = 'card-lv';
      lv.textContent = `Lv.${level}`;
      const top = document.createElement('div');
      top.className = 'card-top';
      top.append(name, lv);
      const stat = document.createElement('div');
      stat.className = 'card-stat';
      stat.textContent = locked ? def.blurb : facilityStat(def.id, level);
      const next = document.createElement('div');
      next.className = 'card-next';
      next.textContent = locked ? `拠点Lv${def.need}で解放` : facilityNext(def.id, level, def.max);
      card.append(top, stat, next);
      if (recommend === def.id) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = 'おすすめ';
        card.append(badge);
      }
      card.append(button);
      this.cards.append(card);
    }
  }

  renderBase(state) {
    this.cards.replaceChildren();
    const level = state.baseLevel || 1;
    const cost = baseUpgradeCost(level);
    const maxed = cost == null;
    const afford = !maxed && state.rawMoney >= cost;
    const broke = !maxed && !afford;
    const card = document.createElement('article');
    card.className = 'card';
    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = '拠点';
    name.style.color = '#ffe56a';
    const lv = document.createElement('div');
    lv.className = 'card-lv';
    lv.textContent = `Lv.${level}`;
    const top = document.createElement('div');
    top.className = 'card-top';
    top.append(name, lv);
    const stat = document.createElement('div');
    stat.className = 'card-stat';
    const cap = state.outpostCap || 0;
    const owned = state.outposts?.length ?? 0;
    stat.textContent = cap > 0 ? `納品 ${owned}/${cap}` : '納品 未解放';
    const next = document.createElement('div');
    next.className = 'card-next';
    next.textContent = baseNextText(level);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.base = '1';
    button.disabled = maxed;
    button.classList.toggle('is-broke', broke);
    button.dataset.broke = broke ? '1' : '';
    button.textContent = maxed ? '最大' : broke ? `${formatNumber(cost)} 不足` : `昇格 ${formatNumber(cost)}`;
    button.style.background = afford ? '#ffe56a' : '#3c5563';
    card.append(top, stat, next, button);
    this.cards.append(card);

    const warpLevel = state.facilities?.warp || 0;
    if (warpLevel < 1 || !state.outposts?.length) {
      const note = document.createElement('article');
      note.className = 'card';
      const line = document.createElement('div');
      line.className = 'card-stat';
      line.textContent = warpLevel < 1 ? 'ワープは拠点Lv4' : '前線を建てるとワープできる';
      note.append(line);
      this.cards.append(note);
      return;
    }
    state.outposts.forEach((spot, index) => {
      const warpCard = document.createElement('article');
      warpCard.className = 'card';
      const title = document.createElement('div');
      title.className = 'card-name';
      title.textContent = `前線${index + 1}`;
      const meta = document.createElement('div');
      meta.className = 'card-stat';
      meta.textContent = `${Math.round(spot.x)}, ${Math.round(spot.z)}`;
      const warpBtn = document.createElement('button');
      warpBtn.type = 'button';
      warpBtn.dataset.warp = String(index);
      const waiting = state.warpCd > 0;
      warpBtn.disabled = waiting;
      warpBtn.textContent = waiting ? `待機 ${Math.ceil(state.warpCd)}` : 'ワープ';
      warpBtn.style.background = waiting ? '#3c5563' : '#ffe56a';
      warpCard.append(title, meta, warpBtn);
      this.cards.append(warpCard);
    });
  }

  updateStick(pointer) {
    if (!pointer?.active) {
      this.stick.hidden = true;
      return;
    }
    this.stick.hidden = false;
    this.stick.style.left = `${pointer.ox}px`;
    this.stick.style.top = `${pointer.oy}px`;
    const dx = Math.max(-78, Math.min(78, pointer.x - pointer.ox));
    const dy = Math.max(-78, Math.min(78, pointer.y - pointer.oy));
    this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  drawMap(state) {
    const c = this.mapCtx;
    const canvas = this.mapCanvas;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2 - 3;
    const view = MAP_VIEW;
    const scale = radius / view;
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#083848';
    c.fillRect(0, 0, w, h);
    const px = state.x;
    const pz = state.z;
    const toX = (x) => cx + (x - px) * scale;
    const toY = (z) => cy + (z - pz) * scale;
    const ringColors = ['rgba(190, 235, 150, 0.55)', 'rgba(255, 170, 185, 0.55)', 'rgba(150, 210, 255, 0.5)', 'rgba(90, 170, 210, 0.45)'];
    c.beginPath();
    c.arc(toX(0), toY(0), WORLD_LIMIT * scale, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(180, 220, 235, 0.28)';
    c.lineWidth = 2;
    c.stroke();
    ZONE_RINGS.forEach((ring, index) => {
      c.beginPath();
      c.arc(toX(0), toY(0), ring.radius * scale, 0, Math.PI * 2);
      c.strokeStyle = ringColors[index] || 'rgba(255,255,255,0.35)';
      c.lineWidth = 2;
      c.stroke();
    });
    c.beginPath();
    c.arc(toX(state.wreckX), toY(state.wreckZ), WRECK.radius * scale, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255, 214, 140, 0.8)';
    c.stroke();
    c.fillStyle = 'rgba(190, 245, 255, 0.9)';
    for (const mark of LANDMARKS) {
      c.fillRect(toX(mark.x) - 1.5, toY(mark.z) - 1.5, 3, 3);
    }
    const plot = (x, z) => {
      const tx = toX(x);
      const ty = toY(z);
      const dx = tx - cx;
      const dy = ty - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius - 10) {
        const k = (radius - 12) / Math.max(dist, 0.001);
        return [cx + dx * k, cy + dy * k];
      }
      return [tx, ty];
    };
    for (const mark of state.sonar || []) {
      const [mx, my] = plot(mark.x, mark.z);
      if (mark.kind === 'rare') {
        c.fillStyle = '#fff6ea';
        c.beginPath();
        c.arc(mx, my, 2.5, 0, Math.PI * 2);
        c.fill();
      } else if (mark.kind === 'dig') {
        c.fillStyle = '#d7b0ff';
        c.fillRect(mx - 2.5, my - 2.5, 5, 5);
      } else {
        c.fillStyle = '#ffb020';
        c.fillRect(mx - 3, my - 3, 6, 6);
      }
    }
    const [bx, by] = plot(0, 0);
    c.fillStyle = '#ffe56a';
    drawDiamond(c, bx, by, 5);
    c.fillStyle = '#3ec8ff';
    for (const spot of state.outposts || []) {
      const [ox, oy] = plot(spot.x, spot.z);
      drawDiamond(c, ox, oy, 4);
    }
    c.restore();
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 3;
    c.stroke();
    drawPlayer(c, cx, cy, state.angle);
  }
}

function drawDiamond(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fill();
}

function drawPlayer(c, cx, cy, angle) {
  const dirX = Math.sin(angle);
  const dirY = Math.cos(angle);
  const perpX = Math.cos(angle);
  const perpY = -Math.sin(angle);
  const tipX = cx + dirX * 8;
  const tipY = cy + dirY * 8;
  const lx = cx - dirX * 6 + perpX * 5.5;
  const ly = cy - dirY * 6 + perpY * 5.5;
  const rx = cx - dirX * 6 - perpX * 5.5;
  const ry = cy - dirY * 6 - perpY * 5.5;
  c.beginPath();
  c.moveTo(tipX, tipY);
  c.lineTo(lx, ly);
  c.lineTo(rx, ry);
  c.closePath();
  c.fillStyle = '#ffffff';
  c.fill();
  c.strokeStyle = '#143040';
  c.lineWidth = 2;
  c.stroke();
}
