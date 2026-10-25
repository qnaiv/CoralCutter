/**
 * Income, base level, and facilities. Tweak numbers here.
 *
 * Coins per minute at propeller Lv1 and sell price ×1, before facilities.
 * These are targets for play, not a simulated clock:
 *   shallow ~80–140, kelp ~220, coral ~450, wreck ~600, deep ~900+.
 * Shallows stay a first lesson (a full starter tank is about 64 coins) but
 * sit off the pad, regrow slowly, and lose to any deeper grove.
 * Deeper bands are clumps, so the seabed reads as patches instead of pins.
 * Nothing here pays while the tab is hidden or the run is paused.
 */

export const OUTPOST_RULES = {
  minBase: 18,
  minGap: 26,
  maxCount: 5,
};

export const BASE_MAX = 6;
/** Cost to leave levels 1..5. */
const BASE_COSTS = [150, 360, 800, 1600, 3000];
const BASE_NEXT = {
  1: '次: 納品・吸い込み・ソナー',
  2: '次: ドローン・加工所',
  3: '次: 海域ワープ',
  4: '次: 納品 +1',
  5: '次: 納品 +1',
};

const PROCESS_IDS = new Set(['kelp', 'giantKelp', 'coral', 'bigCoral', 'shell', 'pearl', 'deep']);
const PROCESS_MULT = [1, 1.15, 1.35, 1.6];
const VACUUM_RADIUS = [0, 2.2, 3.2, 4.4];
const DRONE = [
  null,
  { interval: 28, fraction: 0.3, speed: 22 },
  { interval: 22, fraction: 0.45, speed: 24 },
  { interval: 16, fraction: 0.6, speed: 26 },
];
const WARP_COOLDOWN = [0, 6, 3, 1.5];
const SELL_BY_LEVEL = [0, 5.2, 6.2, 7.2];
const BUILD_COSTS = [220, 340, 480, 640, 820];
const BUILD_OFF = [0, 0, 0.15, 0.3];

export const ECONOMY = {
  resources: {
    seaweed: { value: 4, count: 90, respawn: 15, rMin: 16.5, rMax: 52, minDist: 2.85 },
    kelp: {
      value: 26,
      count: 80,
      respawn: 9,
      rMin: 46,
      rMax: 100,
      minDist: 2.5,
      clusters: 10,
      clusterSize: 8,
      clusterRadius: 8.5,
    },
    giantKelp: {
      value: 60,
      count: 36,
      respawn: 12,
      rMin: 58,
      rMax: 102,
      minDist: 3.2,
      clusters: 6,
      clusterSize: 6,
      clusterRadius: 9,
    },
    coral: {
      value: 120,
      count: 80,
      respawn: 11,
      rMin: 98,
      rMax: 154,
      minDist: 2.6,
      clusters: 10,
      clusterSize: 8,
      clusterRadius: 9,
    },
    bigCoral: {
      value: 240,
      count: 28,
      respawn: 16,
      rMin: 108,
      rMax: 154,
      minDist: 3.2,
      clusters: 7,
      clusterSize: 4,
      clusterRadius: 8,
    },
    shell: {
      value: 180,
      count: 28,
      respawn: 14,
      minDist: 2.3,
      clusters: 4,
      clusterSize: 7,
      clusterRadius: 6,
    },
    pearl: { value: 340, count: 12, respawn: 18, minDist: 3.2, rare: true },
    deep: {
      value: 620,
      count: 48,
      respawn: 14,
      rMin: 162,
      rMax: 226,
      minDist: 2.9,
      clusters: 8,
      clusterSize: 6,
      clusterRadius: 8.2,
    },
  },
};

export const FACILITIES = [
  {
    id: 'outpost',
    name: '納品建設',
    blurb: '今いる場所に前線基地',
    need: 2,
    max: 3,
    costs: [200, 480, 900],
    color: '#3ec8ff',
  },
  {
    id: 'vacuum',
    name: '吸い込み',
    blurb: '船体の周囲も刈る',
    need: 2,
    max: 3,
    costs: [160, 420, 980],
    color: '#3ee0a2',
  },
  {
    id: 'drone',
    name: 'ドローン',
    blurb: 'プレイ中だけ一部を運ぶ',
    need: 3,
    max: 3,
    costs: [320, 700, 1400],
    color: '#ffb020',
  },
  {
    id: 'process',
    name: '加工所',
    blurb: '海藻以外の売値',
    need: 3,
    max: 3,
    costs: [280, 640, 1300],
    color: '#ff8a5b',
  },
  {
    id: 'sonar',
    name: 'ソナー',
    blurb: 'ミニマップに印',
    need: 2,
    max: 3,
    costs: [150, 360, 800],
    color: '#d7b0ff',
  },
  {
    id: 'warp',
    name: 'ワープ',
    blurb: '基地から前線へ',
    need: 4,
    max: 3,
    costs: [400, 900, 1600],
    color: '#ffe56a',
  },
];

export const FACILITY_IDS = FACILITIES.map((entry) => entry.id);

export function emptyFacilities() {
  return { outpost: 0, vacuum: 0, drone: 0, process: 0, sonar: 0, warp: 0 };
}

