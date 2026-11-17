// The top is the existing analytic coast; base points extend only the decorative backdrop/foam silhouette.
import {linear, mix, poly, stroke, line} from './paint.js';
export const CLIFF_DEPTH = 1.4, APPROACH_DEPTH = .35;
const TAU = Math.PI * 2, PROJECT = .72;

/** Same 180-point top contour as ground.js; downward rock depth never changes a logical x/z. */
export function cliffProfile(surface) {
  return Array.from({length: 181}, (_, i) => {
    const a = i / 180 * TAU, edge = 1 + .055 * Math.sin(a * 5 + surface.seed) + .035 * Math.cos(a * 7);
    const x = Math.cos(a) * surface.rx * edge, z = Math.sin(a) * surface.rz * edge, y = z * PROJECT;
    // Keep the actual southern ship/beach approach shallow, easing from 18 to 30 degrees off south.
    const arc = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    const t = Math.max(0, Math.min(1, (arc - Math.PI / 10) / (Math.PI / 15)));
    const depth = APPROACH_DEPTH + (CLIFF_DEPTH - APPROACH_DEPTH) * t * t * (3 - 2 * t);
    return {x, z, y, depth, baseY: y + depth};
  });
}
const path = (rows, fraction = 0) => {
  const p = new Path2D();
  rows.forEach((point, i) => (i ? p.lineTo(point.x, point.y + point.depth * fraction) : p.moveTo(point.x, point.y + point.depth * fraction)));
  return p;
};

/** Draw before the old beach/top fill: its interior hides rear faces and keeps valid feet on top. */
export function paintCliffFaces(c, rows) {
  const base = path(rows, 1); base.closePath();
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  // A translucent contact shadow does not become opaque land in the sea's alpha threshold.
  stroke(c, base, '#253d3a', .35, .24);
  c.fillStyle = '#71634f'; c.fill(base);
  for (let from = 0; from < rows.length - 1; from += 6) {
    const side = rows.slice(from, Math.min(rows.length, from + 7));
    const middle = side[Math.floor(side.length / 2)], variation = .1 + .08 * Math.sin(from * 1.7);
    const upper = mix('#d3c4a2', '#899785', variation + (middle.x > 0 ? .12 : 0));
    const stone = mix('#a8987b', '#666950', variation + (middle.x > 0 ? .14 : 0));
    const face = poly([...side.map(p => [p.x, p.y]), ...[...side].reverse().map(p => [p.x, p.baseY])]);
    c.fillStyle = linear(c, middle.x, middle.y, middle.x, middle.baseY, [[0, upper], [.45, stone], [1, '#71634f']]);
    c.fill(face);
    // Broken vertical seams and ledges make rock strata rather than a uniformly striped retaining wall.
    const seam = side[0], bend = Math.sin(from + 2) * .12;
    stroke(c, line([[seam.x, seam.y + seam.depth * .12], [seam.x + bend, seam.y + seam.depth * .48],
      [seam.x - bend * .5, seam.y + seam.depth * .84]]), '#685e4b', .045, .8);
    if (from % 12 === 0) stroke(c, line([[middle.x - .28, middle.y + middle.depth * .64], [middle.x + .1, middle.y + middle.depth * .69],
      [middle.x + .38, middle.y + middle.depth * .61]]), '#d2bf98', .035, .7);
  }
  for (const fraction of [.34, .72]) {
    stroke(c, path(rows, fraction), '#746850', .055, .65);
    c.save(); c.translate(0, -.055); stroke(c, path(rows, fraction), '#d5c29a', .04, .65); c.restore();
  }
  c.restore();
}

/** A narrow turf/soil lip clipped to the unchanged top, not extra walking or building support. */
export function paintGrassRim(c, rows, beach) {
  c.save(); c.clip(beach); c.lineJoin = 'round';
  stroke(c, path(rows), '#537f37', .42);
  stroke(c, path(rows), '#83ad50', .22);
  c.translate(0, -.045); stroke(c, path(rows), '#bdd479', .065, .9);
  c.restore();
}
