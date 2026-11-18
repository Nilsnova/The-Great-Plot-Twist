// VIS-35: the existing walkable heart target, with a shared scale across damage states.
export const sheets = {core: {file: 'village/core-v1.png', width: 1254, height: 1254}};
const fitBounds = [281, 551, 282, 24];
const frame = (rect, sourceFoot) => ({sheet: 'core', rect, sourceFoot, logical: [128, 128, 12], fitBounds});
export const frames = {
  island_core: frame([42, 17, 542, 573], [271, 550]),
  island_core_damaged: frame([660, 16, 545, 574], [280, 551]),
  island_core_broken: frame([42, 954, 563, 248], [281, 224]),
};
