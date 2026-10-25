/**
 * Efficiency features are intentionally off. The harvest loop already goes
 * through Resources.harvestAround(x, z, radius, ...), so these can be enabled
 * later without rewriting cutting, cargo, or selling.
 *
 * - autoVacuum: also cut inside vacuumRadius around the sub
 * - transportDrone: ferry cargo back to the sell zone
 * - companionSub: a second cutter that calls harvestAround at its own position
 * - zoneWarp: pads that move the sub between zone gates
 *
 * Rewarded ads are out of scope for the prototype. Keep them optional and
 * never required to progress.
 */
export const features = {
  autoVacuum: false,
  vacuumRadius: 0,
  transportDrone: false,
  companionSub: false,
  zoneWarp: false,
  rewardedAds: false,
};
