// Shared art direction and layout. World and player modules read these values.
export const SEA_LEVEL = 0;
export const LAND_LIMIT = 0.38;
export const PLAYER_RADIUS = 0.34;
export const START_HOUR = 18.4;
export const QUALITY = {
  high: { shadows: true, rainCount: 900, waterSegments: 64, pixelRatio: 1.5 },
  low: { shadows: false, rainCount: 350, waterSegments: 40, pixelRatio: 1 },
};
export const settings = { quality: 'high', hour: START_HOUR, fastTime: false };
export const colors = {
  sand: '#c9b68a', grass: '#7e9464', grassDark: '#546e52', rock: '#7d8581',
  wall: '#eadcc3', roof: '#ab6452', wood: '#85664d', darkWood: '#514b40',
  iron: '#34434a', gold: '#ffcc80', water: '#286e79', path: '#c9b891',
};
export const layout = {
  cottage: { x: -7, z: 3 }, lighthouse: { x: 9, z: -8 },
  boathouse: { x: -7, z: 15 }, boat: { x: -0.2, z: 23.2 },
  spawn: { x: -1, z: 10 },
};
