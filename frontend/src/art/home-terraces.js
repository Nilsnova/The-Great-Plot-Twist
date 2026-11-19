// Low sandstone shelves painted inside the original coast, clear of the northern landing.
import {ellipse, line, linear, poly, stroke} from './paint.js';
import {paintMaterial} from './village/terrain-materials.js';

// Two-degree coast samples. The central gap spans the full Smugglers landing spread.
const SHELVES = [
  [106, 122, .976, .110], [112, 121, .886, .082],
  [146, 157, .976, .108], [148, 155, .881, .084],
  [158, 170, .976, .085],
];
const STONE = ['#caa178', '#d6b181', '#b78a63', '#c19a73', '#cfaa7a'];
const between = (upper, lower) => poly([...upper, ...lower.slice().reverse()], 0);
const onFace = ([x, y], [otherX, otherY], depth) => [x + (otherX - x) * depth, y + (otherY - y) * depth];

function profiles(rows, first, last, inset, depth) {
  const crest = [], verge = [], foot = [], shade = [];
  for (let index = first; index <= last; index++) {
    const fraction = (index - first) / (last - first), extent = Math.sin(Math.PI * fraction) ** 1.1;
    const {x, y} = rows[index], relief = extent * (depth + Math.sin(index * 1.24) * .009);
    crest.push([x * inset, y * inset]);
    const turf = relief * (.28 + .042 * Math.cos(index * 1.46));
    const bank = drop => [x * (inset - drop * .45), y * (inset - drop)];
    verge.push(bank(turf));
    foot.push(bank(relief));
    const [shadeX, shadeY] = bank(relief * 1.43);
    shade.push([shadeX + extent * .15, shadeY]);
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
    c.fillStyle = linear(c, x, y, sx, sy, [[0, '#38452b76'], [.27, '#434d3144'], [1, '#454d3400']]);
    c.fill(between(verge, shade));
    for (let i = 0; i < verge.length - 1; i++) {
      const [x, y] = verge[i];
      const [right, bottom] = foot[i + 1];
      c.fillStyle = linear(c, x, y, right + .21, bottom, [
        [0, '#f3d5a2'], [.17, STONE[(i * 3 + first) % STONE.length]], [.76, '#a77f5c'], [1, '#705640'],
      ]);
      c.fill(poly([verge[i], verge[i + 1], foot[i + 1], foot[i]], .035));
      if ((i + first) % 4 !== 0) {
        const band = line([onFace(verge[i], foot[i], .53 + .09 * Math.sin(i)),
          onFace(verge[i + 1], foot[i + 1], .56 + .08 * Math.sin(i + 1))]);
        stroke(c, band, '#70563c', .045, .64);
        c.save(); c.translate(0, -.042); stroke(c, band, '#eed0a0', .04, .58); c.restore();
      }
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
    const [crestX, crestY] = crest[middle], [edgeX, edgeY] = verge[middle];
    c.fillStyle = linear(c, crestX, crestY, edgeX, edgeY, [[0, '#b5cd6d'], [.48, '#85aa49'], [1, '#578040']]);
    c.fill(between(crest, verge));
    stroke(c, line(crest), '#d1e189', .085, .81);
    stroke(c, line(verge), '#426433', .092, .81);
    stroke(c, line(foot), '#665d3f', .054, .49);
    // Small chips at the foot catch the same light as the face and stay painted into the ground.
    for (let i = 2; i < foot.length - 2; i += 4) {
      const [chipX, chipY] = onFace(foot[i], shade[i], .39);
      c.fillStyle = '#4a523a43'; c.fill(ellipse(chipX + .06, chipY + .053, .155, .075));
      c.fillStyle = '#bda47c'; c.fill(poly([[chipX - .12, chipY], [chipX - .06, chipY - .093],
        [chipX + .07, chipY - .082], [chipX + .12, chipY]], .025));
      c.fillStyle = '#9d926b'; c.fill(ellipse(chipX + .20, chipY + .065, .052, .035));
    }
  }
  c.restore();
}
