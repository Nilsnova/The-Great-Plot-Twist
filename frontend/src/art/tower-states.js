// Tower damage states (T33 art prep): the same cannon, mortar and harpoon tower as src/art/island.js
// draws them, shown "intact", "damaged" (tilted, cracked, scorched, smoking) or "broken" (rubble, nothing
// that could fire). Original drawings in the island's cartoon kit; no outside art. Pure: each function
// only paints onto the canvas context it is given, so a test can feed it a recording stand-in.
//
// Wiring: island.js builds the frames `island-<kind>[-l2..l5]-damaged` and `-broken` from these and exposes
// drawTower(kind, level, state, firing). Nothing in the game asks for them yet (see specs/T33-tower-damage-art.md).
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';

export const TOWER_STATES = Object.freeze(['intact', 'damaged', 'broken']);
export const TOWER_KINDS = Object.freeze(['cannon', 'mortar', 'harpoon']);
/** A state name the game may hold (or not hold yet): anything unknown reads as intact, so nothing changes by accident. */
export const towerState = state => (TOWER_STATES.includes(state) ? state : 'intact');
/** The frame name of a tower in a state (level 1 has no suffix, as the intact frames have none). Intact is the plain name. */
export function towerStateFrame(kind, level, state = 'intact') {
  const n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1)), s = towerState(state);
  return `island-${kind}${n > 1 ? `-l${n}` : ''}${s === 'intact' ? '' : `-${s}`}`;
}

const WOOD = '#a8693a', WOOD_DARK = '#7a4a2a', STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb', IRON = '#3e4250';
const SOOT = '#1d1a1c', SMOKE = '#8c8a92', SMOKE_LIGHT = '#cfcad6';

// A grey smoke column rising from a point; `up` is how high it reaches.
function smoke(c, x, y, up) {
  for (const [dx, dy, r, a] of [[0, 0, 3.4, .85], [1.6, -up * .45, 2.8, .7], [-.6, -up * .85, 2.2, .5]])
    part(c, ellipse(x + dx, y + dy, r), SMOKE_LIGHT, {line: SMOKE, width: .8, shade: SMOKE, depth: .8, alpha: a});
}
// A jagged crack: a dark zig-zag from (x, y) going down, with one short branch.
function crack(c, x, y, len) {
  stroke(c, line([[x, y], [x + 2, y + len * .35], [x - 1.2, y + len * .6], [x + 1.6, y + len]]), INK, 1.1);
  stroke(c, line([[x + 2, y + len * .35], [x + 4.5, y + len * .5]]), INK, .9);
}
// A soot scorch: a soft dark smear.
function scorch(c, x, y, rx, ry) { c.save(); c.globalAlpha = .38; c.fillStyle = SOOT; c.fill(ellipse(x, y, rx, ry)); c.restore(); }

/**
 * Damaged: the intact drawing leans (about 4 degrees, about its foot), then gets cracks, scorch marks, a
 * few splinters on the ground and a column of smoke. It still reads as the same tower and level.
 * `drawIntact` is the intact drawing of that kind and level (with or without its firing flash).
 */
export function drawDamaged(drawIntact, c, size) {
  const {w, h} = size, g = h - 5, cx = w / 2;
  c.save(); c.translate(cx, g); c.rotate(.07); c.translate(-cx, -g); drawIntact(c, size); c.restore();
  crack(c, cx - 8, g - 14, 9); crack(c, cx + 7, g - 9, 7);
  scorch(c, cx - 2, g - 9, 7, 2.6); scorch(c, cx + 11, g - 13, 4, 1.8);
  for (const [x, y, a] of [[cx - 16, g + .5, -.3], [cx + 17, g + 1, .5]]) {
    c.save(); c.translate(x, y); c.rotate(a); part(c, rect(-3, -.9, 6, 1.8, .5), WOOD, {depth: .5, width: .8, shade: WOOD_DARK}); c.restore();
  }
  smoke(c, cx + 3, g - 17, 7);
}

