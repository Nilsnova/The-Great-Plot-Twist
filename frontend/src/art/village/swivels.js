// Original shaded swivel nests. Native image pixels do not alter the paid 2×2 footprint.
// Coordinator-approved visual box56×48/anchor7 matches the supplied cannon/mortar families.
export const sheets = {swivels: {file: 'village/swivels-v1.png', width: 1536, height: 1024}};

// Common root-relative bounds keep the short broken state and localized firing/smoke at one scale.
const levels = [
  {fit: [130, 239, 135, 6], states: [
    [[41, 58, 216, 192], [108, 186]],
    [[41, 315, 243, 191], [108, 185]],
    [[38, 532, 223, 245], [112, 239]],
    [[25, 873, 260, 127], [130, 121]],
  ]},
  {fit: [147, 244, 134, 6], states: [
    [[334, 52, 228, 202], [114, 196]],
    [[334, 309, 248, 200], [114, 194]],
    [[328, 531, 242, 250], [121, 244]],
    [[309, 863, 265, 139], [147, 133]],
  ]},
  {fit: [146, 245, 144, 6], states: [
    [[627, 51, 240, 207], [120, 201]],
    [[627, 309, 249, 204], [120, 198]],
    [[612, 531, 267, 251], [135, 245]],
    [[606, 857, 290, 147], [146, 141]],
  ]},
  {fit: [141, 244, 155, 6], states: [
    [[931, 31, 253, 227], [126, 221]],
    [[931, 287, 264, 227], [126, 221]],
    [[928, 533, 257, 250], [129, 244]],
    [[916, 819, 296, 186], [141, 180]],
  ]},
  {fit: [141, 240, 148, 6], states: [
    [[1237, 28, 267, 230], [134, 224]],
    [[1238, 280, 275, 233], [133, 227]],
    [[1230, 535, 279, 246], [141, 240]],
    [[1233, 812, 288, 194], [140, 188]],
  ]},
];
const states = ['intact', 'fire', 'damaged', 'broken'];
export const frames = {};
for (let index = 0; index < levels.length; index++) {
  const suffix = index ? `-l${index + 1}` : '';
  levels[index].states.forEach(([rect, sourceFoot], row) => {
    const state = states[row];
    const id = state === 'fire' ? `island-swivel-fire${suffix}`
      : `island-swivel${suffix}${state === 'intact' ? '' : `-${state}`}`;
    frames[id] = {sheet: 'swivels', rect, sourceFoot, logical: [56, 48, 7], fitBounds: levels[index].fit};
  });
}
