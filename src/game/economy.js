/**
 * Income, upgrades, zones, and facilities. Tweak numbers here.
 *
 * Coins per minute at propeller Lv1 and sell price ×1, before facilities.
 * These are targets for play, not a simulated clock:
 *   shallow ~80–140, kelp ~220, coral ~450, wreck ~600, deep ~900+.
 * A player who buys only the next zone gate spends about 45–55 minutes
 * reaching the deep (cutter Lv11 + depth Lv5). Side upgrades stretch that.
 * Cutter costs grow by about ×1.40 per level (rounded to 10). Depth costs
 * step up beside each gate. Post-deep cutter levels are the steep tail.
 * Nothing here pays while the tab is hidden or the run is paused.
 *
 * Map radius 400 is about 3× the old 232 disk ((400/232)² ≈ 2.97).
 */

export const OUTPOST_RULES = {
  minBase: 18,
  minGap: 26,
  maxCount: 5,
};

export const WORLD = {
  limit: 400,
  baseRadius: 16,
  shallow: 84,
  kelp: 175,
  coral: 275,
  innerDeep: 340,
  /** Minimap shows this many world units around the submarine. */
  mapView: 210,
};

export const WRECK_SITE = { x: 220, z: -144, radius: 34 };

export const ZONE_RING_DEFS = [
  { radius: WORLD.shallow, color: 0xb6f0a0 },
  { radius: WORLD.kelp, color: 0xff9eb8 },
  { radius: WORLD.coral, color: 0x8fd4ff },
  { radius: WORLD.innerDeep, color: 0x4aa0c8 },
];

/** Fixed sights so the wider bands are not empty water. */
export const LANDMARKS = [
  { name: '昆布の灯', x: 36, z: -124, color: 0x9dff6a },
  { name: '昆布の灯', x: -118, z: 72, color: 0x9dff6a },
  { name: 'サンゴの灯', x: 150, z: -168, color: 0xff8aa8 },
  { name: 'サンゴの灯', x: -160, z: -150, color: 0xff8aa8 },
  { name: '深海の噴気', x: -30, z: -300, color: 0x7af6ff },
  { name: '深海の噴気', x: 210, z: 230, color: 0x7af6ff },
  { name: '奥の噴気', x: 90, z: -360, color: 0xd7b0ff },
  { name: '奥の噴気', x: -250, z: -270, color: 0xd7b0ff },
];

/**
 * Cutter. Power is the hardness gate. Damage stays one-shot on that zone's
 * common plant at the level power unlocks, then climbs for the big targets.
 * Costs: 160, then each step is the previous cost ×1.40, rounded to 10.
 */
export const CUTTER_LEVELS = [
  { damage: 14, range: 2.95, power: 1 },
  { damage: 24, range: 3.1, power: 1 },
  { damage: 36, range: 3.25, power: 1, shout: 'でかい海藻を早く刈れる' },
  { damage: 52, range: 3.45, power: 2, shout: '昆布を切断できるようになった！' },
  { damage: 72, range: 3.6, power: 2 },
  { damage: 96, range: 3.8, power: 2, shout: '巨大昆布を一気に切れる！' },
  { damage: 140, range: 4.0, power: 3, shout: 'サンゴを切断できるようになった！' },
  { damage: 250, range: 4.25, power: 3, shout: '大サンゴを粉砕できる！' },
  { damage: 320, range: 4.5, power: 4, shout: '沈没船の貝殻を切断できるようになった！' },
  { damage: 480, range: 4.8, power: 4, shout: '真珠を割り切れる！' },
  { damage: 580, range: 5.15, power: 5, shout: '深海サンゴを切断できるようになった！' },
  { damage: 760, range: 5.4, power: 5 },
  { damage: 1000, range: 5.65, power: 5, shout: '深海の光柱を早く砕ける' },
  { damage: 1320, range: 5.9, power: 5 },
  { damage: 1720, range: 6.15, power: 5 },
  { damage: 2200, range: 6.4, power: 5 },
];

export const CUTTER_COSTS = [160, 220, 310, 430, 600, 840, 1180, 1650, 2310, 3230, 4520, 6330, 8860, 12400, 17360];

export const POWER_NEED = (() => {
  const need = {};
  CUTTER_LEVELS.forEach((row, index) => {
    if (need[row.power] == null) need[row.power] = index + 1;
  });
  return need;
})();

/**
 * Hull / depth rating. Entering a zone needs this level AND the cutter
 * level on the row. Far water (past innerDeep) is the last step.
 * Costs step up faster than the cutter curve so each zone is its own grind.
 */
