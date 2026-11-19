// Low sandstone shelves painted inside the original coast, clear of the northern landing.
import {ellipse, line, linear, poly, stroke} from './paint.js';
import {paintMaterial} from './village/terrain-materials.js';

// Two-degree coast samples, crest inset and exposed face depth in the painted ground's units.
// The north landing and the lower east beach remain clear between the shelves.
const SHELVES = [
  [106, 122, .974, 1.45], [112, 121, .883, 1.08],
  [146, 158, .976, 1.61], [148, 156, .886, 1.23],
  [158, 170, .973, 1.52], [160, 168, .887, 1.15],
];
const STONE = ['#cca179', '#d6b58c', '#b88962', '#c7a078', '#c59a73'];
const between = (upper, lower) => poly([...upper, ...lower.slice().reverse()], 0);
const onFace = ([x, y], [otherX, otherY], depth) => [x + (otherX - x) * depth, y + (otherY - y) * depth];

function profiles(rows, first, last, inset, depth) {
  const crest = [], verge = [], foot = [], shade = [];
  for (let index = first; index <= last; index++) {
    const fraction = (index - first) / (last - first);
    const shoulder = Math.min(1, 3.7 * Math.min(fraction, 1 - fraction));
    const extent = shoulder * shoulder * (3 - 2 * shoulder);
    const {x, y} = rows[index], relief = extent * (depth + Math.sin(index * 1.13) * .10);
    crest.push([x * inset, y * inset]);
    const turf = relief * (.29 + .042 * Math.cos(index * 1.46));
    // A true drop reads consistently as the coast turns, where the old radial inset became a thin strip.
    const bank = drop => [x * inset - Math.sign(x) * drop * .32, y * inset + drop];
    verge.push(bank(turf));
    foot.push(bank(relief));
    const [shadeX, shadeY] = bank(relief * 1.43);
    shade.push([shadeX + extent * .15, shadeY]);
  }
  return {crest, verge, foot, shade};
}

function paintRubble(c, x, y, scale) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.fillStyle = '#39492f53'; c.fill(ellipse(.08, .055, .435, .16));
  c.fillStyle = '#977956'; c.fill(poly([[-.37, .04], [-.32, -.18], [-.17, -.19], [-.08, .05]], .047));
  c.fillStyle = '#c4a47b'; c.fill(poly([[-.32, -.18], [-.27, -.23], [-.13, -.19], [-.17, -.11]], .036));
  c.fillStyle = '#896b4f'; c.fill(poly([[-.19, .057], [-.16, -.18], [.13, -.18], [.24, .08]], .055));
  c.fillStyle = '#d4b28b'; c.fill(poly([[-.16, -.18], [-.066, -.34], [.124, -.32], [.19, -.18], [.035, -.106]], .046));
  c.fillStyle = '#b59370'; c.fill(poly([[.12, -.02], [.28, -.11], [.37, -.045], [.40, .043], [.293, .106]], .046));
  c.fillStyle = '#6f8c43'; c.fill(poly([[.25, -.02], [.29, -.083], [.39, -.069], [.43, -.014], [.34, .027]], .04));
  stroke(c, [[-.10, -.29], [.08, -.30]], '#f4d9aa', .042, .78);
  c.restore();
}

export function paintHomeTerraces(c, rows, beach, materials) {
  c.save();
  c.clip(beach);
  for (const [first, last, inset, depth] of SHELVES) {
    const {crest, verge, foot, shade} = profiles(rows, first, last, inset, depth);
    const middle = Math.floor(foot.length / 2);
    const [x, y] = foot[middle], [sx, sy] = shade[middle];
    c.fillStyle = linear(c, x, y, sx, sy, [[0, '#35452d8a'], [.35, '#3e4e3447'], [1, '#454d3400']]);
    c.fill(between(verge, shade));
    const ledge = verge.map((point, index) => onFace(point, foot[index], .56 + .071 * Math.sin(index * 1.16)));
    for (let i = 0; i < verge.length - 1; i++) {
      const [x, y] = verge[i];
      const [right, bottom] = foot[i + 1];
      c.fillStyle = linear(c, x, y, right + .21, bottom, [
        [0, '#efd0a2'], [.17, STONE[(i * 3 + first) % STONE.length]], [.72, '#ac8561'], [1, '#765b45'],
      ]);
      c.fill(poly([verge[i], verge[i + 1], foot[i + 1], foot[i]], .035));
      const [ledgeX, ledgeY] = ledge[i];
      c.fillStyle = linear(c, ledgeX, ledgeY, right + .11, bottom, [[0, '#644a385f'], [.42, '#ac896023'], [1, '#62543d6e']]);
      c.fill(poly([ledge[i], ledge[i + 1], foot[i + 1], foot[i]], .03));
      if ((i + first) % 4 !== 0 && i > 0 && i < verge.length - 2) {
        const band = line([ledge[i], ledge[i + 1]]);
        stroke(c, band, '#604633', .057, .64);
        c.save(); c.translate(0, -.059); stroke(c, band, '#edd0a1', .045, .76); c.restore();
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
    c.fillStyle = linear(c, crestX, crestY, edgeX, edgeY, [[0, '#b8d66d'], [.40, '#89af4a'], [1, '#537d3b']]);
    c.fill(between(crest, verge));
    stroke(c, line(crest), '#d0e38c', .105, .85);
    stroke(c, line(verge), '#466333', .119, .87);
    stroke(c, line(foot), '#665d3f', .064, .56);
    // Rubble sits at a few shoulder bases, outside the beaches and painted flat into the grass.
    if (inset < .9) {
      const [chipX, chipY] = onFace(foot[middle + 1], shade[middle + 1], .61);
      paintRubble(c, chipX, chipY, first > 140 ? 1.19 : .78);
    } else {
      const [chipX, chipY] = onFace(foot[middle - 2], shade[middle - 2], .45);
      paintRubble(c, chipX, chipY, first > 140 ? .9 : .65);
    }
  }
  c.restore();
}
