// Register each centered stair tread to the same ground pin, with the original render scale.
export const sheets = {core: {file: 'village/home-heart-v5.png', width: 1312, height: 1199}};
const fitBounds = [276, 684, 340, 14];
const frame = (rect, sourceFoot) => ({sheet: 'core', rect, sourceFoot, logical: [128, 128, 12], fitBounds});
export const frames = {
  island_core: frame([14, 0, 616, 698], [276, 684]),
  island_core_damaged: frame([676, 0, 610, 698], [270, 684]),
  island_core_broken: frame([18, 868, 611, 317], [272, 303]),
};
