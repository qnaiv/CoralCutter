import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from './cameraRig.js';
import { SAVE_KEY } from './constants.js';

export function defaultSave() {
  return {
    version: 1,
    money: 0,
    levels: { cutter: 1, tank: 1, propeller: 1, price: 1 },
    stats: { cut: 0, earned: 0, bestCombo: 0 },
    mute: false,
    bgm: 100,
    se: 100,
    viewZoom: 1,
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return base;
    const money = Number(data.money);
    if (Number.isFinite(money) && money > 0) base.money = Math.min(money, 1e9);
    for (const key of Object.keys(base.levels)) {
      const n = Number(data.levels?.[key]);
      if (Number.isFinite(n) && n >= 1) base.levels[key] = Math.floor(n);
    }
    base.stats.cut = Math.max(0, Number(data.stats?.cut) || 0);
    base.stats.earned = Math.max(0, Number(data.stats?.earned) || 0);
    base.stats.bestCombo = Math.max(0, Number(data.stats?.bestCombo) || 0);
    base.mute = Boolean(data.mute);
    base.bgm = percent(data.bgm, 100);
    base.se = percent(data.se, 100);
    const zoom = Number(data.viewZoom);
    if (Number.isFinite(zoom)) {
      base.viewZoom = Math.max(VIEW_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, zoom));
    }
    return base;
  } catch {
    return base;
  }
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function percent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}
