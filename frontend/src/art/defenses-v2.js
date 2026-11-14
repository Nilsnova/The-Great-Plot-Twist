// The second wave of defenses (T43, decision D048 proposed) in the clean cartoon style of ./island.js: the
// culverin, a long gun for a tower spot, by level, idle and firing, and its shot in flight. Same box and anchor
// as the cannon and the harpoon tower (48 x 32, anchor 5), facing right, so every renderer keeps its numbers.
// Original designs, painted in code with the kit of ./paint.js; no downloaded art. Registered in ./registry.js;
// nothing in the game draws them until the culverin is wired in (specs/T43-new-defenses.md).
//
// Level 1: a long, slim iron barrel on a low wooden sledge with two small trucks (wheels) and a wedge under the
// breech that tilts it up for the long shot. 2: a stone pad and iron bands. 3: brass bands, a seamed pad and a
// stack of shot by the muzzle end. 4: a gold muzzle ring, a gold edge on the pad and the island's teal banner. 5: a wholly gilded
// barrel with iron bands and the royal-blue banner with a gold star. Firing: the barrel kicks back, a long
// flash leaves the muzzle and a ring of smoke rolls out.
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';

const WOOD = '#a8693a', WOOD_LIGHT = '#c98a4e', WOOD_DARK = '#7a4a2a', STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb';
const IRON = '#3e4250', BRASS = '#f2c14e', GOLD = '#ffcf3f', GOLD_DARK = '#c98a2a';
// The island's banner colours of the tower tiers (as in ./island.js): teal at level 4, royal blue at 5.
const BANNER = {4: '#2c9aa6', 5: '#2f56b0'};

// A small banner on a pole (pole foot at x, foot): swallow-tailed cloth with gold edges, a star at level 5.
function pennant(c, x, foot, tall, level) {
  const top = foot - tall, cloth = BANNER[level] ?? BANNER[4];
  part(c, rect(x - .8, top, 1.6, tall, .6), WOOD_DARK, {width: .8});
  part(c, poly([[x + .8, top + 1], [x + 10.4, top + 1], [x + 8, top + 4.2], [x + 10.4, top + 7.4], [x + .8, top + 7.4]], .5),
    cloth, {depth: .9, width: .9, light: mix(cloth, '#ffffff', .35), gloss: rect(x + 2, top + 2, 4, .9, .4)});
  stroke(c, line([[x + .8, top + 1.5], [x + 9.8, top + 1.5]]), GOLD, .8);
  stroke(c, line([[x + .8, top + 7], [x + 9.8, top + 7]]), GOLD, .8);
  if (level >= 5) {
    const cx = x + 4.6, cy = top + 4.2, points = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .9 : 2.1; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    part(c, poly(points, .2), GOLD, {width: .5, shade: false});
  }
  part(c, ellipse(x, top - .5, 1.4), GOLD, {width: .7, shade: false});
}

