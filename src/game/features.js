import { vacuumRadius } from './economy.js';

/**
 * Live switches written from owned facilities each frame.
 * Vacuum harvests through Resources.harvestAround around the hull.
 * The transport drone and warp have their own objects; these flags mirror
 * ownership so the hooks stay truthful. Rewarded ads stay off.
 */

export const features = {
  autoVacuum: false,
  vacuumRadius: 0,
  transportDrone: false,
  companionSub: false,
  zoneWarp: false,
  rewardedAds: false,
};

export function applyFacilityFeatures(facilities) {
  const radius = vacuumRadius(facilities?.vacuum || 0);
  features.autoVacuum = radius > 0;
  features.vacuumRadius = radius;
  features.transportDrone = (facilities?.drone || 0) > 0;
  features.zoneWarp = (facilities?.warp || 0) > 0;
}
