// Wide cartoon scenes for the title and the cutscenes (GAME-V3.md §7), drawn in code like every sprite:
// a sky with clouds, sun or moon, far isles, the sea with rolling wave marks, the lighthouse island or
// your home island, pirate ships from the game's own fleet drawings, fog, rain and a rocky foreground.
// The look matches src/art/: bold dark outlines, a two-tone shade, warm saturated colours. Ships, the
// cabin, trees, cannons and captains are the in-game frames (src/art/registry.js), painted larger.
// createScene(options) returns a scene for ./stage.js. Original designs; no image files.
import {INK, ellipse, line, linear, mix, paint, part, poly, radial, rect, stroke} from './paint.js';
import {framesFor} from './registry.js';
import {coin} from './extras.js';

export const MOODS = Object.freeze({
  dusk: {sky: ['#26305e', '#4b3f74', '#b8666e', '#f4a861'], sea: ['#7a6f94', '#1f3a5e'], cloud: ['#f3b39b', '#c47c86'], tint: 'rgba(70,40,90,.16)', far: '#6a5f8c', glint: '#ffd58a', stars: true},
  night: {sky: ['#0b1530', '#14264d', '#22406a', '#35587a'], sea: ['#2b4868', '#0a1a30'], cloud: ['#34466e', '#25335a'], tint: 'rgba(10,22,58,.5)', far: '#22385a', glint: '#cfe0ff', stars: true},
  storm: {sky: ['#141b27', '#222c3b', '#323e4e', '#46535f'], sea: ['#3a4c5a', '#121d28'], cloud: ['#4f5a6b', '#333c4c'], tint: 'rgba(16,24,38,.52)', far: '#2b3846', glint: '#a9b8c8', stars: false},
  dawn: {sky: ['#41639a', '#8e86b4', '#ee9f86', '#ffd894'], sea: ['#8aa7c4', '#2a5679'], cloud: ['#ffe1c8', '#e2a59c'], tint: 'rgba(255,160,110,.1)', far: '#8d8db2', glint: '#fff0b8', stars: false},
  day: {sky: ['#3f9fdc', '#69b9e8', '#a6dcf2', '#dff3ef'], sea: ['#4cb6cf', '#16698f'], cloud: ['#ffffff', '#cfe3f0'], tint: null, far: '#7fb3c6', glint: '#ffffff', stars: false},
});

const GRASS = '#6dbb47', SAND = '#f1d48b', ROCK = '#9c8f86', WHITE = '#f6f0e2', RED = '#d64a3b', LAMP = '#ffd560';

// A small seeded random, so a scene looks the same after every resize.
function random(seed) { let value = seed % 2147483647 || 1; return () => (value = value * 16807 % 2147483647) / 2147483647; }

// A smooth closed shape through the midpoints of the control points (the points pull the curve), and the
// same curve as a polyline, so things can stand on a hill's top edge.
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function smooth(points) {
  const p = new Path2D(), n = points.length, start = mid(points[n - 1], points[0]);
  p.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) { const a = points[i], m = mid(a, points[(i + 1) % n]); p.quadraticCurveTo(a[0], a[1], m[0], m[1]); }
  p.closePath(); return p;
}
function outline(points) {
  const n = points.length, out = [];
  for (let i = 0; i < n; i++) {
    const from = mid(points[(i + n - 1) % n], points[i]), via = points[i], to = mid(points[i], points[(i + 1) % n]);
    for (let k = 0; k < 12; k++) { const t = k / 12, u = 1 - t; out.push([u * u * from[0] + 2 * u * t * via[0] + t * t * to[0], u * u * from[1] + 2 * u * t * via[1] + t * t * to[1]]); }
  }
  return out;
}
/** The highest point of a smooth shape's edge at x (its top surface), or fallback. */
export function topAt(points, x, fallback = 0) {
  const line = outline(points); let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = line[i], [bx, by] = line[(i + 1) % line.length];
    if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
    best = Math.min(best, ay + (by - ay) * (x - ax) / (bx - ax));
  }
  return Number.isFinite(best) ? best : fallback;
}

/** Where things go for a view of w x h CSS px (pure, so tests can check it). */
export function sceneLayout(w, h, {horizon, portraitHorizon} = {}) {
  const portrait = h > w * 1.05;
  const s = Math.max(Math.min(w / 1280, h / 800), Math.min(w, h) / 900);
  const hz = Math.round(h * ((portrait ? portraitHorizon : null) ?? horizon ?? (portrait ? .54 : .6)));
  return {w, h, s, hz, portrait, margin: Math.round(36 * s)};
}

