// The swivel-gun nest (decision D055) in the clean cartoon style of ./island.js and ./defenses-v2.js: a ring of
// sandbags round a wooden post, and on the post a short, wide-mouthed swivel gun on a fork, by level, idle and firing,
// and one pellet in flight. Same box and anchor as the cannon, the harpoon tower and the culverin (48 x 32, anchor 5),
// facing right, so every renderer keeps its numbers. Original designs, painted in code with the kit of ./paint.js;
// no downloaded art. Registered in ./registry.js.
//
// Level 1: three sandbags and an iron gun on a plain post. 2: a full ring of bags on a stone footing. 3: a brass
// barrel and a powder keg. 4: a gold muzzle ring, gold rope on the bags and the island's teal banner. 5: a wholly
// gilded gun and the royal-blue banner with a gold star. Firing: the gun kicks, a fan of three small flashes (the
// pellets) and a puff of smoke. It reads at a glance as "not a cannon": no wheels, no carriage, a low round nest.
// Damage states (T33's approach, ./tower-states.js): `-damaged` is the intact drawing leaning, cracked, scorched and
// smoking (drawDamaged); `-broken` is T33's rubble heap with the bent little gun and a torn sandbag on it.
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';
import {drawBroken, drawDamaged, towerStateFrame} from './tower-states.js';

const SAND = '#d9c08a', SAND_DARK = '#b39660', SAND_LIGHT = '#efdcaa', WOOD = '#a8693a', WOOD_DARK = '#7a4a2a';
const STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb', IRON = '#3e4250', BRASS = '#f2c14e', GOLD = '#ffcf3f', GOLD_DARK = '#c98a2a';
const BANNER = {4: '#2c9aa6', 5: '#2f56b0'};

// One sandbag: a fat rounded pillow with a tied end and a seam.
function bag(c, x, y, w, level) {
  part(c, rect(x, y, w, 5.4, 2.6), SAND, {depth: 1.2, width: 1, light: SAND_LIGHT, shade: SAND_DARK, gloss: rect(x + 1.6, y + 1, w - 4, 1, .5)});
  stroke(c, line([[x + w - 2.6, y + 1], [x + w - 2.6, y + 4.4]]), SAND_DARK, .8);
  if (level >= 4) stroke(c, line([[x + 1, y + 2.7], [x + w - 1, y + 2.7]]), GOLD, .7);
}

// A small pennant on a pole (pole foot at x, foot), as on the culverin and the harpoon tower.
function pennant(c, x, foot, tall, level) {
  const top = foot - tall, cloth = BANNER[level] ?? BANNER[4];
  part(c, rect(x - .7, top, 1.4, tall, .5), WOOD_DARK, {width: .7});
  part(c, poly([[x + .7, top + 1], [x + 9, top + 1], [x + 7, top + 3.8], [x + 9, top + 6.6], [x + .7, top + 6.6]], .5),
    cloth, {depth: .8, width: .8, light: mix(cloth, '#ffffff', .35)});
  if (level >= 5) {
    const cx = x + 4, cy = top + 3.8, points = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .8 : 1.9; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    part(c, poly(points, .2), GOLD, {width: .5, shade: false});
  }
  part(c, ellipse(x, top - .4, 1.2), GOLD, {width: .6, shade: false});
}

// The gun on its fork: a short barrel that flares at the mouth (a blunderbuss-like swivel), tilted a little down.
function gun(c, cx, cy, level, kick) {
  const gilded = level >= 5, body = gilded ? GOLD : level >= 3 ? BRASS : IRON;
  const style = gilded ? {depth: 1.4, width: 1.1, shade: GOLD_DARK, light: '#fff1b8'} : level >= 3 ? {depth: 1.4, width: 1.1, shade: GOLD_DARK, light: '#ffe08a'}
    : {depth: 1.4, width: 1.1, light: '#7b8296'};
  // The fork (the swivel's yoke) on the post.
  part(c, poly([[cx - 3.2, cy + 5], [cx - 2.4, cy - .6], [cx - 1, cy - .6], [cx - 1, cy + 2.6], [cx + 1, cy + 2.6], [cx + 1, cy - .6], [cx + 2.4, cy - .6], [cx + 3.2, cy + 5]], .5),
    gilded ? IRON : level >= 3 ? IRON : '#5a5f6e', {width: .8, shade: false});
  c.save(); c.translate(cx + kick, cy); c.rotate(.06);
  const barrel = new Path2D();
  barrel.moveTo(-8, -2); barrel.lineTo(6, -2.4); barrel.lineTo(10.5, -4.2); barrel.lineTo(10.5, 4.2); barrel.lineTo(6, 2.4); barrel.lineTo(-8, 2);
  barrel.arc(-8, 0, 2, Math.PI / 2, Math.PI * 1.5); barrel.closePath();
  part(c, barrel, body, {...style, gloss: rect(-7, -1.6, 12, .9, .4)});
  part(c, ellipse(10.5, 0, 1, 3.4), '#14161c', {width: .6, shade: false}); // the wide mouth
  if (level >= 2) part(c, rect(-3, -2.6, 1.8, 5.2, .6), gilded ? IRON : level >= 3 ? IRON : BRASS, {width: .6, shade: false});
  if (level === 4) part(c, rect(8.6, -4.4, 2, 8.8, .6), GOLD, {width: .7, shade: GOLD_DARK});
  // The tiller: a short handle out of the back, how a gunner swings it.
  part(c, rect(-14, -1, 6.4, 2, 1), WOOD_DARK, {width: .7, shade: false});
  c.restore();
}

