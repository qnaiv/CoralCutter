import { formatNum } from './math.js';

export const SAVE_KEY = 'coral-cutter-save-v1';

export const SELL_RADIUS = 6;
export const BASE_RADIUS = 13.2;
export const UPGRADE_RADIUS = 12.4;
export const WORLD_LIMIT = 232;
export const PAD_DIST = 8.8;

export const WRECK = { x: 126, z: -82, radius: 26 };

export const BEACON = { angle: Math.PI, dist: 11.15 };

export const ZONES = {
  base: { id: 'base', name: '基地', rank: 0, enter: '基地に戻った' },
  shallow: { id: 'shallow', name: '浅瀬', rank: 1, enter: '浅瀬' },
  kelp: { id: 'kelp', name: '昆布の森', rank: 2, enter: '昆布の森へ入った' },
  coral: { id: 'coral', name: 'サンゴ礁', rank: 3, enter: 'サンゴ礁へ入った' },
  deep: { id: 'deep', name: '深海', rank: 4, enter: '深海へ入った' },
  wreck: { id: 'wreck', name: '沈没船', rank: 5, enter: '沈没船を見つけた' },
};

export const ZONE_RINGS = [
  { radius: 48, color: 0xb6f0a0 },
  { radius: 102, color: 0xff9eb8 },
  { radius: 156, color: 0x8fd4ff },
];

/** Cutter level required to damage a given hardness. */
export const POWER_NEED = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 8 };

export const CUTTER_LEVELS = [
  { damage: 14, range: 2.95, power: 1 },
  { damage: 26, range: 3.25, power: 2, shout: '昆布を切断できるようになった！' },
  { damage: 74, range: 3.55, power: 2, shout: '巨大昆布を一気にまとめて切れる！' },
  { damage: 96, range: 3.95, power: 3, shout: 'サンゴを切断できるようになった！' },
  { damage: 240, range: 4.35, power: 3, shout: '大サンゴを粉砕できる！' },
  { damage: 260, range: 4.8, power: 4, shout: '沈没船の貝殻を切断できるようになった！' },
  { damage: 430, range: 5.15, power: 4, shout: '真珠を割り切れる！' },
  { damage: 520, range: 5.6, power: 5, shout: '深海サンゴを切断できるようになった！' },
];

export const CUTTER_COSTS = [50, 140, 300, 640, 1300, 2400, 4200];

export const TANK_LEVELS = [
  { capacity: 16 },
  { capacity: 26 },
  { capacity: 40 },
  { capacity: 58 },
  { capacity: 82 },
  { capacity: 112 },
];
export const TANK_COSTS = [40, 120, 280, 560, 1100];

export const PROP_LEVELS = [
  { speed: 13 },
  { speed: 16 },
  { speed: 19 },
  { speed: 22.5 },
  { speed: 26 },
];
export const PROP_COSTS = [45, 130, 300, 640];

export const PRICE_LEVELS = [
  { mult: 1 },
  { mult: 1.35 },
  { mult: 1.8 },
  { mult: 2.35 },
  { mult: 3 },
];
export const PRICE_COSTS = [80, 200, 460, 980];

export const PADS = [
  { id: 'cutter', label: 'カッター', angle: 0.62, color: '#ff5a3c' },
  { id: 'tank', label: 'タンク', angle: 2.2, color: '#2ed39a' },
  { id: 'propeller', label: 'プロペラ', angle: 3.95, color: '#3aa0ff' },
  { id: 'price', label: '売値', angle: 5.4, color: '#ffc83d' },
];

export const UPGRADES = [
  {
    id: 'cutter',
    name: 'カッター',
    blurb: '威力・射程・切れる硬さ',
    color: '#ff5a3c',
    max: CUTTER_LEVELS.length,
    cost: (level) => CUTTER_COSTS[level - 1] ?? null,
    stat: (level) => {
      const s = CUTTER_LEVELS[level - 1];
      return `威力 ${s.damage}　射程 ${s.range.toFixed(1)}`;
    },
    next: (level) => {
      const n = CUTTER_LEVELS[level];
      if (!n) return '最大まで強化済み';
      if (n.shout) return `次: ${n.shout.replace('！', '')}`;
      return `次: 威力 ${n.damage}`;
    },
  },
  {
    id: 'tank',
    name: 'タンク',
    blurb: '一度に積める量',
    color: '#2ed39a',
    max: TANK_LEVELS.length,
    cost: (level) => TANK_COSTS[level - 1] ?? null,
    stat: (level) => `容量 ${TANK_LEVELS[level - 1].capacity}`,
    next: (level) => {
      const n = TANK_LEVELS[level];
      return n ? `次: 容量 ${n.capacity}` : '最大まで強化済み';
    },
  },
  {
    id: 'propeller',
    name: 'プロペラ',
    blurb: '移動速度',
    color: '#3aa0ff',
    max: PROP_LEVELS.length,
    cost: (level) => PROP_COSTS[level - 1] ?? null,
    stat: (level) => `速度 ${PROP_LEVELS[level - 1].speed.toFixed(0)}`,
    next: (level) => {
      const n = PROP_LEVELS[level];
      return n ? `次: 速度 ${n.speed.toFixed(0)}` : '最大まで強化済み';
    },
  },
  {
    id: 'price',
    name: '売却価格',
    blurb: '売値の倍率',
    color: '#ffc83d',
    max: PRICE_LEVELS.length,
    cost: (level) => PRICE_COSTS[level - 1] ?? null,
    stat: (level) => `×${PRICE_LEVELS[level - 1].mult.toFixed(2)}`,
    next: (level) => {
      const n = PRICE_LEVELS[level];
      return n ? `次: ×${n.mult.toFixed(2)}` : '最大まで強化済み';
    },
  },
];

