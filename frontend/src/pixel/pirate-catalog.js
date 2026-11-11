// Original pirate tower-defense art (scripts/pixel_art/pirates.py, clean pixel style). Selective library assets,
// loaded by the island scene with loadArt(ids); never part of the default Lighthouse preload.
// [width, height, anchor]: anchor = native pixels from the bottom edge to the ground or waterline.
export const pirateDimensions = {};
for (const frame of [1, 2, 3]) {
  pirateDimensions[`pirate-sloop-${frame}`] = [64, 64, 10];
  pirateDimensions[`pirate-brig-${frame}`] = [96, 80, 11];
  pirateDimensions[`pirate-flagship-${frame}`] = [128, 112, 13];
  pirateDimensions[`pirate-warship-${frame}`] = [160, 128, 14];
  pirateDimensions[`fx-smoke-${frame}`] = [32, 32, 16];
  pirateDimensions[`fx-fire-${frame}`] = [32, 32, 4];
  pirateDimensions[`pirate-splash-${frame}`] = [32, 32, 4];
}
Object.assign(pirateDimensions, {
  'pirate-cannonball': [16, 16, 8], 'pirate-wreck': [64, 48, 8], 'pirate-flag-trophy': [32, 48, 4],
  'island-wall': [48, 48, 6], 'island-wall-damaged': [48, 48, 6], 'island-wall-broken': [48, 48, 6],
  'island-cannon': [48, 32, 5], 'island-cannon-fire': [48, 32, 5], 'island-watchtower': [64, 128, 8],
  'island-house': [64, 64, 8], 'build-spot': [32, 32, 10], 'build-spot-glow': [32, 32, 10],
  'island-wall-l2': [48, 48, 6], 'island-wall-l3': [48, 48, 6],
  'island-cannon-l2': [48, 32, 5], 'island-cannon-l3': [48, 32, 5],
  'island-mortar': [48, 32, 5], 'island-mortar-fire': [48, 32, 5], 'island-mortar-l2': [48, 32, 5], 'island-mortar-l3': [48, 32, 5],
  // Crew figures are 16 x 24 drawn in a 16 x 32 tile (feet on the anchor, like the explorer's 3).
  'crew-gunner': [16, 32, 3], 'crew-carpenter': [16, 32, 3], 'crew-lookout': [16, 32, 3],
  // The explorer in side view with a musket; the body sits centred like the 24 x 32 explorer, facing right.
  'captain-musket-1': [48, 32, 3], 'captain-musket-2': [48, 32, 3], 'captain-cutlass': [48, 32, 3],
  // A boarder on foot (TOWER-DEFENSE.md §12): 16 x 24 in a 16 x 32 tile like the crew; two walking frames and the hack.
  'pirate-boarder-1': [16, 32, 3], 'pirate-boarder-2': [16, 32, 3], 'pirate-boarder-3': [16, 32, 3],
  'fx-musket-flash': [16, 16, 8], 'fx-mortar-shell': [16, 16, 8], 'fx-level-pip': [16, 16, 8],
});
for (const frame of [1, 2, 3, 4]) pirateDimensions[`fx-explosion-${frame}`] = [32, 32, 16];
// Animation frames by family, for the wave renderer: ships bob 1-2-3-2, a splash plays once.
export const pirateFrames = {
  sloop: ['pirate-sloop-1', 'pirate-sloop-2', 'pirate-sloop-3'],
  brig: ['pirate-brig-1', 'pirate-brig-2', 'pirate-brig-3'],
  flagship: ['pirate-flagship-1', 'pirate-flagship-2', 'pirate-flagship-3'],
  splash: ['pirate-splash-1', 'pirate-splash-2', 'pirate-splash-3'],
  wall: ['island-wall', 'island-wall-damaged', 'island-wall-broken'],
  cannon: ['island-cannon', 'island-cannon-fire'],
  buildSpot: ['build-spot', 'build-spot-glow'],
  warship: ['pirate-warship-1', 'pirate-warship-2', 'pirate-warship-3'],
  mortar: ['island-mortar', 'island-mortar-fire'],
  captain: ['captain-musket-1', 'captain-musket-2'],
  boarder: ['pirate-boarder-1', 'pirate-boarder-2', 'pirate-boarder-3'],
  smoke: ['fx-smoke-1', 'fx-smoke-2', 'fx-smoke-3'],
  fire: ['fx-fire-1', 'fx-fire-2', 'fx-fire-3'],
  explosion: ['fx-explosion-1', 'fx-explosion-2', 'fx-explosion-3', 'fx-explosion-4'],
};
// Building art by level (index 0 = level 1); damage states and firing frames stay in pirateFrames.
export const pirateLevels = {
  wall: ['island-wall', 'island-wall-l2', 'island-wall-l3'],
  cannon: ['island-cannon', 'island-cannon-l2', 'island-cannon-l3'],
  mortar: ['island-mortar', 'island-mortar-l2', 'island-mortar-l3'],
};
export const crewArt = { gunner: 'crew-gunner', carpenter: 'crew-carpenter', lookout: 'crew-lookout' };
export const pirateArtIds = Object.keys(pirateDimensions);