/** The swivel-gun nest at `level` (1 to 5); `firing` the frame of a shot. */
export function swivel(level, firing = false) {
  return (c, {h}) => {
    const g = h - 5; shadow(c, 24, g, 19, 3.6);
    if (level >= 2) part(c, rect(5, g - 4, 38, 5, 2.4), level >= 3 ? STONE_LIGHT : STONE, {depth: 1.6, width: 1.1, gloss: rect(8, g - 3.4, 24, 1, .5)});
    const base = level >= 2 ? g - 4 : g;
    // The back row of bags, the post and the gun, then the front row over the post's foot.
    if (level >= 2) for (const [x, w] of [[9, 10], [19, 10], [29, 10]]) bag(c, x, base - 11, w, level);
    part(c, rect(22.4, base - 13, 3.2, 10, .8), WOOD, {depth: 1, width: .9, shade: WOOD_DARK});
    gun(c, 24, base - 15, level, firing ? -1.6 : 0);
    if (level >= 3) { // a powder keg by the nest
      part(c, rect(37, base - 9, 6.4, 8, 2), WOOD, {depth: 1, width: .9, shade: WOOD_DARK});
      for (const y of [base - 7.4, base - 3.4]) stroke(c, line([[37.2, y], [43.2, y]]), IRON, .8);
    }
    for (const [x, w] of level >= 2 ? [[6, 11], [16.5, 12], [28, 11], [38, 7]] : [[11, 11], [21.5, 11], [32, 10]]) bag(c, x, base - 5.8, w, level);
    if (level >= 4) pennant(c, 7, base - 6, level >= 5 ? 17 : 15, level);
    if (firing) {
      const mx = 24 + 10.5 + 1.5 - 1.6, my = base - 15 + .6;
      for (const [dy, len] of [[-3.2, 7], [0, 9], [3.2, 7]]) {
        part(c, poly([[mx, my + dy * .3 - 1], [mx + len, my + dy - .6], [mx + len + 1.6, my + dy], [mx + len, my + dy + .6], [mx, my + dy * .3 + 1]], .6),
          '#fff3c4', {line: '#f29e38', width: .7, shade: false});
      }
      part(c, ellipse(mx + 1.6, my, 2, 1.4), '#ffffff', {line: false, shade: false});
      for (const [x, y, r] of [[mx - 2, my - 4.4, 2.3], [mx + 1.4, my - 5.6, 1.8], [mx - 5, my - 3.4, 1.6]]) part(c, ellipse(x, y, r), '#f4efe6', {line: '#8c8a92', width: .7, shade: '#cfcad6'});
    }
  };
}

// One pellet in flight (8 x 8, anchor 4): a small lead ball with a short bright streak.
function pellet(c, {h}) {
  const y = h / 2;
  stroke(c, line([[.5, y], [4, y]]), '#fff1b8', 1.4, .8);
  part(c, ellipse(5.2, y, 1.6), '#5c6070', {width: .6, depth: .4, gloss: ellipse(4.8, y - .6, .5)});
}

// Broken: T33's rubble (drawBroken), the bent little gun lying on it, and a torn sandbag spilling sand.
function swivelBroken(level) {
  return (c, size) => {
    drawBroken('swivel', level, c, size);
    const g = size.h - 5, cx = size.w / 2, gilded = level >= 5;
    part(c, rect(cx + 4, g - 7, 10, 4.6, 2.2), SAND, {depth: 1, width: .9, shade: SAND_DARK});
    part(c, poly([[cx + 13, g - 3], [cx + 17, g - 1.4], [cx + 12, g - 1]], .6), SAND_LIGHT, {width: .6, shade: false});
    c.save(); c.translate(cx - 10, g - 10); c.rotate(.45);
    part(c, poly([[0, -1.8], [10, -2.2], [13.5, -3.6], [13.5, 3.6], [10, 2.2], [0, 1.8]], .6), gilded ? GOLD : level >= 3 ? BRASS : IRON,
      gilded ? {depth: 1, width: 1, shade: GOLD_DARK, light: '#fff1b8'} : {depth: 1, width: 1});
    part(c, ellipse(13.5, 0, .8, 3), '#14161c', {width: .5, shade: false});
    c.restore();
    stroke(c, line([[cx - 14, g - 2], [cx - 6, g - 6]]), INK, .6, .4);
  };
}

/** Every swivel-nest frame: [width, height, anchor, draw], the names of the culverin's pattern (and T33's
 *  towerStateFrame names for the damaged and broken states). */
export function swivelFrames() {
  const frames = {'fx-swivel-pellet': [8, 8, 4, pellet]};
  for (let level = 1; level <= 5; level++) {
    const tail = level === 1 ? '' : `-l${level}`;
    frames[`island-swivel${tail}`] = [48, 32, 5, swivel(level)];
    frames[`island-swivel-fire${tail}`] = [48, 32, 5, swivel(level, true)];
    frames[towerStateFrame('swivel', level, 'damaged')] = [48, 32, 5, (c, size) => drawDamaged(swivel(level), c, size)];
    frames[towerStateFrame('swivel', level, 'broken')] = [48, 32, 5, swivelBroken(level)];
  }
  return frames;
}

// The frame names by level (index 0 = level 1), for world.js and render.js.
export const SWIVEL_ART = Object.freeze({
  levels: Object.freeze(['island-swivel', 'island-swivel-l2', 'island-swivel-l3', 'island-swivel-l4', 'island-swivel-l5']),
  fire: Object.freeze(['island-swivel-fire', 'island-swivel-fire-l2', 'island-swivel-fire-l3', 'island-swivel-fire-l4', 'island-swivel-fire-l5']),
  shot: 'fx-swivel-pellet',
  damaged: Object.freeze([1, 2, 3, 4, 5].map(level => towerStateFrame('swivel', level, 'damaged'))),
  broken: Object.freeze([1, 2, 3, 4, 5].map(level => towerStateFrame('swivel', level, 'broken'))),
});
