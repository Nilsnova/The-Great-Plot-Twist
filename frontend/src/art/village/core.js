// The walk-through Heart uses a shared scale across intact, damaged and rubble art.
export const sheets = {core: {file: 'village/home-heart-v2.png', width: 1312, height: 1199}};
const fitBounds = [281, 603, 281, 16];
const frame = (rect, sourceFoot) => ({sheet: 'core', rect, sourceFoot, logical: [128, 128, 12], fitBounds});
export const frames = {
  island_core: frame([55, 0, 543, 614], [271, 598]),
  island_core_damaged: frame([709, 0, 547, 619], [273, 603]),
  island_core_broken: frame([54, 917, 562, 248], [281, 232]),
};
