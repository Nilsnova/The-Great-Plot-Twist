// Wide cartoon scenes for the title and the cutscenes (GAME-V3.md §7), drawn in code like every sprite:
// a sky with clouds, sun or moon, far isles, the sea with rolling wave marks, the lighthouse island or
// your home island, pirate ships from the game's own fleet drawings, fog, rain and a rocky foreground.
// Sunlit rock, timber, deep turquoise water, and warm silhouettes carry the island's visual style.
// Ships, cannons and captains use the in-game frames (src/art/registry.js), painted at scene scale.
// createScene(options) returns a scene for ./stage.js. Original designs; no image files.
import {INK, ellipse, line, linear, mix, paint, part, poly, radial, rect, stroke} from './paint.js';
import {framesFor} from './registry.js';
import {coin} from './extras.js';
import {cinematicSprites, paintBeach, paintBluff, paintMeadow, paintShallows, paintTerrace, paintTurfTufts, paintWalk, seededPaint} from './cinematic-land.js';

export const MOODS = Object.freeze({
  dusk: {sky: ['#253b63', '#5a5689', '#cb8b7d', '#ffd08b'], sea: ['#468e9c', '#12526a'], cloud: ['#ffe2b7', '#a77694'], tint: 'rgba(71,46,77,.10)', far: '#666d83', glint: '#ffd88d', stars: true},
  night: {sky: ['#0d1b34', '#182e52', '#2a506c', '#52788e'], sea: ['#305b74', '#102738'], cloud: ['#536c88', '#263955'], tint: 'rgba(10,28,57,.42)', far: '#2f4e63', glint: '#c9edf4', stars: true},
  storm: {sky: ['#161d28', '#253340', '#344b52', '#586467'], sea: ['#455f63', '#182c36'], cloud: ['#677580', '#33404d'], tint: 'rgba(19,31,42,.42)', far: '#354852', glint: '#add2d5', stars: false},
  dawn: {sky: ['#426f9b', '#998bb1', '#eeab8e', '#ffda9b'], sea: ['#61a3ac', '#20677d'], cloud: ['#ffe8c7', '#c38995'], tint: 'rgba(255,160,110,.08)', far: '#8a8ea0', glint: '#fff1ba', stars: false},
  day: {sky: ['#42a5ca', '#72c8df', '#b6e3ec', '#deefe7'], sea: ['#4cbab9', '#187c94'], cloud: ['#fff7dc', '#9bc7d2'], tint: null, far: '#82b1b5', glint: '#f0ffdf', stars: false},
});

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
      const painter = cinematicSprites[name];
      const image = paint(painter ?? frame[3], [frame[0], frame[1]], k * ratio,
        {outline: painter ? .32 : (frame[4]?.outline ?? .9)});
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

// Clouds keep their silhouettes, with the sun on the upper edge and reflected sky in the folds.
function cloud(c, x, y, r, [light, dark], edge) {
  const puffs = [[-1.1, .05, .62], [-.5, -.32, .86], [.32, -.36, .78], [.98, .02, .6], [0, .16, .78], [-.2, -.05, .7]].map(([dx, dy, k]) => ellipse(x + dx * r, y + dy * r, k * r, k * r * .9));
  const all = new Path2D(); for (const p of puffs) all.addPath(p);
  c.save(); c.clip(all);
  c.fillStyle = linear(c, x - r * .25, y - r * .82, x + r * .32, y + r * .86,
    [[0, light], [.49, mix(light, dark, .23)], [.83, dark], [1, mix(dark, edge, .29)]]);
  c.fill(all);
  for (const [dx, dy, scale] of [[-.98, -.22, .63], [-.36, -.55, .73], [.20, -.67, .64], [.87, -.13, .51]]) {
    const px = x + dx * r, py = y + dy * r, extent = r * scale;
    c.fillStyle = radial(c, px, py, extent, [[0, `${light}bd`], [.55, `${light}5a`], [1, `${light}00`]]);
    c.fill(ellipse(px, py, extent, extent * .7, -.12));
  }
  c.restore();
}