export const RESOURCE_TYPES = [
  {
    id: 'giantKelp',
    name: '巨大昆布',
    hp: 70,
    hardness: 2,
    value: 48,
    cargo: 3,
    radius: 1.7,
    count: 22,
    rMin: 64,
    rMax: 100,
    minDist: 4.2,
    region: 'annulus',
    colors: ['#147a3a', '#0d5c32', '#1e8f4e'],
    respawn: 14,
    swayAmp: 0.16,
    swaySpeed: 1.15,
    geo: 'giantKelp',
  },
  {
    id: 'kelp',
    name: '昆布',
    hp: 24,
    hardness: 2,
    value: 18,
    cargo: 2,
    radius: 1.35,
    count: 64,
    rMin: 46,
    rMax: 100,
    minDist: 3.15,
    region: 'annulus',
    colors: ['#1fa85a', '#168a48', '#34c56e'],
    respawn: 10,
    swayAmp: 0.2,
    swaySpeed: 1.35,
    geo: 'kelp',
  },
  {
    id: 'bigCoral',
    name: '大サンゴ',
    hp: 220,
    hardness: 3,
    value: 180,
    cargo: 4,
    radius: 1.85,
    count: 16,
    rMin: 112,
    rMax: 152,
    minDist: 5.2,
    region: 'annulus',
    colors: ['#ff4d6d', '#ff7a45', '#e85dff'],
    respawn: 20,
    swayAmp: 0.04,
    swaySpeed: 0.7,
    geo: 'bigCoral',
  },
  {
    id: 'coral',
    name: 'サンゴ',
    hp: 88,
    hardness: 3,
    value: 80,
    cargo: 3,
    radius: 1.4,
    count: 48,
    rMin: 98,
    rMax: 154,
    minDist: 3.5,
    region: 'annulus',
    colors: ['#ff5d8f', '#ff8a5b', '#ffd36e', '#d56bff'],
    respawn: 16,
    swayAmp: 0.05,
    swaySpeed: 0.8,
    geo: 'coral',
  },
  {
    id: 'anemone',
    name: 'イソギンチャク',
    hp: 64,
    hardness: 3,
    value: 44,
    cargo: 2,
    radius: 1.25,
    count: 18,
    rMin: 104,
    rMax: 150,
    minDist: 3.6,
    region: 'annulus',
    colors: ['#ff6b9a', '#ff8f6b', '#e85dff'],
    respawn: 15,
    swayAmp: 0.14,
    swaySpeed: 1.45,
    geo: 'anemone',
  },
  {
    id: 'fanCoral',
    name: '扇サンゴ',
    hp: 110,
    hardness: 3,
    value: 64,
    cargo: 2,
    radius: 1.35,
    count: 14,
    rMin: 108,
    rMax: 152,
    minDist: 4,
    region: 'annulus',
    colors: ['#ffb3c7', '#ff7a9a', '#ffd0a8'],
    respawn: 16,
    swayAmp: 0.05,
    swaySpeed: 0.65,
    geo: 'fanCoral',
  },
  {
    id: 'pearl',
    name: '真珠',
    hp: 400,
    hardness: 4,
    value: 260,
    cargo: 1,
    radius: 1.15,
    count: 8,
    rMin: 0,
    rMax: 0,
    minDist: 3.4,
    region: 'wreck',
    colors: ['#fff6ea', '#ffe0f2', '#fff1b8'],
    respawn: 22,
    swayAmp: 0.02,
    swaySpeed: 0.5,
    geo: 'pearl',
  },
  {
    id: 'shell',
    name: '貝殻',
    hp: 240,
    hardness: 4,
    value: 140,
    cargo: 2,
    radius: 1.2,
    count: 22,
    rMin: 0,
    rMax: 0,
    minDist: 2.8,
    region: 'wreck',
    colors: ['#f4e2c4', '#e7c39a', '#fff8ef'],
    respawn: 18,
    swayAmp: 0.02,
    swaySpeed: 0.4,
    geo: 'shell',
  },
  {
    id: 'plank',
    name: 'フジツボの板',
    hp: 160,
    hardness: 4,
    value: 86,
    cargo: 2,
    radius: 1.45,
    count: 12,
    rMin: 0,
    rMax: 0,
    minDist: 3.1,
    region: 'wreck',
    colors: ['#8d6a44', '#6e5340', '#a98462'],
    respawn: 18,
    swayAmp: 0.015,
    swaySpeed: 0.35,
    geo: 'plank',
  },
  {
    id: 'scrap',
    name: 'スクラップ',
    hp: 120,
    hardness: 4,
    value: 70,
    cargo: 2,
    radius: 1.2,
    count: 14,
    rMin: 0,
    rMax: 0,
    minDist: 2.9,
    region: 'wreck',
    colors: ['#b5522a', '#8a3e28', '#d07a45'],
    respawn: 16,
    swayAmp: 0.02,
    swaySpeed: 0.45,
    geo: 'scrap',
  },
  {
    id: 'deep',
    name: '深海サンゴ',
    hp: 480,
    hardness: 5,
    value: 420,
    cargo: 4,
    radius: 1.6,
    count: 20,
    rMin: 168,
    rMax: 226,
    minDist: 6.5,
    region: 'deep',
    colors: ['#7af6ff', '#4d7dff', '#d07bff'],
    respawn: 24,
    swayAmp: 0.08,
    swaySpeed: 1.05,
    geo: 'deep',
  },
  {
    id: 'worm',
    name: 'チューブワーム',
    hp: 200,
    hardness: 5,
    value: 170,
    cargo: 3,
    radius: 1.3,
    count: 14,
    rMin: 170,
    rMax: 224,
    minDist: 5.4,
    region: 'deep',
    colors: ['#7af6ff', '#b07bff', '#4d7dff'],
    respawn: 22,
    swayAmp: 0.1,
    swaySpeed: 1.25,
    geo: 'worm',
  },
  {
    id: 'seaweed',
    name: '海藻',
    hp: 10,
    hardness: 1,
    value: 5,
    cargo: 1,
    radius: 1.05,
    count: 230,
    rMin: 15.5,
    rMax: 62,
    minDist: 2.28,
    region: 'annulus',
    colors: ['#3dde6a', '#7cff8a', '#b6ff4a', '#1fbf73'],
    respawn: 6.5,
    swayAmp: 0.22,
    swaySpeed: 2.05,
    geo: 'seaweed',
  },
];

