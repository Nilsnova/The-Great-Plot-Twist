// The island in the clean cartoon style: trees, rocks and props, the captain's cabin, the harbor bell,
// the build markers and every building a crew puts up (walls, cannons, mortars by level, the
// watchtower, houses). Seen from the game's three-quarter camera: a front face and a lighter top.
// Original designs. Boxes and anchors are the old atlas's, so every renderer keeps its numbers.
import {INK, ellipse, line, mix, part, poly, radial, rect, shadow, stroke} from './paint.js';

const WOOD = '#a8693a', WOOD_LIGHT = '#c98a4e', WOOD_DARK = '#7a4a2a', STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb';
const IRON = '#3e4250', BRASS = '#f2c14e', ROOF = '#d4553e', LEAF = '#5cb84a', LEAF_DARK = '#3d8f3c', PINE = '#2f8f5a';
// The tower tiers (GAME-V3.md §4.1): levels 4 and 5 wear gold trim and the island's banner, teal at level 4,
// royal blue with a gold star at level 5 (Redtide's ships fly red, so the defenders never do).
const GOLD = '#ffcf3f', GOLD_DARK = '#c98a2a', BANNER = {4: '#2c9aa6', 5: '#2f56b0'};
// A banner on a pole: the pole's foot at (x, foot), `tall` high; a swallow-tailed flag with a gold edge, a gold
// knob on top and, at level 5, a gold star on the cloth. `size` scales the cloth.
function banner(c, x, foot, tall, level, size = 1) {
  const top = foot - tall, fw = 12 * size, fh = 8 * size, cloth = BANNER[level] ?? BANNER[4];
  part(c, rect(x - .9, top, 1.8, tall, .6), WOOD_DARK, {width: .8});
  part(c, poly([[x + .9, top + 1], [x + .9 + fw, top + 1], [x + .9 + fw - 3 * size, top + 1 + fh / 2], [x + .9 + fw, top + 1 + fh], [x + .9, top + 1 + fh]], .6),
    cloth, {depth: 1, width: 1, gloss: rect(x + 2, top + 2, fw * .5, 1, .4), light: mix(cloth, '#ffffff', .35)});
  stroke(c, line([[x + .9, top + 1.6], [x + .9 + fw - .6, top + 1.6]]), GOLD, .9);
  stroke(c, line([[x + .9, top + fh + .4], [x + .9 + fw - .6, top + fh + .4]]), GOLD, .9);
  if (level >= 5) part(c, starPath(x + .9 + fw * .4, top + 1 + fh / 2, 2.6 * size, 1.1 * size), GOLD, {width: .6, shade: false});
  part(c, ellipse(x, top - .6, 1.6), GOLD, {width: .7, shade: false, gloss: ellipse(x - .5, top - 1.1, .5)});
}
// A cloth banner hanging on a wall's face: gold rod and edges, a swallow tail, the star at level 5.
function hangingBanner(c, x, y, w, h, level) {
  const cloth = BANNER[level] ?? BANNER[4];
  part(c, poly([[x, y], [x + w, y], [x + w, y + h], [x + w / 2, y + h - 3.4], [x, y + h]], .5), cloth,
    {depth: 1.2, width: 1, gloss: rect(x + 1.2, y + 1.6, 1, h - 6, .4), light: mix(cloth, '#ffffff', .35)});
  stroke(c, line([[x + 1, y + 1], [x + 1, y + h - 1.4]]), GOLD, .8); stroke(c, line([[x + w - 1, y + 1], [x + w - 1, y + h - 1.4]]), GOLD, .8);
  part(c, rect(x - 1.6, y - 1.6, w + 3.2, 2.4, 1), GOLD, {width: .8, shade: GOLD_DARK});
  if (level >= 5) part(c, starPath(x + w / 2, y + h / 2 - 1.2, w * .34, w * .15), GOLD, {width: .6, shade: false});
}
function starPath(cx, cy, outer, inner) {
  const points = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? inner : outer; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return poly(points, .3);
}

