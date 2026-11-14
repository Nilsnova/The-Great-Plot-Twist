// Original T5 league shields and the captain statue (its stages from T45), using the island's cartoon paint kit.
// Used by: island/decorations.js (the island scene) and island/progression.js (the Leaderboard card).
import {ellipse, part, poly, rect, shadow} from './paint.js';

// Name, trim and shield face. Colors reuse the island's wood, stone, brass and captain palette.
const RANKS = [
  ['unranked', '#a9a39a', '#3e4250'], ['wood', '#c98a4e', '#7a4a2a'],
  ['bronze', '#c98a4e', '#694335'], ['silver', '#cfc8bb', '#3e5463'],
  ['gold', '#f2c14e', '#66502f'], ['crystal', '#b79be8', '#53406e'],
  ['master', '#f2c14e', '#3e4250'], ['champion', '#f2c14e', '#963e36'],
  ['titan', '#d4b3ed', '#593f7c'], ['legend', '#f2c14e', '#356784'],
  ['mythic', '#f2c14e', '#246c69'], ['crowned', '#ffcf3f', '#2f56b0'],
];
export function waveRank(wave) {
  const index = Number.isSafeInteger(wave) && wave > 0 ? Math.min(11, Math.floor(wave / 10) + 1) : 0;
  const [name, trim, face] = RANKS[index];
  return {index, name, trim, face};
}

function wings(c, rank) {
  if (rank.index < 3) return;
  const feathers = Math.min(3, rank.index - 2);
  for (const side of [-1, 1]) {
    c.save(); c.translate(32, 0); c.scale(side, 1);
    for (let n = 0; n < feathers; n++) {
      const top = 21 + n * 10;
      part(c, poly([[17, top + 3], [30, top - 5], [26, top + 9], [17, top + 17]], 1), rank.trim);
    }
    c.restore();
  }
}

export function drawWaveBadge(c, wave) {
  const rank = waveRank(wave);
  shadow(c, 32, 76, 17, 4);
  part(c, rect(29, 55, 6, 20, 1), '#7a4a2a');
  if (rank.index >= 9) part(c, ellipse(32, 36, 25, 28), rank.trim);
  wings(c, rank);
  part(c, poly([[12, 16], [52, 16], [50, 47], [32, 66], [14, 47]], 2), rank.trim, {depth: 2.5});
  part(c, poly([[17, 22], [47, 22], [45, 45], [32, 59], [19, 45]], 1), rank.face);
  if (rank.index === 1) for (const x of [25, 38]) part(c, rect(x, 24, 1, 23), '#a8693a', {line: false, shade: false});
  if (rank.index >= 2) for (const x of [17, 47]) part(c, ellipse(x, 20, 1.8), '#fff2ce', {width: .6});
  if (rank.index >= 5) part(c, poly([[32, 5], [39, 13], [32, 21], [25, 13]], 1), rank.trim);
  if (rank.index === 6 || rank.index === 10) for (const x of [8, 56])
    part(c, poly([[x, 32], [x + 4, 38], [x, 44], [x - 4, 38]], 1), rank.trim);
  if (rank.index >= 7) part(c, poly([[20, 15], [17, 4], [26, 10], [32, 3], [38, 10], [47, 4], [44, 15]], 1), rank.trim);
  if (rank.index === 8) for (const x of [22, 42]) part(c, ellipse(x, 13, 2), '#fff2ce');
  if (rank.index >= 9) part(c, ellipse(32, 62, 3), '#fff2ce', {width: .7});
  if (rank.index === 11) part(c, poly([[19, 14], [17, 1], [26, 7], [32, 0], [38, 7], [47, 1], [45, 14]], .7), '#ffcf3f');
  c.fillStyle = '#fff2ce'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold ${wave >= 100 ? 20 : 26}px sans-serif`; c.fillText(String(wave), 32, 38);
}

// T45: the captain statue grows with the island's best won wave. Cosmetic only (decision D046).
// Stage 1 is the T5 bronze statue unchanged; each later stage adds one ornament and a new metal.
export const STATUE_STAGES = [
  {wave: 25, name: 'bronze', metal: '#ad945b'},
  {wave: 50, name: 'silver', metal: '#b9bec4'},
  {wave: 75, name: 'gold', metal: '#e0b340'},
  {wave: 100, name: 'crowned', metal: '#f2c14e'},
];
export function statueStage(wave) {
  const best = Number.isSafeInteger(wave) ? wave : 0;
  const reached = STATUE_STAGES.filter(stage => best >= stage.wave);
  if (!reached.length) return {index: 0, wave: 0, name: 'none', metal: null};
  return {index: reached.length, ...reached[reached.length - 1]};
}

export function drawWaveStatue(c, index = 1) {
  const stage = STATUE_STAGES[Math.min(4, Math.max(1, index)) - 1];
  const metal = stage.metal;
  shadow(c, 24, 61, 20, 4);
  part(c, rect(5, 51, 38, 10, 2), '#a9a39a');
  part(c, rect(10, 44, 28, 9, 1), '#cfc8bb');
  if (index >= 3) { // gold and crowned: a red pennant on a pole beside the plinth
    part(c, rect(1, 6, 2, 46, 1), '#7a4a2a');
    part(c, poly([[3, 7], [13, 10], [3, 15]], 1), '#963e36');
  }
  part(c, rect(16, 31, 7, 14, 1), metal);
  part(c, rect(25, 31, 7, 14, 1), metal);
  part(c, poly([[15, 20], [33, 20], [37, 34], [11, 34]], 2), metal);
  if (index >= 2) part(c, poly([[34, 22], [44, 3], [46, 4], [37, 24]], .6), '#e8eef2'); // raised cutlass
  part(c, ellipse(24, 17, 8, 9), metal);
  if (index >= 4) part(c, poly([[15, 11], [14, 2], [19, 6], [24, 0], [29, 6], [34, 2], [33, 11]], 1), '#ffcf3f'); // crown
  else part(c, poly([[10, 12], [17, 4], [24, 8], [31, 4], [38, 12]], 1), metal); // tricorn hat
  c.fillStyle = '#2b1d1a'; c.textAlign = 'center';
  c.font = 'bold 8px sans-serif'; c.fillText(String(stage.wave), 24, 59);
}
