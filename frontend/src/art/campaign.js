// The campaign's island buildings in the clean cartoon style (docs/GAME-V3.md §4 and §5): the Harbor's
// market stall, the Tech hub's workshop, the wreck on the beach (and her mended hull), and the building site
// that stands where something opens later, with a sign that shows the wave it opens after. Seen from the
// game's three-quarter camera like the rest of src/art/island.js. Original designs, painted in code.
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';

const WOOD = '#a8693a', WOOD_LIGHT = '#c98a4e', WOOD_DARK = '#7a4a2a', STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb';
const BRASS = '#f2c14e', IRON = '#3e4250', TEAL = '#2c7f8c', TEAL_LIGHT = '#4fb0bc', RED = '#d4553e', CREAM = '#fff1d0';

// The Harbor: a plank stall with a striped awning, crates and a little flag (80 x 72).
function harbor(c, {w, h}) {
  const g = h - 8, cx = w / 2; shadow(c, cx, g, 34, 6);
  for (const x of [cx - 30, cx + 26]) part(c, rect(x, g - 44, 4, 44, 1.2), WOOD_DARK, {depth: 1, width: 1.1});
  part(c, rect(cx - 32, g - 18, 64, 18, 2), WOOD, {depth: 2.6, width: 1.3, gloss: rect(cx - 29, g - 16, 50, 1.6, .8), light: WOOD_LIGHT});
  for (let x = cx - 26; x < cx + 30; x += 10) stroke(c, line([[x, g - 17], [x, g - 1]]), WOOD_DARK, .9);
  part(c, rect(cx - 34, g - 21, 68, 4.6, 1.6), WOOD_LIGHT, {depth: .8, width: 1.1});
  // Goods on the counter: a coin pile, a jar, a small chart.
  for (const [x, y] of [[cx - 20, g - 23], [cx - 16, g - 24.5], [cx - 18, g - 26]]) part(c, ellipse(x, y, 3, 1.4), BRASS, {width: .8, shade: false});
  part(c, rect(cx - 4, g - 30, 7, 9, 2.4), '#7fd0e0', {depth: .8, width: 1, gloss: rect(cx - 2.6, g - 28.6, 1.4, 5, .6)});
  part(c, rect(cx + 9, g - 25, 14, 4, 1), CREAM, {width: .9, shade: false}); stroke(c, line([[cx + 11, g - 23], [cx + 21, g - 23]]), RED, .8);
  // The awning: red and cream stripes with a scalloped edge.
  const top = g - 52, edge = g - 40;
  const roof = poly([[cx - 38, edge], [cx - 30, top], [cx + 30, top], [cx + 38, edge]], [2, 2, 2, 2]);
  part(c, roof, CREAM, {depth: 2.4, width: 1.4});
  c.save(); c.clip(roof);
  for (let x = cx - 40; x < cx + 40; x += 16) { c.fillStyle = RED; c.beginPath(); c.moveTo(x, edge); c.lineTo(x + 6, top); c.lineTo(x + 14, top); c.lineTo(x + 8, edge); c.closePath(); c.fill(); }
  c.restore();
  for (let x = cx - 38; x < cx + 38; x += 8) part(c, ellipse(x + 4, edge, 4, 2.6, 0), (Math.floor((x - cx + 38) / 8) % 2) ? CREAM : RED, {width: 1, shade: false});
  // Crates beside the stall and the harbor flag.
  part(c, rect(cx + 30, g - 13, 11, 13, 1.4), WOOD_LIGHT, {depth: 1.4, width: 1.1});
  stroke(c, line([[cx + 31, g - 12], [cx + 40, g - 1]]), WOOD_DARK, 1.1);
  part(c, rect(cx - 1, top - 14, 2, 15, .6), WOOD_DARK, {width: .8});
  part(c, poly([[cx + 1, top - 14], [cx + 13, top - 11], [cx + 1, top - 7]], .8), TEAL, {depth: .8, width: 1});
}