// --- Nature -------------------------------------------------------------------------------------
// A cluster of round blobs with one outline around the whole: stroke every edge, then fill the union
// over the inner half, so the seams inside vanish. Two tones (shifted fill) and a few gloss spots.
function cluster(c, blobs, light, dark, gloss, shift = [-2, -4]) {
  const all = new Path2D(); for (const [x, y, rx, ry] of blobs) all.addPath(ellipse(x, y, rx, ry));
  c.save(); c.lineWidth = 2.4; c.strokeStyle = INK; for (const [x, y, rx, ry] of blobs) c.stroke(ellipse(x, y, rx, ry)); c.restore();
  c.save(); c.fillStyle = dark; c.fill(all); c.clip(all); c.translate(shift[0], shift[1]); c.fillStyle = light; c.fill(all); c.restore();
  c.save(); c.clip(all); c.fillStyle = gloss;
  for (const [x, y, rx, ry] of blobs) c.fill(ellipse(x - rx * .32, y - ry * .4, rx * .28, ry * .17));
  c.restore();
}
function oak(c, {w, h}) {
  const cx = w / 2, g = h - 8; shadow(c, cx, g, 22, 6);
  part(c, poly([[cx - 4, g + 1], [cx - 3, g - 26], [cx + 3, g - 26], [cx + 5, g + 1]], 2), WOOD, {depth: 1.6});
  cluster(c, [[cx, g - 62, 22, 19], [cx - 18, g - 46, 15, 13], [cx + 18, g - 46, 15, 13], [cx - 8, g - 36, 15, 11], [cx + 9, g - 36, 15, 11], [cx - 12, g - 70, 12, 11], [cx + 12, g - 72, 12, 11]],
    LEAF, LEAF_DARK, '#8fd65e');
  for (const [x, y] of [[cx - 14, g - 44], [cx + 16, g - 58], [cx - 2, g - 50]]) part(c, ellipse(x, y, 2.2), '#e8483f', {width: .8, depth: .6});
}
function pine(c, {w, h}) {
  const cx = w / 2, g = h - 8; shadow(c, cx, g, 18, 5);
  part(c, rect(cx - 3.5, g - 18, 7, 19, 2), WOOD_DARK, {depth: 1.4});
  [[g - 16, 26, 22], [g - 34, 21, 22], [g - 52, 16, 22], [g - 70, 10, 20]].forEach(([y, half, tall]) => {
    part(c, poly([[cx - half, y], [cx, y - tall - 8], [cx + half, y], [cx + half * .3, y + 3], [cx - half * .3, y + 3]], [3, 2, 3, 2, 2]), PINE,
      {depth: 3.4, dx: -1.2, gloss: poly([[cx - half * .6, y - 3], [cx - 1, y - tall - 4], [cx - half * .15, y - 4]], 1), light: '#62c27c', width: 2});
  });
}
// The palm: a curved trunk with rings, a crown of fronds and two coconuts (drawn for 'birch').
function palm(tall) {
  return (c, {w, h}) => {
    const cx = w / 2, g = h - 8, top = tall ? 30 : 38; shadow(c, cx + 4, g, 18, 5);
    const trunk = new Path2D(); trunk.moveTo(cx - 3, g + 1); trunk.quadraticCurveTo(cx - 6, g - 40, cx + 8, top + 4);
    trunk.lineTo(cx + 13, top + 6); trunk.quadraticCurveTo(cx + 2, g - 40, cx + 5, g + 1); trunk.closePath();
    part(c, trunk, '#b98a56', {depth: 1.8});
    for (let i = 1; i < 7; i++) { const t = i / 7, x = (1 - t) * (1 - t) * cx + 2 * t * (1 - t) * (cx - 2) + t * t * (cx + 10.5), y = g - t * (g - top - 6);
      stroke(c, line([[x - 3.6 + t, y], [x + 3.6 - t, y + .8]]), mix('#b98a56', INK, .45), 1); }
    const fx = cx + 10, fy = top + 2;
    for (const [angle, length, colour] of [[-2.7, 28, '#3f9a4a'], [-.35, 30, '#3f9a4a'], [-1.9, 24, '#4fb04d'], [-1.15, 26, '#4fb04d'], [2.75, 22, '#57bf54'], [.35, 24, '#57bf54'], [-1.5, 18, '#67cc5c']]) {
      const ex = fx + Math.cos(angle) * length, ey = fy + Math.sin(angle) * length * .55 + 10, mx = fx + Math.cos(angle) * length * .5, my = fy + Math.sin(angle) * length * .5 - 6;
      const nx = -Math.sin(angle) * 7, ny = Math.cos(angle) * 7;
      const frond = new Path2D(); frond.moveTo(fx, fy); frond.quadraticCurveTo(mx + nx, my + ny, ex, ey); frond.quadraticCurveTo(mx - nx * .6, my - ny * .6, fx, fy); frond.closePath();
      part(c, frond, colour, {depth: 1.6, width: 1.3});
      stroke(c, line([[fx, fy], [mx, my], [ex, ey]]), mix(colour, INK, .35), .7);
    }
    for (const [x, y] of [[fx - 2.4, fy + 3], [fx + 2.2, fy + 3.6]]) part(c, ellipse(x, y, 2.6), '#8a5a36', {depth: .9, gloss: ellipse(x - .8, y - .9, .8)});
  };
}
function rock(c, {w, h}) {
  const g = h - 4; shadow(c, w / 2, g, 20, 4);
  part(c, poly([[5, g], [8, g - 16], [18, g - 25], [31, g - 23], [41, g - 12], [43, g]], [3, 5, 6, 6, 5, 3]), STONE,
    {depth: 4, dx: -1, gloss: ellipse(17, g - 19, 5, 2.4), light: STONE_LIGHT, width: 1.4});
  part(c, poly([[30, g], [33, g - 9], [40, g - 10], [45, g - 2]], 2), mix(STONE, '#8a8478', .4), {depth: 2, width: 1.2});
  stroke(c, line([[22, g - 12], [26, g - 7], [24, g - 3]]), mix(STONE, INK, .5), .8);
}
function shrub(c, {w, h}) {
  const g = h - 4; shadow(c, w / 2, g, 16, 3.5);
  cluster(c, [[w / 2, g - 12, 10, 8.5], [w / 2 - 9, g - 7, 7, 6], [w / 2 + 9, g - 7, 7, 6]], LEAF, LEAF_DARK, '#8fd65e', [-1, -2.4]);
  for (const [x, y] of [[w / 2 - 6, g - 10], [w / 2 + 5, g - 14], [w / 2 + 9, g - 6]]) part(c, ellipse(x, y, 1.4), '#ffd166', {width: .6, shade: false});
}
function flowers(c, {w, h}) {
  const g = h - 3;
  for (const [x, y, cl] of [[7, g - 7, '#ff6f91'], [13, g - 10, '#ffd166'], [17, g - 6, '#9b7bff'], [10, g - 3, '#ffffff']]) {
    stroke(c, line([[x, y + 1], [x - .5, g]]), '#3d8f3c', 1.1);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; part(c, ellipse(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.3), cl, {width: .6, shade: false}); }
    part(c, ellipse(x, y, .9), '#f29e38', {line: false, shade: false});
  }
}
function grassTuft(c, {w, h}) {
  const g = h - 4;
  for (const [x, lean, tall, colour] of [[11, -4, 13, '#3f9a4a'], [15, -1, 17, '#5cb84a'], [19, 3, 14, '#4fb04d'], [23, 5, 10, '#5cb84a'], [8, -6, 9, '#5cb84a']]) {
    part(c, poly([[x - 2, g], [x + lean, g - tall], [x + 2, g]], [.8, .5, .8]), colour, {depth: .8, width: .9});
  }
}
function bench(c, {w, h}) {
  const g = h - 3; shadow(c, w / 2, g, 20, 3);
  for (const x of [8, 36]) part(c, rect(x, g - 11, 4, 11, 1), WOOD_DARK, {depth: .8});
  part(c, rect(4, g - 22, 40, 5, 2), WOOD, {depth: 1.4, gloss: rect(7, g - 21.4, 30, 1, .5), light: WOOD_LIGHT});
  part(c, rect(3, g - 14, 42, 5, 2), WOOD_LIGHT, {depth: 1.6, gloss: rect(6, g - 13.4, 30, 1, .5)});
}
function barrel(c, {w, h}) {
  const g = h - 3, cx = w / 2; shadow(c, cx, g, 9, 2.6);
  const body = new Path2D(); body.moveTo(cx - 7, g - 25); body.quadraticCurveTo(cx - 10.5, g - 13, cx - 7, g - 1); body.lineTo(cx + 7, g - 1);
  body.quadraticCurveTo(cx + 10.5, g - 13, cx + 7, g - 25); body.closePath();
  part(c, body, WOOD, {depth: 2.4, gloss: rect(cx - 5, g - 22, 2, 18, 1), light: WOOD_LIGHT});
  for (const y of [g - 20, g - 6]) part(c, rect(cx - 8.6, y, 17.2, 2.2, 1), IRON, {depth: .6, width: .8});
  part(c, ellipse(cx, g - 25, 7, 2.4), WOOD_LIGHT, {depth: .6, width: 1});
}
function lantern(c, {w, h}) {
  const g = h - 2, cx = w / 2;
  part(c, rect(cx - 1, g - 22, 2, 22, .8), IRON, {width: .8});
  part(c, rect(cx - 4.5, g - 21, 9, 9, 2), '#ffd166', {depth: 1, gloss: ellipse(cx - 1.4, g - 18.5, 1.4, 2), light: '#fff3c4', width: 1.1});
  part(c, poly([[cx - 5.5, g - 21], [cx, g - 24.5], [cx + 5.5, g - 21]], .8), IRON, {width: .9});
}
function crate(c, {w, h}) {
  const g = h - 3; shadow(c, w / 2, g, 10, 2.6);
  part(c, rect(3, g - 17, 18, 17, 1.6), WOOD_LIGHT, {depth: 2});
  stroke(c, line([[4, g - 16], [20, g - 1]]), WOOD_DARK, 1.6); stroke(c, rect(4.5, g - 15.5, 15, 14, 1), WOOD_DARK, 1);
}
function sign(c, {w, h}) {
  const g = h - 3; part(c, rect(w / 2 - 1.6, g - 20, 3.2, 20, 1), WOOD_DARK, {depth: .8});
  part(c, rect(3, g - 32, w - 6, 13, 2.4), WOOD_LIGHT, {depth: 1.6});
  stroke(c, line([[8, g - 25.5], [24, g - 25.5]]), WOOD_DARK, 1.2);
}