export function baseUpgradeCost(level) {
  if (level >= BASE_MAX) return null;
  return BASE_COSTS[level - 1] ?? null;
}

export function baseNextText(level) {
  if (level >= BASE_MAX) return '拠点は最大';
  return BASE_NEXT[level] || '納品の枠が増える';
}

export function facilityCost(def, level) {
  if (!def || level >= def.max) return null;
  return def.costs[level] ?? null;
}

export function outpostCap(baseLevel, facilityLevel) {
  if (facilityLevel < 1) return 0;
  return Math.min(OUTPOST_RULES.maxCount, Math.max(0, baseLevel - 1));
}

export function outpostBuildCost(owned, facilityLevel) {
  const base = BUILD_COSTS[Math.min(owned, BUILD_COSTS.length - 1)] ?? BUILD_COSTS[0];
  const off = BUILD_OFF[facilityLevel] ?? 0;
  return Math.max(1, Math.round(base * (1 - off)));
}

export function outpostSellRadius(facilityLevel) {
  const level = Math.max(0, Math.min(3, facilityLevel | 0));
  return SELL_BY_LEVEL[level] || SELL_BY_LEVEL[1];
}

export function outpostBlocked(x, z, existing, worldLimit, colliders) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
  const dist = Math.hypot(x, z);
  if (dist < OUTPOST_RULES.minBase || dist > worldLimit - 4) return true;
  for (const spot of existing) {
    if (Math.hypot(x - spot.x, z - spot.z) < OUTPOST_RULES.minGap) return true;
  }
  if (colliders) {
    for (const collider of colliders) {
      const need = (collider.r || 1) + 2.4;
      const dx = x - collider.x;
      const dz = z - collider.z;
      if (dx * dx + dz * dz < need * need) return true;
    }
  }
  return false;
}

export function outpostArrival(outpost, sellRadius) {
  const len = Math.hypot(outpost.x, outpost.z) || 1;
  const ux = outpost.x / len;
  const uz = outpost.z / len;
  const gap = sellRadius + 8;
  let x = outpost.x + ux * gap;
  let z = outpost.z + uz * gap;
  if (Math.hypot(x, z) > 228) {
    x = outpost.x - ux * gap;
    z = outpost.z - uz * gap;
  }
  return { x, z };
}

export function vacuumRadius(level) {
  const index = Math.max(0, Math.min(VACUUM_RADIUS.length - 1, level | 0));
  return VACUUM_RADIUS[index] || 0;
}

export function droneStats(level) {
  const index = Math.max(0, Math.min(DRONE.length - 1, level | 0));
  return DRONE[index];
}

export function processMult(level, typeId) {
  if (!typeId || !PROCESS_IDS.has(typeId)) return 1;
  const index = Math.max(0, Math.min(PROCESS_MULT.length - 1, level | 0));
  return PROCESS_MULT[index];
}

export function warpCooldown(level) {
  const index = Math.max(0, Math.min(WARP_COOLDOWN.length - 1, level | 0));
  return WARP_COOLDOWN[index] || 0;
}

export function facilityStat(id, level) {
  if (id === 'outpost') {
    if (level < 1) return '未建設';
    const off = Math.round((BUILD_OFF[level] || 0) * 100);
    return `半径 ${outpostSellRadius(level).toFixed(1)}　割引 ${off}%`;
  }
  if (id === 'vacuum') {
    const radius = vacuumRadius(level);
    return radius ? `半径 ${radius.toFixed(1)}` : 'なし';
  }
  if (id === 'drone') {
    const stats = droneStats(level);
    if (!stats) return 'なし';
    return `${stats.interval}秒ごと ${Math.round(stats.fraction * 100)}%`;
  }
  if (id === 'process') return `×${processMult(level, 'coral').toFixed(2)}`;
  if (id === 'sonar') {
    if (level <= 0) return 'なし';
    if (level === 1) return 'でかい獲物';
    if (level === 2) return '獲物と真珠';
    return '獲物・真珠・掘り場';
  }
  if (id === 'warp') {
    const cool = warpCooldown(level);
    if (!cool) return 'なし';
    return level >= 3 ? `冷却 ${cool}秒・往復` : `冷却 ${cool}秒`;
  }
  return '';
}

export function facilityNext(id, level, max) {
  if (level >= max) return '最大まで強化済み';
  if (id === 'outpost') {
    if (level === 0) return '次: 建てるボタン';
    if (level === 1) return '次: 安く、売却が広い';
    return '次: さらに安い';
  }
  if (id === 'vacuum') return `次: 半径 ${vacuumRadius(level + 1).toFixed(1)}`;
  if (id === 'drone') {
    const stats = droneStats(level + 1);
    return `次: ${stats.interval}秒 ${Math.round(stats.fraction * 100)}%`;
  }
  if (id === 'process') return `次: ×${processMult(level + 1, 'coral').toFixed(2)}`;
  if (id === 'sonar') {
    if (level === 0) return '次: でかい獲物を表示';
    if (level === 1) return '次: 真珠も表示';
    return '次: 掘り場も表示';
  }
  if (id === 'warp') {
    if (level === 0) return '次: 基地から前線へ';
    if (level === 1) return '次: 冷却 3秒';
    return '次: 冷却 1.5秒・前線から帰還';
  }
  return '';
}
