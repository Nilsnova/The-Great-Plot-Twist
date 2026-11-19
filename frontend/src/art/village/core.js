// Keep the walk-through Heart's entry axis and scale aligned across all three states.
export const sheets = {core: {file: 'village/home-heart-v3.png', width: 1312, height: 1199}};
const fitBounds = [263, 684, 340, 14];
const frame = (rect, sourceFoot) => ({sheet: 'core', rect, sourceFoot, logical: [128, 128, 12], fitBounds});
export const frames = {
  island_core: frame([27, 0, 603, 698], [263, 684]),
  island_core_damaged: frame([684, 0, 602, 698], [262, 684]),
  island_core_broken: frame([29, 896, 600, 289], [261, 275]),
};
