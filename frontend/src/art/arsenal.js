// The island's arsenal (T41, decision D042) in the clean cartoon style of src/art/campaign.js: a squat
// stone armory with a slate roof, an iron-banded timber door under a crossed-muskets sign, a weapon rack
// with three guns against the wall, a powder barrel and a small red pennant. Seen from the game's
// three-quarter camera like the Tech hub and the Harbor. An original design, painted in code with the
// shared paint kit (src/art/paint.js); no outside image. Registered in src/art/registry.js.
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';

const STONE = '#a9a39a', STONE_LIGHT = '#cfc8bb', SLATE = '#56627a', SLATE_LIGHT = '#8593a8';
const WOOD = '#a8693a', WOOD_LIGHT = '#c98a4e', WOOD_DARK = '#7a4a2a', IRON = '#3e4250', BRASS = '#f2c14e', RED = '#d4553e';

// One gun leaning on the rack: a wooden stock and an iron barrel.
function gun(c, x, top, bottom) {
  part(c, rect(x - 1, top, 2, bottom - top - 6, .8), IRON, {width: .8, shade: false});
  part(c, poly([[x - 2.2, bottom - 7], [x + 2.2, bottom - 7], [x + 1.6, bottom], [x - 2.6, bottom]], .6), WOOD, {width: .8, depth: .6});
}

// The arsenal (80 x 80, anchor 8): the building, its rack and its barrel.
function arsenal(c, {w, h}) {
  const g = h - 8, cx = w / 2; shadow(c, cx, g, 34, 6);
  // Stone walls with mortar lines.
  part(c, rect(cx - 30, g - 36, 60, 36, 2.4), STONE, {depth: 3, width: 1.4, gloss: rect(cx - 27, g - 34, 3, 30, 1), light: STONE_LIGHT});
  for (let y = g - 29; y < g; y += 7) stroke(c, line([[cx - 29, y], [cx + 29, y]]), mix(STONE, INK, .35), .8);
  // The slate roof with a ridge cap.
  const roof = poly([[cx - 36, g - 34], [cx - 22, g - 56], [cx + 22, g - 56], [cx + 36, g - 34]], 2);
  part(c, roof, SLATE, {depth: 2.6, width: 1.5, light: SLATE_LIGHT, gloss: rect(cx - 18, g - 54, 30, 1.6, .8)});
  for (const y of [g - 48, g - 41]) stroke(c, line([[cx - 30 + (g - y - 34) * .6, y], [cx + 30 - (g - y - 34) * .6, y]]), mix(SLATE, INK, .4), .8);
  part(c, rect(cx - 23, g - 59, 46, 4, 1.6), mix(SLATE, INK, .25), {width: 1.1, shade: false});
  // The door: timber planks with two iron bands and a brass ring.
  part(c, rect(cx - 8, g - 24, 16, 24, 7), WOOD, {depth: 1.4, width: 1.2, light: WOOD_LIGHT});
  for (const x of [cx - 3, cx + 3]) stroke(c, line([[x, g - 22], [x, g - 1]]), WOOD_DARK, .8);
  for (const y of [g - 17, g - 7]) part(c, rect(cx - 8, y, 16, 2, .6), IRON, {width: .7, shade: false});
  part(c, ellipse(cx + 4.5, g - 11, 1.4), BRASS, {width: .7, shade: false});
  // The sign over the door: a brass shield with two crossed muskets.
  part(c, poly([[cx - 8, g - 33], [cx + 8, g - 33], [cx + 8, g - 28], [cx, g - 24.5], [cx - 8, g - 28]], 1.2), BRASS, {depth: 1, width: 1.1, light: '#ffe08a'});
  for (const [a, b] of [[[cx - 6, g - 26.5], [cx + 6, g - 32]], [[cx + 6, g - 26.5], [cx - 6, g - 32]]]) stroke(c, line([a, b]), INK, 1.6);
  // The weapon rack against the left wall: two rails and three guns.
  part(c, rect(cx - 27, g - 22, 15, 2, .6), WOOD_DARK, {width: .8, shade: false});
  for (const x of [cx - 24, cx - 19.5, cx - 15]) gun(c, x, g - 26, g - 1);
  part(c, rect(cx - 27, g - 8, 15, 2, .6), WOOD_DARK, {width: .8, shade: false});
  // A powder barrel by the right wall, with a red band.
  part(c, rect(cx + 15, g - 14, 11, 14, 3), WOOD_LIGHT, {depth: 1.4, width: 1.1});
  part(c, rect(cx + 15, g - 9, 11, 2.4, .6), RED, {width: .8, shade: false});
  part(c, ellipse(cx + 20.5, g - 14, 5.5, 1.6), WOOD, {width: .9, shade: false});
  // The pennant on the roof.
  part(c, rect(cx - 1, g - 74, 2, 16, .6), WOOD_DARK, {width: .8});
  part(c, poly([[cx + 1, g - 74], [cx + 13, g - 70.5], [cx + 1, g - 67]], .8), RED, {depth: .8, width: 1});
}

/** The arsenal frames: name -> [width, height, anchor, draw]. */
export function arsenalFrames() {
  return {'island-arsenal': [80, 80, 8, arsenal]};
}
