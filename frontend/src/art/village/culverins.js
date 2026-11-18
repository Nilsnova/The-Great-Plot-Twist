// Original shaded long-gun family; source pixels never change the paid2×2 footprint.
// Coordinator-approved visual dimensions56×48/anchor7 match cannon/mortar volume.
export const sheets = {culverins: {file: 'village/culverins-v1.png', width: 1536, height: 1024}};
const levels = [
  {fit: [112, 180, 119, 9], states: [
    [[52, 67, 198, 184], [95, 175]],
    [[51, 318, 214, 188], [96, 179]],
    [[52, 571, 198, 189], [95, 180]],
    [[35, 848, 231, 141], [112, 132]],
  ]},
  {fit: [123, 178, 129, 9], states: [
    [[342, 67, 214, 184], [106, 175]],
    [[341, 318, 218, 187], [107, 178]],
    [[342, 571, 217, 187], [106, 178]],
    [[325, 848, 252, 139], [123, 130]],
  ]},
  {fit: [113, 179, 142, 9], states: [
    [[622, 67, 224, 180], [113, 171]],
    [[623, 314, 223, 188], [112, 179]],
    [[623, 571, 221, 186], [112, 177]],
    [[623, 844, 254, 149], [112, 140]],
  ]},
  {fit: [126, 191, 132, 9], states: [
    [[925, 62, 238, 192], [117, 183]],
    [[925, 308, 238, 200], [117, 191]],
    [[925, 567, 237, 194], [117, 185]],
    [[916, 842, 258, 147], [126, 138]],
  ]},
  {fit: [133, 185, 149, 9], states: [
    [[1226, 64, 263, 186], [132, 177]],
    [[1226, 312, 263, 194], [132, 185]],
    [[1227, 571, 261, 188], [131, 179]],
    [[1225, 847, 282, 145], [133, 136]],
  ]},
];
const states = ['intact', 'fire', 'damaged', 'broken'];
export const frames = {};
for (let index = 0; index < levels.length; index++) {
  const suffix = index ? `-l${index + 1}` : '';
  levels[index].states.forEach(([rect, sourceFoot], row) => {
    const state = states[row];
    const id = state === 'fire' ? `island-culverin-fire${suffix}`
      : `island-culverin${suffix}${state === 'intact' ? '' : `-${state}`}`;
    frames[id] = {sheet: 'culverins', rect, sourceFoot, logical: [56, 48, 7], fitBounds: levels[index].fit};
  });
}