// Sprites: an in-game frame painted at the size it is shown (k CSS px per logical px), cached per size.
function spriteCache(frames, ratio) {
  const cache = new Map();
  return (name, k, tint = null) => {
    const key = `${name}@${k.toFixed(3)}@${tint}`, frame = frames[name];
    if (!frame) return null;
    if (!cache.has(key)) {
      const image = paint(frame[3], [frame[0], frame[1]], k * ratio, {outline: frame[4]?.outline ?? .9});
      if (tint) { const c = image.getContext('2d'); c.globalCompositeOperation = 'source-atop'; c.fillStyle = tint; c.fillRect(0, 0, image.width, image.height); }
      cache.set(key, {image, frame, k});
    }
    return cache.get(key);
  };
}
/** Draws a cached sprite with its feet (the frame's anchor) on (x, y). */
function place(c, sprite, x, y, {flip = false, rotate = 0} = {}) {
  if (!sprite) return;
  const {image, frame: [fw, fh, anchor], k} = sprite;
  c.save(); c.translate(x, y); if (rotate) c.rotate(rotate); if (flip) c.scale(-1, 1);
  c.drawImage(image, -fw * k / 2, -(fh - anchor) * k, fw * k, fh * k); c.restore();
}
function tint(c, g, colour) {
  if (!colour) return;
  c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = colour; c.fillRect(-g.margin - 2, -2, g.w + g.margin * 2 + 4, g.h + 4); c.restore();
}

// A puffy cartoon cloud: overlapping circles with one outer outline and a darker underside.
function cloud(c, x, y, r, [light, dark], edge, lw) {
  const puffs = [[-1.1, .05, .62], [-.5, -.32, .86], [.32, -.36, .78], [.98, .02, .6], [0, .16, .78], [-.2, -.05, .7]].map(([dx, dy, k]) => ellipse(x + dx * r, y + dy * r, k * r, k * r * .9));
  c.save(); c.lineWidth = lw * 2; c.strokeStyle = edge; for (const p of puffs) c.stroke(p);
  c.fillStyle = dark; for (const p of puffs) c.fill(p);
  const all = new Path2D(); for (const p of puffs) all.addPath(p);
  c.clip(all); c.translate(-r * .06, -r * .2); c.fillStyle = light; for (const p of puffs) c.fill(p);
  c.restore();
}

// The sky: gradient, sun or moon, stars and clouds.
function drawSky(c, g, o, mood) {
  const {w, h, s, hz, margin} = g, [a, b, d, e] = mood.sky, left = -margin, width = w + margin * 2;
  c.fillStyle = linear(c, 0, 0, 0, hz, [[0, a], [.45, b], [.82, d], [1, e]]); c.fillRect(left, 0, width, hz + 2);
  const rand = random(o.seed ?? 7), edge = mix(INK, a, .3);
  if (o.stars ?? mood.stars) {
    c.fillStyle = '#fff6d8';
    for (let i = 0; i < 70; i++) { const x = left + rand() * width, y = rand() * hz * .62, r = (rand() * .9 + .5) * s * 1.5; c.globalAlpha = .45 + rand() * .5; c.fill(ellipse(x, y, r)); }
    c.globalAlpha = 1;
  }
  const body = o.sky === 'night' || o.sky === 'storm' ? null : o.sky === 'day' ? 'sun-high' : 'sun';
  if (body === 'sun') {
    const x = g.portrait ? w * .3 : w * .38, y = hz - 8 * s, r = 50 * s;
    c.fillStyle = radial(c, x, y, r * 5, [[0, `${mood.sky[3]}cc`], [1, `${mood.sky[3]}00`]]); c.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    part(c, ellipse(x, y, r), o.sky === 'dawn' ? '#fff0a8' : '#ffd27a', {shade: '#f6a95b', depth: r * .12, line: edge, width: 3 * s});
  } else if (body === 'sun-high') {
    const x = w * .16, y = h * .12, r = 34 * s;
    c.fillStyle = radial(c, x, y, r * 4, [[0, '#fff8d0aa'], [1, '#fff8d000']]); c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    part(c, ellipse(x, y, r), '#ffe27a', {shade: '#f8c24e', depth: r * .14, line: edge, width: 3 * s});
  } else if (o.sky === 'night' && o.moon !== false) {
    const x = g.portrait ? w * .78 : w * .2, y = h * .15, r = 30 * s;
    c.fillStyle = radial(c, x, y, r * 4, [[0, '#cfe0ff55'], [1, '#cfe0ff00']]); c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    part(c, ellipse(x, y, r), '#f3ecd0', {shade: '#cfc6a6', depth: r * .16, line: edge, width: 3 * s});
    c.fillStyle = '#ddd3b2';
    for (const [dx, dy, k] of [[-.3, -.2, .18], [.25, .2, .14], [.1, -.4, .1]]) c.fill(ellipse(x + dx * r, y + dy * r, k * r));
  }
  const count = o.sky === 'storm' ? 7 : o.sky === 'day' ? 4 : 4;
  for (let i = 0; i < count; i++) {
    const x = left + (i + .3 + rand() * .4) * width / count, y = (o.sky === 'storm' ? .14 : .1) * h + rand() * hz * (o.sky === 'storm' ? .35 : .4);
    const r = (o.sky === 'storm' ? 70 : 40 + rand() * 26) * s;
    cloud(c, x, y, r, mood.cloud, edge, 2.4 * s);
  }
  if (o.gulls) for (const [fx, fy, k] of [[.52, .22, 1], [.58, .17, .8], [.62, .26, .7]]) {
    const x = w * fx, y = h * fy, r = 9 * s * k;
    stroke(c, line([[x - r, y - r * .2], [x - r * .45, y - r * .55], [x, y], [x + r * .45, y - r * .55], [x + r, y - r * .2]]), mix(INK, a, .2), 2.2 * s * k);
  }
}

