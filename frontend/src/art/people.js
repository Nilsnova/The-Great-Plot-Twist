// People in the clean cartoon style: the captains (10 colour variants, front, back and side, two walk
// frames each, the musket pose), the hired crew and the pirates who come ashore. Original designs:
// round heads, tricorn hats with a coloured band, long coats, chunky boots. Boxes and anchors are
// the old atlas's (24 x 32, feet 3 px above the bottom edge; crew 16 x 32; the musket pose 48 x 32).
import {INK, ellipse, line, mix, part, poly, rect, shadow, stroke} from './paint.js';

const SKIN = '#f3c39b', SKIN_DARK = '#d99a76', BOOT = '#4a2e22', PANTS = '#5b4a6e', GOLD = '#f2c14e';
// Ten captains a crew can tell apart at a glance: coat, hat, the hat's band and the trousers.
export const CAPTAIN_PALETTES = Object.freeze([
  {coat: '#2c9aa6', hat: '#25324a', band: '#f2c14e', pants: '#4b4e6e'},
  {coat: '#d1453b', hat: '#2a2430', band: '#f6e6c4', pants: '#4a3a3a'},
  {coat: '#3a6fd8', hat: '#f1e3c2', band: '#3a6fd8', pants: '#3b4466'},
  {coat: '#3fa04d', hat: '#6b3f26', band: '#f2c14e', pants: '#4d4636'},
  {coat: '#8b55c9', hat: '#2b2340', band: '#ff9ccf', pants: '#463b5c'},
  {coat: '#ee8a2c', hat: '#3a2a20', band: '#5fd0e0', pants: '#4f3c33'},
  {coat: '#e0609b', hat: '#ffffff', band: '#e0609b', pants: '#5a3a52'},
  {coat: '#f0c43a', hat: '#2f3a5a', band: '#e2463b', pants: '#4a4a5a'},
  {coat: '#8a5a36', hat: '#b33a32', band: '#f2c14e', pants: '#3e3530'},
  {coat: '#ece6d6', hat: '#1f6f78', band: '#f2c14e', pants: '#5a5f72'},
]);
export const CAPTAIN_COUNT = CAPTAIN_PALETTES.length;
// The colour of your own captain's musket and cutlass poses (0-9); read when a pose is painted.
let poseColour = 0;
export function setPoseColour(index) { poseColour = Number.isInteger(index) && index >= 0 && index < CAPTAIN_COUNT ? index : 0; }
const posePalette = () => CAPTAIN_PALETTES[poseColour];
const VIEWS = ['', '-back', '-side'], STEPS = ['', '-walk-1', '-walk-2'];