// The sky: gradient, sun or moon, stars and clouds.
function drawSky(c, g, o, mood) {
  const {w, h, s, hz, margin} = g, [a, b, d, e] = mood.sky, left = -margin, width = w + margin * 2;
  c.fillStyle = linear(c, 0, 0, 0, hz, [[0, a], [.45, b], [.82, d], [1, e]]); c.fillRect(left, 0, width, hz + 2);
  const rand = seededPaint(o.seed ?? 7), edge = mix(INK, a, .3);
  const warm = o.sky === 'dusk' || o.sky === 'dawn', glowX = w * (g.portrait ? .30 : .38);
  if (warm || o.sky === 'day') {
    const glowY = warm ? hz : h * .12, glowSize = Math.max(hz * .88, w * .36);
    c.fillStyle = radial(c, glowX, glowY, glowSize, [[0, `${mood.glint}9c`], [.35, `${mood.sky[3]}5c`], [1, `${mood.sky[3]}00`]]);
    c.fillRect(left, 0, width, hz + 2);
  }
  if (o.stars ?? mood.stars) {
    c.fillStyle = '#fff6d8';
    for (let i = 0; i < 70; i++) { const x = left + rand() * width, y = rand() * hz * .62, r = (rand() * .9 + .5) * s * 1.5; c.globalAlpha = .45 + rand() * .5; c.fill(ellipse(x, y, r)); }
    c.globalAlpha = 1;
  }
  const body = o.sky === 'night' || o.sky === 'storm' ? null : o.sky === 'day' ? 'sun-high' : 'sun';
  if (body === 'sun') {
    const x = g.portrait ? w * .3 : w * .38, y = hz - 8 * s, r = 50 * s;
    c.fillStyle = radial(c, x, y, r * 5, [[0, `${mood.sky[3]}cc`], [1, `${mood.sky[3]}00`]]); c.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    part(c, ellipse(x, y, r), radial(c, x - r * .26, y - r * .21, r * 1.3,
      [[0, '#fff5ca'], [.53, '#ffe2a5'], [1, '#f2ae67']]), {line: false, shade: false});
  } else if (body === 'sun-high') {
    const x = w * .16, y = h * .12, r = 34 * s;
    c.fillStyle = radial(c, x, y, r * 4, [[0, '#fff8d0aa'], [1, '#fff8d000']]); c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    part(c, ellipse(x, y, r), radial(c, x - r * .23, y - r * .2, r * 1.24,
      [[0, '#fff9d6'], [.58, '#ffe495'], [1, '#eebb5f']]), {line: false, shade: false});
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
    cloud(c, x, y, r, mood.cloud, edge);
  }
  if (o.gulls) for (const [fx, fy, k] of [[.52, .22, 1], [.58, .17, .8], [.62, .26, .7]]) {
    const x = w * fx, y = h * fy, r = 9 * s * k;
    stroke(c, line([[x - r, y - r * .2], [x - r * .45, y - r * .55], [x, y], [x + r * .45, y - r * .55], [x + r, y - r * .2]]), mix(INK, a, .2), 2.2 * s * k);
  }
}

// Low isles on the horizon, a shade of the sky.
function drawFar(c, g, o, mood) {
  const {w, s, hz, margin} = g, rand = seededPaint((o.seed ?? 7) + 3);
  for (const [fx, width, height] of [[.08, .3, 34], [.3, .18, 22], [g.portrait ? .2 : .55, .22, 28]]) {
    const x = -margin + fx * (w + margin * 2), wide = width * w, tall = height * s * (.8 + rand() * .4);
    const island = smooth([[x - wide * .6, hz + 30 * s], [x - wide * .3, hz - tall * .7], [x, hz - tall * 1.3], [x + wide * .3, hz - tall * .6], [x + wide * .6, hz + 30 * s]]);
    part(c, island, linear(c, x - wide * .2, hz - tall, x + wide * .15, hz + 20 * s,
      [[0, mix(mood.far, mood.sky[3], .18)], [.55, mood.far], [1, mix(mood.far, mood.sea[0], .64)]]),
    {line: false, shade: false});
  }
}