// --- Buildings -----------------------------------------------------------------------------------
// A wall section by level: a log palisade, a stone wall with merlons, a tall stone rampart with iron
// bands and a pennant, gold-capped merlons and the island's banner (4), a gold band and the starred
// royal banner (5). The damaged and broken frames show any level beaten down.
function wall(level) {
  return (c, {w, h}) => {
    const g = h - 6; shadow(c, w / 2, g + 1, 22, 4);
    if (level === 1) {
      for (let i = 0; i < 7; i++) {
        const x = 4 + i * 5.8, top = g - 24 - (i % 2) * 2;
        part(c, poly([[x, g], [x, top + 4], [x + 2.6, top], [x + 5.2, top + 4], [x + 5.2, g]], [1, 1, .6, 1, 1]), i % 2 ? WOOD : WOOD_LIGHT,
          {depth: 1.4, width: 1.1, gloss: rect(x + 1, top + 5, 1, g - top - 9, .5), light: '#e0a868'});
      }
      for (const y of [g - 17, g - 7]) part(c, rect(2.5, y, w - 5, 2.6, 1.2), WOOD_DARK, {depth: .6, width: .9});
      return;
    }
    const tall = level >= 3 ? 30 : 24, top = g - tall;
    part(c, rect(3, top + 4, w - 6, tall - 4, 2), STONE, {depth: 2.6, width: 1.3});
    part(c, rect(3, top, w - 6, 6, 2), STONE_LIGHT, {depth: 1, width: 1.2});
    // Stone courses: staggered blocks.
    c.save(); c.clip(rect(3, top + 6, w - 6, tall - 6, 2)); c.strokeStyle = mix(STONE, INK, .4); c.lineWidth = .8;
    for (let row = 0, y = top + 6; y < g; row++, y += 6) {
      c.beginPath(); c.moveTo(3, y); c.lineTo(w - 3, y); c.stroke();
      for (let x = 3 + (row % 2 ? 4 : 9); x < w - 3; x += 10) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 6); c.stroke(); }
    }
    c.restore();
    for (let i = 0; i < 4; i++) part(c, rect(5 + i * 10.3, top - 6, 7, 7, 1.4), STONE_LIGHT, {depth: 1.4, width: 1.2, gloss: rect(6, top - 5, 3, 1, .5)});
    if (level >= 4) for (let i = 0; i < 4; i++) part(c, rect(4.6 + i * 10.3, top - 7, 7.8, 2.4, 1), GOLD, {width: .9, shade: GOLD_DARK, gloss: rect(6, top - 6.6, 3, .6, .3)});
    if (level >= 3) {
      for (const y of [top + 9, g - 6]) part(c, rect(2, y, w - 4, 2.6, 1), level >= 5 && y === top + 9 ? GOLD : IRON, {depth: .6, width: .9, ...(level >= 5 && y === top + 9 ? {shade: GOLD_DARK} : {})});
      for (let x = 8; x < w - 4; x += 10) part(c, ellipse(x, top + 10.3, .9), level >= 5 ? IRON : BRASS, {line: false, shade: false});
    }
    if (level === 3) {
      part(c, rect(w / 2 - 1, top - 20, 2, 16, .8), WOOD_DARK, {width: .8});
      part(c, poly([[w / 2 + 1, top - 20], [w / 2 + 13, top - 17], [w / 2 + 1, top - 12]], .8), '#2c9aa6', {depth: 1, width: 1});
      part(c, ellipse(w / 2 + 5.5, top - 16.2, 1.6), BRASS, {width: .6, shade: false});
    }
    if (level >= 4) hangingBanner(c, w / 2 - 5, top + 3, 10, level >= 5 ? 20 : 16, level);
  };
}
function wallDamaged(c, {w, h}) {
  const g = h - 6, top = g - 24; shadow(c, w / 2, g + 1, 22, 4);
  part(c, poly([[3, g], [3, top], [16, top], [19, top + 6], [26, top + 3], [29, top + 9], [w - 3, top + 4], [w - 3, g]], [2, 2, 1, 1, 1, 1, 2, 2]), STONE, {depth: 2.6, width: 1.3});
  stroke(c, line([[12, top + 4], [15, top + 11], [12, top + 16]]), INK, 1); stroke(c, line([[34, top + 8], [31, top + 15]]), INK, 1);
  for (let x = 8; x < w - 4; x += 11) stroke(c, line([[x, top + 13], [x + 7, top + 13]]), mix(STONE, INK, .45), .8);
  for (const [x, y, r] of [[8, g - 1, 2.6], [40, g, 2.2], [24, g + .5, 1.8]]) part(c, ellipse(x, y, r, r * .7), STONE_LIGHT, {depth: .6, width: .9});
}
function wallBroken(c, {w, h}) {
  const g = h - 6; shadow(c, w / 2, g + 1, 22, 4);
  for (const [x, y, rw, rh, cl] of [[10, g - 4, 8, 5, STONE], [22, g - 7, 10, 7, STONE_LIGHT], [35, g - 4, 8, 5, STONE], [17, g - 1, 6, 3, STONE_LIGHT], [30, g - 1, 6, 3, STONE]])
    part(c, ellipse(x, y, rw, rh), cl, {depth: 1.6, width: 1.2});
  part(c, poly([[24, g - 13], [28, g - 20], [33, g - 18], [31, g - 11]], 1), WOOD, {depth: .8, width: .9});
}
// A cannon by level, facing right on the ground line: a wheeled carriage (1), on a stone pad with
// brass rings (2), on a round bastion with a gold-trimmed long barrel (3), a gilded muzzle, a gold-edged
// pad and the island's banner behind it (4), a longer, wholly gilded barrel and the starred banner (5).
// Firing kicks the barrel back.
function cannon(level, firing = false) {
  return (c, {w, h}) => {
    const g = h - 5, cx = 22; shadow(c, cx, g, 18, 3.6);
    if (level >= 2) part(c, rect(4, g - 6, 38, 7, 3), level >= 3 ? STONE_LIGHT : STONE, {depth: 2, width: 1.2, gloss: rect(7, g - 5.4, 26, 1.2, .6)});
    if (level >= 3) for (let x = 8; x < 40; x += 8) stroke(c, line([[x, g - 5], [x, g + 1]]), mix(STONE, INK, .4), .8);
    if (level >= 4) stroke(c, line([[5.5, g - 6], [40.5, g - 6]]), GOLD, 1.3);
    const base = level >= 2 ? g - 6 : g, kick = firing ? -3 : 0;
    part(c, poly([[cx - 12, base - 2], [cx - 9, base - 9], [cx + 8, base - 9], [cx + 10, base - 2]], 1.4), WOOD, {depth: 1.6, width: 1.2});
    const length = [22, 25, 28, 28, 30][level - 1] ?? 22, thick = [7, 7.6, 8.4, 8.6, 9][level - 1] ?? 7;
    c.save(); c.translate(cx - 8 + kick, base - 11); c.rotate(-.12);
    const barrel = new Path2D(); barrel.moveTo(-1, -thick / 2 - .6); barrel.lineTo(length - 2, -thick / 2 + .8); barrel.lineTo(length, -thick / 2 + .4);
    barrel.lineTo(length, thick / 2 - .4); barrel.lineTo(length - 2, thick / 2 - .8); barrel.lineTo(-1, thick / 2 + .6); barrel.arc(-1, 0, thick / 2 + .6, Math.PI / 2, Math.PI * 1.5); barrel.closePath();
    part(c, barrel, level >= 5 ? GOLD : IRON, level >= 5 ? {depth: 2, width: 1.3, shade: GOLD_DARK, gloss: rect(1, -thick / 2 + .8, length - 6, 1.3, .6), light: '#fff1b8'}
      : {depth: 2, width: 1.3, gloss: rect(1, -thick / 2 + .8, length - 6, 1.3, .6), light: '#7b8296'});
    if (level >= 2) for (const x of level >= 3 ? [3, 11, length - 3] : [4, length - 3]) part(c, rect(x - 1, -thick / 2 - .3, 2.4, thick + .6, .8), level >= 5 ? IRON : BRASS, {width: .7, shade: false});
    if (level === 4) part(c, rect(length - 4.6, -thick / 2 - .5, 4.6, thick + 1, 1), GOLD, {width: .8, shade: GOLD_DARK});
    part(c, ellipse(length, 0, 1.4, thick / 2 - .2), '#14161c', {width: .8, shade: false});
    c.restore();
    for (const x of [cx - 7, cx + 6]) { part(c, ellipse(x, base - 2.4, 4.6), WOOD_DARK, {depth: 1, width: 1.2}); part(c, ellipse(x, base - 2.4, 1.6), level >= 2 ? BRASS : '#c9a06a', {width: .8, shade: false}); }
    if (level >= 4) banner(c, 4.5, base - 1, level >= 5 ? 19 : 17, level, .8);
    if (firing) {
      const mx = cx - 8 + kick + length * Math.cos(.12) + 2, my = base - 11 - length * Math.sin(.12);
      part(c, ellipse(mx + 4, my, 5.2, 4), '#fff3c4', {line: '#f29e38', width: 1, shade: false});
      part(c, ellipse(mx + 3, my, 3, 2.4), '#ffffff', {line: false, shade: false});
    }
  };
}
// A mortar by level: a squat iron pot on a wooden bed aimed at the sky (1), banded in brass (2), on a
// stone ring (3), a gold rim, a gold-edged ring and the island's banner (4), a wholly gilded pot and the
// starred banner (5). Firing: a puff from the mouth.
function mortar(level, firing = false) {
  return (c, {w, h}) => {
    const g = h - 5, cx = w / 2; shadow(c, cx, g, 16, 3.4);
    if (level >= 3) part(c, ellipse(cx, g - 3, 17, 5), STONE, {depth: 1.6, width: 1.2, gloss: ellipse(cx - 6, g - 5, 6, 1.2), light: STONE_LIGHT});
    if (level >= 4) stroke(c, ellipse(cx, g - 3.4, 15.6, 4), GOLD, 1.1);
    const base = level >= 3 ? g - 4 : g;
    part(c, rect(cx - 13, base - 7, 26, 7, 2), WOOD, {depth: 1.6, width: 1.2, gloss: rect(cx - 11, base - 6.4, 18, 1, .5), light: WOOD_LIGHT});
    const s = [1, 1.1, 1.18, 1.2, 1.24][level - 1] ?? 1;
    c.save(); c.translate(cx, base - 9); c.scale(s, s); c.rotate(-.35);
    part(c, poly([[-8, 4], [-9, -4], [-6.5, -10], [6.5, -10], [9, -4], [8, 4]], [3, 3, 1, 1, 3, 3]), level >= 5 ? GOLD : IRON,
      level >= 5 ? {depth: 2.2, width: 1.3, shade: GOLD_DARK, gloss: rect(-6, -7, 2, 9, 1), light: '#fff1b8'} : {depth: 2.2, width: 1.3, gloss: rect(-6, -7, 2, 9, 1), light: '#7b8296'});
    part(c, ellipse(0, -10, 7.4, 2.6), level >= 4 ? GOLD : '#2a2d36', {width: 1.1, shade: false});
    part(c, ellipse(0, -10, 5.2, 1.6), '#101218', {line: false, shade: false});
    if (level >= 2) part(c, rect(-9, -3.6, 18, 2.4, 1), level >= 5 ? IRON : BRASS, {width: .7, shade: false});
    if (level >= 3) part(c, rect(-8, -8.4, 16, 1.8, .8), level >= 5 ? IRON : BRASS, {width: .7, shade: false});
    c.restore();
    for (const x of [cx - 9, cx + 9]) part(c, ellipse(x, base - 3.4, 2.2), WOOD_DARK, {width: .9, shade: false});
    if (level >= 4) banner(c, cx + 13, base - 2, level >= 5 ? 19 : 17, level, .8);
    if (firing) for (const [x, y, r] of [[cx + 6, base - 24, 4.6], [cx + 10, base - 27, 3.4], [cx + 2, base - 27, 3]]) part(c, ellipse(x, y, r), '#f4efe6', {line: '#8c8a92', width: .9, shade: '#cfcad6'});
  };
}
// The watchtower; at levels 4 and 5 (GAME-V3.md §4.1) a gold-trimmed roof and the island's banner instead of
// the pennant, at 5 a gold railing and the starred royal banner.
function watchtower(level) { return (c, size) => watchtowerAt(c, size, level); }
function watchtowerAt(c, {w, h}, level) {
  const g = h - 8, cx = w / 2; shadow(c, cx, g, 24, 5);
  for (const x of [cx - 17, cx + 13]) part(c, rect(x, g - 70, 4.5, 71, 1.4), WOOD_DARK, {depth: 1.2, width: 1.2});
  for (const [y0, y1] of [[g - 8, g - 34], [g - 34, g - 60]]) { stroke(c, line([[cx - 14, y0], [cx + 14, y1]]), INK, 3); stroke(c, line([[cx - 14, y0], [cx + 14, y1]]), WOOD, 1.6);
    stroke(c, line([[cx + 14, y0], [cx - 14, y1]]), INK, 3); stroke(c, line([[cx + 14, y0], [cx - 14, y1]]), WOOD, 1.6); }
  for (const y of [g - 34, g - 8]) part(c, rect(cx - 18, y - 2, 36, 3.6, 1.4), WOOD, {depth: .8, width: 1});
  // The lookout's hut: a plank box with a railing and a pointed roof with a pennant.
  part(c, rect(cx - 23, g - 74, 46, 6, 2), level >= 5 ? GOLD : WOOD_LIGHT, level >= 5 ? {depth: 1.6, width: 1.3, shade: GOLD_DARK} : {depth: 1.6, width: 1.3});
  part(c, rect(cx - 20, g - 92, 40, 19, 2.4), WOOD, {depth: 2.4, width: 1.3});
  for (let x = cx - 16; x < cx + 18; x += 6) stroke(c, line([[x, g - 91], [x, g - 74]]), WOOD_DARK, .9);
  part(c, rect(cx - 10, g - 89, 20, 8, 1.6), '#3a2a24', {shade: false, width: 1});
  part(c, ellipse(cx + 2, g - 85, 2, 2.2), '#f3c39b', {width: .8, shade: false});
  part(c, poly([[cx - 27, g - 90], [cx, g - 112], [cx + 27, g - 90]], [2, 2, 2]), ROOF, {depth: 3, dx: -1, width: 1.4, gloss: poly([[cx - 18, g - 92], [cx - 2, g - 107], [cx - 6, g - 93]], 1), light: '#ef7e62'});
  if (level >= 4) {
    stroke(c, line([[cx - 26, g - 90.6], [cx, g - 111], [cx + 26, g - 90.6]]), GOLD, 1.6);
    banner(c, cx, g - 111, 10, level, level >= 5 ? 1.15 : 1);
    return;
  }
  part(c, rect(cx - .8, g - 122, 1.8, 12, .6), WOOD_DARK, {width: .8});
  part(c, poly([[cx + 1, g - 122], [cx + 13, g - 119], [cx + 1, g - 115]], .8), BRASS, {depth: .8, width: 1});
}
// The house, and its three roles from level 2 (GAME-V3.md "Houses"): the Barracks (stone walls, a teal roof with
// crossed swords on a shield and the island's flag on the ridge), the Tavern (warm lit windows, a hanging sign with
// a frothy mug and a barrel by the door) and the Workshop (plank walls, a slate roof, a gear sign with a hammer on
// a post and a saw by the wall). A role house is drawn in a wider box (80 x 72) so its sign has room.
const HOUSE_LOOKS = {
  plain: {wall: '#f2dfb6', light: '#fff1d0', seam: '#d9bf8e', roof: ROOF, roofLight: '#ef7e62', window: '#7fd0e0'},
  barracks: {wall: '#d8d0c2', light: '#ece6da', seam: '#b5ab9b', roof: '#2c7f8c', roofLight: '#4fb0bc', window: '#7fd0e0'},
  tavern: {wall: '#f2dfb6', light: '#fff1d0', seam: '#d9bf8e', roof: '#c8423b', roofLight: '#ef7e62', window: '#ffd36a'},
  workshop: {wall: WOOD_LIGHT, light: '#ddb07a', seam: WOOD, roof: '#6b7280', roofLight: '#9aa3b0', window: '#7fd0e0'},
};
function gear(c, x, y, r) {
  const teeth = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, out = i % 2 ? r * .74 : r; teeth.push([x + Math.cos(a) * out, y + Math.sin(a) * out]); }
  part(c, poly(teeth, .5), '#b8bec8', {depth: 1, width: 1, gloss: ellipse(x - r * .35, y - r * .4, r * .3, r * .18), light: '#e6eaf0'});
  part(c, ellipse(x, y, r * .34), '#5a6270', {width: .8, shade: false});
}
function house(role = null) {
  const look = HOUSE_LOOKS[role] ?? HOUSE_LOOKS.plain;
  return (c, {w, h}) => {
    const g = h - 8, cx = w / 2; shadow(c, cx, g, role ? 31 : 27, 5);
    if (role === 'workshop') { // a saw leaning on the left wall
      part(c, poly([[cx - 27, g], [cx - 23, g - 15], [cx - 20, g - 14], [cx - 23, g]], .5), '#cfd5dc', {depth: .6, width: .9});
      part(c, rect(cx - 25, g - 19, 5, 5, 1.2), WOOD_DARK, {width: .9});
    }
    part(c, rect(cx - 22, g - 26, 44, 26, 2), look.wall, {depth: 3, width: 1.3, gloss: rect(cx - 19, g - 24, 3, 20, 1), light: look.light});
    if (role === 'barracks') {
      for (let y = g - 21, row = 0; y < g; y += 5, row++) {
        stroke(c, line([[cx - 21, y], [cx + 21, y]]), look.seam, .8);
        for (let x = cx - 18 + (row % 2) * 4; x < cx + 20; x += 8) stroke(c, line([[x, y], [x, y + 5]]), look.seam, .7);
      }
    } else if (role === 'workshop') {
      for (let x = cx - 16; x < cx + 22; x += 6) stroke(c, line([[x, g - 25], [x, g]]), look.seam, .8);
    } else for (let y = g - 21; y < g; y += 5) stroke(c, line([[cx - 21, y], [cx + 21, y]]), look.seam, .8);
    part(c, rect(cx - 5, g - 17, 10, 17, 4.5), role === 'barracks' ? WOOD_DARK : WOOD, {depth: 1.4, width: 1.2}); part(c, ellipse(cx + 2.6, g - 8, .9), BRASS, {line: false, shade: false});
    if (role === 'barracks') for (const y of [g - 12, g - 5]) part(c, rect(cx - 5, y, 10, 1.4, .4), IRON, {line: false, shade: false});
    for (const x of [cx - 16, cx + 9]) {
      part(c, rect(x, g - 20, 8, 8, 1.6), look.window, {depth: 1, width: 1.1, gloss: rect(x + 1.4, g - 18.6, 2, 2.6, .6)}); stroke(c, line([[x + 4, g - 20], [x + 4, g - 12]]), INK, .8);
      if (role === 'tavern') { c.save(); c.globalAlpha = .35; c.fillStyle = radial(c, x + 4, g - 16, 7, [[0, '#ffe8a0'], [1, '#ffe8a000']]); c.fill(ellipse(x + 4, g - 16, 7, 6)); c.restore(); }
    }
    part(c, rect(cx + 9, g - 46, 6, 14, 1), '#9e958a', {depth: 1, width: 1.1});
    const roof = poly([[cx - 27, g - 24], [cx - 12, g - 44], [cx + 12, g - 44], [cx + 27, g - 24]], [2.4, 3, 3, 2.4]);
    part(c, roof, look.roof, {depth: 3.4, dx: -1, width: 1.4, gloss: poly([[cx - 20, g - 27], [cx - 10, g - 41], [cx - 4, g - 41], [cx - 14, g - 27]], 1), light: look.roofLight});
    c.save(); c.clip(roof); for (let y = g - 30; y > g - 44; y -= 6) stroke(c, line([[cx - 30, y], [cx + 30, y]]), mix(look.roof, INK, .35), .8); c.restore();
    if (role === 'barracks') {
      // The island's flag on the ridge, and a shield with two crossed cutlasses on the roof.
      banner(c, cx - 7, g - 43, 14, 4, .9);
      part(c, poly([[cx - 6, g - 39], [cx + 6, g - 39], [cx + 6, g - 33], [cx, g - 27.5], [cx - 6, g - 33]], 1.2), BANNER[4], {depth: 1, width: 1.1, light: mix(BANNER[4], '#ffffff', .35)});
      stroke(c, poly([[cx - 4.6, g - 37.8], [cx + 4.6, g - 37.8], [cx + 4.6, g - 33.4], [cx, g - 29.2], [cx - 4.6, g - 33.4]], 1), GOLD, .8);
      for (const s of [-1, 1]) {
        c.save(); c.translate(cx, g - 33.6); c.rotate(s * .78);
        part(c, rect(-.7, -7.4, 1.4, 10, .5), '#dfe6ea', {depth: .4, width: .8});
        part(c, rect(-2.2, 2.2, 4.4, 1.1, .4), GOLD, {width: .7, shade: false});
        part(c, rect(-.7, 3.2, 1.4, 2.4, .5), WOOD_DARK, {width: .7, shade: false});
        c.restore();
      }
    } else if (role === 'tavern') {
      // A barrel by the door and, on an iron bracket at the left, a swinging sign with a frothy mug.
      part(c, rect(cx + 23, g - 9, 8, 9, 2.6), WOOD, {depth: 1.2, width: 1.1});
      for (const y of [g - 7, g - 2.4]) stroke(c, line([[cx + 23.4, y], [cx + 30.6, y]]), IRON, .9);
      stroke(c, line([[cx - 22, g - 30], [cx - 35, g - 30]]), IRON, 1.6);
      stroke(c, line([[cx - 22, g - 26], [cx - 26, g - 30]]), IRON, 1.1);
      for (const x of [cx - 33.5, cx - 25.5]) stroke(c, line([[x, g - 30], [x, g - 27]]), IRON, .8);
      part(c, rect(cx - 36, g - 27.5, 13, 12, 1.6), WOOD_LIGHT, {depth: 1.2, width: 1.1, light: '#ddb07a'});
      part(c, rect(cx - 32.6, g - 23.5, 5.6, 6.4, 1), GOLD, {depth: .8, width: .9, light: '#ffe79a'});
      stroke(c, ellipse(cx - 26, g - 20.4, 1.7, 2.2), INK, .9);
      part(c, ellipse(cx - 29.8, g - 24.2, 3.6, 1.8), '#fff8ec', {width: .8, shade: false});
      for (const x of [cx - 31.6, cx - 28.6]) part(c, ellipse(x, g - 25.4, 1.3, 1.1), '#fff8ec', {width: .7, shade: false});
    } else if (role === 'workshop') {
      // A post at the right with a big gear sign and a hammer across it.
      part(c, rect(cx + 27, g - 24, 2.6, 24, .8), WOOD_DARK, {depth: .8, width: 1});
      gear(c, cx + 28.3, g - 30, 6.4);
      c.save(); c.translate(cx + 28.3, g - 30); c.rotate(-.7);
      part(c, rect(-.7, -2, 1.4, 11, .5), WOOD, {depth: .4, width: .8});
      part(c, rect(-3.6, -3.6, 7.2, 3, .8), IRON, {depth: .6, width: .9, gloss: rect(-3, -3.2, 3, .6, .3)});
      c.restore();
      gear(c, cx - 9, g - 34, 3.2);
    }
  };
}
function cabin(c, {w, h}) {
  const g = h - 12, cx = w / 2; shadow(c, cx, g, 40, 7);
  part(c, rect(cx - 34, g - 30, 68, 30, 2), WOOD_LIGHT, {depth: 3, width: 1.4});
  for (let y = g - 25; y < g; y += 5) stroke(c, line([[cx - 33, y], [cx + 33, y]]), WOOD, 1);
  part(c, rect(cx - 7, g - 21, 14, 21, 6), '#6b3f26', {depth: 1.6, width: 1.3}); part(c, ellipse(cx + 3.6, g - 10, 1.1), BRASS, {line: false, shade: false});
  for (const x of [cx - 27, cx + 13]) { part(c, rect(x, g - 23, 13, 11, 2), '#7fd0e0', {depth: 1.2, width: 1.2, gloss: rect(x + 2, g - 21, 3, 3, .8)}); stroke(c, line([[x + 6.5, g - 23], [x + 6.5, g - 12]]), INK, .9); stroke(c, line([[x, g - 17.5], [x + 13, g - 17.5]]), INK, .9); part(c, rect(x - 1.5, g - 12, 16, 2.6, 1), WOOD, {width: .9}); }
  part(c, rect(cx + 16, g - 66, 9, 22, 1.4), '#9e958a', {depth: 1.4, width: 1.2}); part(c, rect(cx + 15, g - 68, 11, 4, 1), '#b8b0a4', {width: 1});
  part(c, poly([[cx - 42, g - 28], [cx - 18, g - 62], [cx + 18, g - 62], [cx + 42, g - 28]], [3, 4, 4, 3]), '#2c7f8c', {depth: 4.4, dx: -1, width: 1.6, gloss: poly([[cx - 32, g - 31], [cx - 15, g - 57], [cx - 8, g - 57], [cx - 24, g - 31]], 1.4), light: '#4fb0bc'});
  const roof = poly([[cx - 42, g - 28], [cx - 18, g - 62], [cx + 18, g - 62], [cx + 42, g - 28]], [3, 4, 4, 3]);
  c.save(); c.clip(roof); for (let y = g - 35; y > g - 62; y -= 7) stroke(c, line([[cx - 50, y], [cx + 50, y]]), '#1f5c66', .9); c.restore();
  part(c, ellipse(cx, g - 46, 6, 6), '#f2dfb6', {depth: 1, width: 1.2}); part(c, ellipse(cx, g - 46, 3.6), '#2c7f8c', {width: .9, shade: false});
}
function bell(c, {w, h}) {
  const g = h - 1, cx = w / 2; shadow(c, cx, g - 1, 11, 2.4);
  for (const x of [cx - 10, cx + 6.6]) part(c, rect(x, g - 34, 3.4, 34, 1.2), WOOD_DARK, {depth: .8, width: 1.1});
  part(c, rect(cx - 12, g - 38, 24, 5, 2), WOOD, {depth: 1.2, width: 1.2});
  const body = new Path2D(); body.moveTo(cx - 3, g - 32); body.quadraticCurveTo(cx - 5, g - 22, cx - 7.6, g - 17); body.lineTo(cx + 7.6, g - 17);
  body.quadraticCurveTo(cx + 5, g - 22, cx + 3, g - 32); body.closePath();
  part(c, body, '#f2b33a', {depth: 2, width: 1.2, gloss: rect(cx - 3.4, g - 29, 1.6, 9, .8), light: '#ffe08a'});
  part(c, rect(cx - 8.4, g - 18.4, 16.8, 2.6, 1.2), '#e09a2a', {width: 1, shade: false});
  part(c, ellipse(cx, g - 15, 1.6), '#6b4a14', {width: .8, shade: false});
}
// "You can build here": a glowing gold ring on the ground (48 x 24) and a floating badge (20 x 24).
function buildRing(c, {w, h}) {
  c.save(); c.fillStyle = radial(c, w / 2, h / 2, w / 2, [[0, '#ffe8a033'], [.7, '#ffd36a55'], [1, '#ffd36a00']]); c.fill(ellipse(w / 2, h / 2, w / 2 - .5, h / 2 - .5)); c.restore();
  c.save(); c.setLineDash([3.2, 2.2]); c.lineDashOffset = 0; stroke(c, ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 3.2), '#fff4c8', 2); c.restore();
  stroke(c, ellipse(w / 2, h / 2, w / 2 - 7, h / 2 - 5.4), '#f2c14e', 1.2, .8);
}
const GLYPH = {
  wall: c => { for (const [x, y] of [[5, 9], [11, 9], [8, 13.5]]) part(c, rect(x - 2.6, y - 2, 5.2, 4, .8), '#fff6dc', {line: false, shade: false}); },
  tower: c => { part(c, rect(4.4, 8, 10, 3.4, 1.6), '#fff6dc', {line: false, shade: false}); part(c, ellipse(6.4, 13, 2.2), '#fff6dc', {line: false, shade: false}); part(c, ellipse(12.4, 13, 2.2), '#fff6dc', {line: false, shade: false}); },
  watchtower: c => { part(c, poly([[5, 9], [10, 4.5], [15, 9]], .6), '#fff6dc', {line: false, shade: false}); part(c, rect(6.2, 9, 7.6, 6.4, .8), '#fff6dc', {line: false, shade: false}); },
  house: c => { part(c, poly([[4.6, 10], [10, 5], [15.4, 10]], .6), '#fff6dc', {line: false, shade: false}); part(c, rect(6, 10, 8, 5.6, .8), '#fff6dc', {line: false, shade: false}); },
};
GLYPH.cannon = GLYPH.tower;
function badge(kind) {
  return (c, {w}) => {
    part(c, poly([[w / 2 - 3, 18], [w / 2, 22.4], [w / 2 + 3, 18]], .8), '#c98a2a', {width: 1.1, shade: false});
    part(c, ellipse(w / 2, 10.2, 8.4), '#2c7f8c', {depth: 1.6, width: 1.3, gloss: ellipse(w / 2 - 3, 6.4, 3, 1.4), light: '#4fb0bc'});
    stroke(c, ellipse(w / 2, 10.2, 7), '#f2c14e', 1.2);
    GLYPH[kind]?.(c);
  };
}
function levelPip(c, {w, h}) {
  const cx = w / 2, cy = h / 2, star = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 5.6; star.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  part(c, poly(star, .7), BRASS, {depth: 1, width: 1, gloss: ellipse(cx - 1.2, cy - 1.6, 1.4, .8), light: '#fff1b8'});
}
// The star of levels 4 and 5: brighter gold on a teal disc with a gold ring, so a tier tower reads at a glance.
function tierPip(c, {w, h}) {
  const cx = w / 2, cy = h / 2;
  part(c, ellipse(cx, cy, 7, 7), BANNER[4], {depth: .8, width: .9, shade: false});
  stroke(c, ellipse(cx, cy, 6.1), GOLD, .9);
  part(c, starPath(cx, cy, 5, 2.3), GOLD, {depth: 1, width: .9, gloss: ellipse(cx - 1.1, cy - 1.5, 1.2, .7), light: '#fff6c8'});
}
function buildSpot(glow) {
  return (c, {w, h}) => {
    const cy = h - 10;
    if (glow) { c.save(); c.fillStyle = radial(c, w / 2, cy, 15, [[0, '#ffe8a088'], [1, '#ffe8a000']]); c.fill(ellipse(w / 2, cy, 15, 8)); c.restore(); }
    part(c, ellipse(w / 2, cy, 12, 5.6), '#c9a06a', {depth: 1.2, width: 1.1, shade: '#a87e4c'});
    stroke(c, ellipse(w / 2, cy, 8, 3.4), glow ? '#fff4c8' : '#8a6a42', 1);
  };
}

