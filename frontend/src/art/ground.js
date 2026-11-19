// The island's ground in the clean cartoon style, painted at runtime instead of the old 1024 x 768
// pixel backdrop: a warm sand beach, a soft-edged meadow with a darker rim, sandy paths where the
// spots and the cabin stand (TOWER-DEFENSE.md §2), flowers and grass strokes. It covers the same
// 64 x 48 world units as the backdrop. Alpha is the decorative cliff-base/foam silhouette; walking
// and placement retain the separate analytic top in surfaces.js (D062).
import {surfaces} from '../world/places/surfaces.js';
import {LEGACY_DEPTH} from '../world/projection.js';
import {canvas, ellipse, linear, poly} from './paint.js';
import {cliffProfile, paintCliffFaces, paintGrassRim} from './coast-cliffs.js';
import {paintHomeTerraces} from './home-terraces.js';
import {meadowScale, paintMaterial, pathMaterialMask} from './village/terrain-materials.js';

const SIZE = {width: 64, height: 48};
// Paths of each island (logical x/z, a polyline each) and small clearings [x, z, radius].
const PATHS = {
  home_islet: {lines: [[[0, -15], [0, -5.5], [0, 7.5], [.6, 14], [1.6, 21]], [[-13, -5.5], [13, -5.5]], [[-11, 7.5], [12, 7.5]], [[0, 11], [8.5, 12.6]]],
    clearings: [[0, -14, 3.2], [-8, 6.6, 3.4], [8.5, 12.4, 2.4], [7, -6, 2.6], [-8, -6, 2.6]]},
};
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const PATH_WIDTH = 2.2;

function meadowEdge(angle) {
  // The north Smugglers beach widens between the terrace shelves, like the three naval beaches.
  const north = Math.abs(angle - Math.PI * 1.5);
  const inward = Math.max(0, Math.min(1, (north - Math.PI / 9) / (Math.PI / 12)));
  return Math.min(meadowScale(angle), .865 + .12 * inward * inward * (3 - 2 * inward));
}

const PAVERS = [
  ['#d6bd94', '#b9a280', '#e6cca6'], ['#d4c2a4', '#b2a382', '#e6d2b2'],
  ['#c9b99c', '#af9a7f', '#d8c8a6'], ['#c6ab87', '#a88d70', '#d6bd9b'],
  ['#d9c6a6', '#b6a386', '#e8d6b8'], ['#c8b292', '#a9957c', '#d8c5a8'],
];

