// The island's ground in the clean cartoon style, painted at runtime instead of the old 1024 x 768
// pixel backdrop: a warm sand beach, a soft-edged meadow with a darker rim, sandy paths where the
// spots and the cabin stand (TOWER-DEFENSE.md §2), flowers and grass strokes. It covers the same
// 64 x 48 world units as the backdrop. Alpha is the decorative cliff-base/foam silhouette; walking
// and placement retain the separate analytic top in surfaces.js (D062).
import {surfaceClass, surfaces} from '../world/places/surfaces.js';
import {WALL_PERIMETER_CELLS} from '../island/wall-perimeter.js';
import {LEGACY_DEPTH} from '../world/projection.js';
import {canvas, ellipse, linear, poly, radial, stroke} from './paint.js';
import {APPROACH_DEPTH, cliffProfile, paintCliffFaces, paintGrassRim} from './coast-cliffs.js';
import {paintShorePockets, paintTerraceFeet} from './shore-pockets.js';
import {materialRect, meadowScale, mirroredGrassPattern, paintMaterial, pathMaterialMask} from './village/terrain-materials.js';

const SIZE = {width: 64, height: 48};
// Paths of each island (logical x/z, a polyline each) and small clearings [x, z, radius].
const PATHS = {
  home_islet: {lines: [[[0, -15], [0, -5.5], [0, 7.5], [.6, 14], [1.6, 21]], [[-13, -5.5], [13, -5.5]], [[-11, 7.5], [12, 7.5]], [[0, 11], [8.5, 12.6]]],
    clearings: [[0, -14, 3.2], [-8, 6.6, 3.4], [8.5, 12.4, 2.4], [7, -6, 2.6], [-8, -6, 2.6]]},
};
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const PATH_WIDTH = 2.2;
const PAVING_WIDTH = 1.5;
// Short paved approaches meet the existing arsenal and tech hub doorways.
const SERVICE_WALKS = [
  [[-5.16, -10.75], [-5.16, -5.48]],
  [[8.14, -11.62], [9.26, -8.12], [9.26, -5.5]],
];

function meadowEdge(angle) {
  // The north Smugglers beach widens between the terrace shelves, like the three naval beaches.
  const north = Math.abs(angle - Math.PI * 1.5);
  const inward = Math.max(0, Math.min(1, (north - Math.PI / 9) / (Math.PI / 12)));
  return Math.min(meadowScale(angle), .865 + .12 * inward * inward * (3 - 2 * inward));
}

const coastRadius = (angle, seed) => 1 + .055 * Math.sin(angle * 5 + seed) + .035 * Math.cos(angle * 7);
const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function wallGrassEdge(surface, meadow) {
  const shoulders = WALL_PERIMETER_CELLS.map(({x, z}) => {
    const angle = Math.atan2(z / surface.rz, x / surface.rx);
    let radius = 0, width = 0;
    // The artwork's plinth is narrower than the protected 2-by-2 placement clearance.
    for (const dx of [-.58, .58]) for (const dz of [-.58, .58]) {
      const nx = (x + dx) / surface.rx, nz = (z + dz) / surface.rz;
      const corner = Math.atan2(nz, nx);
      radius = Math.max(radius, Math.hypot(nx, nz) / coastRadius(corner, surface.seed));
      width = Math.max(width, angleDistance(angle, corner));
    }
    return {angle, width, radius: Math.min(.96, radius + .009)};
  });
  function neededRadius(angle) {
    const edge = meadow(angle);
    let radius = edge;
    for (const shoulder of shoulders) {
      const fade = Math.max(0, Math.min(1, 1 - (angleDistance(angle, shoulder.angle) - shoulder.width) / .10));
      radius = Math.max(radius, edge + (shoulder.radius - edge) * fade * fade * (3 - 2 * fade));
    }
    return radius;
  }
  // Blend neighbouring footings into one grass edge. Fill the small notches between
  // square pads first, then soften the end of each run into the existing meadow.
  const count = 180, step = Math.PI * 2 / count;
  const sample = (list, index) => list[(index + count) % count];
  const nearby = (list, index) => [-3, -2, -1, 0, 1, 2, 3].map(offset => sample(list, index + offset));
  const measured = Array.from({length: count}, (_, index) => neededRadius(index * step));
  const expanded = measured.map((_, index) => Math.max(...nearby(measured, index)));
  const joined = expanded.map((_, index) => Math.min(...nearby(expanded, index)));
  const smooth = joined.map((value, index) =>
    (sample(joined, index - 2) + 2 * sample(joined, index - 1) + 3 * value +
      2 * sample(joined, index + 1) + sample(joined, index + 2)) / 9);
  return angle => {
    const at = angle / step, first = Math.floor(at), progress = at - first;
    const radius = sample(smooth, first) * (1 - progress) + sample(smooth, first + 1) * progress;
    return Math.max(meadow(angle), radius);
  };
}

