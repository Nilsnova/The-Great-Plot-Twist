// The active original pixel kit. One world unit is 16 native art pixels.
export const PIXELS_PER_UNIT = 16;
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
export const pixelArt = Object.entries(dimensions).map(([id, [width, height, anchor]]) => ({
  id, file: `${id}.png`, width, height, size: [width / 16, height / 16, anchor / height],
}));
export const pixelById = Object.fromEntries(pixelArt.map(item => [item.id, item]));
export const pixelArtIds = pixelArt.map(item => item.id);
export const pixelSizes = Object.fromEntries(pixelArt.map(item => [item.id, item.size]));
export const snapPixel = value => Math.round(value * PIXELS_PER_UNIT) / PIXELS_PER_UNIT;