// Low isles on the horizon, a shade of the sky.
function drawFar(c, g, o, mood) {
  const {w, s, hz, margin} = g, edge = mix(mood.far, INK, .35), rand = random((o.seed ?? 7) + 3);
  for (const [fx, width, height] of [[.08, .3, 34], [.3, .18, 22], [g.portrait ? .2 : .55, .22, 28]]) {
    const x = -margin + fx * (w + margin * 2), wide = width * w, tall = height * s * (.8 + rand() * .4);
    part(c, smooth([[x - wide * .6, hz + 30 * s], [x - wide * .3, hz - tall * .7], [x, hz - tall * 1.3], [x + wide * .3, hz - tall * .6], [x + wide * .6, hz + 30 * s]]),
      mood.far, {shade: mix(mood.far, '#1a2440', .25), depth: 4 * s, line: edge, width: 2 * s});
  }
}

// The sea: a gradient with a bright line at the horizon and the sun's glitter path.
function drawSea(c, g, o, mood) {
  const {w, h, s, hz, margin} = g, [top, deep] = mood.sea;
  c.fillStyle = linear(c, 0, hz, 0, h, [[0, top], [1, deep]]); c.fillRect(-margin, hz, w + margin * 2, h - hz);
  stroke(c, line([[-margin, hz + 1], [w + margin, hz + 1]]), mix(top, '#ffffff', .4), 2.2 * s, .8);
  if (o.sky === 'dusk' || o.sky === 'dawn') {
    const x = g.portrait ? w * .3 : w * .38;
    for (let i = 0; i < 14; i++) {
      const y = hz + 6 * s + i * i * 1.9 * s, half = (10 + i * 7) * s * (i % 2 ? .6 : 1);
      if (y > h) break;
      stroke(c, line([[x - half, y], [x + half, y]]), mood.glint, (2 + i * .25) * s, .7 - i * .03);
    }
  }
}
// Rolling wave marks: little curls that drift with the swell (redrawn each frame).
function drawWaves(c, g, o, mood, time) {
  const {w, h, s, hz, margin} = g, colour = mix(mood.sea[0], '#ffffff', .35), rows = 9;
  c.lineCap = 'round'; c.strokeStyle = colour;
  for (let j = 0; j < rows; j++) {
    const k = (j + 1) / rows, y = hz + (h - hz) * k ** 1.5, size = (6 + 22 * k) * s, gap = size * 6;
    const shift = (time * (8 + 16 * k) * s + j * 97) % gap, sway = Math.sin(time * .8 + j) * 2 * s;
    c.lineWidth = (1.4 + 2.2 * k) * s; c.globalAlpha = .28 + .4 * k;
    for (let x = -margin - gap + shift + (j % 2) * gap / 2; x < w + margin; x += gap) {
      c.beginPath(); c.moveTo(x - size, y + sway); c.quadraticCurveTo(x - size / 2, y - size * .35 + sway, x, y + sway); c.quadraticCurveTo(x + size / 2, y - size * .35 + sway, x + size, y + sway); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

// The lighthouse: a white tower with red bands, a gallery, the lamp room and a red cap. Returns the lamp.
function lighthouse(c, x, ground, u, lit) {
  const H = 250 * u, lw = 3 * u, top = ground - H;
  const tower = poly([[x - 37 * u, ground + 4 * u], [x - 26 * u, top], [x + 26 * u, top], [x + 37 * u, ground + 4 * u]], 3 * u);
  part(c, tower, WHITE, {shade: '#d7cdbb', depth: 9 * u, line: false});
  c.save(); c.clip(tower);
  for (const [from, to] of [[.06, .2], [.42, .56], [.78, .92]]) { c.fillStyle = RED; c.fillRect(x - 40 * u, top + H * from, 80 * u, H * (to - from)); c.fillStyle = '#a8322a'; c.fillRect(x + 12 * u, top + H * from, 30 * u, H * (to - from)); }
  c.fillStyle = '#ffffff55'; c.fillRect(x - 20 * u, top, 7 * u, H);
  c.restore();
  stroke(c, tower, INK, lw);
  for (const fy of [.31, .67]) part(c, rect(x - 6 * u, top + H * fy, 12 * u, 18 * u, 5 * u), lit ? '#ffe39a' : '#2c3546', {shade: false, width: lw * .7});
  part(c, poly([[x - 11 * u, ground + 2 * u], [x - 11 * u, ground - 26 * u], [x, ground - 34 * u], [x + 11 * u, ground - 26 * u], [x + 11 * u, ground + 2 * u]], 5 * u), '#8a5a34', {width: lw * .8});
  part(c, rect(x - 42 * u, top - 14 * u, 84 * u, 16 * u, 4 * u), '#3d4250', {width: lw});
  for (let i = -3; i <= 3; i++) stroke(c, line([[x + i * 11 * u, top - 14 * u], [x + i * 11 * u, top - 30 * u]]), INK, lw * .7);
  stroke(c, line([[x - 40 * u, top - 30 * u], [x + 40 * u, top - 30 * u]]), INK, lw * .9);
  const lamp = {x, y: top - 50 * u};
  const room = rect(x - 23 * u, top - 70 * u, 46 * u, 42 * u, 6 * u);
  part(c, room, lit ? radial(c, x, lamp.y, 30 * u, [[0, '#fffbe0'], [.5, '#ffe27a'], [1, '#f2a93b']]) : '#3e4c60', {shade: false, width: lw});
  for (const dx of [-8, 8]) stroke(c, line([[x + dx * u, top - 69 * u], [x + dx * u, top - 29 * u]]), INK, lw * .7);
  part(c, poly([[x - 32 * u, top - 66 * u], [x, top - 106 * u], [x + 32 * u, top - 66 * u]], 4 * u), RED, {shade: '#a8322a', depth: 5 * u, width: lw, gloss: poly([[x - 4 * u, top - 98 * u], [x - 22 * u, top - 70 * u], [x - 14 * u, top - 70 * u]], 2 * u), light: '#ef7a5e'});
  part(c, ellipse(x, top - 110 * u, 6 * u), '#f2c14e', {width: lw * .8});
  return lamp;
}

// The lighthouse island: a green hill with a beach, a rocky cliff, the lighthouse, the cabin and trees.
function lighthouseIsland(c, g, sprite, cx, u, lit) {
  const {hz} = g, iw = 600 * u, base = hz + 34 * u, lw = 3 * u;
  part(c, ellipse(cx, base - 4 * u, iw * .56, 28 * u), SAND, {shade: '#d9b56a', depth: 6 * u, width: lw});
  const points = [[cx - iw * .54, base + 2 * u], [cx - iw * .4, hz - 22 * u], [cx - iw * .2, hz - 84 * u], [cx + iw * .02, hz - 116 * u], [cx + iw * .26, hz - 116 * u],
    [cx + iw * .42, hz - 66 * u], [cx + iw * .52, base + 2 * u], [cx, base + 8 * u]];
  const hill = smooth(points), top = x => topAt(points, x, hz);
  part(c, hill, GRASS, {shade: '#4f9a3a', depth: 14 * u, line: false, gloss: ellipse(cx - iw * .14, hz - 70 * u, iw * .13, 9 * u, -.35), light: '#93d36a'});
  // The cliff on the sea side: grey rock inside the hill's outline.
  c.save(); c.clip(hill);
  part(c, smooth([[cx + iw * .2, hz - 70 * u], [cx + iw * .4, hz - 100 * u], [cx + iw * .7, hz - 40 * u], [cx + iw * .5, base + 30 * u], [cx + iw * .22, base + 10 * u], [cx + iw * .26, hz - 20 * u]]),
    ROCK, {shade: '#7a6d68', depth: 12 * u, width: lw * .8, gloss: ellipse(cx + iw * .34, hz - 48 * u, 10 * u, 22 * u, .5), light: '#bdb3a8'});
  for (const [x0, y0, x1, y1] of [[.3, -30, .38, -12], [.27, 6, .33, 22], [.4, -50, .45, -36]]) stroke(c, line([[cx + iw * x0, hz + y0 * u], [cx + iw * x1, hz + y1 * u]]), INK, lw * .6, .45);
  c.restore();
  stroke(c, hill, INK, lw);
  // The beach in front of the hill, with the foam line.
  part(c, ellipse(cx - iw * .02, base + 2 * u, iw * .5, 15 * u), SAND, {shade: '#d9b56a', depth: 5 * u, width: lw});
  const path = [cx - iw * .18, cx - iw * .1, cx - iw * .03].map((x, i) => [x, top(x) + (i ? 6 : 16) * u]);
  stroke(c, line([[cx - iw * .24, base - 14 * u], ...path]), '#e8c983', 9 * u, .9);
  place(c, sprite('pine', 1.05 * u), cx - iw * .36, top(cx - iw * .36) + 14 * u);
  place(c, sprite('oak', .95 * u), cx - iw * .25, top(cx - iw * .25) + 10 * u);
  place(c, sprite('rock', 1.1 * u), cx - iw * .44, base - 2 * u);
  place(c, sprite('shrub', 1.1 * u), cx + iw * .03, top(cx + iw * .03) + 8 * u);
  place(c, sprite('cabin', 1.15 * u), cx - iw * .08, top(cx - iw * .08) + 12 * u);
  place(c, sprite('barrel', 1.1 * u), cx - iw * .18, top(cx - iw * .18) + 16 * u);
  const lamp = lighthouse(c, cx + iw * .14, top(cx + iw * .14) + 6 * u, u, lit);
  const foam = new Path2D(); foam.ellipse(cx - iw * .02, base + 6 * u, iw * .52, 16 * u, 0, Math.PI * .08, Math.PI * .92);
  stroke(c, foam, '#ffffff', 3.5 * u, .75);
  return lamp;
}

// Your home island: a wide meadow with the cabin, the bell, cannons, a wall and your captains on the beach.
function homeIsland(c, g, sprite, o) {
  const {w, s, hz, portrait} = g, u = s * (portrait ? 1.6 : 1.1), cx = w * .5, iw = portrait ? w * 1.3 : Math.min(w * .82, 1000 * s), lw = 3 * u;
  const base = hz + 52 * u, top = hz - 46 * u;
  part(c, ellipse(cx, base - 6 * u, iw * .56, 40 * u), SAND, {shade: '#d9b56a', depth: 8 * u, width: lw});
  const points = [[cx - iw * .54, base - 4 * u], [cx - iw * .42, hz - 24 * u], [cx - iw * .22, top - 12 * u], [cx + iw * .22, top - 12 * u], [cx + iw * .42, hz - 24 * u], [cx + iw * .54, base - 4 * u], [cx, base + 20 * u]];
  const hill = smooth(points), ground = x => topAt(points, x, hz);
  part(c, hill, GRASS, {shade: '#4f9a3a', depth: 16 * u, width: lw, gloss: ellipse(cx - iw * .1, top + 14 * u, iw * .2, 9 * u), light: '#93d36a'});
  stroke(c, line([[cx - iw * .02, base - 30 * u], [cx - iw * .06, hz - 10 * u], [cx - iw * .1, top + 22 * u]]), '#e8c983', 10 * u, .9);
  const k = 1.25 * u;
  place(c, sprite('pine', k * .9), cx - iw * .3, top + 18 * u);
  place(c, sprite('oak', k * .85), cx + iw * .27, top + 20 * u);
  place(c, sprite('cabin', k), cx - iw * .1, top + 34 * u);
  if (o.harbor) place(c, sprite('island-harbor', k * 1.05), cx + iw * .1, top + 40 * u);
  else place(c, sprite('island-bell', k * 1.2), cx + iw * .1, top + 38 * u);
  place(c, sprite('island-wall', k), cx + iw * .33, hz + 6 * u);
  place(c, sprite('island-cannon', k * 1.1), cx - iw * .34, hz + 8 * u);
  if (!portrait) place(c, sprite('island-cannon', k * 1.1), cx + iw * .42, base - 26 * u, {flip: true});
  for (let i = 0; i < (o.crew ?? 3); i++) {
    const at = (i - ((o.crew ?? 3) - 1) / 2) * (portrait ? 46 : 70) * u;
    place(c, sprite(`captain-${i + 1}`, k * 1.45), cx + at, base - 14 * u);
  }
  if (o.coins) for (const [dx, dy, r] of [[-.2, -8, 9], [-.17, -4, 8], [-.185, -16, 8], [.2, -6, 9], [.23, -10, 7]]) coin(c, cx + iw * dx, base + dy * u, r * u, 2.2 * u);
  stroke(c, line([[cx - iw * .52, base + 22 * u], [cx, base + 34 * u], [cx + iw * .52, base + 22 * u]]), '#ffffff', 3.5 * u, .75);
}

// A rocky corner in front, with grass, so the scene has depth.
function drawForeground(c, g, o, mood) {
  const {w, h, s} = g, u = s * 1.1, lw = 3 * u, rock = mix('#77707f', mood.sky[1], .15);
  const left = poly([[-60 * u, h + 10], [-50 * u, h - 120 * u], [40 * u, h - 150 * u], [120 * u, h - 104 * u], [190 * u, h - 40 * u], [230 * u, h + 10]], 22 * u);
  part(c, left, rock, {shade: mix(rock, '#20182a', .3), depth: 12 * u, width: lw, gloss: poly([[20 * u, h - 136 * u], [70 * u, h - 128 * u], [30 * u, h - 116 * u]], 6 * u), light: mix(rock, '#ffffff', .25)});
  for (const [x, y, r] of [[30, 140, 1], [96, 108, .8], [150, 60, .7]]) {
    const gx = x * u, gy = h - y * u, k = 18 * u * r;
    part(c, poly([[gx - k, gy + 4 * u], [gx - k * .5, gy - k * 1.5], [gx - k * .1, gy - k * .4], [gx + k * .3, gy - k * 1.8], [gx + k * .55, gy - k * .3], [gx + k, gy - k * 1.2], [gx + k * 1.1, gy + 4 * u]], 2 * u), '#5aa23c', {shade: '#3e7d2c', depth: 4 * u, width: lw * .8});
  }
  const right = poly([[w - 150 * u, h + 10], [w - 110 * u, h - 56 * u], [w - 40 * u, h - 80 * u], [w + 40 * u, h - 60 * u], [w + 50 * u, h + 10]], 18 * u);
  part(c, right, rock, {shade: mix(rock, '#20182a', .3), depth: 10 * u, width: lw});
  tint(c, g, mood.tint);
}

// The beam of the lit lamp, sweeping round (redrawn each frame); still motion holds it towards the sea.
function drawBeam(c, g, lamp, time, still) {
  if (!lamp) return;
  const {w, h, s} = g, angle = still ? Math.PI * .9 : time * .55 + 2.2, side = Math.cos(angle), facing = Math.sin(angle);
  const length = Math.abs(side) * Math.max(w, h) * .95, dir = Math.sign(side) || -1;
  c.globalCompositeOperation = 'screen';
  if (length > 24 * s) {
    const end = lamp.x + dir * length;
    // Two cones, a faint wide one and a bright narrow one, so the edge looks soft.
    for (const [spread, strength] of [[.2, .16], [.1, .42]]) {
      const reach = 10 * s + length * spread;
      c.fillStyle = linear(c, lamp.x, 0, end, 0, [[0, `rgba(255,224,140,${strength})`], [.6, `rgba(255,214,120,${strength * .35})`], [1, 'rgba(255,214,120,0)']]);
      c.beginPath(); c.moveTo(lamp.x, lamp.y - 6 * s); c.lineTo(end, lamp.y - reach * .6); c.lineTo(end, lamp.y + reach); c.lineTo(lamp.x, lamp.y + 6 * s); c.closePath(); c.fill();
    }
  }
  const r = (26 + Math.max(0, facing) * 44) * s;
  c.fillStyle = radial(c, lamp.x, lamp.y, r, [[0, 'rgba(255,248,214,.95)'], [.35, 'rgba(255,222,140,.5)'], [1, 'rgba(255,210,120,0)']]);
  c.fillRect(lamp.x - r, lamp.y - r, r * 2, r * 2);
  c.globalCompositeOperation = 'source-over';
}

function drawRain(c, g, time) {
  const {w, h, s, margin} = g, rand = random(91), fall = 900 * s, slant = .28;
  c.strokeStyle = '#c6d6e8'; c.lineCap = 'round'; c.lineWidth = 1.6 * s; c.globalAlpha = .38;
  c.beginPath();
  for (let i = 0; i < 150; i++) {
    const x0 = -margin + rand() * (w + margin * 2 + h * slant), y = (rand() * h + time * fall * (.8 + rand() * .4)) % (h + 40 * s) - 20 * s, x = x0 - y * slant;
    c.moveTo(x, y); c.lineTo(x - 7 * s, y + 24 * s);
  }
  c.stroke(); c.globalAlpha = 1;
}
function drawFog(c, g, time) {
  const {w, h, s, hz} = g, rand = random(23);
  for (let i = 0; i < 6; i++) {
    const r = (160 + rand() * 140) * s, span = w + r * 4, x = (rand() * span + time * (10 + rand() * 10) * s) % span - r * 2, y = hz + (rand() * .5 - .1) * (h - hz);
    c.fillStyle = radial(c, x, y, r, [[0, 'rgba(214,226,232,.32)'], [1, 'rgba(214,226,232,0)']]);
    c.save(); c.translate(x, y); c.scale(1, .35); c.translate(-x, -y); c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
}

function frameNames(o) {
  const names = new Set();
  if (o.island === 'lighthouse' || o.far === 'lighthouse') ['pine', 'oak', 'cabin', 'barrel', 'rock', 'shrub'].forEach(name => names.add(name));
  if (o.island === 'home') ['pine', 'oak', 'cabin', 'island-bell', 'island-harbor', 'island-wall', 'island-cannon', 'captain-1', 'captain-2', 'captain-3'].forEach(name => names.add(name));
  for (const ship of o.ships ?? []) names.add(ship.name);
  return [...names];
}

/**
 * A scene for ./stage.js. options: sky (dusk, night, storm, dawn, day), island (lighthouse, home or none),
 * far ('lighthouse': a small dark lighthouse isle on the horizon), lit and beam (the lamp), ships
 * [{name, x, y, size, flip, drift, sink}] (x a share of the width, y a share of the sea below the horizon,
 * size times the scene scale, drift px per second, sink px per second), rain, fog, gulls, stars, crew,
 * coins, harbor, horizon (a share of the height), foreground (default true), still (no motion).
 */
export async function createScene(options = {}) {
  const o = {sky: 'dusk', island: null, lit: false, beam: false, ships: [], foreground: true, ...options};
  const mood = MOODS[o.sky] ?? MOODS.dusk, frames = await framesFor(frameNames(o));
  let sprite = null, lamp = null;
  const layers = [
    {depth: .04, still: true, draw: (c, g) => drawSky(c, g, o, mood)},
    {depth: .16, still: true, draw: (c, g) => drawFar(c, g, o, mood)},
    {depth: .3, still: true, draw: (c, g) => drawSea(c, g, o, mood)},
    {depth: .3, draw: (c, g, time) => drawWaves(c, g, o, mood, o.still ? 0 : time)},
  ];
  const shipLayer = (ship, depth) => ({depth, draw: (c, g, time) => {
    const t = o.still ? 0 : time, k = g.s * (ship.size ?? 1), item = sprite(ship.name, k, ship.tint ?? mood.tint);
    const x = g.w * ship.x + (ship.drift ?? 0) * g.s * t, y = g.hz + (g.h - g.hz) * (ship.y ?? 0) + (ship.sink ?? 0) * g.s * t;
    place(c, item, x, y + Math.sin(t * 1.4 + ship.x * 9) * 3 * k, {flip: ship.flip, rotate: Math.sin(t * 1.1 + ship.x * 5) * .035 + (ship.sink ? Math.min(.3, t * .05) : 0)});
  }});
  for (const ship of o.ships.filter(item => (item.y ?? 0) < .2)) layers.push(shipLayer(ship, .34));
  if (o.far === 'lighthouse') layers.push({depth: .22, still: true, draw: (c, g) => {
    const cx = g.portrait ? g.w * .8 : g.w * .82; lighthouseIsland(c, g, sprite, cx, g.s * .36, false); tint(c, g, mood.tint);
  }});
  if (o.island === 'lighthouse') layers.push({depth: .55, still: true, draw: (c, g) => {
    const cx = g.portrait ? g.w * .62 : g.w * (o.at ?? .74);
    lamp = lighthouseIsland(c, g, sprite, cx, g.s * (o.size ?? 1) * (g.portrait ? 1.3 : .88), o.lit); tint(c, g, mood.tint);
    if (o.lit) { const r = 70 * g.s; c.globalCompositeOperation = 'screen'; c.fillStyle = radial(c, lamp.x, lamp.y, r, [[0, 'rgba(255,230,150,.7)'], [1, 'rgba(255,230,150,0)']]); c.fillRect(lamp.x - r, lamp.y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; }
  }});
  if (o.island === 'home') layers.push({depth: .55, still: true, draw: (c, g) => { homeIsland(c, g, sprite, o); tint(c, g, mood.tint); }});
  if (o.beam && o.lit) layers.push({depth: .55, draw: (c, g, time) => drawBeam(c, g, lamp, time, !!o.still)});
  for (const ship of o.ships.filter(item => (item.y ?? 0) >= .2)) layers.push(shipLayer(ship, .7));
  if (o.fog) layers.push({depth: .8, draw: (c, g, time) => drawFog(c, g, o.still ? 0 : time)});
  if (o.foreground) layers.push({depth: 1, still: true, draw: (c, g) => drawForeground(c, g, o, mood)});
  if (o.rain) layers.push({depth: 1.1, draw: (c, g, time) => drawRain(c, g, o.still ? 0 : time)});
  return {
    options: o, layers,
    layout(w, h, ratio = 1) { sprite = spriteCache(frames, ratio); return sceneLayout(w, h, o); },
  };
}

/** The scenes the title and the cutscenes use, by name (options for createScene). */
export const PANELS = Object.freeze({
  title: {sky: 'dusk', island: 'lighthouse', lit: true, beam: true, ships: [{name: 'pirate-flagship-1', x: .47, y: .05, size: .58}], portraitHorizon: .5, seed: 11},
  coast: {sky: 'dusk', island: 'lighthouse', lit: true, beam: true, gulls: true, at: .66, seed: 3},
  dark: {sky: 'storm', island: 'lighthouse', lit: false, rain: true, at: .6, seed: 5},
  pirates: {sky: 'night', far: 'lighthouse', fog: true, ships: [{name: 'pirate-flagship-1', x: .42, y: .32, size: 2.1}, {name: 'pirate-sloop-1', x: .14, y: .08, size: .9}], seed: 9},
  armada: {sky: 'night', far: 'lighthouse', ships: [{name: 'pirate-warship-1', x: .32, y: .3, size: 1.5}, {name: 'pirate-sloop-1', x: .62, y: .12, size: 1.2}, {name: 'pirate-sloop-1', x: .12, y: .06, size: .8}, {name: 'pirate-flagship-1', x: .5, y: .03, size: .6}], seed: 13},
  departing: {sky: 'night', fog: true, ships: [{name: 'pirate-flagship-1', x: .5, y: .2, size: 1.4, drift: 14}], seed: 17},
  sinking: {sky: 'night', fog: true, ships: [{name: 'pirate-wreck', x: .45, y: .28, size: 2.4, sink: 5}], seed: 19},
  home: {sky: 'day', island: 'home', crew: 3, coins: true, horizon: .48, portraitHorizon: .58, foreground: false, seed: 21},
  harbor: {sky: 'day', island: 'home', crew: 2, harbor: true, horizon: .48, portraitHorizon: .58, foreground: false, seed: 25},
  dawn: {sky: 'dawn', island: 'lighthouse', lit: true, at: .66, gulls: true, seed: 27},
  relit: {sky: 'night', island: 'lighthouse', lit: true, beam: true, at: .62, seed: 29},
});