function paintSandWaterline(c, rim) {
  const segments = rim.length - 1;
  for (let i = 0; i < segments; i += 3) {
    const {x, y, depth} = rim[i];
    const previous = rim[(i + segments - 1) % segments], next = rim[(i + 1) % segments];
    // The north cove opens onto the water behind the island. Elsewhere the cliff drop
    // determines how much of the top the tide can appear to reach.
    const north = Math.abs(i - segments * .75);
    const exposure = Math.max(0, 1 - (depth - APPROACH_DEPTH) / 1.25, 1 - Math.max(0, north - 7) / 8);
    if (exposure < .035) continue;
    const tangent = Math.atan2(next.y - previous.y, next.x - previous.x);
    const swell = .5 + .28 * Math.sin(i * .31 + 1.2) + .22 * Math.cos(i * .71);
    c.save(); c.globalAlpha *= exposure;
    // A narrow scalloped stain where the water darkens the sand.
    const wet = .993 - .009 * swell;
    c.translate(x * wet, y * wet); c.rotate(tangent); c.scale(1.37 + swell * .81, .40 + swell * .42);
    c.fillStyle = radial(c, 0, 0, 1,
      [[0, '#86674e94'], [.37, '#a67c595b'], [.72, '#b6926c2b'], [1, '#b6926c00']]);
    c.fill(ellipse(0, 0, 1));
    c.restore();

    const dry = .953 - .012 * swell;
    c.save(); c.globalAlpha *= exposure;
    c.translate(x * dry, y * dry); c.rotate(tangent); c.scale(1.52 + swell * .61, .38 + swell * .20);
    c.fillStyle = radial(c, 0, 0, 1, [[0, '#ffe9aa50'], [.43, '#ffdd9b37'], [1, '#ffdd9b00']]);
    c.fill(ellipse(0, 0, 1));
    c.restore();
  }
}

function paintBeachDetails(c, beach, rim, materials) {
  c.save();
  c.clip(beach);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = .88;
  c.fillStyle = linear(c, -16, -13, 15, 13, [[0, '#fff0bf83'], [.40, '#fbda9f38'], [.73, '#d2a97508'], [1, '#926d583d']]);
  c.fill(beach);
  paintSandWaterline(c, rim);
  // Rocky shoulders shade the sand at their feet. The four open approaches keep a warm centre.
  for (let i = 2; i < rim.length - 1; i += 5) {
    const {x, y, depth} = rim[i];
    if (depth < 1.35 || Math.abs(i - 135) < 13) continue;
    const reach = .82 + .27 * depth;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    c.save(); c.translate(.978 * x, .978 * y); c.rotate(angle); c.scale(1, .61);
    c.fillStyle = radial(c, 0, 0, reach, [[0, '#78624f68'], [.35, '#9977593e'], [.72, '#a3846325'], [1, '#a3846300']]);
    c.fill(ellipse(0, 0, reach));
    c.restore();
  }
  // Scattered ridges and warm highlights stay in the dry top between the water and turf.
  const texture = seeded(31507);
  for (let i = 0; i < 48; i++) {
    const index = Math.floor(texture() * (rim.length - 1)), {x, y} = rim[index];
    const inset = .899 + texture() * .067, at = [x * inset, y * inset];
    const width = .25 + texture() * .47, angle = Math.atan2(y, x) + Math.PI / 2;
    c.fillStyle = i % 3 ? '#fff1c15a' : '#9263423e';
    c.fill(ellipse(...at, width, .043 + texture() * .032, angle));
    if (i % 5 === 0) {
      c.fillStyle = '#976d5348'; c.fill(ellipse(at[0] + .17, at[1] - .095, .067, .045));
    }
  }
  if (materials) paintMaterial(c, materials, 'sand', {alpha: .10});
  paintShorePockets(c, rim, materials);
  c.restore();
}