// The rubble every broken tower shares: stone and charred timber heaped on the ground, an ash smear and
// one last thread of smoke. Level 2+ towers stood on a stone pad, so their pad lies in chunks beneath.
function rubble(c, {w, h}, level) {
  const g = h - 5, cx = w / 2; shadow(c, cx, g, 19, 3.6);
  scorch(c, cx, g - 1, 17, 3.4);
  if (level >= 2) for (const [x, y, rw, rh, cl] of [[cx - 15, g - 2, 7, 3, STONE], [cx + 14, g - 2, 7, 3.2, STONE_LIGHT], [cx, g, 6, 2.4, STONE]])
    part(c, ellipse(x, y, rw, rh), cl, {depth: 1, width: 1});
  for (const [x, y, rw, rh, cl] of [[cx - 8, g - 4, 6, 4, STONE], [cx + 4, g - 6, 7, 5.4, STONE_LIGHT], [cx + 13, g - 3, 5, 3.4, STONE], [cx - 1, g - 1.5, 5, 2.4, STONE_LIGHT]])
    part(c, ellipse(x, y, rw, rh), cl, {depth: 1.4, width: 1.1});
  // Charred timber: a snapped beam and a plank end poking out of the heap.
  c.save(); c.translate(cx - 4, g - 8); c.rotate(-.5); part(c, rect(-8, -1.6, 16, 3.2, .8), mix(WOOD_DARK, INK, .45), {depth: .6, width: .9, shade: false}); c.restore();
  c.save(); c.translate(cx + 9, g - 7); c.rotate(.9); part(c, rect(-5, -1.3, 10, 2.6, .6), WOOD_DARK, {depth: .6, width: .9, shade: false}); c.restore();
  smoke(c, cx - 3, g - 12, 8);
}
// What is left of each kind's weapon, lying in the rubble.
const WRECKAGE = {
  // A barrel snapped in two: one half on the ground, one tilted against a broken wheel.
  cannon(c, {w, h}) {
    const g = h - 5, cx = w / 2;
    c.save(); c.translate(cx + 2, g - 3); c.rotate(.12); part(c, rect(-3, -3.4, 15, 6.8, 2), IRON, {depth: 1.4, width: 1.2, gloss: rect(-1, -2.6, 10, 1, .4), light: '#7b8296'}); c.restore();
    c.save(); c.translate(cx - 12, g - 9); c.rotate(-.7); part(c, rect(-1, -3, 12, 6, 2), IRON, {depth: 1.2, width: 1.2}); part(c, ellipse(11, 0, 1.1, 2.4), '#14161c', {width: .7, shade: false}); c.restore();
    part(c, ellipse(cx + 14, g - 4, 4.4, 4.4), WOOD_DARK, {depth: .8, width: 1.1}); stroke(c, line([[cx + 14, g - 8.4], [cx + 14, g - 4], [cx + 17.4, g - 2.6]]), INK, 1);
  },
  // The iron pot cracked and rolled onto its side.
  mortar(c, {w, h}) {
    const g = h - 5, cx = w / 2;
    c.save(); c.translate(cx + 3, g - 5); c.rotate(1.1);
    part(c, poly([[-8, 4], [-9, -4], [-6.5, -10], [6.5, -10], [9, -4], [8, 4]], [3, 3, 1, 1, 3, 3]), IRON, {depth: 2, width: 1.3});
    part(c, ellipse(0, -10, 7.4, 2.6), '#2a2d36', {width: 1.1, shade: false}); part(c, ellipse(0, -10, 5.2, 1.6), '#101218', {line: false, shade: false});
    c.restore();
    stroke(c, line([[cx + 1, g - 8], [cx + 3.4, g - 4.6], [cx + 1.6, g - 1.8]]), INK, 1.1);
    part(c, ellipse(cx - 13, g - 2.6, 2.4), '#2a2d36', {width: .9, shade: false});
  },
  // The crossbow with a snapped limb, its string slack, and the rope trailing across the rubble.
  harpoon(c, {w, h}) {
    const g = h - 5, cx = w / 2;
    c.save(); c.translate(cx - 2, g - 6); c.rotate(-.18); part(c, rect(-13, -2, 26, 4, 1.4), '#c98a4e', {depth: 1.2, width: 1.2}); c.restore();
    const limb = new Path2D(); limb.moveTo(cx + 9, g - 8); limb.quadraticCurveTo(cx + 13, g - 14, cx + 11, g - 18);
    c.save(); c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 4.4; c.stroke(limb); c.strokeStyle = WOOD; c.lineWidth = 2.6; c.stroke(limb); c.restore();
    const rope = [[cx - 14, g - 8], [cx - 6, g - 4], [cx + 6, g - 3], [cx + 17, g - 1]];
    stroke(c, line(rope), '#9c7a44', 2.4); stroke(c, line(rope), '#dcbb78', 1.2);
  },
};

/** Broken: rubble, the kind's wrecked weapon and a trace of smoke. Nothing is aimed or flashing, so it cannot read as firing. */
export function drawBroken(kind, level, c, size) {
  rubble(c, size, level); (WRECKAGE[kind] ?? WRECKAGE.cannon)(c, size);
}
