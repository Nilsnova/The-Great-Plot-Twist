// Original shaded mortar artwork; native pixels never alter the paid 2×2 footprint.
// Coordinator-approved visual revision56×48/anchor7 matches the shaded cannon family.
export const sheets = {mortars: {file: 'village/mortars-v1.png', width: 1536, height: 1024}};

// Per-tier virtual bounds preserve scale when the firing puff or low rubble uses a different crop.
const levels = [
  {fit: [101, 161, 79, 6], states: [
    [[110, 111, 135, 134], [69, 128]],
    [[111, 339, 134, 167], [68, 161]],
    [[111, 600, 136, 137], [68, 131]],
    [[78, 854, 180, 118], [101, 112]],
  ]},
  {fit: [99, 167, 94, 6], states: [
    [[392, 100, 151, 144], [77, 138]],
    [[393, 330, 149, 173], [76, 167]],
    [[394, 585, 147, 151], [75, 145]],
    [[370, 845, 193, 128], [99, 122]],
  ]},
  {fit: [107, 180, 96, 6], states: [
    [[674, 84, 177, 164], [90, 158]],
    [[675, 323, 176, 186], [89, 180]],
    [[675, 573, 176, 165], [89, 159]],
    [[657, 839, 203, 134], [107, 128]],
  ]},
  {fit: [110, 184, 95, 9], states: [
    [[974, 79, 179, 169], [91, 163]],
    [[975, 321, 178, 190], [90, 184]],
    [[975, 570, 177, 173], [90, 164]],
    [[955, 841, 205, 134], [110, 128]],
  ]},
  {fit: [110, 186, 102, 6], states: [
    [[1266, 67, 192, 183], [101, 177]],
    [[1269, 317, 190, 192], [98, 186]],
    [[1265, 567, 193, 173], [102, 167]],
    [[1257, 838, 212, 139], [110, 133]],
  ]},
];
const states = ['intact', 'fire', 'damaged', 'broken'];
export const frames = {};
for (let index = 0; index < levels.length; index++) {
  const suffix = index ? `-l${index + 1}` : '';
  levels[index].states.forEach(([rect, sourceFoot], row) => {
    const state = states[row];
    const id = state === 'fire' ? `island-mortar-fire${suffix}`
      : `island-mortar${suffix}${state === 'intact' ? '' : `-${state}`}`;
    frames[id] = {sheet: 'mortars', rect, sourceFoot, logical: [56, 48, 7], fitBounds: levels[index].fit};
  });
}