export const DEPTH_LEVELS = [
  { reach: '浅瀬', radius: WORLD.shallow, wreck: false, cutter: 1 },
  { reach: '昆布の森', radius: WORLD.kelp, wreck: false, cutter: 4 },
  { reach: 'サンゴ礁', radius: WORLD.coral, wreck: false, cutter: 7 },
  { reach: '沈没船', radius: WORLD.coral, wreck: true, cutter: 9 },
  { reach: '深海', radius: WORLD.innerDeep, wreck: true, cutter: 11 },
  { reach: '深海の奥', radius: WORLD.limit, wreck: true, cutter: 13 },
];

export const DEPTH_COSTS = [420, 980, 1680, 2900, 5200];

/** ×1.42 from 140, rounded to 10. Ten levels, past the old cap of 112. */
export const TANK_LEVELS = [
  { capacity: 16 },
  { capacity: 24 },
  { capacity: 34 },
  { capacity: 48 },
  { capacity: 64 },
  { capacity: 86 },
  { capacity: 114 },
  { capacity: 150 },
  { capacity: 196 },
  { capacity: 250 },
];
export const TANK_COSTS = [140, 200, 280, 400, 570, 810, 1150, 1630, 2310];

/** Starts a little slower than the old 13 so the wider map takes longer to cross. ×1.44 from 150. */
export const PROP_LEVELS = [
  { speed: 12 },
  { speed: 14.5 },
  { speed: 17 },
  { speed: 20 },
  { speed: 23 },
  { speed: 26.5 },
  { speed: 30 },
  { speed: 34 },
];
export const PROP_COSTS = [150, 220, 320, 460, 660, 950, 1370];

/** ×1.48 from 280 so sell-price is a sink, not a way to skip the gates. */
export const PRICE_LEVELS = [
  { mult: 1 },
  { mult: 1.22 },
  { mult: 1.48 },
  { mult: 1.78 },
  { mult: 2.15 },
  { mult: 2.6 },
  { mult: 3.15 },
  { mult: 3.8 },
];
export const PRICE_COSTS = [280, 410, 610, 900, 1330, 1970, 2920];

export const BASE_MAX = 6;
/** Cost to leave levels 1..5. Mid-game sinks, not the first purchase. */
const BASE_COSTS = [450, 1100, 2500, 5200, 9800];
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
const BUILD_COSTS = [560, 900, 1400, 2000, 2800];
const BUILD_OFF = [0, 0, 0.15, 0.3];

