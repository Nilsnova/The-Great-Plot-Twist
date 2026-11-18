// Original cannon material trial. Logical geometry and state selection stay in island.js.
import {ellipse, line, linear, part, poly, rect, shadow, stroke} from './paint.js';
const INK = '#24333b', BRASS = '#e3ae42', WOOD = '#996039';
const LENGTHS = [21, 23, 25, 25, 26], WIDTHS = [7, 8, 9, 9, 9.4];

function plinth(c, foot, level) {
  // Separate top, bevel and front planes preserve the anchored foot while giving volume.
  part(c, poly([[4, foot - 5], [10, foot - 1], [38, foot - 1], [44, foot - 5], [44, foot - 1], [38, foot + 3], [10, foot + 3], [4, foot - 1]], .7),
    linear(c, 0, foot - 5, 0, foot + 3, [[0, '#909b96'], [1, '#59685f']]), {width: .75, shade: false, line: INK});
  part(c, poly([[4, foot - 5], [10, foot - 9], [37, foot - 9], [44, foot - 5], [38, foot - 1], [10, foot - 1]], .8),
    linear(c, 3, foot - 10, 42, foot, [[0, '#d5d8c4'], [.55, '#b0b8a5'], [1, '#8a938d']]), {width: .8, shade: false, line: INK});
  stroke(c, line([[6, foot - 5], [11, foot - 2.4], [37, foot - 2.4], [42, foot - 5]]), '#e8e1c5', .65);
  for (const x of [14, 25, 35]) stroke(c, line([[x, foot - 1], [x, foot + 2.4]]), '#526259', .65);
  if (level >= 4) stroke(c, line([[5, foot - 5], [10.5, foot - 1.2], [37.5, foot - 1.2], [43, foot - 5]]), '#f4cc64', 1.1);
}
function wheel(c, x, y, brass) {
  part(c, ellipse(x, y, 4.2, 4.4), '#563d2c', {width: .8, depth: 1});
  part(c, ellipse(x - .35, y - .3, 3.1, 3.3), '#bd8145', {width: .65, depth: .7, light: '#e0aa67', gloss: ellipse(x - 1.2, y - 1.7, .8, .6)});
  for (const [dx, dy] of [[2.5, 0], [0, 2.7], [1.8, 1.9], [1.8, -1.9]])
    stroke(c, line([[x - dx, y - dy], [x + dx, y + dy]]), '#744b30', .65);
  part(c, ellipse(x, y, 1.2), brass ? BRASS : '#e0bd7d', {width: .6, shade: false});
}
/** Draw one intact/firing cannon in its existing 48×32 frame, ground at h−5. */
export function paintReferenceCannon(c, {h}, level, firing) {
  const foot = h - 5, base = foot - (level >= 2 ? 6 : 0), cx = 23;
  shadow(c, 24, foot + 1, 20, 3.2, .12); shadow(c, 24, foot, 15, 2.1, .18);
  if (level >= 2) plinth(c, foot - 2, level);
  wheel(c, cx + 6, base - 2.7, level >= 2);
  part(c, poly([[cx - 12, base - 2], [cx - 9, base - 10], [cx + 7, base - 10], [cx + 10, base - 2]], .8),
    linear(c, cx - 10, base - 10, cx + 9, base, [[0, '#cf9556'], [1, WOOD]]), {width: .8, shade: false, line: INK});
  stroke(c, line([[cx - 8, base - 8], [cx + 6, base - 8]]), '#efd19a', .65);
  stroke(c, line([[cx - 9, base - 3], [cx + 8, base - 3]]), '#653f2a', .65);
  const length = LENGTHS[level - 1], thick = WIDTHS[level - 1], kick = firing ? -2.5 : 0;
  c.save(); c.translate(cx - 9 + kick, base - 10.5); c.rotate(-.14);
  const barrel = new Path2D(); barrel.moveTo(-1, -thick / 2); barrel.lineTo(length, -thick / 2 + .7);
  barrel.lineTo(length, thick / 2 - .7); barrel.lineTo(-1, thick / 2);
  barrel.bezierCurveTo(-5, thick / 2, -5, -thick / 2, -1, -thick / 2); barrel.closePath();
  const gilded = level >= 5;
  part(c, barrel, linear(c, 0, -thick / 2, 0, thick / 2,
    gilded ? [[0, '#fff0a8'], [.3, '#ebbd51'], [.64, '#ba7e26'], [1, '#684622']]
      : [[0, '#9aa9aa'], [.24, '#617880'], [.6, '#314750'], [1, '#172a32']]), {width: .9, shade: false, line: INK});
  stroke(c, line([[0, -thick / 2 + 1], [length - 3, -thick / 2 + 1.5]]), gilded ? '#fff5ca' : '#c2d0ce', .7);
  if (level >= 2) for (const x of level >= 3 ? [2, 10, length - 2] : [3, length - 2])
    part(c, rect(x - .8, -thick / 2 - .3, 1.8, thick + .6, .4),
      linear(c, 0, -thick / 2, 0, thick / 2, [[0, gilded ? '#8d9b99' : '#ffe7a3'], [.45, gilded ? '#40585d' : BRASS], [1, gilded ? '#233a40' : '#916022']]),
      {width: .5, shade: false, line: INK});
  part(c, ellipse(length, 0, 2.1, thick / 2), level >= 4 ? '#f2ca67' : '#78908f', {width: .7, depth: .6, shade: gilded ? '#9f6b28' : '#394c50'});
  part(c, ellipse(length + .35, .1, 1.25, thick / 2 - 1.3), '#14232a', {width: .5, shade: false});
  if (firing) {
    // The recoil also keeps the flash inside the original canvas, including its outline ring.
    part(c, poly([[length + 2, -.8], [length + 5, -3], [length + 4, -.3], [length + 6, 1.1], [length + 3, 1.8]], .3),
      '#ffe8a6', {line: '#e89939', width: .65, shade: false});
    part(c, ellipse(length + 3, .3, 1.4, 1.2), '#fff7db', {line: false, shade: false});
  }
  c.restore();
  part(c, rect(cx - 12, base - 6.2, 18, 3.3, .8), WOOD, {width: .7, depth: .7, light: '#dfa66c', gloss: rect(cx - 11, base - 5.8, 13, .7, .3)});
  for (const x of [cx - 10, cx + 3]) part(c, ellipse(x, base - 4.4, .6), '#e0bc71', {line: false, shade: false});
  wheel(c, cx - 7, base - 2.4, level >= 2);
}
