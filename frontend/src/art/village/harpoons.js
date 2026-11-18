// Original shaded harpoon artwork; native pixels never alter the paid 2×2 footprint.
// Coordinator-approved visual revision56×48/anchor7 matches the shaded defense families.
export const sheets = {harpoons: {file: 'village/harpoons-v1.png', width: 1536, height: 1024}};

// Per-tier virtual bounds preserve scale when the firing puff or low rubble uses a different crop.
const levels = [
  {fit: [94, 176, 110, 7], states: [
    [[87, 63, 185, 182], [75, 176]],
    [[87, 327, 169, 157], [75, 151]],
    [[85, 563, 171, 164], [77, 157]],
    [[68, 852, 187, 84], [94, 78]],
  ]},
  {fit: [95, 176, 104, 7], states: [
    [[381, 62, 186, 182], [82, 176]],
    [[384, 327, 179, 157], [79, 151]],
    [[380, 560, 175, 166], [83, 159]],
    [[368, 848, 193, 88], [95, 82]],
  ]},
  {fit: [100, 178, 103, 7], states: [
    [[683, 61, 181, 184], [80, 178]],
    [[683, 323, 183, 162], [80, 156]],
    [[676, 560, 176, 167], [87, 160]],
    [[663, 846, 196, 91], [100, 85]],
  ]},
  {fit: [99, 177, 110, 7], states: [
    [[982, 61, 187, 183], [82, 177]],
    [[984, 323, 190, 161], [80, 155]],
    [[978, 559, 180, 168], [86, 161]],
    [[965, 847, 199, 88], [99, 82]],
  ]},
  {fit: [96, 178, 109, 7], states: [
    [[1279, 61, 190, 184], [85, 178]],
    [[1280, 320, 193, 165], [84, 159]],
    [[1277, 557, 186, 170], [87, 163]],
    [[1268, 842, 201, 96], [96, 90]],
  ]},
];
const states = ['intact', 'fire', 'damaged', 'broken'];
export const frames = {};
for (let index = 0; index < levels.length; index++) {
  const suffix = index ? `-l${index + 1}` : '';
  levels[index].states.forEach(([rect, sourceFoot], row) => {
    const state = states[row];
    const id = state === 'fire' ? `island-harpoon-fire${suffix}`
      : `island-harpoon${suffix}${state === 'intact' ? '' : `-${state}`}`;
    frames[id] = {sheet: 'harpoons', rect, sourceFoot, logical: [56, 48, 7], fitBounds: levels[index].fit};
  });
}
