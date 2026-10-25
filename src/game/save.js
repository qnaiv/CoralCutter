import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from './cameraRig.js';
import {
  CUTTER_LEVELS,
  PRICE_LEVELS,
  PROP_LEVELS,
  SAVE_KEY,
  TANK_LEVELS,
  WORLD_LIMIT,
} from './constants.js';
import { BASE_MAX, DEPTH_LEVELS, FACILITY_IDS, OUTPOST_RULES, emptyFacilities } from './economy.js';

/** v1/v2 cutter rows, kept so a numeric level still means the same power. */
const LEGACY_CUTTER = [
  { power: 1, damage: 14 },
  { power: 2, damage: 26 },
  { power: 2, damage: 74 },
  { power: 3, damage: 96 },
  { power: 3, damage: 240 },
  { power: 4, damage: 260 },
  { power: 4, damage: 430 },
  { power: 5, damage: 520 },
];
const LEGACY_TANK = [16, 26, 40, 58, 82, 112];
const LEGACY_PROP = [13, 16, 19, 22.5, 26];
const LEGACY_PRICE = [1, 1.35, 1.8, 2.35, 3];

export function defaultSave() {
  return {
    version: 3,
    money: 0,
    levels: { cutter: 1, tank: 1, propeller: 1, price: 1, depth: 1, decoy: 1 },
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
    if (!data || (data.version !== 1 && data.version !== 2 && data.version !== 3)) return base;
    const money = Number(data.money);
    if (Number.isFinite(money) && money > 0) base.money = Math.min(money, 1e9);
    for (const key of Object.keys(base.levels)) {
      const n = Number(data.levels?.[key]);
      if (Number.isFinite(n) && n >= 1) base.levels[key] = Math.floor(n);
    }
    if (data.version === 1 || data.version === 2) applyLegacyLevels(base.levels);
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

function applyLegacyLevels(levels) {
  const cutterRow = LEGACY_CUTTER[Math.max(0, Math.min(LEGACY_CUTTER.length, levels.cutter) - 1)];
  let cutter = 1;
  for (let i = 0; i < CUTTER_LEVELS.length; i++) {
    const row = CUTTER_LEVELS[i];
    if (row.power < cutterRow.power) continue;
    cutter = i + 1;
    if (row.damage >= cutterRow.damage) break;
  }
  levels.cutter = cutter;
  levels.depth = Math.max(1, Math.min(DEPTH_LEVELS.length, cutterRow.power));
  levels.tank = firstAtLeast(TANK_LEVELS, LEGACY_TANK[indexOf(levels.tank, LEGACY_TANK)], (row) => row.capacity);
  levels.propeller = firstAtLeast(PROP_LEVELS, LEGACY_PROP[indexOf(levels.propeller, LEGACY_PROP)], (row) => row.speed);
  levels.price = firstAtLeast(PRICE_LEVELS, LEGACY_PRICE[indexOf(levels.price, LEGACY_PRICE)], (row) => row.mult);
}

function indexOf(level, table) {
  return Math.max(0, Math.min(table.length, level) - 1);
}

function firstAtLeast(table, value, pick) {
  for (let i = 0; i < table.length; i++) {
    if (pick(table[i]) + 1e-6 >= value) return i + 1;
  }
  return table.length;
}

function percent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}