function paintTurfBevel(c, coast, meadow, grassRadius) {
  c.save();
  c.clip(meadow);
  c.globalCompositeOperation = 'source-atop';
  const curve = angle => .023 + .021 * (.5 + .5 * Math.sin(angle * 6 + .5)) + .009 * Math.cos(angle * 13);
  c.fillStyle = linear(c, -17, -13, 14, 11, [[0, '#5676390d'], [.52, '#44693811'], [1, '#3d53321a']]);
  for (const width of [1.58, 1.39, 1.13, .92, .70, .47]) {
    const band = new Path2D(meadow);
    band.addPath(coast(angle => grassRadius(angle) - width * curve(angle), .012, 3));
    c.fill(band, 'evenodd');
  }
  // Warm soil shows below the sunlit grass on the same rounded cut.
  const soil = coast(angle => grassRadius(angle) - curve(angle) * .14, .012, 3);
  stroke(c, soil, linear(c, -16, -14, 13, 12, [[0, '#7185454b'], [.48, '#6d6d3d77'], [1, '#584c32a2']]), .19);
  const crest = coast(angle => grassRadius(angle) - curve(angle) * .36, .012, 3);
  stroke(c, crest, linear(c, -16, -14, 13, 12, [[0, '#dceba6a5'], [.46, '#c8d58285'], [1, '#91a25338']]), .11, .92);
  c.restore();
}

const PAVERS = [
  ['#dbc9a3', '#aa9475', '#f2e1b9'], ['#decfa9', '#b7a285', '#f6e7c6'],
  ['#ceb98f', '#9d8a67', '#e9d3a7'], ['#d7ba91', '#ac8c65', '#f1d2a8'],
  ['#d5c6a5', '#ac9b7e', '#efdfbf'], ['#ccbda0', '#9b8e76', '#e7d7b9'],
];
const WEATHERED_PAVERS = [
  ['#dbc49b', '#b49a74', '#f1dfb4'], ['#dfcba6', '#b69f7e', '#f2e0bb'],
  ['#c9b393', '#a78e6d', '#e3cea7'], ['#d8bc92', '#b19a74', '#efd9aa'],
  ['#d4c3a6', '#b29a80', '#e8d9b6'], ['#d6c09b', '#b29b77', '#eddbb4'],
];
// Individual stone faces cut from the sandstone sheet. Its grouted seams never cross a drawn slab.
const PAVER_FACES = [[.026, .024, .107, .047], [.193, .025, .112, .046], [.364, .029, .106, .047],
  [.563, .021, .106, .047], [.725, .025, .106, .047], [.875, .026, .094, .047]];

// Measure distance inside the existing capsule strokes and octagonal aprons for edge wear.
// This only colours the stone. The exact path mask still clips every pass.
function pavingClearance(paths) {
  const segments = [];
  for (const [lane, points] of paths.lines.entries()) {
    const radius = (paths.widths?.[lane] ?? PAVING_WIDTH) / 2;
    for (let i = 1; i < points.length; i++) {
      const [x, z] = points[i - 1], [endX, endZ] = points[i];
      const y = z * LEGACY_DEPTH, dx = endX - x, dy = endZ * LEGACY_DEPTH - y;
      segments.push({x, y, dx, dy, radius, lengthSquared: dx * dx + dy * dy || 1});
    }
  }
  const aprons = paths.clearings.map(([x, z, radius]) => ({x, y: z * LEGACY_DEPTH, inset: radius * Math.cos(Math.PI / 8)}));
  return (x, y) => {
    let inside = -Infinity;
    for (const lane of segments) {
      const sx = x - lane.x, sy = y - lane.y;
      const along = Math.max(0, Math.min(1, (sx * lane.dx + sy * lane.dy) / lane.lengthSquared));
      inside = Math.max(inside, lane.radius - Math.hypot(sx - along * lane.dx, sy - along * lane.dy));
    }
    for (const apron of aprons) {
      const dx = Math.abs(x - apron.x), dy = Math.abs(y - apron.y) / LEGACY_DEPTH;
      const reach = Math.max(dx, dy, (dx + dy) * Math.SQRT1_2);
      inside = Math.max(inside, (apron.inset - reach) * LEGACY_DEPTH);
    }
    return inside;
  };
}

