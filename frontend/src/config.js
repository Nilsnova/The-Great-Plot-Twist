// Shared art direction and layout. World and player modules read these values.
export const SEA_LEVEL = 0;
export const LAND_LIMIT = 0.38;
export const PLAYER_RADIUS = 0.34;
export const START_HOUR = 10.4;
export const QUALITY = {
  high: { shadows: false, rainCount: 900, waveMarks: 160, pixelRatio: 1.25 },
  low: { shadows: false, rainCount: 350, waveMarks: 80, pixelRatio: 1 },
};
export const settings = { quality: 'high', hour: START_HOUR, fastTime: false };
export const colors = {
  sand: '#e1d3a3', grass: '#c3cb96', grassDark: '#92ad78', rock: '#a4b39d',
  wall: '#eee2bc', roof: '#b9664e', wood: '#cbb282', darkWood: '#846f51',
  iron: '#42655e', gold: '#f3d58c', water: '#86aaa2', path: '#e8d9ad',
};
export const layout = {
  cottage: { x: -7, z: 3 }, lighthouse: { x: 9, z: -8 },
  boathouse: { x: -7, z: 15 }, boat: { x: -0.2, z: 23.2 },
  spawn: { x: -1, z: 10 },
};