// The sea: a gradient with a bright line at the horizon and the sun's glitter path.
function drawSea(c, g, o, mood) {
  const {w, h, s, hz, margin} = g, [top, deep] = mood.sea, span = h - hz, full = w + margin * 2;
  c.fillStyle = linear(c, w * .42, hz, w * .57, h,
    [[0, top], [.21, mix(top, deep, .26)], [.57, mix(top, deep, .68)], [1, deep]]);
  c.fillRect(-margin, hz, full, span);
  c.save(); c.beginPath(); c.rect(-margin, hz, full, span); c.clip();
  const swell = seededPaint((o.seed ?? 7) + 41);
  for (let j = 0; j < 92; j++) {
    const k = swell() ** 1.52, y = hz + span * k, at = -margin + swell() * full;
    const radius = s * (9 + 93 * k) * (.8 + swell() * .8), pale = j % 4 > 1;
    const tint = pale ? mix(top, '#90edda', .30) : mix(deep, '#092b3e', .24);
    c.fillStyle = radial(c, at, y, radius, [[0, `${tint}63`], [.60, `${tint}39`], [1, `${tint}00`]]);
    c.save(); c.translate(at, y); c.scale(1, .11 + k * .075); c.translate(-at, -y);
    c.fill(ellipse(at, y, radius, radius)); c.restore();
  }
  for (let j = 0; j < 18; j++) {
    const k = .28 + swell() * .7, y = hz + span * k, at = -margin + swell() * full;
    const width = (21 + swell() * (47 + k * 90)) * s, tilt = (3 + swell() * k * 11) * s;
    const eddy = new Path2D(); eddy.moveTo(at - width, y + tilt);
    eddy.bezierCurveTo(at - width * .41, y - tilt, at + width * .32, y + tilt * .43, at + width, y - tilt * .77);
    const sheen = mix(top, '#b1ebd1', .40);
    stroke(c, eddy, linear(c, at - width, 0, at + width, 0,
      [[0, `${sheen}00`], [.31, `${sheen}61`], [.67, `${sheen}4d`], [1, `${sheen}00`]]),
    s * (1.1 + 2.1 * k), .52);
  }
  c.restore();
  stroke(c, line([[-margin, hz + 1], [w + margin, hz + 1]]), mix(top, '#dcf8e3', .25), 1.4 * s, .7);
  if (o.sky === 'dusk' || o.sky === 'dawn') {
    const x = g.portrait ? w * .3 : w * .38;
    for (let i = 0; i < 14; i++) {
      const y = hz + 6 * s + i * i * 1.9 * s, half = (10 + i * 7) * s * (i % 2 ? .6 : 1);
      if (y > h) break;
      const glint = linear(c, x - half, y, x + half, y,
        [[0, `${mood.glint}00`], [.3, `${mood.glint}85`], [.58, mood.glint], [1, `${mood.glint}00`]]);
      stroke(c, [[x - half, y + s], [x - half * .29, y - s], [x + half * .34, y], [x + half, y - s]],
        glint, (1.6 + i * .34) * s, .76 - i * .033);
    }
  }
}
// Rolling wave marks: little curls that drift with the swell (redrawn each frame).
function drawWaves(c, g, o, mood, time) {
  const {w, h, s, hz, margin} = g, colour = mix(mood.sea[0], '#d9f9e3', .53), rows = 9;
  c.lineCap = 'round';
  for (let j = 0; j < rows; j++) {
    const k = (j + 1) / rows, y = hz + (h - hz) * k ** 1.5, size = (6 + 22 * k) * s, gap = size * 6;
    const shift = (time * (8 + 16 * k) * s + j * 97) % gap, sway = Math.sin(time * .8 + j) * 2 * s;
    const crest = new Path2D(), reflection = new Path2D();
    for (let x = -margin - gap + shift + (j % 2) * gap / 2; x < w + margin; x += gap) {
      const phase = Math.sin(Math.floor((x - shift) / gap + .45) * 3.7 + j * 1.6), v = y + sway + phase * size * .51;
      const extent = size * (.57 + (phase + 1) * .48);
      crest.moveTo(x - extent, v + extent * .12);
      crest.bezierCurveTo(x - extent * .4, v - extent * .23, x + extent * .26, v + extent * .26, x + extent * .83, v - extent * .08);
      reflection.moveTo(x - extent * .73, v + extent * .24);
      reflection.quadraticCurveTo(x, v + extent * .27, x + extent * .55, v + extent * .22);
    }
    stroke(c, reflection, mix(mood.sea[0], mood.sea[1], .55), (1 + k * 2) * s, .2 + .27 * k);
    stroke(c, crest, colour, (.9 + 1.35 * k) * s, .19 + .48 * k);
  }
}