/** Dressed limestone blocks on the original paths and building clearings. */
function paintPavers(c, paths, materials) {
  const bounds = {left: -SIZE.width / 2, top: -SIZE.height / 2, right: SIZE.width / 2, bottom: SIZE.height / 2};
  const random = seeded(18281);
  const sheet = materials && materialRect(materials, 'path');
  const colours = sheet ? WEATHERED_PAVERS : PAVERS;
  const clearance = sheet ? pavingClearance(paths) : null;
  c.save();
  c.clip(pathMaterialMask(paths, PAVING_WIDTH));
  c.fillStyle = sheet ? '#93765562' : '#9e936f';
  c.fillRect(bounds.left, bounds.top, SIZE.width, SIZE.height);
  for (let row = bounds.top; row < bounds.bottom;) {
    // Canvas rows are compressed in depth, so these read as nearly square slabs in the world.
    const depth = .53 + random() * .11;
    let left = bounds.left - random();
    while (left < bounds.right) {
      const width = .72 + random() * .19, joint = .012 + random() * .013;
      const chip = .046 + random() * .076, drift = (random() - .5) * (sheet ? .08 : .037);
      const pigment = Math.floor(random() * colours.length);
      const [face, edge, sun] = colours[pigment];
      const x = left + joint, y = row + joint + drift;
      const right = left + width - joint, bottom = row + depth - joint + drift;
      const bevel = .053 + chip * .44;
      left += width;
      const centreX = (x + right) / 2, centreY = (y + bottom) / 2;
      if (clearance) {
        const inside = clearance(centreX, centreY);
        if (inside < -.58) continue;
        // Alternating chipped and worn stones let the earth show through along the edges and ends.
        const wear = .13 * Math.sin(centreX * 4.6 + centreY * 2.1) + .075 * Math.cos(centreY * 6 - centreX * 4);
        const intact = Math.max(0, Math.min(1, (inside + wear + .10) / .54));
        c.globalAlpha = .045 + .945 * intact * intact * (3 - 2 * intact);
      } else if (!nearPath(paths, centreX, centreY / LEGACY_DEPTH, 2.55)) continue;
      const opacity = c.globalAlpha;

      c.fillStyle = linear(c, x + .08, y + .05, right, bottom,
        [[0, face], [.59, edge], [.86, edge], [1, sheet ? '#938261' : '#79684f']]);
      c.fill(poly([[x + chip, y], [right - .062, y + .009], [right, y + .056],
        [right - .018, bottom - .042], [right - .065, bottom], [x + .062, bottom - .005],
        [x, bottom - .061], [x + .012, y + .057]], .019));
      const top = poly([[x + chip, y + .014], [right - .083, y + .022], [right - .038, y + .069],
        [right - .065, bottom - bevel], [right - .116, bottom - bevel - .018], [x + .071, bottom - bevel + .009],
        [x + .025, bottom - bevel - .019], [x + .031, y + .063]], .018);
      c.fillStyle = linear(c, x + .034, y, x + width * .61, bottom,
        [[0, sun], [.32, face], [.70, face], [1, edge]]);
      c.fill(top);
      if (sheet) {
        const [sx, sy, sw, sh] = sheet, [u, v, w, h] = PAVER_FACES[pigment];
        c.save(); c.clip(top); c.globalAlpha *= .27; c.globalCompositeOperation = 'luminosity';
        c.drawImage(materials, sx + u * sw, sy + v * sh, w * sw, h * sh, x, y, right - x, bottom - y);
        c.restore();
      }
      c.save(); c.clip(top);
      stroke(c, [[x + chip + .021, y + .019], [x + width * .53, y + .018], [right - .097, y + .027]],
        sheet ? '#fff0c968' : '#fff0c996', sheet ? .025 : .035, opacity);
      c.fillStyle = '#78634a21';
      c.fill(poly([[x + width * .77, y + depth * .28], [right, y + depth * .37], [right, bottom - bevel],
        [x + width * .59, bottom - bevel]], .022));
      c.restore();
      c.fillStyle = sun + '53';
      c.fill(ellipse(x + width * .23, y + depth * .28, .024 + chip * .22, .012));
      if (chip > .104) {
        stroke(c, [[x + chip * .67, y + .046], [x + chip, y + .052], [x + chip * 1.26, y + .036]],
          '#a58a653e', .012, opacity);
      }
    }
    row += depth;
  }
  c.restore();
}

