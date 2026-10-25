import * as THREE from 'three';
import { WRECK, ZONES } from './constants.js';
import { smoothstep, valueNoise } from './math.js';

export function inWreck(x, z, radius = WRECK.radius) {
  const dx = x - WRECK.x;
  const dz = z - WRECK.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function zoneAt(x, z) {
  if (inWreck(x, z)) return ZONES.wreck;
  const d = Math.hypot(x, z);
  if (d < 14) return ZONES.base;
  if (d < 48) return ZONES.shallow;
  if (d < 102) return ZONES.kelp;
  if (d < 156) return ZONES.coral;
  return ZONES.deep;
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
  if (dist < 48) _mix.copy(_sand);
  else if (dist < 102) _mix.copy(_sand).lerp(_kelp, smoothstep(48, 70, dist));
  else if (dist < 156) _mix.copy(_kelp).lerp(_coral, smoothstep(102, 120, dist));
  else _mix.copy(_coral).lerp(_deep, smoothstep(156, 178, dist));
  if (wreckD < WRECK.radius + 10) {
    _mix.lerp(_wreck, smoothstep(WRECK.radius + 10, WRECK.radius * 0.45, wreckD) * 0.85);
  }
  const n = valueNoise(x * 0.17, z * 0.17);
  const n2 = valueNoise(x * 0.05 + 20, z * 0.05);
  out.copy(_mix);
  out.offsetHSL((n - 0.5) * 0.02, (n2 - 0.5) * 0.08, (n - 0.5) * 0.08 + (n2 - 0.5) * 0.04);
  return out;
}
