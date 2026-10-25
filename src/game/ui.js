import { UPGRADES, buyLabel, canCutText, objectiveFor } from './constants.js';
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
    this.stick = document.getElementById('stick');
    this.nub = document.getElementById('stick-nub');
    this.titleStats = document.getElementById('title-stats');
    this.startBtn = document.getElementById('start');
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.cardKey = '';
    this.onStart = null;
    this.onReset = null;
    this.onToggleMute = null;
    this.onBuy = null;

    this.startBtn.addEventListener('click', () => this.onStart?.());
    document.getElementById('reset').addEventListener('click', () => this.onReset?.());
    this.muteBtn.addEventListener('click', () => this.onToggleMute?.());
    this.cards.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-buy]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.onBuy?.(btn.dataset.buy);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.hud.classList.contains('playing')) this.onStart?.();
    });
  }

  setTitleStats(save) {
    const played = save.money > 0 || save.stats.earned > 0 || save.stats.cut > 0;
    this.startBtn.textContent = played ? 'つづきから' : 'もぐる';
    if (!played) {
      this.titleStats.textContent = '';
      return;
    }
    this.titleStats.textContent = `所持金 ${formatNumber(save.money)}　累計売却 ${formatNumber(save.stats.earned)}　ベストコンボ ${save.stats.bestCombo}`;
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
    this.objectiveEl.textContent = objectiveFor(state.cutterLevel);
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
    if (ratio >= 0.45 && state.dist > 12) {
      this.navEl.hidden = false;
      this.navEl.textContent = `基地まで ${Math.round(state.dist)}m`;
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

    if (state.combo >= 2 && state.comboAge < 0.9) {
      const fade = state.comboAge < 0.5 ? 1 : Math.max(0, 1 - (state.comboAge - 0.5) / 0.4);
      this.comboEl.hidden = false;
      this.comboEl.textContent = `x${state.combo} コンボ`;
      this.comboEl.style.opacity = String(fade);
      this.comboEl.style.fontSize = `${Math.min(64, 32 + state.combo * 2)}px`;
    } else {
      this.comboEl.hidden = true;
    }

    const key = `${state.rawMoney}|${state.cutterLevel}|${state.tankLevel}|${state.propLevel}|${state.priceLevel}|${state.nearPad}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.renderCards(state);
    }
    this.drawMap(state);
    this.updateStick(state.pointer);
  }

  renderCards(state) {
    const levels = {
      cutter: state.cutterLevel,
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
      const card = document.createElement('article');
      card.className = 'card';
      if (state.nearPad === def.id) card.classList.add('near');
      if (recommend === def.id) card.classList.add('recommend');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.buy = def.id;
      button.disabled = !afford;
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
    const view = 120;
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
    const rings = [
      { r: 48, color: 'rgba(190, 235, 150, 0.35)' },
      { r: 102, color: 'rgba(255, 170, 185, 0.4)' },
      { r: 156, color: 'rgba(150, 210, 255, 0.35)' },
    ];
    for (const ring of rings) {
      c.beginPath();
      c.arc(toX(0), toY(0), ring.r * scale, 0, Math.PI * 2);
      c.strokeStyle = ring.color;
      c.lineWidth = 2;
      c.stroke();
    }
    c.beginPath();
    c.arc(toX(state.wreckX), toY(state.wreckZ), 26 * scale, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255, 214, 140, 0.8)';
    c.stroke();
    const bx = toX(0);
    const by = toY(0);
    const bdx = bx - cx;
    const bdy = by - cy;
    const bd = Math.hypot(bdx, bdy);
    c.fillStyle = '#ffe56a';
    if (bd > radius - 10) {
      const k = (radius - 12) / bd;
      drawDiamond(c, cx + bdx * k, cy + bdy * k, 5);
    } else {
      c.beginPath();
      c.arc(bx, by, 5, 0, Math.PI * 2);
      c.fill();
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