function paintPlantedEdges(c, id, paths) {
  const random = seeded(7391), lanes = {...paths, clearings: []};
  for (const [cx, cz, radius] of paths.clearings) {
    // Small groups hug the old paving apron, like the low planting around the reference buildings.
    for (const start of [1.15, 4.14]) {
      for (let i = 0; i < 8; i++) {
        const angle = start + (random() - .5) * .45;
        const reach = radius * .83 + .29 + random() * .15;
        const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
        if (surfaceClass(id, x, z) !== 2 || nearPath(lanes, x, z, 1.05)) continue;
        const y = z * LEGACY_DEPTH, width = .10 + random() * .12, ly = .09 + random() * .10;
        c.fillStyle = '#3a602e6c';
        c.fill(ellipse(x + .045, y + .026, width * .87, ly * .50));
        c.fillStyle = linear(c, x - .08, y - ly, x + .06, y + .02,
          [[0, '#b8d364'], [.49, '#6f9e37'], [1, '#477431']]);
        c.fill(ellipse(x, y - ly * .39, width * .67, ly * .62, angle - 1.1));
      }
    }
  }
}

function paintWeatheredPathEdges(c, id, paths, materials) {
  const random = seeded(19357);
  const [moss, shade, light] = materials ? ['#7485479c', '#586e397a', '#b7bf745b'] : ['#748b44b5', '#51673885', '#c3c87e87'];
  c.save(); c.clip(pathMaterialMask(paths, PAVING_WIDTH, materials ? 0 : .12));
  for (const [lane, points] of paths.lines.entries()) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const ay = az * LEGACY_DEPTH, by = bz * LEGACY_DEPTH;
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length < .8) continue;
    const angle = Math.atan2(dy, dx);
    const sideX = -dy / length, sideY = dx / length;
    const radius = (paths.widths?.[lane] ?? PAVING_WIDTH) / 2;
    for (const side of [-1, 1]) for (let at = .35 + random() * 1.1; at < length - .36; at += .62 + random() * 1.36) {
      const inset = radius - (materials ? .095 : .04) - .085 * random();
      const x = ax + dx * at / length + side * sideX * inset;
      const y = ay + dy * at / length + side * sideY * inset;
      if (surfaceClass(id, x, y / LEGACY_DEPTH) !== 2) continue;
      c.fillStyle = random() > .35 ? moss : shade;
      c.fill(ellipse(x, y, .08 + .14 * random(), .04 + .067 * random(), angle));
      c.fillStyle = light;
      c.fill(ellipse(x - .024, y - .035, .048 + .08 * random(), .035, angle));
    }
  }
  c.restore();
}

/** True when the place has a painted ground. */
export const hasGround = id => Object.hasOwn(PATHS, id) && Object.hasOwn(surfaces, id);