/** World-anchored limestone setts with shallow bevels and narrow, subdued joints. */
function paintPavers(c, paths, materials) {
  const bounds = {left: -SIZE.width / 2, top: -SIZE.height / 2, right: SIZE.width / 2, bottom: SIZE.height / 2};
  const random = seeded(18281), faces = new Path2D();
  c.save();
  c.clip(pathMaterialMask(paths, PATH_WIDTH));
  c.fillStyle = '#b0a288';
  c.fillRect(bounds.left, bounds.top, SIZE.width, SIZE.height);
  for (let row = bounds.top; row < bounds.bottom;) {
    const depth = .43 + random() * .12;
    let left = bounds.left - random();
    while (left < bounds.right) {
      const width = .53 + random() * .17, trim = .008 + random() * .008;
      const chip = .02 + random() * .038, drift = (random() - .5) * .028;
      const [face, bevel, gleam] = PAVERS[Math.floor(random() * PAVERS.length)];
      const x = left + trim, y = row + trim + drift;
      const right = left + width - trim, bottom = row + depth - trim + drift;
      left += width;
      const centerZ = (y + bottom) / (2 * LEGACY_DEPTH);
      if (!nearPath(paths, (x + right) / 2, centerZ, 2.4)) continue;
      c.fillStyle = bevel;
      c.fill(poly([[x + chip, y], [right - .03, y + .006], [right, y + .033],
        [right - .017, bottom - .023], [right - .049, bottom], [x + .037, bottom],
        [x, bottom - .039], [x, y + .036]], .009));
      const top = poly([[x + chip, y + .009], [right - .035, y + .013], [right - .015, y + .038],
        [right - .026, bottom - .038], [right - .055, bottom - .044], [x + .045, bottom - .037],
        [x + .014, bottom - .059], [x + .012, y + .042]], .009);
      c.fillStyle = linear(c, x, y, x + width * .32, bottom, [[0, gleam], [.27, face], [.84, face], [1, bevel]]);
      c.fill(top);
      faces.addPath(top);
    }
    row += depth;
  }
  // Reuse the atlas's original limestone grain inside each face. The carved joints stay distinct.
  if (materials) {
    c.clip(faces);
    c.globalCompositeOperation = 'soft-light';
    paintMaterial(c, materials, 'path', {alpha: .08});
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
  // Stone village footpaths retain a thin bank of warm sand against the grass.
  if (paths) {
    c.save(); c.clip(coast(.99));
    for (const [padding, colour] of [[.16, '#a88c62'], [.067, '#e5c691'], [0, '#efd7a0']]) {
      c.fillStyle = colour;
      c.fill(pathMaterialMask(paths, PATH_WIDTH, padding));
    }
    paintPavers(c, paths, materials);
    c.clip(pathMaterialMask(paths, PATH_WIDTH));
    c.globalAlpha = materials ? .25 : 1;
    c.fillStyle = '#d7b273'; for (let i = 0; i < 120; i++) { const points = paths.lines[Math.floor(random() * paths.lines.length)], t = random(), j = Math.floor(t * (points.length - 1)), f = t * (points.length - 1) - j;
      const [x0, z0] = points[j], [x1, z1] = points[Math.min(points.length - 1, j + 1)]; c.fill(ellipse(...at(x0 + (x1 - x0) * f + (random() - .5) * 1.4, z0 + (z1 - z0) * f + (random() - .5) * 1.4), .09, .06)); }
    c.restore();
  }
  // Grass strokes and little flowers across the meadow (never on a path).
  c.save(); c.clip(coast(.82));
  for (let i = 0; i < 420; i++) {
    const x = (random() - .5) * s.rx * 1.7, z = (random() - .5) * s.rz * 1.7, [px, py] = at(x, z);
    if (paths && nearPath(paths, x, z, 1.6)) continue;
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
  c.fillStyle = linear(c, -16, -15, 15, 16, [[0, '#fff0b841'], [.47, '#ffebbc18'], [1, '#a2674737']]);
  c.fill(beach);
  c.lineWidth = .84; c.strokeStyle = '#e4bc83'; c.stroke(beach);
  c.lineWidth = .25; c.strokeStyle = '#c89d66'; c.stroke(beach);
  c.fillStyle = '#e2bf7e'; for (let i = 0; i < 260; i++) { const a = random() * Math.PI * 2, k = .86 + random() * .13; c.fill(ellipse(Math.cos(a) * s.rx * k, Math.sin(a) * s.rz * k * .72, .07 + random() * .08, .05)); }
  c.restore();
  if (!materials) paintGrassRim(c, rim, beach);
  // The meadow: a soft edge, a darker rim and a lighter heart.
  const meadow = coast(materials ? meadowEdge : .85, .012, 3);
  c.save(); c.clip(beach); c.translate(.07, .29); c.fillStyle = '#b49760'; c.fill(meadow); c.restore();
  c.fillStyle = '#75bd54'; c.fill(meadow);
  c.save(); c.clip(meadow);
  const glow = c.createRadialGradient(-5, -7, 2, 0, 0, s.rx + 1.5);
  glow.addColorStop(0, '#a6d768'); glow.addColorStop(.63, '#84c35a'); glow.addColorStop(1, '#62a94c');
  c.fillStyle = glow; c.fill(meadow);
  // Let the broad green light lead; fine grass detail should not compete with the buildings.
  if (materials) paintMaterial(c, materials, 'grass', {alpha: .49});
  c.lineWidth = .62; c.strokeStyle = '#559445'; c.stroke(meadow);
  // Soft patches of darker and lighter grass.
  c.globalAlpha = materials ? .3 : 1;
  for (let i = 0; i < 26; i++) { const x = (random() - .5) * s.rx * 1.6, z = (random() - .5) * s.rz * 1.6; c.fillStyle = random() > .5 ? '#86cf5e66' : '#63b34f55'; c.fill(ellipse(x, z * .72, 1.2 + random() * 2.2, .7 + random() * 1.2)); }
  c.restore();
  c.lineWidth = .16; c.strokeStyle = '#3d7f36'; c.stroke(meadow);
  if (materials) { c.save(); c.clip(beach); c.lineWidth = .08; c.strokeStyle = '#d6e592'; c.stroke(meadow); c.restore(); }
  paintHomeTerraces(c, rim, beach, materials);
}
function nearPath(paths, x, z, reach) {
  for (const points of paths.lines) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < reach) return true;
  }
  return paths.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + reach * .5);
}
