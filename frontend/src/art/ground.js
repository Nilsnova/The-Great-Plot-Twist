// The island's ground in the clean cartoon style, painted at runtime instead of the old 1024 x 768
// pixel backdrop: a warm sand beach, a soft-edged meadow with a darker rim, sandy paths where the
// spots and the cabin stand (TOWER-DEFENSE.md §2), flowers and grass strokes. It covers the same
// 64 x 48 world units as the backdrop. Alpha is the decorative cliff-base/foam silhouette; walking
// and placement retain the separate analytic top in surfaces.js (D062).
import {surfaceClass, surfaces} from '../world/places/surfaces.js';
import {WALL_PERIMETER_CELLS} from '../island/wall-perimeter.js';
import {LEGACY_DEPTH} from '../world/projection.js';
import {canvas, ellipse, linear, poly, radial, stroke} from './paint.js';
import {cliffProfile, paintCliffFaces, paintGrassRim} from './coast-cliffs.js';
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
    for (const dx of [-1.04, 1.04]) for (const dz of [-1.04, 1.04]) {
      const nx = (x + dx) / surface.rx, nz = (z + dz) / surface.rz;
      const corner = Math.atan2(nz, nx);
      radius = Math.max(radius, Math.hypot(nx, nz) / coastRadius(corner, surface.seed));
      width = Math.max(width, angleDistance(angle, corner));
    }
    return {angle, width, radius: Math.min(.994, radius + .011)};
  });
  return angle => {
    const edge = meadow(angle);
    let radius = edge;
    for (const shoulder of shoulders) {
      const fade = Math.max(0, Math.min(1, 1 - (angleDistance(angle, shoulder.angle) - shoulder.width) / .10));
      radius = Math.max(radius, edge + (shoulder.radius - edge) * fade * fade * (3 - 2 * fade));
    }
    return radius;
  };
}

function paintBeachDetails(c, beach, rim, materials) {
  c.save();
  c.clip(beach);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = .88;
  c.fillStyle = linear(c, -16, -13, 15, 13, [[0, '#fff0bf83'], [.40, '#fbda9f38'], [.73, '#d2a97508'], [1, '#926d583d']]);
  c.fill(beach);
  // Overlapping washes follow the waterline as one varied stain, with a soft edge on dry sand.
  for (let i = 1; i < rim.length - 1; i += 2) {
    const {x, y} = rim[i], previous = rim[i - 1], next = rim[i + 1];
    const tangent = Math.atan2(next.y - previous.y, next.x - previous.x);
    const reach = 1.02 + .27 * Math.sin(i * .41) + .17 * Math.cos(i * .77);
    c.save(); c.translate(.997 * x, .997 * y); c.rotate(tangent); c.scale(2.55, reach);
    c.fillStyle = radial(c, 0, 0, 1, [[0, '#976e4e55'], [.40, '#a7815d31'], [.72, '#b18c6217'], [1, '#b18c6200']]);
    c.fill(ellipse(0, 0, 1));
    c.restore();
  }
  // Rocky shoulders shade the sand at their feet. The four open approaches keep a warm centre.
  for (let i = 2; i < rim.length - 1; i += 5) {
    const {x, y, depth} = rim[i];
    if (depth < 1.35 || Math.abs(i - 135) < 13) continue;
    const reach = .82 + .27 * depth;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    c.save(); c.translate(.978 * x, .978 * y); c.rotate(angle); c.scale(1, .61);
    c.fillStyle = radial(c, 0, 0, reach, [[0, '#635d516e'], [.48, '#74695547'], [1, '#74695500']]);
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
  for (const width of [1.58, 1.39, 1.13, .92, .70, .47]) {
    const band = new Path2D(meadow);
    band.addPath(coast(angle => grassRadius(angle) - width * curve(angle), .012, 3));
    c.fillStyle = '#38522a13';
    c.fill(band, 'evenodd');
  }
  // The olive cut directly below the bright grass crest gives the rocky shoulders a rounded lip.
  const soil = coast(angle => grassRadius(angle) - curve(angle) * .14, .012, 3);
  stroke(c, soil, linear(c, -16, -14, 13, 12, [[0, '#6d88424f'], [.48, '#58623080'], [1, '#404723ad']]), .24);
  const crest = coast(angle => grassRadius(angle) - curve(angle) * .36, .012, 3);
  stroke(c, crest, linear(c, -16, -14, 13, 12, [[0, '#e1ee99d9'], [.46, '#c0d978aa'], [1, '#87a54e38']]), .15, .92);
  c.restore();
}

const PAVERS = [
  ['#dbc9a3', '#aa9475', '#f2e1b9'], ['#decfa9', '#b7a285', '#f6e7c6'],
  ['#ceb98f', '#9d8a67', '#e9d3a7'], ['#d7ba91', '#ac8c65', '#f1d2a8'],
  ['#d5c6a5', '#ac9b7e', '#efdfbf'], ['#ccbda0', '#9b8e76', '#e7d7b9'],
];
const WEATHERED_PAVERS = [
  ['#cebe94', '#a99b76', '#e1d3a9'], ['#d0c59e', '#ac9f7b', '#e6d9b3'],
  ['#bdb087', '#9a8e6b', '#d8c79d'], ['#cab68b', '#a39773', '#decea5'],
  ['#c5bda0', '#a49a7c', '#ddd3ae'], ['#c3b79b', '#a29475', '#dbd0ab'],
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
  c.fillStyle = sheet ? '#91825568' : '#9e936f';
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
        const intact = Math.max(0, Math.min(1, (inside + wear + .18) / .64));
        c.globalAlpha = .065 + .925 * intact * intact * (3 - 2 * intact);
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
        [[0, sun], [.26, face], [.65, face], [1, edge]]);
      c.fill(top);
      if (sheet) {
        const [sx, sy, sw, sh] = sheet, [u, v, w, h] = PAVER_FACES[pigment];
        c.save(); c.clip(top); c.globalAlpha *= .36; c.globalCompositeOperation = 'luminosity';
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
  paintTerrain(c, s, coast, random, materials);
  // The original path remains worn earth at the edges, with narrower stone laid on its centre.
  if (paths) {
    c.save(); c.clip(coast(.99));
    c.fillStyle = linear(c, -16, -12, 14, 13, [[0, '#c7b77712'], [.52, '#c2ac7427'], [1, '#b195592b']]);
    for (const padding of [.16, .067, 0, -.105, -.21]) {
      c.fill(pathMaterialMask(paths, PATH_WIDTH, padding));
    }
    const paving = {
      lines: [...paths.lines, ...SERVICE_WALKS],
      widths: [...paths.lines.map(() => PAVING_WIDTH), .96, .91],
      stoneAprons: true,
      clearings: paths.clearings.map(([x, z, radius]) => [x, z, radius * .76]),
    };
    // The low paver edge casts a short contact shadow onto the lawn.
    c.save();
    c.clip(pathMaterialMask(paving, PAVING_WIDTH, .38));
    c.translate(.046, .085);
    c.fillStyle = materials ? '#6f633918' : '#69583f20';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .115));
    c.translate(-.027, -.035);
    c.fillStyle = materials ? '#66584231' : '#5c513e43';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .057));
    c.restore();
    paintPlantedEdges(c, id, paths);
    paintPavers(c, paving, materials);
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
    // A small tuft: three curved blades in a darker green.
    const tuft = i % 2 ? '#56a845' : '#4a983f';
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
  [-13.2, -7.8, 5.6, 3.4, .96], [-6.6, -11.5, 6.3, 3.3, 1.06],
  [7.3, -12.2, 5.9, 3.7, 1.10], [14.0, -7.2, 4.5, 3.4, .89],
  [-12.6, 8.1, 4.9, 3.5, .86], [12.1, 8.9, 4.5, 3.5, .82],
];