/** Paints the ground of a place at density texels per world unit; returns the canvas. */
export function paintGround(id, density = 28, materials = null) {
  const s = surfaces[id], paths = PATHS[id];
  const art = canvas(Math.round(SIZE.width * density), Math.round(SIZE.height * density)), c = art.getContext('2d');
  // World x/z to the canvas: x across, the drawn y = -z * 0.72 down from the top edge.
  c.setTransform(density, 0, 0, density, SIZE.width / 2 * density, SIZE.height / 2 * density);
  const at = (x, z) => [x, z * .72];
  const coast = (k, wobble = 0, seed = 0) => {
    const p = new Path2D();
    for (let i = 0; i <= 180; i++) {
      const a = i / 180 * Math.PI * 2, edge = coastRadius(a, s.seed);
      const extra = 1 + wobble * (Math.sin(a * 13 + seed) * .6 + Math.sin(a * 23 + seed * 2) * .4);
      const scale = typeof k === 'function' ? k(a) : k;
      const [x, y] = at(Math.cos(a) * s.rx * scale * edge * extra, Math.sin(a) * s.rz * scale * edge * extra);
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    p.closePath(); return p;
  };
  const random = seeded(s.seed * 7919 + 17);
  const relief = lawnRelief();
  paintTerrain(c, s, coast, random, materials, relief);
  // The original path remains worn earth at the edges, with narrower stone laid on its centre.
  if (paths) {
    c.save(); c.clip(coast(.99));
    const paving = {
      lines: [...paths.lines, ...SERVICE_WALKS],
      widths: [...paths.lines.map(() => PAVING_WIDTH), .96, .91],
      stoneAprons: true,
      clearings: paths.clearings.map(([x, z, radius]) => [x, z, radius * .76]),
    };
    // The dust sits just around the laid stone. A broad outer band washes out the grass.
    c.fillStyle = linear(c, -16, -12, 14, 13, [[0, '#e6c58e20'], [.52, '#c7aa7929'], [1, '#aa895b32']]);
    for (const padding of [.19, .08]) c.fill(pathMaterialMask(paving, PAVING_WIDTH, padding));
    // The low paver edge casts a short contact shadow onto the lawn.
    c.save();
    c.clip(pathMaterialMask(paving, PAVING_WIDTH, .20));
    c.translate(.046, .085);
    c.fillStyle = materials ? '#6f633918' : '#69583f20';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .076));
    c.translate(-.027, -.035);
    c.fillStyle = materials ? '#66584231' : '#5c513e43';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .057));
    c.restore();
    paintPlantedEdges(c, id, paths);
    paintPavers(c, paving, materials);
    // Keep the paving in the same pool of light as the adjoining lawn.
    c.save();
    c.clip(pathMaterialMask(paving, PAVING_WIDTH));
    c.globalCompositeOperation = 'soft-light'; c.globalAlpha = .62;
    c.drawImage(relief, -SIZE.width / 2, -SIZE.height / 2, SIZE.width, SIZE.height);
    c.restore();
    paintWeatheredPathEdges(c, id, paving, materials);
    c.clip(pathMaterialMask(paths, PATH_WIDTH));
    c.globalAlpha = materials ? .25 : 1;
    c.fillStyle = '#d7b273'; for (let i = 0; i < 120; i++) { const points = paths.lines[Math.floor(random() * paths.lines.length)], t = random(), j = Math.floor(t * (points.length - 1)), f = t * (points.length - 1) - j;
      const [x0, z0] = points[j], [x1, z1] = points[Math.min(points.length - 1, j + 1)]; c.fill(ellipse(...at(x0 + (x1 - x0) * f + (random() - .5) * 1.4, z0 + (z1 - z0) * f + (random() - .5) * 1.4), .09, .06)); }
    c.restore();
  }
  // Grass strokes and little flowers across the meadow (never on a path).
  const serviceWalks = {lines: SERVICE_WALKS, clearings: []};
  c.save(); c.clip(coast(.82));
  for (let i = 0; i < 420; i++) {
    const x = (random() - .5) * s.rx * 1.7, z = (random() - .5) * s.rz * 1.7, [px, py] = at(x, z);
    if (paths && (nearPath(paths, x, z, 1.6) || nearPath(serviceWalks, x, z, .78))) continue;
    if (i % 14 === 0) { const colour = ['#ffffff', '#ffd166', '#ff8fab'][i % 3];
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.fillStyle = colour; c.fill(ellipse(px + Math.cos(a) * .09, py + Math.sin(a) * .07, .07, .06)); }
      c.fillStyle = '#f29e38'; c.fill(ellipse(px, py, .04, .035)); continue; }
    if (i % 3) continue;
    c.fillStyle = '#4b75374b';
    c.fill(ellipse(px + .04, py + .015, .17, .06));
    const tuft = linear(c, px - .075, py - .28, px + .025, py,
      [[0, i % 2 ? '#abd763' : '#8cc44d'], [.57, '#6dac41'], [1, '#437d36']]);
    for (const [dx, lean, tall] of [[-.1, -.1, .26], [0, .02, .34], [.1, .12, .24]]) {
      const blade = new Path2D(); blade.moveTo(px + dx - .035, py); blade.quadraticCurveTo(px + dx + lean * .3, py - tall * .6, px + dx + lean, py - tall); blade.quadraticCurveTo(px + dx + lean * .2 + .03, py - tall * .5, px + dx + .035, py); blade.closePath();
      c.fillStyle = tuft; c.fill(blade);
    }
  }
  c.restore();
  return art;
}

