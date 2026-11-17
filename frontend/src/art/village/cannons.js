// Original shaded cannon family. Image pixels are separate from the 2×2 gameplay footprint.
export const sheets = {
  cannons: {file: 'village/cannons-v1.png', width: 1536, height: 1024},
};

// Every pose of a level shares one root-relative fitting box. Shorter clean
// wreck crops retain their true foot while virtual headroom preserves scale.
const levels = [
  {crop: [123, 165, 109, 11], feet: [[165, 253], [165, 516], [165, 783], [165, 997]]},
  {crop: [129, 184, 121, 11], feet: [[454, 251], [454, 512], [454, 781], [454, 998]]},
  {crop: [139, 206, 130, 10], feet: [[754, 251], [754, 515], [754, 782], [754, 999]]},
  {crop: [148, 222, 131, 11], feet: [[1058, 253], [1058, 518], [1058, 785], [1058, 1000]]},
  {crop: [140, 240, 147, 11], feet: [[1362, 252], [1362, 515], [1362, 785], [1362, 1003]]},
];
const states = ['intact', 'fire', 'damaged', 'broken'];
const BROKEN_ROW_TOP = 800;
export const frames = {};
for (let index = 0; index < levels.length; index++) {
  const {crop: [left, top, right, bottom], feet} = levels[index];
  const suffix = index ? `-l${index + 1}` : '';
  for (let row = 0; row < states.length; row++) {
    const state = states[row], [x, y] = feet[row];
    const actualTop = state === 'broken' ? Math.min(top, y - BROKEN_ROW_TOP) : top;
    const id = state === 'fire' ? `island-cannon-fire${suffix}`
      : `island-cannon${suffix}${state === 'intact' ? '' : `-${state}`}`;
    frames[id] = {sheet: 'cannons', rect: [x - left, y - actualTop, left + right, actualTop + bottom],
      logical: [56, 48, 7], sourceFoot: [left, actualTop], fitBounds: [left, top, right, bottom]};
  }
}