// The lighthouse: a white tower with red bands, a gallery, the lamp room and a red cap. Returns the lamp.
function lighthouse(c, x, ground, u, lit) {
  const H = 250 * u, lw = 2.15 * u, top = ground - H;
  const tower = poly([[x - 37 * u, ground + 4 * u], [x - 26 * u, top], [x + 26 * u, top], [x + 37 * u, ground + 4 * u]], 3 * u);
  const limestone = linear(c, x - 39 * u, 0, x + 42 * u, 0,
    [[0, '#9e9489'], [.16, '#e9d7b4'], [.33, '#fff2d5'], [.56, '#e9d4b3'], [.79, '#b9aa98'], [1, '#747783']]);
  part(c, tower, limestone, {line: false, shade: false});
  c.save(); c.clip(tower);
  const terracotta = linear(c, x - 39 * u, 0, x + 43 * u, 0,
    [[0, '#9f5447'], [.23, '#e88c69'], [.43, '#c96c53'], [.71, '#a95647'], [1, '#76434b']]);
  for (const [from, to] of [[.06, .2], [.42, .56], [.78, .92]]) {
    c.fillStyle = terracotta; c.fillRect(x - 40 * u, top + H * from, 80 * u, H * (to - from));
    stroke(c, [[x - 41 * u, top + H * from], [x + 39 * u, top + H * from]], '#fff0d2', u * 1.5, .27);
  }
  // The mortar and fine weathering follow the same painted tower as its red bands.
  const rand = seededPaint(513);
  for (let j = 0, y = top + 12 * u; y < ground; j++, y += (9 + rand() * 5) * u) {
    stroke(c, [[x - 37 * u, y + .6 * u], [x - 10 * u, y], [x + 20 * u, y + .25 * u], [x + 37 * u, y + 1.8 * u]],
      '#665658', u * .76, .25);
    stroke(c, [[x - 27 * u, y + 1.9 * u], [x + 18 * u, y + 1.6 * u]], '#fff2d6', u * .65, .36);
    for (let stone = 0; stone < 3; stone++) {
      const at = x + (-34 + (j % 2) * 7 + stone * 20) * u;
      stroke(c, [[at, y + u], [at + u * .55, y + (6 + rand() * 5) * u]], '#715e55', u * .73, .25);
    }
  }
  for (let i = 0; i < 155; i++) {
    const dx = (-38 + rand() * 76) * u, y = top + rand() * H, radius = (.17 + rand() * .8) * u;
    c.fillStyle = i % 4 ? '#6e5c5624' : '#ffffff4f'; c.fill(ellipse(x + dx, y, radius, radius * 1.72));
  }
  c.fillStyle = linear(c, x, ground - 46 * u, x, ground + 4 * u, [[0, '#49584b00'], [1, '#45604a55']]);
  c.fillRect(x - 38 * u, ground - 46 * u, 76 * u, 50 * u);
  c.restore();
  stroke(c, tower, '#514855', lw, .85);
  for (const fy of [.31, .67]) {
    const wx = x - 8 * u, wy = top + H * fy, ww = 16 * u, wh = 20 * u;
    part(c, rect(wx, wy, ww, wh, 2 * u), lit ? radial(c, x, wy + wh * .42, wh * .68,
      [[0, '#fff1b6'], [.52, '#e6ae63'], [1, '#ac743e']]) : '#2c3546', {line: '#735644', shade: false, width: lw * .82});
    stroke(c, [[x, wy], [x, wy + wh]], '#725b47', lw * .54);
    stroke(c, [[wx, wy + wh / 2], [wx + ww, wy + wh / 2]], '#725b47', lw * .54);
    stroke(c, [[wx, wy + wh + u * .54], [wx + ww, wy + wh + u * .54]], '#eee0c8', lw * .75, .82);
  }
  const door = poly([[x - 11 * u, ground + 2 * u], [x - 11 * u, ground - 26 * u], [x, ground - 34 * u],
    [x + 11 * u, ground - 26 * u], [x + 11 * u, ground + 2 * u]], 5 * u);
  part(c, door, linear(c, x - 8 * u, ground - 30 * u, x + 12 * u, ground,
    [[0, '#b78659'], [.44, '#93633f'], [1, '#523c30']]), {line: '#725947', width: lw * .9});
  stroke(c, [[x - 4 * u, ground - 26 * u], [x - 4 * u, ground + u]], '#d4ad78', u * .9, .66);
  part(c, ellipse(x + 5.2 * u, ground - 12 * u, 1.4 * u), '#cf9e5a', {line: '#7a644b', width: lw * .35});
  part(c, rect(x - 42 * u, top - 14 * u, 84 * u, 16 * u, 4 * u),
    linear(c, x - 42 * u, top - 13 * u, x + 42 * u, top + 3 * u,
      [[0, '#bfa179'], [.12, '#e3c398'], [.5, '#aa9177'], [1, '#5f626d']]), {line: '#5e5360', shade: false, width: lw});
  const brass = linear(c, x - 41 * u, 0, x + 41 * u, 0, [[0, '#746758'], [.3, '#ecc17d'], [.72, '#b08d60'], [1, '#795f55']]);
  for (let i = -3; i <= 3; i++) stroke(c, [[x + i * 11 * u, top - 14 * u], [x + i * 11 * u, top - 30 * u]], brass, lw * .85);
  stroke(c, [[x - 40 * u, top - 30 * u], [x + 40 * u, top - 30 * u]], '#6e5c4c', lw * 1.35);
  stroke(c, [[x - 40 * u, top - 30 * u], [x + 40 * u, top - 30 * u]], brass, lw * .86);
  const lamp = {x, y: top - 50 * u};
  const room = rect(x - 23 * u, top - 70 * u, 46 * u, 42 * u, 6 * u);
  const glass = lit ? radial(c, x, lamp.y, 30 * u, [[0, '#fffceb'], [.44, '#ffe9a2'], [.73, '#ebbc65'], [1, '#a97947']])
    : linear(c, x - 18 * u, top - 70 * u, x + 23 * u, top - 30 * u, [[0, '#5f7c8b'], [.5, '#3d5c6d'], [1, '#324554']]);
  part(c, room, glass, {line: '#78644f', shade: false, width: lw});
  for (const dx of [-8, 8]) stroke(c, [[x + dx * u, top - 69 * u], [x + dx * u, top - 29 * u]], brass, lw * .78);
  const roof = poly([[x - 32 * u, top - 66 * u], [x, top - 106 * u], [x + 32 * u, top - 66 * u]], 4 * u);
  part(c, roof, linear(c, x - 20 * u, top - 100 * u, x + 26 * u, top - 66 * u,
    [[0, '#eaa677'], [.32, '#b87555'], [.68, '#9a5b55'], [1, '#5e495b']]), {line: '#6a4f56', width: lw, shade: false});
  stroke(c, [[x - 6 * u, top - 93 * u], [x - 15 * u, top - 81 * u], [x - 24 * u, top - 69 * u]], '#ffddbe', lw, .70);
  stroke(c, [[x - 28 * u, top - 67 * u], [x + 28 * u, top - 67 * u]], '#b28c66', lw, .8);
  part(c, ellipse(x, top - 110 * u, 6 * u), '#d9ab59', {line: '#725d4d', width: lw * .72,
    depth: 1.8 * u, gloss: ellipse(x - 1.9 * u, top - 112 * u, 1.9 * u)});
  return lamp;
}