function boots(c, legs) {
  for (const [x, y, h] of legs) {
    part(c, rect(x, y, 3.6, h, 1.4), PANTS, {depth: .9});
    part(c, rect(x - .4, y + h - 2.6, 4.4, 3, 1.4), BOOT, {depth: .8, gloss: rect(x, y + h - 2.3, 1.4, .8, .4)});
  }
}
function face(c, x, y, {side = false} = {}) {
  if (side) {
    part(c, ellipse(x + 1.6, y + .6, .8, 1.1), INK, {line: false, shade: false});
    c.fillStyle = '#fff'; c.fill(ellipse(x + 1.85, y + .2, .3, .35));
    part(c, ellipse(x + 3.6, y + 2.6, .9, .7), '#ef9f86', {line: false, shade: false, alpha: .7});
    return;
  }
  for (const dx of [-2.1, 2.1]) {
    part(c, ellipse(x + dx, y + .5, .82, 1.15), INK, {line: false, shade: false});
    c.fillStyle = '#fff'; c.fill(ellipse(x + dx + .25, y + .05, .3, .36));
    part(c, ellipse(x + dx * 1.45, y + 2.4, 1, .65), '#ef9f86', {line: false, shade: false, alpha: .6});
  }
  stroke(c, line([[x - 1, y + 2.9], [x, y + 3.4], [x + 1, y + 2.9]]), INK, .7);
}
// The tricorn: a wide upturned brim, a rounded crown and a coloured band.
function hat(c, pal, x, y, view) {
  const brim = view === '-side'
    ? poly([[x - 7.4, y + .4], [x - 3, y + 3], [x + 3.6, y + 3], [x + 7.6, y + 1.2], [x + 5.8, y + 6], [x - 5.8, y + 6.2]], [1.4, 2, 2, 1.4, 2, 2])
    : poly([[x - 8.4, y - .8], [x - 3.6, y + 3.6], [x + 3.6, y + 3.6], [x + 8.4, y - .8], [x + 6.4, y + 6.2], [x - 6.4, y + 6.2]], [1.4, 2, 2, 1.4, 2, 2]);
  part(c, rect(x - 4.2, y - 1.8, 8.4, 6.6, 3.4), pal.hat, {depth: 1.4, gloss: ellipse(x - 1.8, y + .3, 1.6, .9)});
  part(c, rect(x - 4, y + 1.6, 8, 1.7, .6), pal.band, {depth: .6, width: .8});
  part(c, brim, mix(pal.hat, INK, .12), {depth: 1.1, gloss: rect(x - 5, y + 3.4, 4, .8, .4)});
  part(c, ellipse(x, y + 4.4, 1.2, 1), pal.band, {width: .6, shade: false});
}
function captainBody(c, pal, view, step) {
  const cx = 12, back = view === '-back', side = view === '-side';
  shadow(c, cx, 29.2, 6.6, 1.9);
  // Legs: a walk frame lifts one boot (front and back) or swings them apart (side).
  const lift = step === '-walk-1' ? 1 : step === '-walk-2' ? 2 : 0;
  if (side) {
    const swing = lift === 1 ? 2.2 : lift === 2 ? -2.2 : 0;
    boots(c, [[cx - 1.8 - swing, 23.4, 6 - (lift ? .6 : 0)], [cx - 1.8 + swing, 23.4, 6]]);
  } else boots(c, [[cx - 4.4, 23.4 - (lift === 1 ? 1.2 : 0), 6], [cx + .8, 23.4 - (lift === 2 ? 1.2 : 0), 6]]);
  // The coat: a rounded bell with tails, buttons and a belt.
  const coat = side
    ? poly([[cx - 3.6, 15], [cx + 3.4, 15], [cx + 4.4, 24.4], [cx - 5.6, 25]], [3, 3, 1.6, 1.6])
    : poly([[cx - 4.8, 15], [cx + 4.8, 15], [cx + 6.4, 25], [cx - 6.4, 25]], [3.2, 3.2, 1.8, 1.8]);
  part(c, coat, pal.coat, {depth: 2.2, gloss: ellipse(cx - 2.6, 17.4, 1.3, 2.2)});
  if (!back && !side) {
    part(c, poly([[cx - 2, 15.2], [cx + 2, 15.2], [cx, 19.6]], .6), '#f6efe0', {depth: .5, width: .8});
    for (const y of [19.8, 22.4]) part(c, ellipse(cx + 2.4, y, .62), GOLD, {width: .6, shade: false});
  }
  if (back) stroke(c, line([[cx, 20.5], [cx, 25]]), mix(pal.coat, INK, .45), .8);
  part(c, rect(side ? cx - 4 : cx - 5.4, 20.6, side ? 8 : 10.8, 1.9, .7), '#3a2a24', {depth: .5, width: .8});
  if (!back) part(c, rect(side ? cx + 1.2 : cx - 1.2, 20.3, 2.4, 2.5, .6), GOLD, {width: .6, shade: false});
  // Arms: coat sleeves with round hands; the side view shows one arm swinging.
  const arm = (x, y, angle) => {
    c.save(); c.translate(x, y); c.rotate(angle);
    part(c, rect(-1.6, -.6, 3.2, 6.6, 1.6), pal.coat, {depth: 1});
    part(c, ellipse(0, 6.4, 1.6), SKIN, {depth: .7});
    c.restore();
  };
  const swing = step === '-walk-1' ? .35 : step === '-walk-2' ? -.35 : 0;
  if (side) arm(cx + .4, 16.4, swing);
  else { arm(cx - 5.4, 16.2, .16 + swing * .4); arm(cx + 5.4, 16.2, -.16 - swing * .4); }
  // The head: big and round, hair peeking out under the hat.
  const hx = side ? cx + 1 : cx, hy = 10.6;
  part(c, ellipse(hx, hy + .4, 5.5, 5.1), back ? '#7a4a2e' : SKIN, {depth: 1.6, shade: back ? undefined : SKIN_DARK});
  if (!back) {
    if (side) part(c, poly([[hx - 5.4, hy - 1.6], [hx - 1, hy - 2.6], [hx - 2.4, hy + 2.2], [hx - 5.2, hy + 3.4]], 1.4), '#7a4a2e', {depth: .8});
    else for (const s of [-1, 1]) part(c, poly([[hx + s * 5.6, hy - 1.4], [hx + s * 3, hy - 2.4], [hx + s * 3.6, hy + 1.4], [hx + s * 5.4, hy + 2.6]], 1.2), '#7a4a2e', {depth: .6});
    face(c, hx + (side ? 1 : 0), hy + .4, {side});
  }
  hat(c, pal, hx, hy - 7, view);
}
function captain(pal, view, step) { return c => captainBody(c, pal, view, step); }
// The musket pose, facing right: the captain stands at the middle of a 48 px box, the long gun level.
function musketPose(pal, firing) {
  return c => {
    c.save(); c.translate(12, 0); captainBody(c, pal, '-side', ''); c.restore();
    const kick = firing ? -1 : 0;
    c.save(); c.translate(kick, 0);
    part(c, poly([[20, 17.2], [26, 16], [29, 18.6], [21.5, 20.6]], 1), '#8a5a36', {depth: .8});
    part(c, rect(25, 15.6, 18.5, 1.9, .9), '#3b3f4a', {depth: .6, gloss: rect(27, 15.9, 14, .5, .25)});
    part(c, rect(28, 17.2, 7, 1.6, .6), '#8a5a36', {depth: .5, width: .8});
    part(c, ellipse(26, 19.6, 1.6), SKIN, {depth: .6});
    part(c, ellipse(31.4, 19, 1.5), SKIN, {depth: .6});
    c.restore();
  };
}
// The cutlass swing (TOWER-DEFENSE.md §12), facing right in the musket's 48 px box: the blade out in
// front at the end of its arc, with a pale swoosh behind it.
function cutlassPose(pal) {
  return c => {
    c.save(); c.translate(12, 0); captainBody(c, pal, '-side', ''); c.restore();
    c.save(); c.globalAlpha = .55; c.lineCap = 'round';
    for (const [r, w, a] of [[11.5, 2.4, .5], [9.6, 1.4, .9]]) { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = w; c.beginPath(); c.arc(25.5, 18, r, -1.9, -.15); c.stroke(); }
    c.restore();
    c.save(); c.translate(26.4, 17.4); c.rotate(-1.62);
    part(c, rect(-1.6, -.6, 3.2, 6.2, 1.6), pal.coat, {depth: 1});
    part(c, ellipse(0, 6, 1.6), SKIN, {depth: .6});
    part(c, rect(-1.9, 6.9, 3.8, 1.1, .5), GOLD, {width: .7, shade: false});
    c.translate(0, 1); c.scale(1.25, 1.25);
    part(c, blade(), '#dfe6ea', {depth: .5, width: .8, gloss: rect(-.1, 7.4, .5, 5, .2)});
    c.restore();
  };
}
// A fallen captain (GAME-V3.md §3, captain health), 40 x 24: the side view laid on its back, head to the
// left and face up, a flat shadow under it and three dizzy stars over the head. One per lobby colour.
const star = (x, y, r) => poly([[x, y - r], [x + r * .32, y - r * .32], [x + r, y], [x + r * .32, y + r * .32], [x, y + r],
  [x - r * .32, y + r * .32], [x - r, y], [x - r * .32, y - r * .32]], .25);
