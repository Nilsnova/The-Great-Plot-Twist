// The island's ground in the clean cartoon style, painted at runtime instead of the old 1024 x 768
// pixel backdrop: a warm sand beach, a soft-edged meadow with a darker rim, sandy paths where the
// spots and the cabin stand (TOWER-DEFENSE.md §2), flowers and grass strokes. It covers the same
// 64 x 48 world units as the backdrop. Alpha is the decorative cliff-base/foam silhouette; walking
// and placement retain the separate analytic top in surfaces.js (D062).
import {surfaceClass, surfaces} from '../world/places/surfaces.js';
import {LEGACY_DEPTH} from '../world/projection.js';
import {canvas, ellipse, linear, poly, radial, stroke} from './paint.js';
import {cliffProfile, paintCliffFaces, paintGrassRim} from './coast-cliffs.js';
import {meadowScale, paintMaterial, pathMaterialMask} from './village/terrain-materials.js';

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

function paintBeachDetails(c, coast, beach, rim, materials) {
  c.save();
  c.clip(beach);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = .88;
  c.fillStyle = linear(c, -16, -13, 15, 13, [[0, '#fff0bf83'], [.40, '#fbda9f38'], [.73, '#d2a97508'], [1, '#926d583d']]);
  c.fill(beach);
  for (const inset of [.953, .967, .979]) {
    const wetSand = new Path2D(beach);
    wetSand.addPath(coast(angle => inset + .006 * Math.sin(8 * angle - 1) + .004 * Math.cos(17 * angle), .003, 1));
    c.fillStyle = linear(c, -14, -12, 14, 8, [[0, '#c9a27434'], [.44, '#a57c572c'], [1, '#945f512f']]);
    c.fill(wetSand, 'evenodd');
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

/** Dressed limestone blocks on the original paths and building clearings. */
function paintPavers(c, paths, materials) {
  const bounds = {left: -SIZE.width / 2, top: -SIZE.height / 2, right: SIZE.width / 2, bottom: SIZE.height / 2};
  const random = seeded(18281), faces = new Path2D();
  c.save();
  c.clip(pathMaterialMask(paths, PAVING_WIDTH));
  c.fillStyle = '#9e936f';
  c.fillRect(bounds.left, bounds.top, SIZE.width, SIZE.height);
  for (let row = bounds.top; row < bounds.bottom;) {
    // Canvas rows are compressed in depth, so these read as nearly square slabs in the world.
    const depth = .53 + random() * .11;
    let left = bounds.left - random();
    while (left < bounds.right) {
      const width = .72 + random() * .19, joint = .012 + random() * .013;
      const chip = .046 + random() * .076, drift = (random() - .5) * .037;
      const [face, edge, sun] = PAVERS[Math.floor(random() * PAVERS.length)];
      const x = left + joint, y = row + joint + drift;
      const right = left + width - joint, bottom = row + depth - joint + drift;
      left += width;
      if (!nearPath(paths, (x + right) / 2, (y + bottom) / (2 * LEGACY_DEPTH), 2.55)) continue;

      c.fillStyle = edge;
      c.fill(poly([[x + chip, y], [right - .062, y + .009], [right, y + .056],
        [right - .018, bottom - .042], [right - .065, bottom], [x + .062, bottom - .005],
        [x, bottom - .061], [x + .012, y + .057]], .019));
      const top = poly([[x + chip, y + .014], [right - .083, y + .022], [right - .031, y + .069],
        [right - .048, bottom - .058], [right - .092, bottom - .073], [x + .071, bottom - .063],
        [x + .025, bottom - .092], [x + .031, y + .063]], .018);
      c.fillStyle = linear(c, x + .034, y, x + width * .61, bottom,
        [[0, sun], [.29, face], [.83, face], [1, edge]]);
      c.fill(top);
      faces.addPath(top);
      c.fillStyle = sun + '53';
      c.fill(ellipse(x + width * .23, y + depth * .28, .024 + chip * .22, .012));
      if (chip > .104) {
        stroke(c, [[x + chip * .67, y + .046], [x + chip, y + .052], [x + chip * 1.26, y + .036]],
          '#a58a653e', .012);
      }
    }
    row += depth;
  }
  // Limestone grain stays on the cut faces, leaving the worn joints legible around them.
  if (materials) {
    c.clip(faces);
    c.globalCompositeOperation = 'soft-light';
    paintMaterial(c, materials, 'path', {alpha: .23});
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

function paintWeatheredPathEdges(c, id, paths) {
  const random = seeded(19357);
  c.save(); c.clip(pathMaterialMask(paths, PAVING_WIDTH, .12));
  for (const [lane, points] of paths.lines.entries()) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const ay = az * LEGACY_DEPTH, by = bz * LEGACY_DEPTH;
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length < .8) continue;
    const angle = Math.atan2(dy, dx);
    const sideX = -dy / length, sideY = dx / length;
    const radius = (paths.widths[lane] ?? PAVING_WIDTH) / 2;
    for (const side of [-1, 1]) for (let at = .35 + random() * 1.1; at < length - .36; at += .62 + random() * 1.36) {
      const inset = radius - .04 - .085 * random();
      const x = ax + dx * at / length + side * sideX * inset;
      const y = ay + dy * at / length + side * sideY * inset;
      if (surfaceClass(id, x, y / LEGACY_DEPTH) !== 2) continue;
      c.fillStyle = random() > .35 ? '#748b44b5' : '#51673885';
      c.fill(ellipse(x, y, .08 + .14 * random(), .04 + .067 * random(), angle));
      c.fillStyle = '#c3c87e87';
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
      const a = i / 180 * Math.PI * 2, edge = 1 + .055 * Math.sin(a * 5 + s.seed) + .035 * Math.cos(a * 7);
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
    c.fillStyle = '#69583f20';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .115));
    c.translate(-.027, -.035);
    c.fillStyle = '#5c513e43';
    c.fill(pathMaterialMask(paving, PAVING_WIDTH, .057));
    c.restore();
    paintPlantedEdges(c, id, paths);
    paintPavers(c, paving, materials);
    paintWeatheredPathEdges(c, id, paving);
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
  c.lineWidth = .84; c.strokeStyle = '#dec291'; c.stroke(beach);
  c.lineWidth = .25; c.strokeStyle = '#bea374'; c.stroke(beach);
  c.fillStyle = '#e2bf7e'; for (let i = 0; i < 260; i++) { const a = random() * Math.PI * 2, k = .86 + random() * .13; c.fill(ellipse(Math.cos(a) * s.rx * k, Math.sin(a) * s.rz * k * .72, .07 + random() * .08, .05)); }
  c.restore();
  paintBeachDetails(c, coast, beach, rim, materials);
  if (!materials) paintGrassRim(c, rim, beach);
  const grassRadius = materials ? meadowEdge : () => .85;
  const meadow = coast(grassRadius, .012, 3);
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
    c.globalCompositeOperation = 'soft-light';
    paintMaterial(c, materials, 'grass', {alpha: .49});
    c.globalCompositeOperation = 'source-over';
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
  c.restore();
  paintTurfBevel(c, coast, meadow, grassRadius);
  stroke(c, meadow, '#486e39', .145, .9);
}
function nearPath(paths, x, z, reach) {
  for (const points of paths.lines) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < reach) return true;
  }
  return paths.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + reach * .5);
}
