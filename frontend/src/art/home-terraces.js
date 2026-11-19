// Low sandstone shelves painted inside the original coast, clear of the northern landing.
import {line, linear, poly, stroke} from './paint.js';
import {paintMaterial} from './village/terrain-materials.js';

// Two-degree coast samples. The central gap spans the full Smugglers landing spread.
const SHELVES = [
  [106, 122, .976, .088], [112, 121, .889, .067],
  [146, 157, .976, .091], [148, 155, .885, .070],
  [158, 170, .976, .071],
];
const STONE = ['#bc9871', '#cda87d', '#b28d67', '#c39c73', '#bca17d'];
const between = (upper, lower) => poly([...upper, ...lower.slice().reverse()], 0);

function profiles(rows, first, last, inset, depth) {
  const crest = [], verge = [], foot = [], shade = [];
  for (let index = first; index <= last; index++) {
    const fraction = (index - first) / (last - first), extent = Math.sin(Math.PI * fraction) ** .69;
    const {x, y} = rows[index], relief = extent * (depth + Math.sin(index * 1.45) * .007);
    crest.push([x * inset, y * inset]);
    verge.push([x * (inset - relief * .23), y * (inset - relief * .23)]);
    foot.push([x * (inset - relief), y * (inset - relief)]);
    shade.push([x * (inset - relief * 1.42) + extent * .15, y * (inset - relief * 1.43)]);
  }
  return {crest, verge, foot, shade};
}

export function paintHomeTerraces(c, rows, beach, materials) {
  c.save();
  c.clip(beach);
  for (const [first, last, inset, depth] of SHELVES) {
    const {crest, verge, foot, shade} = profiles(rows, first, last, inset, depth);
    const middle = Math.floor(foot.length / 2);
    const [x, y] = foot[middle], [sx, sy] = shade[middle];
    c.fillStyle = linear(c, x, y, sx, sy, [[0, '#41492d65'], [.32, '#41492d39'], [1, '#41492d00']]);
    c.fill(between(verge, shade));
    for (let i = 0; i < verge.length - 1; i++) {
      const [x, y] = verge[i];
      const [right, bottom] = foot[i + 1];
      c.fillStyle = linear(c, x, y, right + .24, bottom, [
        [0, '#f4dcac'], [.16, STONE[(i * 3 + first) % STONE.length]], [.67, '#ad8c64'], [1, '#796044'],
      ]);
      c.fill(poly([verge[i], verge[i + 1], foot[i + 1], foot[i]], 0));
      if ((i + first) % 3 === 0) {
        const [baseX, baseY] = foot[i], crack = line([[x, y],
          [baseX + .084, y + (baseY - y) * .59], [baseX, baseY]]);
        stroke(c, crack, '#6b523a', .074, .66);
        c.save(); c.translate(.054, 0); stroke(c, crack, '#e7c79d', .037, .46); c.restore();
      }
    }
    if (materials) {
      c.save();
      c.clip(between(verge, foot));
      c.globalCompositeOperation = 'soft-light';
      paintMaterial(c, materials, 'rock', {alpha: .28});
      c.restore();
    }
    c.fillStyle = '#7fab45';
    c.fill(between(crest, verge));
    stroke(c, line(crest), '#bedb75', .083, .88);
    stroke(c, line(verge), '#648f3a', .085, .92);
    stroke(c, line(foot), '#665d3f', .054, .49);
  }
  c.restore();
}