function fallenCaptain(pal) {
  return c => {
    shadow(c, 20, 21.4, 16, 2.4);
    // The body's own ground shadow would not turn with it: it is dropped, the flat one above stands in.
    const kept = c.shadows; c.shadows = [];
    c.save(); c.translate(4.6, 22.6); c.rotate(-Math.PI / 2); captainBody(c, pal, '-side', ''); c.restore();
    c.shadows = kept;
    for (const [x, y, r] of [[8.6, 3, 1.9], [14.2, 1.9, 1.5], [19.6, 3.4, 1.3]]) part(c, star(x, y, r), GOLD, {width: .55, shade: false});
  };
}
// Crew figures (16 x 32): smaller, with the tool of their trade.
function crewFigure(kind) {
  const look = {gunner: {shirt: '#e8e2d2', stripe: '#c8423b', cap: '#c8423b'}, carpenter: {shirt: '#d8a35a', stripe: null, cap: '#5a6b7a'},
    lookout: {shirt: '#3a78c8', stripe: '#e8e2d2', cap: '#25324a'}}[kind];
  return c => {
    const cx = 8; shadow(c, cx, 29.3, 4.8, 1.4);
    boots(c, [[cx - 3.4, 24, 5.4], [cx + .2, 24, 5.4]]);
    part(c, poly([[cx - 3.6, 17], [cx + 3.6, 17], [cx + 4.4, 25], [cx - 4.4, 25]], [2.4, 2.4, 1.2, 1.2]), look.shirt, {depth: 1.6});
    if (look.stripe) for (const y of [19.2, 21.6]) part(c, rect(cx - 3.9, y, 7.8, 1.1, .4), look.stripe, {line: false, shade: false});
    if (kind === 'carpenter') { part(c, rect(cx - 3, 20, 6, 5.4, 1), '#7a5236', {depth: .8}); part(c, rect(cx + 3.4, 18.6, 1.2, 6, .4), '#8a5a36', {width: .7}); part(c, rect(cx + 2.2, 17.6, 3.6, 1.8, .5), '#9aa4ae', {width: .7}); }
    if (kind === 'gunner') { part(c, rect(cx - 6.4, 13, 1.1, 13, .5), '#8a5a36', {width: .7}); part(c, ellipse(cx - 5.85, 12.6, 1.1, 1.3), '#3a2a24', {width: .7}); }
    for (const s of [-1, 1]) part(c, ellipse(cx + s * 4.2, 22.4, 1.3), SKIN, {depth: .5, width: .8});
    part(c, ellipse(cx, 12.6, 4.2, 4), SKIN, {depth: 1.2, shade: SKIN_DARK});
    for (const dx of [-1.5, 1.5]) part(c, ellipse(cx + dx, 13, .62, .9), INK, {line: false, shade: false});
    part(c, ellipse(cx + 2.6, 14.6, .8, .5), '#ef9f86', {line: false, shade: false, alpha: .6});
    part(c, ellipse(cx - 2.6, 14.6, .8, .5), '#ef9f86', {line: false, shade: false, alpha: .6});
    // Headwear: the gunner's bandana, the carpenter's cap, the lookout's cap with a spyglass.
    part(c, poly([[cx - 4.4, 11.4], [cx - 3, 8], [cx + 3, 8], [cx + 4.4, 11.4]], [1.2, 2.4, 2.4, 1.2]), look.cap, {depth: .9});
    if (kind === 'gunner') part(c, poly([[cx + 3.6, 10.4], [cx + 6.4, 11.6], [cx + 5, 13]], .6), look.cap, {depth: .4, width: .8});
    if (kind === 'lookout') { part(c, rect(cx + 2.6, 14.6, 5, 1.8, .7), '#b8862e', {depth: .5, width: .8}); part(c, rect(cx + 6.2, 14.3, 1.4, 2.4, .5), '#e2b75a', {width: .7}); }
  };
}
// Pirates on foot (the boarders): red bandana, eye patch, striped shirt and a cutlass.
function boarder(step = '', hit = false) {
  return c => {
    const cx = 12; shadow(c, cx, 29.2, 6.2, 1.8);
    c.save();
    if (hit) { c.translate(cx, 29); c.rotate(-.18); c.translate(-cx, -29); }
    const lift = step === '-walk-1' ? 1 : step === '-walk-2' ? 2 : 0;
    for (const [x, up] of [[cx - 4.2, lift === 1], [cx + .6, lift === 2]]) {
      part(c, rect(x, 23.2 - (up ? 1.2 : 0), 3.6, 5.8, 1.2), '#2f2a3a', {depth: .8});
      part(c, rect(x - .3, 26.6 - (up ? 1.2 : 0), 4.2, 2.6, 1.2), '#3a241c', {depth: .6});
    }
    const shirt = poly([[cx - 5, 15.4], [cx + 5, 15.4], [cx + 5.8, 24.4], [cx - 5.8, 24.4]], [3, 3, 1.6, 1.6]);
    part(c, shirt, '#f4ece0', {depth: 1.8});
    c.save(); c.clip(shirt); for (const y of [17, 19.6, 22.2]) { c.fillStyle = '#c8423b'; c.fillRect(cx - 7, y, 14, 1.25); } c.restore();
    stroke(c, shirt, INK, 1);
    part(c, rect(cx - 5.6, 21.6, 11.2, 1.8, .6), '#2f2a3a', {depth: .4, width: .8});
    // The cutlass arm up (walking and standing), dropped when hit, brought down forward on a hack.
    const raise = hit ? -.5 : step === '-hack' ? -.9 : step === '-walk-1' ? -2.5 : step === '-walk-2' ? -2.8 : -2.65;
    c.save(); c.translate(cx + 4.6, 16.6); c.rotate(raise);
    part(c, blade(), '#dfe6ea', {depth: .5, width: .8, gloss: rect(-.1, 7.4, .5, 5, .2)});
    part(c, rect(-1.9, 6.1, 3.8, 1.1, .5), GOLD, {width: .7, shade: false});
    part(c, rect(-1.5, -.4, 3, 5.8, 1.5), '#f4ece0', {depth: .8});
    part(c, ellipse(0, 5.6, 1.5), SKIN, {depth: .6});
    c.restore();
    c.save(); c.translate(cx - 5, 16.6); c.rotate(.2); part(c, rect(-1.5, -.4, 3, 5.8, 1.5), '#f4ece0', {depth: .8}); part(c, ellipse(0, 5.6, 1.5), SKIN, {depth: .6}); c.restore();
    part(c, ellipse(cx, 11, 5.2, 4.9), SKIN, {depth: 1.5, shade: SKIN_DARK});
    part(c, ellipse(cx, 14.2, 3.4, 1.6), '#6a4a3a', {line: false, shade: false, alpha: .35});
    if (hit) { stroke(c, line([[cx - 3, 10.4], [cx - 1.2, 11.6]]), INK, .8); stroke(c, line([[cx - 3, 11.6], [cx - 1.2, 10.4]]), INK, .8); }
    else { part(c, ellipse(cx - 2, 11.2, .8, 1.1), INK, {line: false, shade: false}); c.fillStyle = '#fff'; c.fill(ellipse(cx - 1.75, 10.8, .28, .32)); }
    part(c, ellipse(cx + 2.2, 11.2, 1.5, 1.3), INK, {line: false, shade: false});
    stroke(c, line([[cx - 4.6, 8.8], [cx + 4.8, 12.6]]), INK, .55);
    stroke(c, hit ? ellipse(cx, 14, 1, .8) : line([[cx - 1.4, 13.8], [cx + 1.2, 13.4]]), INK, .7);
    // The bandana with white spots and its knot.
    const scarf = poly([[cx - 5.6, 9.6], [cx - 4.6, 5.6], [cx, 4.4], [cx + 4.6, 5.6], [cx + 5.6, 9.6]], [1, 2, 3, 2, 1]);
    part(c, scarf, '#d33a35', {depth: 1.2});
    c.save(); c.clip(scarf); c.fillStyle = '#ffffffcc'; for (const [x, y] of [[-2.6, 7.4], [.6, 6.2], [3, 8], [-.6, 8.6]]) c.fill(ellipse(cx + x, y, .6)); c.restore();
    part(c, poly([[cx - 5.2, 8.6], [cx - 8.4, 8], [cx - 7.8, 11], [cx - 5.4, 10]], .7), '#d33a35', {depth: .5, width: .8});
    c.restore();
    if (hit) for (const [x, y] of [[cx - 7, 5], [cx + 7.5, 6.5]]) part(c, poly([[x, y - 1.6], [x + .5, y - .4], [x + 1.6, y], [x + .5, y + .4], [x, y + 1.6], [x - .5, y + .4], [x - 1.6, y], [x - .5, y - .4]], .2), '#fff3b0', {width: .6, shade: false});
  };
}
const blade = () => poly([[-.8, 6.6], [.8, 6.6], [1.1, 11], [-.2, 13.4], [-.9, 11.6]], .4);

