// The island's ground in the clean cartoon style, painted at runtime instead of the old 1024 x 768
// pixel backdrop: a warm sand beach, a soft-edged meadow with a darker rim, sandy paths where the
// spots and the cabin stand (TOWER-DEFENSE.md §2), flowers and grass strokes. It covers the same
// 64 x 48 world units as the backdrop, and its alpha is the coast the sea and the walker read.
import {surfaces} from '../world/places/surfaces.js';
import {canvas, ellipse, line, stroke} from './paint.js';

const SIZE = {width: 64, height: 48};
// Paths of each island (logical x/z, a polyline each) and small clearings [x, z, radius].
const PATHS = {
  home_islet: {lines: [[[0, -15], [0, -5.5], [0, 7.5], [.6, 14], [1.6, 21]], [[-13, -5.5], [13, -5.5]], [[-11, 7.5], [12, 7.5]], [[0, 11], [8.5, 12.6]]],
    clearings: [[0, -14, 3.2], [-8, 6.6, 3.4], [8.5, 12.4, 2.4], [7, -6, 2.6], [-8, -6, 2.6]]},
};
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** True when the place has a painted ground. */
export const hasGround = id => Object.hasOwn(PATHS, id) && Object.hasOwn(surfaces, id);

/** Paints the ground of a place at density texels per world unit; returns the canvas. */
export function paintGround(id, density = 28) {
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
      const [x, y] = at(Math.cos(a) * s.rx * k * edge * extra, Math.sin(a) * s.rz * k * edge * extra);
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    p.closePath(); return p;
  };
  const random = seeded(s.seed * 7919 + 17);
  // Wet sand fading into the shallows (translucent, so the sea still reads it as water).
  c.fillStyle = '#e8cf8e70'; c.fill(coast(1.035));
  // The beach: warm sand, darker at the waterline, lighter towards the meadow.
  const beach = coast(1);
  c.fillStyle = '#f2d595'; c.fill(beach);
  c.save(); c.clip(beach); c.lineWidth = .9; c.strokeStyle = '#ddb877'; c.stroke(beach); c.lineWidth = .3; c.strokeStyle = '#c99f5e'; c.stroke(beach);
  c.fillStyle = '#e2bf7e'; for (let i = 0; i < 260; i++) { const a = random() * Math.PI * 2, k = .86 + random() * .13; c.fill(ellipse(Math.cos(a) * s.rx * k, Math.sin(a) * s.rz * k * .72, .07 + random() * .08, .05)); }
  c.restore();
  // The meadow: a soft edge, a darker rim and a lighter heart.
  const meadow = coast(.85, .012, 3);
  c.save(); c.translate(.05, .3); c.fillStyle = '#c9ab6a'; c.fill(meadow); c.restore();
  c.fillStyle = '#6fc155'; c.fill(meadow);
  c.save(); c.clip(meadow);
  const glow = c.createRadialGradient(-4, -6, 2, 0, 0, s.rx); glow.addColorStop(0, '#93d968'); glow.addColorStop(.6, '#7cc95a'); glow.addColorStop(1, '#5fb24c');
  c.fillStyle = glow; c.fill(meadow);
  c.lineWidth = .7; c.strokeStyle = '#4f9c41'; c.stroke(meadow);
  // Soft patches of darker and lighter grass.
  for (let i = 0; i < 26; i++) { const x = (random() - .5) * s.rx * 1.6, z = (random() - .5) * s.rz * 1.6; c.fillStyle = random() > .5 ? '#86cf5e66' : '#63b34f55'; c.fill(ellipse(x, z * .72, 1.2 + random() * 2.2, .7 + random() * 1.2)); }
  c.restore();
  c.lineWidth = .16; c.strokeStyle = '#3d7f36'; c.stroke(meadow);
  // Paths: a sandy band with a darker edge and a soft inner light.
  if (paths) {
    const trail = new Path2D(); for (const points of paths.lines) points.forEach(([x, z], i) => (i ? trail.lineTo(...at(x, z)) : trail.moveTo(...at(x, z))));
    c.save(); c.clip(coast(.99)); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [width, colour] of [[2.5, '#b98f57'], [2.2, '#e7c88a'], [1.1, '#efd7a0']]) {
      c.lineWidth = width; c.strokeStyle = colour; c.stroke(trail);
      for (const [x, z, r] of paths.clearings) { c.fillStyle = colour; c.fill(ellipse(...at(x, z), r + (width - 2.2) / 2, (r + (width - 2.2) / 2) * .72)); }
    }
    c.fillStyle = '#d7b273'; for (let i = 0; i < 120; i++) { const [points] = [paths.lines[Math.floor(random() * paths.lines.length)]], t = random(), j = Math.floor(t * (points.length - 1)), f = t * (points.length - 1) - j;
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
function nearPath(paths, x, z, reach) {
  for (const points of paths.lines) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < reach) return true;
  }
  return paths.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + reach * .5);
}
