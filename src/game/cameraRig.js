import * as THREE from 'three';
import { clamp, smoothstep } from './math.js';

const LOOK_Y = 0.4;
const LIFT = 1.6;
const OLD_RISE = 20;
const OLD_RUN = 12 - LIFT;
const OLD_DIST = Math.hypot(OLD_RISE, OLD_RUN);
const DIR_Y = OLD_RISE / OLD_DIST;
const DIR_Z = OLD_RUN / OLD_DIST;

/**
 * Ground width of the previous desktop rig (fov 42, distance OLD_DIST)
 * divided by aspect. Measured by intersecting the view frustum with y = 0.
 */
const OLD_WIDTH_PER_ASPECT = 21.83;

/** Default pullback on wide screens: about 1.85× the old ground area. */
const AREA_PULL = 1.85;

const _cam = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
const _hit = new THREE.Vector3();

function groundWidth(aspect, fov, height, back, lift) {
  _cam.fov = fov;
  _cam.aspect = Math.max(0.2, aspect);
  _cam.position.set(0, height, back);
  _cam.up.set(0, 1, 0);
  _cam.lookAt(0, LOOK_Y, lift);
  _cam.updateProjectionMatrix();
  _cam.updateMatrixWorld();
  const left = ndcGround(-1, 0);
  const right = ndcGround(1, 0);
  return Math.abs(right - left);
}

function ndcGround(nx, ny) {
  _hit.set(nx, ny, 0.5).unproject(_cam);
  _hit.sub(_cam.position);
  const t = -_cam.position.y / _hit.y;
  return _cam.position.x + _hit.x * t;
}

/** Width the previous build showed, including its separate portrait camera. */
function previousWidth(aspect) {
  const desktop = OLD_WIDTH_PER_ASPECT * aspect;
  if (aspect >= 1) return desktop;
  const narrow = groundWidth(aspect, 50, 27, 14, 3.6);
  const blend = smoothstep(1, 0.82, aspect);
  return desktop + (narrow - desktop) * blend;
}

/**
 * Top-down rig for the current frame.
 * Wide screens sit at ~1.85× the old visible area. Narrower frames raise the
 * camera further so the seabed strip across the short side does not collapse.
 */
export function cameraRig(aspect) {
  const safeAspect = clamp(aspect, 0.35, 3.2);
  const wideWidth = OLD_WIDTH_PER_ASPECT * safeAspect * Math.sqrt(AREA_PULL);
  const squeeze = smoothstep(1.22, 0.5, safeAspect);
  const widthBoost = 1 + squeeze * 0.9;
  const targetWidth = wideWidth * widthBoost;
  const distScale = targetWidth / (OLD_WIDTH_PER_ASPECT * safeAspect);
  const dist = OLD_DIST * distScale;
  const shownBefore = previousWidth(safeAspect);
  return {
    fov: 42,
    height: LOOK_Y + DIR_Y * dist,
    back: LIFT + DIR_Z * dist,
    lift: LIFT,
    lookY: LOOK_Y,
    distScale,
    indicatorScale: targetWidth / shownBefore,
  };
}