// The Tech hub: a stone workshop with a brass dome, a big gear on the front and a chimney (80 x 88).
function techhub(c, {w, h}) {
  const g = h - 8, cx = w / 2; shadow(c, cx, g, 32, 6);
  part(c, rect(cx - 28, g - 34, 56, 34, 2.4), STONE, {depth: 3, width: 1.4, gloss: rect(cx - 25, g - 32, 3, 28, 1), light: STONE_LIGHT});
  for (let y = g - 28; y < g; y += 7) stroke(c, line([[cx - 27, y], [cx + 27, y]]), mix(STONE, INK, .35), .8);
  part(c, rect(cx - 7, g - 20, 14, 20, 6), WOOD, {depth: 1.4, width: 1.2}); part(c, ellipse(cx + 3.5, g - 10, 1), BRASS, {line: false, shade: false});
  for (const x of [cx - 22, cx + 11]) { part(c, rect(x, g - 26, 11, 10, 2), '#9fe3ef', {depth: 1, width: 1.1, gloss: rect(x + 1.6, g - 24.6, 2.4, 3, .6)}); stroke(c, line([[x + 5.5, g - 26], [x + 5.5, g - 16]]), INK, .8); }
  // The dome: brass with ribs and a little lantern on top.
  const dome = new Path2D(); dome.moveTo(cx - 24, g - 34); dome.quadraticCurveTo(cx - 24, g - 64, cx, g - 66); dome.quadraticCurveTo(cx + 24, g - 64, cx + 24, g - 34); dome.closePath();
  part(c, dome, BRASS, {depth: 3, dx: -1, width: 1.5, gloss: ellipse(cx - 10, g - 52, 5, 7, -.4), light: '#ffe08a'});
  for (const k of [-.5, 0, .5]) stroke(c, line([[cx + k * 22, g - 35], [cx + k * 10, g - 63]]), mix(BRASS, INK, .4), .9);
  part(c, rect(cx - 4, g - 76, 8, 10, 2), TEAL, {depth: 1, width: 1.1}); part(c, poly([[cx - 6, g - 76], [cx, g - 82], [cx + 6, g - 76]], 1), RED, {width: 1});
  // The gear sign over the door.
  const gear = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 7.4 : 9.4; gear.push([cx + Math.cos(a) * r, g - 42 + Math.sin(a) * r]); }
  part(c, poly(gear, .8), IRON, {depth: 1.2, width: 1.1, light: '#7b8296'}); part(c, ellipse(cx, g - 42, 3.2), BRASS, {width: .9, shade: false});
  // The chimney with a puff.
  part(c, rect(cx + 18, g - 60, 7, 18, 1.2), STONE_LIGHT, {depth: 1, width: 1.1});
  for (const [x, y, r] of [[cx + 22, g - 66, 3.4], [cx + 26, g - 71, 2.6]]) part(c, ellipse(x, y, r), '#f4efe6', {line: '#8c8a92', width: .8, shade: '#cfcad6'});
}

// The wreck on the beach: a broken hull on its side with a snapped mast (96 x 56), and mended with new
// planks, a straight mast and a furled sail (96 x 80).
function wreck(mended) {
  return (c, {w, h}) => {
    const g = h - 6, cx = w / 2; shadow(c, cx, g, 42, 6);
    const hull = new Path2D(); hull.moveTo(cx - 40, g - 18); hull.quadraticCurveTo(cx - 34, g + 1, cx, g); hull.quadraticCurveTo(cx + 30, g, cx + 42, g - 12);
    hull.lineTo(cx + 38, g - 22); hull.lineTo(cx - 36, g - 26); hull.closePath();
    part(c, hull, mended ? WOOD : mix(WOOD, '#6b5a4a', .45), {depth: 3, width: 1.5, gloss: rect(cx - 30, g - 22, 50, 1.6, .8), light: WOOD_LIGHT});
    for (const y of [g - 18, g - 11, g - 5]) stroke(c, line([[cx - 34, y], [cx + 36, y + 2]]), WOOD_DARK, .9);
    if (!mended) {
      // A hole in the side, loose planks and seaweed.
      part(c, poly([[cx - 6, g - 20], [cx + 6, g - 21], [cx + 9, g - 9], [cx - 3, g - 6], [cx - 10, g - 12]], 1.4), '#2a1c14', {width: 1.1, shade: false});
      for (const [x, y, a] of [[cx - 22, g + 1, .3], [cx + 24, g + 2, -.4]]) { c.save(); c.translate(x, y); c.rotate(a); part(c, rect(-9, -1.6, 18, 3.2, 1), WOOD_LIGHT, {width: .9}); c.restore(); }
      for (const x of [cx - 30, cx + 30]) stroke(c, line([[x, g - 2], [x + 3, g - 9], [x + 1, g - 13]]), '#3d8f3c', 1.4);
      c.save(); c.translate(cx + 4, g - 24); c.rotate(.9); part(c, rect(-2, -26, 4.4, 26, 1.2), WOOD_DARK, {width: 1.1}); c.restore();
      part(c, poly([[cx + 8, g - 30], [cx + 18, g - 26], [cx + 12, g - 22]], 1), '#e8dcc0', {width: .9, shade: false});
      return;
    }
    // Mended: fresh planks over the hole, a straight mast with a furled sail and a pennant.
    part(c, rect(cx - 8, g - 20, 18, 12, 1.4), WOOD_LIGHT, {depth: 1, width: 1.1});
    for (const x of [cx - 4, cx + 5]) part(c, ellipse(x, g - 14, .9), IRON, {line: false, shade: false});
    part(c, rect(cx - 2.4, g - 70, 4.8, 46, 1.4), WOOD_DARK, {depth: 1, width: 1.2});
    part(c, rect(cx - 18, g - 56, 36, 6, 3), '#f2ead6', {depth: 1.4, width: 1.1});
    for (const x of [cx - 12, cx, cx + 12]) stroke(c, line([[x, g - 56], [x, g - 50]]), mix('#f2ead6', INK, .35), .8);
    part(c, poly([[cx + 2, g - 70], [cx + 16, g - 67], [cx + 2, g - 63]], .8), TEAL_LIGHT, {depth: .8, width: 1});
    for (const x of [cx - 26, cx + 22]) part(c, rect(x, g - 30, 4, 8, 1), WOOD, {width: .9});
  };
}