// The lighthouse island: a green hill with a beach, a rocky cliff, the lighthouse, the cabin and trees.
function lighthouseIsland(c, g, sprite, cx, u, lit) {
  const {hz} = g, iw = 600 * u, base = hz + 34 * u;
  paintShallows(c, cx, base + 8 * u, iw * .64, 58 * u, u, 142);
  paintBeach(c, cx, base - 4 * u, iw * .56, 28 * u, u, 214);
  const points = [[cx - iw * .54, base + 2 * u], [cx - iw * .4, hz - 22 * u], [cx - iw * .2, hz - 84 * u], [cx + iw * .02, hz - 116 * u], [cx + iw * .26, hz - 116 * u],
    [cx + iw * .42, hz - 66 * u], [cx + iw * .52, base + 2 * u], [cx, base + 8 * u]];
  const hill = smooth(points), top = x => topAt(points, x, hz);
  paintMeadow(c, hill, {left: cx - iw * .55, top: hz - 116 * u, width: iw * 1.1, height: 157 * u, unit: u, seed: 279});
  // Model a stack of coastal rocks inside the same sea-facing bluff.
  c.save(); c.clip(hill);
  const shoreWall = smooth([[cx - iw * .55, base + 6 * u], [cx - iw * .43, base - 8 * u],
    [cx - iw * .24, base - 11 * u], [cx - iw * .07, base - 9 * u], [cx + iw * .18, base - 16 * u],
    [cx + iw * .35, base - 29 * u], [cx + iw * .59, base + 5 * u], [cx + iw * .4, base + 36 * u],
    [cx - iw * .30, base + 25 * u]]);
  paintBluff(c, shoreWall, {left: cx - iw * .55, top: base - 34 * u, width: iw * 1.17, height: 74 * u, unit: u, seed: 641});
  paintTerrace(c, [[cx - iw * .48, hz + 15 * u], [cx - iw * .39, hz - 18 * u],
    [cx - iw * .27, hz - 14 * u]], 18 * u, u, 512);
  paintTerrace(c, [[cx + iw * .014, hz - 80 * u], [cx + iw * .14, hz - 84 * u],
    [cx + iw * .25, hz - 92 * u]], 16 * u, u, 616);
  const bluff = smooth([[cx + iw * .2, hz - 70 * u], [cx + iw * .4, hz - 100 * u], [cx + iw * .7, hz - 40 * u],
    [cx + iw * .5, base + 30 * u], [cx + iw * .22, base + 10 * u], [cx + iw * .26, hz - 20 * u]]);
  paintBluff(c, bluff, {left: cx + iw * .17, top: hz - 111 * u, width: iw * .56, height: 180 * u, unit: u, seed: 445});
  const verge = new Path2D();
  verge.moveTo(cx + iw * .25, base + 7 * u);
  verge.bezierCurveTo(cx + iw * .20, hz - 6 * u, cx + iw * .27, hz - 19 * u, cx + iw * .24, hz - 46 * u);
  verge.bezierCurveTo(cx + iw * .21, hz - 71 * u, cx + iw * .34, hz - 89 * u, cx + iw * .40, hz - 86 * u);
  stroke(c, verge, '#718c46', u * 5.5, .86);
  stroke(c, verge, '#c3d774', u * 1.76, .76);
  paintTurfTufts(c, [[cx - iw * .405, hz - .8 * u, .75], [cx - iw * .320, hz - 14 * u, .95],
    [cx - iw * .206, base - 8 * u, 1.11], [cx - iw * .072, base - 9 * u, .7],
    [cx + iw * .07, hz - 80 * u, .65], [cx + iw * .19, base - 17 * u, 1.15],
    [cx + iw * .251, hz - 47 * u, .9], [cx + iw * .286, hz - 67 * u, .7]], u);
  const lampFoot = cx + iw * .14, cabinFoot = cx - iw * .08;
  for (const [x, y, width, height] of [[lampFoot + 32 * u, top(lampFoot) + 11 * u, 68 * u, 12 * u],
    [cabinFoot + 22 * u, top(cabinFoot) + 20 * u, 48 * u, 8 * u]]) {
    c.save(); c.translate(x, y); c.rotate(-.03); c.scale(1, height / width);
    c.fillStyle = radial(c, -width * .12, 0, width, [[0, '#2d473d7b'], [.6, '#31543d48'], [1, '#34523b00']]);
    c.fill(ellipse(0, 0, width)); c.restore();
  }
  c.restore();
  stroke(c, hill, '#546841', u * 2.15, .8);
  // The beach in front of the hill, with the foam line.
  paintBeach(c, cx - iw * .02, base + 2 * u, iw * .5, 15 * u, u, 717);
  const path = [cx - iw * .18, cx - iw * .1, cx - iw * .03].map((x, i) => [x, top(x) + (i ? 6 : 16) * u]);
  paintWalk(c, [[cx - iw * .24, base - 14 * u], ...path], 9 * u);
  place(c, sprite('pine', 1.05 * u), cx - iw * .36, top(cx - iw * .36) + 14 * u);
  place(c, sprite('oak', .95 * u), cx - iw * .25, top(cx - iw * .25) + 10 * u);
  place(c, sprite('rock', 1.1 * u), cx - iw * .44, base - 2 * u);
  place(c, sprite('shrub', 1.1 * u), cx + iw * .03, top(cx + iw * .03) + 8 * u);
  place(c, sprite('cabin', 1.15 * u), cx - iw * .08, top(cx - iw * .08) + 12 * u);
  place(c, sprite('barrel', 1.1 * u), cx - iw * .18, top(cx - iw * .18) + 16 * u);
  const lamp = lighthouse(c, cx + iw * .14, top(cx + iw * .14) + 6 * u, u, lit);
  const foam = new Path2D(); foam.ellipse(cx - iw * .02, base + 6 * u, iw * .52, 16 * u, 0, Math.PI * .08, Math.PI * .92);
  stroke(c, foam, '#66c7bd', 5.1 * u, .62);
  stroke(c, foam, '#dcffe6', 1.9 * u, .9);
  return lamp;
}