function paintLawnRelief(c) {
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
      image.data[offset] = lit ? 231 : 48;
      image.data[offset + 1] = lit ? 219 : 79;
      image.data[offset + 2] = lit ? 123 : 40;
      image.data[offset + 3] = 255 * Math.min(lit ? .36 : .43, Math.abs(light) * 1.7);
    }
  }
  ctx.putImageData(image, 0, 0);
  c.drawImage(lightField, left, top, SIZE.width, SIZE.height);
}

function paintTerrain(c, s, coast, random, materials) {
  const rim = cliffProfile(s);
  paintCliffFaces(c, rim, materials);
  // Wet sand fading into the shallows (translucent, so the sea still reads it as water).
  c.fillStyle = '#e8cf8e70'; c.fill(coast(1.035));
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
  // Keep each wall's full footing on the existing dry shelf, using the same turf as the meadow.
  const grassRadius = wallGrassEdge(s, materials ? meadowEdge : () => .85);
  const meadow = coast(grassRadius, .012, 3);
  c.save(); c.clip(beach); c.globalCompositeOperation = 'source-atop';
  c.save(); c.clip(beach); c.translate(.08, .33); c.fillStyle = '#9b7f56'; c.fill(meadow); c.restore();
  c.fillStyle = '#78b743'; c.fill(meadow);
  c.save(); c.clip(meadow);
  // The warm light on the terraces also passes over the paved lanes and the open meadow.
  const glow = c.createRadialGradient(-9, -9, 2, 3, 1, s.rx + 2);
  glow.addColorStop(0, '#bddc68');
  glow.addColorStop(.52, '#8ebc46');
  glow.addColorStop(1, '#579638');
  c.fillStyle = glow; c.fill(meadow);
  if (materials) {
    c.save(); c.fillStyle = mirroredGrassPattern(c, materials);
    c.globalAlpha = .60;
    c.fillRect(-32, -24, 64, 48);
    c.rotate(.17); c.translate(-2.6, 1.4); c.scale(1.25, 1.15);
    c.globalAlpha = .27;
    c.fillRect(-32, -24, 64, 48);
    c.restore();
  }
  // A broad change in light from the sunlit back ledges to the lower shore ties their caps
  // into the meadow without drawing any new path or extending the dry ground.
  c.fillStyle = linear(c, -16, -12, 12, 13, [[0, '#f3d67832'], [.46, '#f4d36b09'], [.73, '#42783b10'], [1, '#345b303c']]);
  c.fill(meadow);
  for (let i = 0; i < 26; i++) {
    const x = (random() - .5) * s.rx * 1.6, y = (random() - .5) * s.rz * 1.6 * LEGACY_DEPTH;
    const colour = random() > .5 ? '#d5e487' : '#377b2d';
    const width = 2.2 + random() * 2.6, depth = 1.4 + random() * 2.15;
    c.fillStyle = radial(c, x, y, width, [[0, `${colour}4b`], [.43, `${colour}23`], [1, `${colour}00`]]);
    c.fill(ellipse(x, y, width, depth));
  }
  paintLawnRelief(c);
  c.restore();
  paintTurfBevel(c, coast, meadow, grassRadius);
  stroke(c, meadow, '#486e39', .145, .9);
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