// Where a building opens later: a roped-off sandy plot, a crate of tools and a signpost with the wave
// it opens after, and a padlock (64 x 56).
function site(wave) {
  return (c, {w, h}) => {
    const g = h - 6, cx = w / 2; shadow(c, cx, g, 26, 5);
    part(c, ellipse(cx, g - 3, 26, 7), '#d9c08f', {depth: 1, width: 1.2, shade: '#c4a874'});
    for (const [x, y] of [[cx - 22, g - 4], [cx + 22, g - 4], [cx - 12, g + 1], [cx + 12, g + 1]]) part(c, rect(x - 1.3, y - 10, 2.6, 10, .8), WOOD_DARK, {width: .9});
    stroke(c, line([[cx - 22, g - 12], [cx - 12, g - 8], [cx + 12, g - 8], [cx + 22, g - 12]]), '#e8d6a8', 1.2);
    part(c, rect(cx - 20, g - 12, 10, 8, 1.2), WOOD_LIGHT, {depth: 1, width: 1}); stroke(c, line([[cx - 19, g - 11], [cx - 11, g - 5]]), WOOD_DARK, .9);
    // The signpost with the wave number.
    part(c, rect(cx + 5, g - 32, 3, 28, 1), WOOD_DARK, {depth: .8, width: 1});
    part(c, rect(cx - 6, g - 46, 26, 16, 3), CREAM, {depth: 1.6, width: 1.3});
    if (wave) {
      c.save(); c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 10px sans-serif';
      c.fillText(String(wave), cx + 7, g - 37.6); c.restore();
    }
    // A padlock on the post.
    const lock = new Path2D(); lock.arc(cx + 6.5, g - 24, 3.2, Math.PI, 0); lock.lineTo(cx + 9.7, g - 22); lock.moveTo(cx + 3.3, g - 22); lock.lineTo(cx + 3.3, g - 24);
    stroke(c, lock, IRON, 1.6);
    part(c, rect(cx + 2.2, g - 22.6, 8.6, 7, 1.6), BRASS, {depth: .8, width: 1});
    part(c, ellipse(cx + 6.5, g - 19.6, .9), INK, {line: false, shade: false});
  };
}
// The lock badge over a build spot that opens later (20 x 24, like the build badges).
function lockBadge(c, {w}) {
  part(c, poly([[w / 2 - 3, 18], [w / 2, 22.4], [w / 2 + 3, 18]], .8), '#8a6a42', {width: 1.1, shade: false});
  part(c, ellipse(w / 2, 10.2, 8.4), '#6b6f7c', {depth: 1.6, width: 1.3, light: '#9aa0ad'});
  const shackle = new Path2D(); shackle.arc(w / 2, 9, 2.6, Math.PI, 0); stroke(c, shackle, CREAM, 1.4);
  part(c, rect(w / 2 - 3.6, 9, 7.2, 5.6, 1.2), CREAM, {line: false, shade: false});
}

/** The campaign frames: name -> [width, height, anchor, draw]. */
export function campaignFrames() {
  const frames = {
    'island-harbor': [80, 72, 8, harbor], 'island-techhub': [80, 88, 8, techhub],
    'island-wreck': [96, 56, 6, wreck(false)], 'island-wreck-mended': [96, 80, 6, wreck(true)],
    'island-site': [64, 56, 6, site(null)], 'build-badge-locked': [20, 24, 0, lockBadge],
  };
  for (const wave of [4, 5, 6, 8]) frames[`island-site-${wave}`] = [64, 56, 6, site(wave)];
  return frames;
}