// Your home island: a wide meadow with the cabin, the bell, cannons, a wall and your captains on the beach.
function homeIsland(c, g, sprite, o) {
  const {w, s, hz, portrait} = g, u = s * (portrait ? 1.6 : 1.1), cx = w * .5, iw = portrait ? w * 1.3 : Math.min(w * .82, 1000 * s);
  const base = hz + 52 * u, top = hz - 46 * u;
  paintShallows(c, cx, base + 14 * u, iw * .62, 64 * u, u, o.seed + 2);
  paintBeach(c, cx, base - 6 * u, iw * .56, 40 * u, u, o.seed + 1);
  const points = [[cx - iw * .54, base - 4 * u], [cx - iw * .42, hz - 24 * u], [cx - iw * .22, top - 12 * u], [cx + iw * .22, top - 12 * u], [cx + iw * .42, hz - 24 * u], [cx + iw * .54, base - 4 * u], [cx, base + 20 * u]];
  const hill = smooth(points);
  paintMeadow(c, hill, {left: cx - iw * .54, top: top - 12 * u, width: iw * 1.08, height: 130 * u, unit: u, seed: o.seed + 3});
  c.save(); c.clip(hill);
  paintTerrace(c, [[cx - iw * .41, top + 45 * u], [cx - iw * .29, top + 21 * u],
    [cx - iw * .20, top + 29 * u]], 10 * u, u, o.seed + 4);
  paintTerrace(c, [[cx + iw * .16, top + 33 * u], [cx + iw * .29, top + 24 * u],
    [cx + iw * .43, top + 44 * u]], 13 * u, u, o.seed + 5);
  const cliffs = smooth([[cx - iw * .58, base + 4 * u], [cx - iw * .43, base - 7 * u], [cx - iw * .28, base + 2 * u],
    [cx, base + 7 * u], [cx + iw * .36, base + 2 * u], [cx + iw * .54, base - 11 * u], [cx + iw * .6, base + 37 * u], [cx, base + 62 * u]]);
  paintBluff(c, cliffs, {left: cx - iw * .6, top: base - 17 * u, width: iw * 1.22, height: 83 * u, unit: u, seed: o.seed + 19});
  c.restore();
  stroke(c, hill, '#635f40', u * 1.83, .77);
  paintWalk(c, [[cx - iw * .02, base - 30 * u], [cx - iw * .06, hz - 10 * u], [cx - iw * .1, top + 22 * u]], 10 * u);
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
  const wash = new Path2D();
  wash.moveTo(cx - iw * .52, base + 22 * u);
  wash.quadraticCurveTo(cx, base + 42 * u, cx + iw * .52, base + 22 * u);
  stroke(c, wash, '#6cd7c8', 5.5 * u, .68);
  stroke(c, wash, '#e5ffed', 1.95 * u, .92);
}

