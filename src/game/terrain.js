import * as THREE from 'three';
import { WORLD, WRECK, ZONES } from './constants.js';
import { accessAt } from './economy.js';
import { smoothstep, valueNoise } from './math.js';

export function inWreck(x, z, radius = WRECK.radius) {
  const dx = x - WRECK.x;
  const dz = z - WRECK.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function zoneAt(x, z) {
  if (inWreck(x, z)) return ZONES.wreck;
  const d = Math.hypot(x, z);
  if (d < WORLD.baseRadius) return ZONES.base;
  if (d <= WORLD.shallow) return ZONES.shallow;
  if (d <= WORLD.kelp) return ZONES.kelp;
  if (d <= WORLD.coral) return ZONES.coral;
  return ZONES.deep;
}

/** Zone the player is allowed to count as standing in. Ignores a clip past a locked ring. */
export function zoneForPlayer(x, z, cutterLevel, depthLevel) {
  const zone = zoneAt(x, z);
  const access = accessAt(cutterLevel, depthLevel);
  if (zone.id === 'wreck') {
    if (access.wreck) return zone;
    return Math.hypot(x, z) <= WORLD.kelp ? ZONES.kelp : ZONES.coral;
  }
  if (zone.id === 'deep' && access.radius <= WORLD.coral) return ZONES.coral;
  if (zone.id === 'coral' && access.radius <= WORLD.kelp) return ZONES.kelp;
  if (zone.id === 'kelp' && access.radius <= WORLD.shallow) return ZONES.shallow;
  return zone;
}

export function groundHeight(x, z) {
  const dist = Math.hypot(x, z);
  const wreckD = Math.hypot(x - WRECK.x, z - WRECK.z);
  let flatten = smoothstep(10, 22, dist);
  if (wreckD < 18) flatten *= smoothstep(7, 18, wreckD);
  const h =
    (valueNoise(x * 0.04, z * 0.04) - 0.5) * 0.7 +
    (valueNoise(x * 0.12 + 8, z * 0.12 - 3) - 0.5) * 0.28;
  return h * flatten;
}

const _sand = new THREE.Color(0xf2d7a4);
const _kelp = new THREE.Color(0x7eaf62);
const _coral = new THREE.Color(0xe7a48c);
const _deep = new THREE.Color(0x1d4e62);
const _wreck = new THREE.Color(0x8d6a44);
const _mix = new THREE.Color();

export function terrainColor(x, z, out) {
  const dist = Math.hypot(x, z);
  const wreckD = Math.hypot(x - WRECK.x, z - WRECK.z);
  if (dist < WORLD.shallow) _mix.copy(_sand);
  else if (dist < WORLD.kelp) _mix.copy(_sand).lerp(_kelp, smoothstep(WORLD.shallow, WORLD.shallow + 28, dist));
  else if (dist < WORLD.coral) _mix.copy(_kelp).lerp(_coral, smoothstep(WORLD.kelp, WORLD.kelp + 28, dist));
  else _mix.copy(_coral).lerp(_deep, smoothstep(WORLD.coral, WORLD.coral + 36, dist));
  if (wreckD < WRECK.radius + 10) {
    _mix.lerp(_wreck, smoothstep(WRECK.radius + 10, WRECK.radius * 0.45, wreckD) * 0.85);
  }
  const n = valueNoise(x * 0.17, z * 0.17);
  const n2 = valueNoise(x * 0.05 + 20, z * 0.05);
  out.copy(_mix);
  out.offsetHSL((n - 0.5) * 0.02, (n2 - 0.5) * 0.08, (n - 0.5) * 0.08 + (n2 - 0.5) * 0.04);
  return out;
}