/** Every island frame: name -> [width, height, anchor, draw]. */
export function islandFrames() {
  const frames = {
    oak: [80, 104, 8, oak], pine: [80, 112, 8, pine], birch: [80, 104, 8, palm(false)], 'birch-tall': [80, 104, 8, palm(true)],
    rock: [48, 36, 4, rock], shrub: [40, 32, 4, shrub], flowers: [24, 24, 3, flowers], 'grass-tuft': [32, 32, 4, grassTuft],
    bench: [48, 32, 3, bench], barrel: [24, 32, 3, barrel], lantern: [16, 24, 2, lantern], crate: [24, 24, 3, crate], sign: [32, 40, 3, sign],
    cabin: [96, 96, 12, cabin], 'island-house': [64, 64, 8, house()], 'island-watchtower': [64, 128, 8, watchtower(1)],
    'island-house-barracks': [80, 72, 8, house('barracks')], 'island-house-tavern': [80, 72, 8, house('tavern')], 'island-house-workshop': [80, 72, 8, house('workshop')],
    'island-watchtower-l4': [64, 128, 8, watchtower(4)], 'island-watchtower-l5': [64, 128, 8, watchtower(5)],
    'island-wall': [48, 48, 6, wall(1)], 'island-wall-l2': [48, 48, 6, wall(2)], 'island-wall-l3': [48, 48, 6, wall(3)],
    'island-wall-l4': [48, 48, 6, wall(4)], 'island-wall-l5': [48, 48, 6, wall(5)],
    'island-wall-damaged': [48, 48, 6, wallDamaged], 'island-wall-broken': [48, 48, 6, wallBroken],
    'island-cannon': [48, 32, 5, cannon(1)], 'island-cannon-l2': [48, 32, 5, cannon(2)], 'island-cannon-l3': [48, 32, 5, cannon(3)],
    'island-cannon-l4': [48, 32, 5, cannon(4)], 'island-cannon-l5': [48, 32, 5, cannon(5)],
    'island-cannon-fire': [48, 32, 5, cannon(1, true)], 'island-cannon-fire-l2': [48, 32, 5, cannon(2, true)], 'island-cannon-fire-l3': [48, 32, 5, cannon(3, true)],
    'island-cannon-fire-l4': [48, 32, 5, cannon(4, true)], 'island-cannon-fire-l5': [48, 32, 5, cannon(5, true)],
    'island-mortar': [48, 32, 5, mortar(1)], 'island-mortar-l2': [48, 32, 5, mortar(2)], 'island-mortar-l3': [48, 32, 5, mortar(3)],
    'island-mortar-l4': [48, 32, 5, mortar(4)], 'island-mortar-l5': [48, 32, 5, mortar(5)],
    'island-mortar-fire': [48, 32, 5, mortar(1, true)], 'island-mortar-fire-l2': [48, 32, 5, mortar(2, true)], 'island-mortar-fire-l3': [48, 32, 5, mortar(3, true)],
    'island-mortar-fire-l4': [48, 32, 5, mortar(4, true)], 'island-mortar-fire-l5': [48, 32, 5, mortar(5, true)],
    'build-spot': [32, 32, 10, buildSpot(false)], 'build-spot-glow': [32, 32, 10, buildSpot(true)], 'fx-level-pip': [16, 16, 8, levelPip], 'fx-level-pip-gold': [16, 16, 8, tierPip],
    'island-bell': [24, 40, 0, bell], 'build-ring': [48, 24, 0, buildRing],
  };
  for (const kind of ['wall', 'tower', 'cannon', 'watchtower', 'house']) frames[`build-badge-${kind}`] = [20, 24, 0, badge(kind)];
  return frames;
}
// The ring and the badges glow on their own: no ink silhouette around them.
export const NO_OUTLINE = new Set(['build-ring', 'build-spot-glow']);
