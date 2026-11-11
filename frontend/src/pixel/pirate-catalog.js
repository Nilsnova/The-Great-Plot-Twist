// Original pirate-wave art (lane P2, scripts/pixel_art/pirates.py). Selective library assets,
// loaded by the island scene with loadArt(ids); never part of the default Lighthouse preload.
// [width, height, anchor]: anchor = native pixels from the bottom edge to the ground or waterline.
export const pirateDimensions = {};
for (const frame of [1, 2, 3]) {
  pirateDimensions[`pirate-sloop-${frame}`] = [64, 64, 10];
  pirateDimensions[`pirate-brig-${frame}`] = [96, 80, 11];
  pirateDimensions[`pirate-flagship-${frame}`] = [128, 112, 13];
  pirateDimensions[`pirate-splash-${frame}`] = [32, 32, 4];
}
Object.assign(pirateDimensions, {
  'pirate-cannonball': [16, 16, 8], 'pirate-wreck': [64, 48, 8], 'pirate-flag-trophy': [32, 48, 4],
  'island-wall': [48, 48, 6], 'island-wall-damaged': [48, 48, 6], 'island-wall-broken': [48, 48, 6],
  'island-cannon': [48, 32, 5], 'island-cannon-fire': [48, 32, 5], 'island-watchtower': [64, 128, 8],
  'island-house': [64, 64, 8], 'build-spot': [32, 32, 10], 'build-spot-glow': [32, 32, 10],
});
// Animation frames by family, for the wave renderer: ships bob 1-2-3-2, a splash plays once.
export const pirateFrames = {
  sloop: ['pirate-sloop-1', 'pirate-sloop-2', 'pirate-sloop-3'],
  brig: ['pirate-brig-1', 'pirate-brig-2', 'pirate-brig-3'],
  flagship: ['pirate-flagship-1', 'pirate-flagship-2', 'pirate-flagship-3'],
  splash: ['pirate-splash-1', 'pirate-splash-2', 'pirate-splash-3'],
  wall: ['island-wall', 'island-wall-damaged', 'island-wall-broken'],
  cannon: ['island-cannon', 'island-cannon-fire'],
  buildSpot: ['build-spot', 'build-spot-glow'],
};
export const pirateArtIds = Object.keys(pirateDimensions);
