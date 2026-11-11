// Logical sprite geometry remains 16 pixels/world unit; detailed sources add texels.
import { storyDimensions } from './story-catalog.js';
import { festivalDimensions } from './festival-catalog.js';
import { pirateDimensions } from './pirate-catalog.js';
export const PIXELS_PER_UNIT = 16;
export const DETAIL_DENSITY = 4;
const dimensions = {
  cottage: [128, 128, 14], 'cottage-interior': [128, 128, 14], 'cottage-glow': [128, 128, 14],
  lighthouse: [96, 208, 16], boathouse: [96, 96, 8], birch: [80, 104, 8], pine: [80, 112, 8],
  oak: [80, 104, 8], 'birch-tall': [80, 104, 8],
  'grass-tuft': [32, 32, 4], fern: [32, 32, 4], reeds: [32, 40, 4], mushrooms: [32, 32, 4],
  rock: [48, 36, 4], shrub: [40, 32, 4], flowers: [24, 24, 3], sign: [32, 40, 3],
  jetty: [48, 112, 8], boat: [64, 40, 8], crate: [24, 24, 3], barrel: [24, 32, 3],
  'rope-coil': [32, 20, 3], lantern: [16, 24, 2], bench: [48, 32, 3], buoy: [24, 32, 3],
  driftwood: [40, 24, 3], gull: [24, 24, 3],
};
for (const view of ['explorer', 'explorer-back', 'explorer-side']) {
  dimensions[view] = [24, 32, 3];
  for (const step of [1, 2]) dimensions[`${view}-walk-${step}`] = [24, 32, 3];
}
const detailedIds = new Set(Object.keys(dimensions));
const staged = {
  'harbour-office': [128, 160, 14], 'harbour-beacon': [64, 128, 14],
  'signal-station': [112, 112, 12], 'ferry-pier': [96, 128, 8], sailboat: [96, 112, 10],
  'dark-schooner': [128, 112, 10], 'sealed-letter': [32, 32, 4], 'torn-page': [32, 32, 4],
  logbook: [32, 40, 4], compass: [32, 32, 4], 'brass-star': [24, 24, 4], 'beacon-fire': [32, 48, 4],
};
Object.assign(staged, {
  'fog-bank': [192,96,12], 'back-room': [96,96,8], 'low-tide-cave': [112,96,12], 'arena-gate': [112,96,12],
  'raid-arch': [112,112,12], 'watchtower-ruin': [80,144,12], reef: [96,64,8], 'salvage-yard': [144,112,12],
  jail: [112,112,12], 'market-hall': [144,128,12], 'prediction-kiosk': [80,96,12],
  'sports-pavilion': [144,128,12], cabin: [96,96,12], workshop: [112,112,12],
  greenhouse: [112,96,12], windmill: [112,160,14], 'notice-board': [48,64,6],
  'captains-table': [64,48,6], 'build-plot': [144,96,12], 'harbour-office-glow': [128,160,14],
});
Object.assign(staged, {
  'islet-empty-plot':[56,64,4], 'islet-locked-sign':[64,72,4],
  'islet-signal-station':[80,128,12], 'islet-signal-station-lit':[80,128,12],
});
Object.assign(staged, storyDimensions);
Object.assign(staged, festivalDimensions);
Object.assign(staged, pirateDimensions);
Object.assign(dimensions, staged);
export const pixelArt = Object.entries(dimensions).map(([id, [width, height, anchor]]) => ({
  id, file: `${id}.png`, width, height, visibility: id.startsWith('character-masked-captain') ? 'finale' : 'public', usage: Object.hasOwn(staged, id) ? 'library' : 'island', size: [width / 16, height / 16, anchor / height],
  ...(detailedIds.has(id) ? { detail: { file: `hd/${id}.png`, width: width * DETAIL_DENSITY, height: height * DETAIL_DENSITY } } : {}),
}));
export const pixelById = Object.fromEntries(pixelArt.map(item => [item.id, item]));
export const pixelArtIds = pixelArt.filter(item => item.usage === 'island').map(item => item.id);
export const pixelSizes = Object.fromEntries(pixelArt.map(item => [item.id, item.size]));
export const snapPixel = value => Math.round(value * PIXELS_PER_UNIT) / PIXELS_PER_UNIT;

// Original illustrated title, intentionally outside the world sprite preload.
export const titleBackdrop={file:'places/title.webp',width:1672,height:941,source:'scripts/hires_art/PROVENANCE.md'};