export const ECONOMY = {
  resources: {
    seaweed: { value: 4, count: 200, respawn: 15, rMin: 18, rMax: 82, minDist: 3.1 },
    kelp: {
      value: 26,
      count: 144,
      respawn: 9,
      rMin: 88,
      rMax: 172,
      minDist: 2.6,
      clusters: 18,
      clusterSize: 8,
      clusterRadius: 9,
    },
    giantKelp: {
      value: 60,
      count: 60,
      respawn: 12,
      rMin: 108,
      rMax: 172,
      minDist: 3.4,
      clusters: 10,
      clusterSize: 6,
      clusterRadius: 10,
    },
    coral: {
      value: 120,
      count: 144,
      respawn: 11,
      rMin: 182,
      rMax: 270,
      minDist: 2.7,
      clusters: 18,
      clusterSize: 8,
      clusterRadius: 9.5,
    },
    bigCoral: {
      value: 240,
      count: 48,
      respawn: 16,
      rMin: 200,
      rMax: 270,
      minDist: 3.4,
      clusters: 12,
      clusterSize: 4,
      clusterRadius: 8,
    },
    shell: {
      value: 180,
      count: 42,
      respawn: 14,
      minDist: 2.4,
      clusters: 6,
      clusterSize: 7,
      clusterRadius: 7,
    },
    pearl: { value: 340, count: 16, respawn: 18, minDist: 3.4, rare: true },
    deep: {
      value: 620,
      count: 96,
      respawn: 14,
      rMin: 285,
      rMax: 388,
      minDist: 3.0,
      clusters: 16,
      clusterSize: 6,
      clusterRadius: 8.5,
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
    costs: [600, 1500, 3200],
    color: '#3ec8ff',
  },
  {
    id: 'vacuum',
    name: '吸い込み',
    blurb: '船体の周囲も刈る',
    need: 2,
    max: 3,
    costs: [480, 1300, 3000],
    color: '#3ee0a2',
  },
  {
    id: 'drone',
    name: 'ドローン',
    blurb: 'プレイ中だけ一部を運ぶ',
    need: 3,
    max: 3,
    costs: [960, 2200, 4600],
    color: '#ffb020',
  },
  {
    id: 'process',
    name: '加工所',
    blurb: '海藻以外の売値',
    need: 3,
    max: 3,
    costs: [840, 1900, 4000],
    color: '#ff8a5b',
  },
  {
    id: 'sonar',
    name: 'ソナー',
    blurb: 'ミニマップに印',
    need: 2,
    max: 3,
    costs: [450, 1100, 2500],
    color: '#d7b0ff',
  },
  {
    id: 'warp',
    name: 'ワープ',
    blurb: '基地から前線へ',
    need: 4,
    max: 3,
    costs: [1200, 2800, 5400],
    color: '#ffe56a',
  },
];

export const FACILITY_IDS = FACILITIES.map((entry) => entry.id);

export function emptyFacilities() {
  return { outpost: 0, vacuum: 0, drone: 0, process: 0, sonar: 0, warp: 0 };
}

export function accessAt(cutterLevel, depthLevel) {
  const depth = Math.max(0, Math.min(DEPTH_LEVELS.length, depthLevel | 0));
  let radius = WORLD.baseRadius;
  let wreck = false;
  for (let i = 0; i < depth; i++) {
    const row = DEPTH_LEVELS[i];
    if (cutterLevel < row.cutter) continue;
    radius = Math.max(radius, row.radius);
    if (row.wreck) wreck = true;
  }
  return { radius: Math.min(radius, WORLD.limit), wreck };
}

export function nextGateHint(cutterLevel, depthLevel) {
  for (let i = 0; i < DEPTH_LEVELS.length; i++) {
    const row = DEPTH_LEVELS[i];
    const depthOk = depthLevel >= i + 1;
    const cutterOk = cutterLevel >= row.cutter;
    if (depthOk && cutterOk) continue;
    const bits = [];
    if (!cutterOk) bits.push(`カッターLv${row.cutter}`);
    if (!depthOk) bits.push(`深度Lv${i + 1}`);
    return `${row.reach}は${bits.join('・')}`;
  }
  return 'ここより先には進めない';
}

export function objectiveFor(cutterLevel, depthLevel = 1) {
  for (let i = 1; i < DEPTH_LEVELS.length; i++) {
    const row = DEPTH_LEVELS[i];
    if (cutterLevel < row.cutter || depthLevel < i + 1) {
      return `目標: カッターLv${row.cutter}・深度Lv${i + 1}で${row.reach}へ`;
    }
  }
  return '深海の奥まで進める';
}

function inWreckDisc(x, z) {
  const dx = x - WRECK_SITE.x;
  const dz = z - WRECK_SITE.z;
  return dx * dx + dz * dz <= WRECK_SITE.radius * WRECK_SITE.radius;
}

function circleIntersections(x0, z0, r0, x1, z1, r1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6 || d > r0 + r1 || d < Math.abs(r0 - r1)) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const xm = x0 + (a * dx) / d;
  const zm = z0 + (a * dz) / d;
  const rx = (-dz * h) / d;
  const rz = (dx * h) / d;
  return [
    { x: xm + rx, z: zm + rz },
    { x: xm - rx, z: zm - rz },
  ];
}

/** Nearest standable point outside the wreck and inside the allowed disk. */
function exitWreck(x, z, maxRadius) {
  const cx = WRECK_SITE.x;
  const cz = WRECK_SITE.z;
  const wr = WRECK_SITE.radius + 1.2;
  let dx = x - cx;
  let dz = z - cz;
  let length = Math.hypot(dx, dz);
  if (length < 0.05) {
    dx = -cx || -1;
    dz = -cz;
    length = Math.hypot(dx, dz) || 1;
  }
  const px = cx + (dx / length) * wr;
  const pz = cz + (dz / length) * wr;
  if (Math.hypot(px, pz) <= maxRadius + 0.05 && !inWreckDisc(px, pz)) return { x: px, z: pz };
  const hits = circleIntersections(0, 0, maxRadius, cx, cz, wr);
  if (hits.length) {
    hits.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
    return hits[0];
  }
  const origin = Math.hypot(cx, cz) || 1;
  return { x: cx - (cx / origin) * wr, z: cz - (cz / origin) * wr };
}

/** Slide back to the ring the player is allowed to stand in. */
export function containPosition(x, z, cutterLevel, depthLevel) {
  const access = accessAt(cutterLevel, depthLevel);
  let nx = x;
  let nz = z;
  let ring = false;
  let wreck = false;
  const dist = Math.hypot(nx, nz);
  const limit = Math.max(WORLD.baseRadius, access.radius - 0.12);
  if (dist > limit) {
    const scale = limit / dist;
    nx *= scale;
    nz *= scale;
    ring = true;
  }
  if (!access.wreck && inWreckDisc(nx, nz)) {
    const safe = exitWreck(nx, nz, limit);
    nx = safe.x;
    nz = safe.z;
    wreck = true;
  }
  const blocked = ring || wreck;
  return {
    x: nx,
    z: nz,
    blocked,
    ring,
    wreck,
    message: blocked ? nextGateHint(cutterLevel, depthLevel) : '',
  };
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
  if (Math.hypot(x, z) > WORLD.limit - 6) {
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