// Projected centres and radii of the turf shoulders under the raised banks.
const LAWN_SHOULDERS = [
  [-13.0, -7.8, 6.0, 3.9, 1.38], [-6.6, -11.5, 6.6, 3.8, 1.35],
  [7.3, -12.2, 6.4, 4.1, 1.41], [14.0, -7.2, 4.9, 3.6, 1.16],
  [-12.6, 8.6, 5.7, 4.0, 1.14], [12.1, 9.1, 5.0, 3.9, 1.08],
  [-7.8, -4.0, 3.8, 2.7, .31], [7.0, -4.3, 3.9, 2.6, .27],
  [-7.6, 4.9, 3.8, 2.65, .29], [1.7, .52, 4.7, 2.9, .22],
];

// The central green opens into the sun. Cooler grass collects below the rocky shoulders.
const MEADOW_GLADES = [
  [-11.6, -7.9, 6.6, 2.7, -.46, '#387e38'],
  [1.4, -9.3, 5.8, 4.1, .18, '#e2e988'],
  [11.6, -5.7, 4.4, 2.9, .27, '#4e8539'],
  [1.1, -.7, 8.5, 3.7, -.15, '#dce882'],
  [-8.4, 8.7, 6.3, 3.5, -.35, '#477f39'],
  [8.5, 8.3, 6.4, 3.7, .32, '#a8d366'],
];

function lawnRelief() {
  const lightField = canvas(192, 144), ctx = lightField.getContext('2d');
  const {width, height} = lightField, image = ctx.createImageData(width, height);
  const left = -SIZE.width / 2, top = -SIZE.height / 2;
  for (let row = 0; row < height; row++) {
    const y = top + (row + .5) * SIZE.height / height;
    for (let col = 0; col < width; col++) {
      const x = left + (col + .5) * SIZE.width / width;
      let slopeX = 0, slopeY = 0;
      for (const [cx, cy, rx, ry, rise] of LAWN_SHOULDERS) {
        const u = (x - cx) / rx, v = (y - cy) / ry, shape = 1 - u * u - v * v;
        if (shape <= 0) continue;
        // The derivative of this rounded profile eases to zero at the edge of each shoulder.
        const grade = -6 * rise * shape * shape;
        slopeX += grade * u / rx;
        slopeY += grade * v / ry;
      }
      const light = (.60 * slopeX + .43 * slopeY + .67) / Math.hypot(slopeX, slopeY, 1) - .67;
      const offset = (row * width + col) * 4;
      const lit = light > 0;
      image.data[offset] = lit ? 234 : 43;
      image.data[offset + 1] = lit ? 236 : 86;
      image.data[offset + 2] = lit ? 143 : 44;
      image.data[offset + 3] = 255 * Math.min(lit ? .31 : .33, Math.abs(light) * 1.28);
    }
  }
  ctx.putImageData(image, 0, 0);
  return lightField;
}

