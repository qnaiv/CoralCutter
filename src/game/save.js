import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from './cameraRig.js';
import { SAVE_KEY, WORLD_LIMIT } from './constants.js';
import { BASE_MAX, FACILITY_IDS, OUTPOST_RULES, emptyFacilities } from './economy.js';

export function defaultSave() {
  return {
    version: 2,
    money: 0,
    levels: { cutter: 1, tank: 1, propeller: 1, price: 1 },
    baseLevel: 1,
    facilities: emptyFacilities(),
    outposts: [],
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
    if (!data || (data.version !== 1 && data.version !== 2)) return base;
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
    const baseLevel = Number(data.baseLevel);
    if (Number.isFinite(baseLevel)) {
      base.baseLevel = Math.max(1, Math.min(BASE_MAX, Math.floor(baseLevel)));
    }
    base.facilities = readFacilities(data.facilities);
    base.outposts = readOutposts(data.outposts);
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

function readFacilities(raw) {
  const facilities = emptyFacilities();
  if (!raw || typeof raw !== 'object') return facilities;
  for (const id of FACILITY_IDS) {
    const n = Number(raw[id]);
    if (Number.isFinite(n) && n > 0) facilities[id] = Math.max(0, Math.min(3, Math.floor(n)));
  }
  return facilities;
}

function readOutposts(raw) {
  if (!Array.isArray(raw)) return [];
  const kept = [];
  for (const item of raw) {
    const x = Number(item?.x);
    const z = Number(item?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const dist = Math.hypot(x, z);
    if (dist < OUTPOST_RULES.minBase || dist > WORLD_LIMIT - 4) continue;
    let close = false;
    for (const spot of kept) {
      if (Math.hypot(x - spot.x, z - spot.z) < OUTPOST_RULES.minGap) {
        close = true;
        break;
      }
    }
    if (close) continue;
    kept.push({ x, z });
    if (kept.length >= OUTPOST_RULES.maxCount) break;
  }
  return kept;
}

function percent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}