/** The culverin at `level` (1 to 5); `firing` the frame of a shot. */
export function culverin(level, firing = false) {
  return (c, {h}) => {
    const g = h - 5, gilded = level >= 5; shadow(c, 23, g, 20, 3.6);
    if (level >= 2) part(c, rect(3, g - 6, 42, 7, 3), level >= 3 ? STONE_LIGHT : STONE, {depth: 2, width: 1.2, gloss: rect(6, g - 5.4, 28, 1.2, .6)});
    if (level >= 3) for (let x = 9; x < 44; x += 9) stroke(c, line([[x, g - 5], [x, g + 1]]), mix(STONE, INK, .4), .8);
    if (level >= 4) stroke(c, line([[4.5, g - 6], [43.5, g - 6]]), GOLD, 1.3);
    const base = level >= 2 ? g - 6 : g, kick = firing ? -2.6 : 0;
    // A stack of shot in front of the sledge (level 3 and up).
    if (level >= 3) for (const [x, y] of [[39, base - 2], [43, base - 2], [41, base - 5]]) part(c, ellipse(x, y, 2), IRON, {width: .8, depth: .6, gloss: ellipse(x - .6, y - .6, .6)});
    // The sledge: a long low wooden bed with a wedge (the quoin) under the breech.
    part(c, poly([[10, base - 2], [12, base - 7], [34, base - 7], [36, base - 2]], 1.2), WOOD, {depth: 1.4, width: 1.2, gloss: rect(14, base - 6.4, 14, 1, .4), light: WOOD_LIGHT});
    part(c, poly([[12, base - 7], [18, base - 7], [12, base - 10.4]], .6), WOOD_DARK, {width: 1, shade: false});
    if (level >= 2) for (const x of [17, 28]) part(c, rect(x, base - 7.4, 2.2, 5.4, .6), level >= 5 ? GOLD : IRON, {width: .7, shade: false});
    // The barrel: long and slim, tilted up, with a swell at the muzzle.
    const length = [27, 28, 29, 30, 31][level - 1] ?? 27, thick = [5.2, 5.4, 5.8, 6, 6.2][level - 1] ?? 5.2;
    c.save(); c.translate(13 + kick, base - 10.6); c.rotate(-.2);
    const barrel = new Path2D();
    barrel.moveTo(0, -thick / 2); barrel.lineTo(length - 3, -thick / 2 + 1); barrel.lineTo(length - 2, -thick / 2 + .3); barrel.lineTo(length, -thick / 2 + .3);
    barrel.lineTo(length, thick / 2 - .3); barrel.lineTo(length - 2, thick / 2 - .3); barrel.lineTo(length - 3, thick / 2 - 1); barrel.lineTo(0, thick / 2);
    barrel.arc(0, 0, thick / 2, Math.PI / 2, Math.PI * 1.5); barrel.closePath();
    part(c, barrel, gilded ? GOLD : IRON, gilded ? {depth: 1.8, width: 1.2, shade: GOLD_DARK, gloss: rect(1, -thick / 2 + .7, length - 7, 1.1, .5), light: '#fff1b8'}
      : {depth: 1.8, width: 1.2, gloss: rect(1, -thick / 2 + .7, length - 7, 1.1, .5), light: '#7b8296'});
    part(c, ellipse(-thick / 2 - .8, 0, 1.3), gilded ? IRON : BRASS, {width: .7, shade: false}); // the cascabel knob
    if (level >= 2) for (const x of level >= 3 ? [4, 12, 20] : [5, 16]) part(c, rect(x - 1, -thick / 2 - .3, 2.2, thick + .6, .7), gilded ? IRON : level >= 3 ? BRASS : IRON, {width: .7, shade: false});
    if (level === 4) part(c, rect(length - 3.4, -thick / 2 - .2, 3.4, thick + .4, .8), GOLD, {width: .8, shade: GOLD_DARK});
    part(c, ellipse(length, 0, 1, thick / 2 - .5), '#14161c', {width: .7, shade: false});
    c.restore();
    // Two small trucks under the sledge.
    for (const x of [15, 30]) { part(c, ellipse(x, base - 2, 3), WOOD_DARK, {depth: .8, width: 1.1}); part(c, ellipse(x, base - 2, 1.1), level >= 2 ? BRASS : '#c9a06a', {width: .7, shade: false}); }
    if (level >= 4) pennant(c, 4.5, base - 1, level >= 5 ? 18 : 16, level);
    if (firing) {
      const mx = 13 + kick + length * Math.cos(.2) + 1.5, my = base - 10.6 - length * Math.sin(.2);
      part(c, poly([[mx - 1, my - 2.6], [mx + 7, my - 1.6], [mx + 10, my], [mx + 7, my + 1.6], [mx - 1, my + 2.6]], 1), '#fff3c4', {line: '#f29e38', width: .9, shade: false});
      part(c, ellipse(mx + 3, my, 2.6, 1.4), '#ffffff', {line: false, shade: false});
      for (const [x, y, r] of [[mx - 1, my - 4.4, 2.6], [mx + 2.4, my - 5.6, 2], [mx - 3.6, my - 5.4, 1.8]]) part(c, ellipse(x, y, r), '#f4efe6', {line: '#8c8a92', width: .8, shade: '#cfcad6'});
    }
  };
}

// The culverin's shot in flight (16 x 8, anchor 4, flying right): a small iron ball with a short streak.
function culverinBall(c, {h}) {
  const y = h / 2;
  stroke(c, line([[1, y], [9, y]]), '#f4efe6', 2.2, .8);
  part(c, ellipse(11.5, y, 2.6), IRON, {width: .9, depth: .6, gloss: ellipse(10.8, y - .9, .8)});
}

/** Every culverin frame: [width, height, anchor, draw], the names of the harpoon tower's pattern. */
export function defensesV2Frames() {
  const frames = {'fx-culverin-ball': [16, 8, 4, culverinBall]};
  for (let level = 1; level <= 5; level++) {
    const tail = level === 1 ? '' : `-l${level}`;
    frames[`island-culverin${tail}`] = [48, 32, 5, culverin(level)];
    frames[`island-culverin-fire${tail}`] = [48, 32, 5, culverin(level, true)];
  }
  return frames;
}

// The frame names by level (index 0 = level 1), for world.js and render.js in the integration step.
export const CULVERIN_ART = Object.freeze({
  levels: Object.freeze(['island-culverin', 'island-culverin-l2', 'island-culverin-l3', 'island-culverin-l4', 'island-culverin-l5']),
  fire: Object.freeze(['island-culverin-fire', 'island-culverin-fire-l2', 'island-culverin-fire-l3', 'island-culverin-fire-l4', 'island-culverin-fire-l5']),
  shot: 'fx-culverin-ball',
});