function paintTerrain(c, s, coast, random, materials, relief) {
  const rim = cliffProfile(s);
  paintCliffFaces(c, rim, materials);
  // Wet sand fading into the shallows (translucent, so the sea still reads it as water).
  c.fillStyle = '#c7b79c70'; c.fill(coast(1.035));
  // The beach: warm sand, darker at the waterline, lighter towards the meadow.
  const beach = coast(1);
  c.fillStyle = '#f2d595'; c.fill(beach);
  if (materials) { c.save(); c.clip(beach); paintMaterial(c, materials, 'sand', {alpha: .9}); c.restore(); }
  c.save(); c.clip(beach);
  c.lineWidth = .84; c.strokeStyle = '#e6c78e'; c.stroke(beach);
  c.lineWidth = .25; c.strokeStyle = '#c9a878'; c.stroke(beach);
  c.fillStyle = '#e2bf7e'; for (let i = 0; i < 260; i++) { const a = random() * Math.PI * 2, k = .86 + random() * .13; c.fill(ellipse(Math.cos(a) * s.rx * k, Math.sin(a) * s.rz * k * .72, .07 + random() * .08, .05)); }
  c.restore();
  paintBeachDetails(c, beach, rim, materials);
  if (!materials) paintGrassRim(c, rim, beach);
  // Continue the meadow under the visible wall foot while leaving the sand wash facing the sea.
  const grassRadius = wallGrassEdge(s, materials ? meadowEdge : () => .85);
  const meadow = coast(grassRadius, .012, 3);
  c.save(); c.clip(beach); c.globalCompositeOperation = 'source-atop';
  c.save(); c.clip(beach); c.translate(.08, .33); c.fillStyle = '#9b7f56'; c.fill(meadow); c.restore();
  c.fillStyle = '#7cb945'; c.fill(meadow);
  c.save(); c.clip(meadow);
  // The warm light on the terraces also passes over the paved lanes and the open meadow.
  const glow = c.createRadialGradient(-9, -9, 2, 3, 1, s.rx + 2);
  glow.addColorStop(0, '#bedf70');
  glow.addColorStop(.52, '#90c74f');
  glow.addColorStop(1, '#5da140');
  c.fillStyle = glow; c.fill(meadow);
  if (materials) {
    c.save(); c.fillStyle = mirroredGrassPattern(c, materials);
    c.globalAlpha = .41;
    c.fillRect(-32, -24, 64, 48);
    c.rotate(.22); c.translate(-2.6, 1.4); c.scale(.92, 1.03);
    c.globalAlpha = .18;
    c.fillRect(-32, -24, 64, 48);
    c.restore();
  }
  // A broad change in light from the sunlit back ledges to the lower shore ties their caps
  // into the meadow without drawing any new path or extending the dry ground.
  c.fillStyle = linear(c, -16, -12, 12, 13, [[0, '#fff0a22f'], [.40, '#efdf8410'], [.73, '#4b873c0f'], [1, '#356d3c28']]);
  c.fill(meadow);
  for (const [x, y, width, depth, angle, color] of MEADOW_GLADES) {
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(width, depth);
    c.fillStyle = radial(c, 0, 0, 1, [[0, `${color}52`], [.49, `${color}32`], [1, `${color}00`]]);
    c.fill(ellipse(0, 0, 1));
    c.restore();
  }
  for (let i = 0; i < 26; i++) {
    const x = (random() - .5) * s.rx * 1.6, y = (random() - .5) * s.rz * 1.6 * LEGACY_DEPTH;
    const colour = random() > .5 ? '#d3e78b' : '#377e38';
    const width = 2.2 + random() * 2.6, depth = 1.4 + random() * 2.15;
    c.fillStyle = radial(c, x, y, width, [[0, `${colour}24`], [.43, `${colour}14`], [1, `${colour}00`]]);
    c.fill(ellipse(x, y, width, depth));
  }
  c.drawImage(relief, -SIZE.width / 2, -SIZE.height / 2, SIZE.width, SIZE.height);
  c.restore();
  paintTurfBevel(c, coast, meadow, grassRadius);
  stroke(c, meadow, linear(c, -16, -14, 13, 12, [[0, '#64854079'], [.53, '#496d3dac'], [1, '#425f36d6']]), .145);
  paintTerraceFeet(c, beach, rim, materials);
  c.restore();
}
function nearPath(paths, x, z, reach) {
  for (const points of paths.lines) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < reach) return true;
  }
  return paths.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + reach * .5);
}