// A rocky corner in front, with grass, so the scene has depth.
function drawForeground(c, g, o, mood) {
  const {w, h, s} = g, u = s * 1.1, lw = 1.75 * u;
  const left = poly([[-60 * u, h + 10], [-50 * u, h - 120 * u], [40 * u, h - 150 * u], [120 * u, h - 104 * u], [190 * u, h - 40 * u], [230 * u, h + 10]], 22 * u);
  const cool = o.sky === 'night' || o.sky === 'storm';
  paintBluff(c, left, {left: -65 * u, top: h - 150 * u, width: 302 * u, height: 163 * u + 12, unit: u, seed: 937, cool});
  for (const [x, y, r] of [[30, 140, 1], [96, 108, .8], [150, 60, .7]]) {
    const gx = x * u, gy = h - y * u, k = 18 * u * r;
    const leaves = poly([[gx - k, gy + 4 * u], [gx - k * .5, gy - k * 1.5], [gx - k * .1, gy - k * .4], [gx + k * .3, gy - k * 1.8], [gx + k * .55, gy - k * .3], [gx + k, gy - k * 1.2], [gx + k * 1.1, gy + 4 * u]], 2 * u);
    part(c, leaves, linear(c, gx - k * .8, gy - k * 1.55, gx + k, gy,
      [[0, '#b0d46c'], [.45, '#6f9f4b'], [1, '#365e41']]), {line: '#385544', width: lw * .72, shade: false});
  }
  const right = poly([[w - 150 * u, h + 10], [w - 110 * u, h - 56 * u], [w - 40 * u, h - 80 * u], [w + 40 * u, h - 60 * u], [w + 50 * u, h + 10]], 18 * u);
  paintBluff(c, right, {left: w - 155 * u, top: h - 82 * u, width: 208 * u, height: 94 * u + 12, unit: u, seed: 387, cool});
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
    // Nested soft fan contours feather the falloff through the same moving anchor.
    for (const [spread, strength] of [[.20, .09], [.14, .14], [.087, .31]]) {
      const reach = 10 * s + length * spread;
      const bloom = lamp.x + dir * length * .29;
      c.fillStyle = linear(c, lamp.x, 0, end, 0, [[0, `rgba(255,235,165,${strength})`],
        [.34, `rgba(255,222,148,${strength * .56})`], [1, 'rgba(255,214,120,0)']]);
      c.beginPath(); c.moveTo(lamp.x, lamp.y - 6 * s);
      c.quadraticCurveTo(bloom, lamp.y - reach * .28, end, lamp.y - reach * .6);
      c.lineTo(end, lamp.y + reach);
      c.quadraticCurveTo(bloom, lamp.y + reach * .32, lamp.x, lamp.y + 6 * s);
      c.closePath(); c.fill();
    }
  }
  const r = (26 + Math.max(0, facing) * 44) * s;
  c.fillStyle = radial(c, lamp.x, lamp.y, r, [[0, 'rgba(255,248,214,.95)'], [.35, 'rgba(255,222,140,.5)'], [1, 'rgba(255,210,120,0)']]);
  c.fillRect(lamp.x - r, lamp.y - r, r * 2, r * 2);
  c.globalCompositeOperation = 'source-over';
}

