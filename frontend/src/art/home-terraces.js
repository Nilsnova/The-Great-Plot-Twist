// Low sandstone shelves painted inside the original coast, clear of the northern landing.
import {line, linear, poly, stroke} from './paint.js';
import {paintMaterial} from './village/terrain-materials.js';

// Two-degree coast samples. The central gap spans the full Smugglers landing spread.
const SHELVES = [[106, 121, .083], [146, 155, .089], [158, 169, .064]];
const STONE = ['#bc9871', '#cda87d', '#b28d67', '#c39c73', '#bca17d'];
const between = (upper, lower) => poly([...upper, ...lower.slice().reverse()], 0);

function profiles(rows, first, last, depth) {
  const crest = [], verge = [], foot = [], shade = [];
  for (let index = first; index <= last; index++) {
    const fraction = (index - first) / (last - first), extent = Math.sin(Math.PI * fraction) ** .69;
    const {x, y} = rows[index], inset = extent * (depth + Math.sin(index * 1.45) * .007);
    crest.push([x * .976, y * .976]);
    verge.push([x * (.976 - inset * .23), y * (.976 - inset * .23)]);
    foot.push([x * (.976 - inset), y * (.976 - inset)]);
    shade.push([x * (.976 - inset * 1.35) + extent * .15, y * (.976 - inset * 1.37)]);
  }
  return {crest, verge, foot, shade};
}

export function paintHomeTerraces(c, rows, beach, materials) {
  c.save();
  c.clip(beach);
  for (const [first, last, depth] of SHELVES) {
    const {crest, verge, foot, shade} = profiles(rows, first, last, depth);
    c.fillStyle = '#40522f46';
    c.fill(between(verge, shade));
    for (let i = 0; i < verge.length - 1; i++) {
      const [x, y] = verge[i];
      const [right, bottom] = foot[i + 1];
      c.fillStyle = linear(c, x, y, right + .24, bottom, [
        [0, '#efd3a0'], [.18, STONE[(i * 3 + first) % STONE.length]], [.79, '#9f7c56'], [1, '#715b40'],
      ]);
      c.fill(poly([verge[i], verge[i + 1], foot[i + 1], foot[i]], 0));
      if ((i + first) % 3 === 0) {
        const [baseX, baseY] = foot[i];
        stroke(c, line([[x, y], [baseX + .085, y + (baseY - y) * .61], [baseX, baseY]]), '#664d37', .05, .64);
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
