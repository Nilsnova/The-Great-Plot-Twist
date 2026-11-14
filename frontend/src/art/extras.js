// Small cartoon icons that still had only a pixel PNG (GAME-V3.md §7): the coin, the brass compass and the
// five emote bubbles the captains show over their heads. Same names and boxes as the pixel catalog
// (src/pixel/story-catalog.js, src/pixel/catalog.js), so the world and How to play keep their numbers.
// Original designs, painted in code with the kit of ./paint.js.
import {INK, ellipse, line, part, poly, rect, stroke} from './paint.js';

const GOLD = '#f5c542', GOLD_DARK = '#c98f1d', BRASS = '#e2a93b', CREAM = '#fff4d8', RED = '#d4553e', TEAL = '#2c7f8c';

/** A gold coin with a rim and a shine, centred on (x, y) with radius r (any context, any scale). */
export function coin(c, x, y, r, width = Math.max(.8, r * .16)) {
  part(c, ellipse(x, y, r, r), GOLD, {shade: GOLD_DARK, depth: r * .22, width, gloss: ellipse(x - r * .38, y - r * .38, r * .22, r * .3, -.6)});
  stroke(c, ellipse(x, y, r * .62, r * .62), GOLD_DARK, Math.max(.5, width * .6));
  stroke(c, line([[x - r * .12, y - r * .32], [x - r * .12, y + r * .32]]), GOLD_DARK, Math.max(.5, width * .7));
}

// The coin (16 x 16, anchor 0).
function coinIcon(c, {w, h}) { coin(c, w / 2, h / 2, 6.4, 1); }

// The compass (32 x 32, anchor 4): a brass case, a cream face and a red and teal needle.
function compass(c, {w, h}) {
  const cx = w / 2, cy = h / 2 - 1;
  part(c, rect(cx - 2.5, cy - 15, 5, 4, 1.4), BRASS, {width: 1});
  part(c, ellipse(cx, cy, 12.5), BRASS, {depth: 2, width: 1.3, gloss: ellipse(cx - 5, cy - 6, 3, 2, -.6)});
  part(c, ellipse(cx, cy, 9), CREAM, {depth: 1.2, width: 1});
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) stroke(c, line([[cx + dx * 6.4, cy + dy * 6.4], [cx + dx * 8, cy + dy * 8]]), INK, .8);
  part(c, poly([[cx, cy - 7.5], [cx + 2.4, cy], [cx - 2.4, cy]], .5), RED, {shade: false, width: .8});
  part(c, poly([[cx, cy + 7.5], [cx - 2.4, cy], [cx + 2.4, cy]], .5), TEAL, {shade: false, width: .8});
  part(c, ellipse(cx, cy, 1.4), BRASS, {shade: false, width: .6});
}

// An emote: a round speech bubble (24 x 24, anchor 0) with its sign inside.
function bubble(sign) {
  return (c, {w}) => {
    const cx = w / 2;
    part(c, poly([[cx - 10, 2], [cx + 10, 2], [cx + 10, 17], [cx + 2, 17], [cx - 2, 22], [cx - 3, 17], [cx - 10, 17]], [4, 4, 4, .6, .6, .6, 4]),
      CREAM, {depth: 1.4, width: 1.1});
    sign(c, cx, 9.5);
  };
}
const SIGNS = {
  // A raised hand.
  wave: (c, x, y) => {
    part(c, rect(x - 4, y - 2, 8, 7, 2.6), '#f2c29b', {width: .9, depth: .8});
    for (let i = 0; i < 4; i++) part(c, rect(x - 4 + i * 2.1, y - 6 + (i === 0 || i === 3 ? 1.2 : 0), 1.8, 5.5, .9), '#f2c29b', {width: .7, shade: false});
    stroke(c, line([[x + 6, y - 5], [x + 7.5, y - 6.5]]), INK, .8); stroke(c, line([[x + 6.5, y - 2], [x + 8, y - 2.5]]), INK, .8);
  },
  // A gold star.
  cheer: (c, x, y) => {
    const points = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; points.push([x + Math.cos(a) * r, y + .4 + Math.sin(a) * r]); }
    part(c, poly(points, .5), GOLD, {shade: GOLD_DARK, width: .9});
  },
  // An arrow that points ahead.
  point: (c, x, y) => part(c, poly([[x - 6, y - 1.6], [x + 1, y - 1.6], [x + 1, y - 4.5], [x + 6.5, y], [x + 1, y + 4.5], [x + 1, y + 1.6], [x - 6, y + 1.6]], .5), TEAL, {width: .9, depth: .8}),
  // A little lit lantern.
  lantern: (c, x, y) => {
    part(c, rect(x - 3.5, y - 4, 7, 9, 1.6), GOLD, {shade: GOLD_DARK, width: .9, gloss: rect(x - 2.2, y - 2.6, 1.4, 5, .6)});
    part(c, rect(x - 4.5, y - 5.5, 9, 2, .8), '#5a4632', {shade: false, width: .8});
    part(c, rect(x - 4.5, y + 4.5, 9, 2, .8), '#5a4632', {shade: false, width: .8});
    stroke(c, line([[x - 2, y - 5.5], [x, y - 7.5], [x + 2, y - 5.5]]), INK, .8);
  },
  // A question mark.
  shrug: (c, x, y) => {
    const p = new Path2D(); p.moveTo(x - 3.2, y - 2.6); p.bezierCurveTo(x - 3.2, y - 7, x + 3.6, y - 7, x + 3.4, y - 2.8); p.bezierCurveTo(x + 3.2, y - .4, x, y - .2, x, y + 2.4);
    stroke(c, p, INK, 3.2); stroke(c, p, RED, 1.7);
    part(c, ellipse(x, y + 5.2, 1.5), RED, {shade: false, width: .8});
  },
};

/** The frames: [width, height, anchor, draw]. */
export function extraFrames() {
  return {
    'coin-icon': [16, 16, 0, coinIcon],
    compass: [32, 32, 4, compass],
    ...Object.fromEntries(Object.entries(SIGNS).map(([id, sign]) => [`emote-${id}`, [24, 24, 0, bubble(sign)]])),
  };
}