export function cutterStats(level) {
  return CUTTER_LEVELS[Math.max(0, Math.min(CUTTER_LEVELS.length, level) - 1)];
}

export function tankCapacity(level) {
  return TANK_LEVELS[Math.max(0, Math.min(TANK_LEVELS.length, level) - 1)].capacity;
}

export function propSpeed(level) {
  return PROP_LEVELS[Math.max(0, Math.min(PROP_LEVELS.length, level) - 1)].speed;
}

export function priceMult(level) {
  return PRICE_LEVELS[Math.max(0, Math.min(PRICE_LEVELS.length, level) - 1)].mult;
}

export function padPosition(pad) {
  return {
    x: Math.sin(pad.angle) * PAD_DIST,
    z: Math.cos(pad.angle) * PAD_DIST,
  };
}

export function nearestPad(x, z) {
  let best = null;
  let bestD = 2.55;
  for (const pad of PADS) {
    const p = padPosition(pad);
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < bestD) {
      bestD = d;
      best = pad.id;
    }
  }
  return best;
}

export function objectiveFor(cutterLevel) {
  if (cutterLevel < 2) return '目標: でかい海藻を刈ってカッターLv2へ';
  if (cutterLevel < 4) return '目標: 昆布の幹を刈ってサンゴへ';
  if (cutterLevel < 6) return '目標: 巨大サンゴを刈って沈没船へ';
  if (cutterLevel < 8) return '目標: 宝箱を開けて深海へ';
  return '深海の光柱を刈れる';
}

export function canCutText(cutterLevel) {
  const power = cutterStats(cutterLevel).power;
  const names = {
    1: '海藻',
    2: '海藻・昆布',
    3: 'サンゴ・イソギンチャクまで',
    4: '貝殻・板・スクラップまで',
    5: '深海サンゴ・チューブワームまで',
  };
  return `切断できる: ${names[power] ?? '海藻'}`;
}

export function buyLabel(cost, money, maxed) {
  if (maxed) return '最大';
  if (cost == null) return '最大';
  if (money < cost) return `${formatNum(cost)} 不足`;
  return `強化 ${formatNum(cost)}`;
}