/** Every people frame: name -> [width, height, anchor, draw]. */
export function peopleFrames() {
  const frames = {};
  CAPTAIN_PALETTES.forEach((pal, i) => {
    for (const view of VIEWS) for (const step of STEPS) {
      const draw = captain(pal, view, step);
      frames[`captain-${i + 1}${view}${step}`] = [24, 32, 3, draw];
      if (i === 0) frames[`explorer${view}${step}`] = [24, 32, 3, draw];
    }
  });
  // The story crew skins other captains wore before (deckhand, navigator, cook, salvager) are captains 2-5.
  ['deckhand', 'navigator', 'cook', 'salvager'].forEach((role, i) => {
    for (const view of VIEWS) for (const step of STEPS) frames[`crew-${role}${view}${step}`] = [24, 32, 3, captain(CAPTAIN_PALETTES[i + 1], view, step)];
  });
  // Your captain's poses in waves wear your colour (setPoseColour, the lobby's index 0-9) when painted.
  frames['captain-musket-1'] = [48, 32, 3, c => musketPose(posePalette(), false)(c)];
  frames['captain-musket-2'] = [48, 32, 3, c => musketPose(posePalette(), true)(c)];
  frames['captain-cutlass'] = [48, 32, 3, c => cutlassPose(posePalette())(c)];
  // Captain health: every colour's fallen captain (a wave shows each captain who is down in their colour).
  CAPTAIN_PALETTES.forEach((pal, i) => { frames[`captain-down-${i + 1}`] = [40, 24, 3, fallenCaptain(pal)]; });
  for (const kind of ['gunner', 'carpenter', 'lookout']) frames[`crew-${kind}`] = [16, 32, 3, crewFigure(kind)];
  frames.boarder = [24, 32, 3, boarder()];
  frames['boarder-walk-1'] = [24, 32, 3, boarder('-walk-1')];
  frames['boarder-walk-2'] = [24, 32, 3, boarder('-walk-2')];
  frames['boarder-hit'] = [24, 32, 3, boarder('', true)];
  frames['boarder-hack'] = [24, 32, 3, boarder('-hack')];
  return frames;
}
