// Original shaded vegetation. Source pixels never change a logical foot or collider.
export const sheets = {
  nature: {file: 'village/nature-v1.png', width: 1536, height: 1024},
};

// Rectangles follow the actual authored layout, rather than an assumed equal grid.
// sourceFoot is the root/contact point relative to that rectangle, in native pixels.
export const frames = {
  oak: {sheet: 'nature', rect: [24, 132, 418, 431], logical: [80, 104, 8], sourceFoot: [197, 420]},
  pine: {sheet: 'nature', rect: [442, 74, 322, 489], logical: [80, 112, 8], sourceFoot: [158, 478]},
  birch: {sheet: 'nature', rect: [779, 144, 362, 419], logical: [80, 104, 8], sourceFoot: [145, 408]},
  'birch-tall': {sheet: 'nature', rect: [1149, 54, 369, 509], logical: [80, 104, 8], sourceFoot: [164, 498]},
  rock: {sheet: 'nature', rect: [53, 737, 337, 223], logical: [48, 36, 4], sourceFoot: [167, 209]},
  shrub: {sheet: 'nature', rect: [439, 739, 307, 221], logical: [40, 32, 4], sourceFoot: [152, 208]},
  flowers: {sheet: 'nature', rect: [813, 748, 284, 211], logical: [24, 24, 3], sourceFoot: [145, 198]},
  'grass-tuft': {sheet: 'nature', rect: [1177, 763, 303, 196], logical: [32, 32, 4], sourceFoot: [154, 183]},
};