function drawRain(c, g, time) {
  const {w, h, s, margin} = g, rand = seededPaint(91), fall = 900 * s, slant = .28;
  c.strokeStyle = '#c6d6e8'; c.lineCap = 'round'; c.lineWidth = 1.6 * s; c.globalAlpha = .38;
  c.beginPath();
  for (let i = 0; i < 150; i++) {
    const x0 = -margin + rand() * (w + margin * 2 + h * slant), y = (rand() * h + time * fall * (.8 + rand() * .4)) % (h + 40 * s) - 20 * s, x = x0 - y * slant;
    c.moveTo(x, y); c.lineTo(x - 7 * s, y + 24 * s);
  }
  c.stroke(); c.globalAlpha = 1;
}
function drawFog(c, g, time) {
  const {w, h, s, hz} = g, rand = seededPaint(23);
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
 * [{name, x, y, size, flip, drift, sink, portrait}] (x a share of the width, y a share of the sea below
 * the horizon, size times the scene scale, drift and sink px per second, optional portrait x/y), rain, fog, gulls, stars, crew,
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
    const position = (g.portrait && ship.portrait) || ship;
    const x = g.w * position.x + (ship.drift ?? 0) * g.s * t, y = g.hz + (g.h - g.hz) * (position.y ?? 0) + (ship.sink ?? 0) * g.s * t;
    place(c, item, x, y + Math.sin(t * 1.4 + position.x * 9) * 3 * k, {flip: ship.flip, rotate: Math.sin(t * 1.1 + position.x * 5) * .035 + (ship.sink ? Math.min(.3, t * .05) : 0)});
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
  title: {sky: 'dusk', island: 'lighthouse', lit: true, beam: true, ships: [{name: 'pirate-flagship-1', x: .62, y: .27, size: .64, portrait: {x: .12, y: .04}}], portraitHorizon: .44, seed: 11},
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
