// People in the clean cartoon style: the captains (10 colour variants, front, back and side, two walk
// frames each, the musket pose), the hired crew and the pirates who come ashore. Original designs:
// round heads, tricorn hats with a coloured band, long coats, chunky boots. Boxes and anchors are
// the old atlas's (24 x 32, feet 3 px above the bottom edge; crew 16 x 32; the musket pose 48 x 32).
import {INK, ellipse, line, linear, mix, part, poly, radial, rect, shadow, stroke} from './paint.js';

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
const OUTLINE_LIGHT = [[0, '#6b5343'], [.48, '#4a3731'], [1, '#30262b']];
const FIELD_EDGE = [[0, '#8c6b4e'], [.42, '#614638'], [1, '#3b302e']];
const FIELD_OUTLINE = {outline: .73};
const EYE = '#352727', EYE_LIGHT = '#fff1d3';
const BOARDER_EDGE = [[0, '#8f614f'], [.43, '#684739'], [1, '#402f33']];
const BOARDER_OUTLINE = {outline: .77};

// Match the warm upper-left daylight on the village and the cooler shadows under roof edges.
function cloth(c, x0, y0, x1, y1, colour) {
  return linear(c, x0, y0, x1, y1, [
    [0, mix(colour, '#ffe3bb', .48)], [.22, mix(colour, '#f7dcab', .23)],
    [.47, colour], [.75, mix(colour, '#344964', .23)], [1, mix(colour, '#242739', .58)],
  ]);
}
const materialEdge = colour => mix(INK, mix(colour, '#615064', .27), .28);
function skin(c, x, y, size) {
  return radial(c, x, y, size * 1.36, [[0, '#ffe9c7'], [.31, '#fbd4ad'], [.61, SKIN], [.86, '#e0a385'], [1, '#ad6d65']],
    x - size * .35, y - size * .36);
}
function brass(c, x0, y0, x1, y1) {
  return linear(c, x0, y0, x1, y1, [[0, '#fff0bd'], [.36, '#f3cf80'], [.61, '#cf9551'], [1, '#875a3c']]);
}
// A broad brow shadow and a rounded near cheek give the eyes readable planes at game size.
function facePlanes(c, x, y, size) {
  const browY = y - size * .40;
  c.fillStyle = linear(c, x, browY - .5, x, browY + size * .24,
    [[0, '#74483e47'], [.47, '#9b574043'], [1, '#a7634200']]);
  c.fill(ellipse(x + size * .02, browY, size * .68, size * .24));
  const cheekX = x - size * .35, cheekY = y + size * .22;
  c.fillStyle = radial(c, cheekX, cheekY, size * .38,
    [[0, '#ffedca97'], [.56, '#ffcba253'], [1, '#ed9f7500']]);
  c.fill(ellipse(cheekX, cheekY, size * .36, size * .26, .18));
}
function boots(c, legs, sunlight) {
  for (const [x, y, h] of legs) {
    const edge = sunlight ? materialEdge('#625068') : undefined;
    part(c, rect(x, y, 3.6, h, 1.4), sunlight ? cloth(c, x, y, x + 3.6, y + h, PANTS) : PANTS, {depth: .9, line: edge});
    const leather = sunlight ? linear(c, x, y + h - 2.6, x + 3.5, y + h + .4,
      [[0, '#977043'], [.43, BOOT], [.66, '#633f2a'], [1, '#2b251f']]) : BOOT;
    const toe = rect(x - .4, y + h - 2.6, 4.4, 3, 1.4);
    part(c, toe, leather,
      {depth: .8, gloss: rect(x, y + h - 2.3, 1.4, .8, .4), light: sunlight ? '#dfb888a8' : undefined, line: edge});
    if (sunlight) {
      const toeY = y + h - 1.18;
      c.fillStyle = radial(c, x + .9, toeY, 1.55, [[0, '#d2985d'], [.58, '#c6814d8c'], [1, '#ab664500']]);
      c.fill(ellipse(x + 1.25, toeY, 1.47, .75, -.16));
      stroke(c, [[x + .1, toeY + .75], [x + 2.5, toeY + .82], [x + 3.16, toeY + .59]], '#4b2e28', .44);
    }
  }
}
function face(c, x, y, {side = false, sunlight = false} = {}) {
  const dark = sunlight ? EYE : INK, glint = sunlight ? EYE_LIGHT : '#fff';
  if (side) {
    part(c, ellipse(x + 1.6, y + .6, .8, 1.1), dark, {line: false, shade: false});
    c.fillStyle = glint; c.fill(ellipse(x + 1.85, y + .2, .3, .35));
    part(c, ellipse(x + 3.6, y + 2.6, .9, .7), '#ef9f86', {line: false, shade: false, alpha: .7});
    if (sunlight) {
      c.fillStyle = radial(c, x + 2.7, y + 1.76, 1.5, [[0, '#fff0ce'], [.6, '#ffc6955c'], [1, '#ffbc8b00']]);
      c.fill(ellipse(x + 2.52, y + 1.77, 1.27, .65, -.11));
      stroke(c, [[x + 2.45, y + 2.68], [x + 3.15, y + 2.75], [x + 3.55, y + 2.51]], '#935742', .44);
    }
    return;
  }
  for (const dx of [-2.1, 2.1]) {
    part(c, ellipse(x + dx, y + .5, .82, 1.15), dark, {line: false, shade: false});
    c.fillStyle = glint; c.fill(ellipse(x + dx + .25, y + .05, .3, .36));
    part(c, ellipse(x + dx * 1.45, y + 2.4, 1, .65), '#ef9f86', {line: false, shade: false, alpha: .6});
  }
  stroke(c, line([[x - 1, y + 2.9], [x, y + 3.4], [x + 1, y + 2.9]]), dark, .7);
}
// A near cheek and ear sit opposite a short far cheek. The visible nose turns with the face plane.
function quarterHead(c, x, y, scale = 1, captain = false, profile = false) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  const edge = materialEdge('#c89675');
  part(c, ellipse(-4.45, .9, 1.17, 1.33), '#eab28b', {depth: .65, width: .77, line: edge});
  const head = poly([
    [-4.7, -2.42], [-1.4, -4.5], [2.65, -3.98], [4.42, -1.88], [4.48, .2], [5.12, 1.24],
    [4.21, 1.82], [3.55, 3.55], [1.16, 4.77], [-2.9, 4.03], [-4.66, 1.97],
  ], [1.18, 2.3, 2.15, 1.4, .5, .55, .45, 1.13, 1.5, 1.4, 1.1]);
  part(c, head, skin(c, -.2, .05, 5.25), {depth: 1.3, shade: SKIN_DARK, line: edge});
  facePlanes(c, .03, .08, 4.35);
  const hair = poly([[-4.6, -2], [-2.23, -2.6], [-2.42, -.55], [-3.52, 1.5], [-4.65, .52]], .76);
  part(c, hair, '#7a4a2e', {depth: .6, width: .7, line: '#76513b'});
  c.fillStyle = linear(c, -4, -.7, -.7, 3.6, [[0, '#a5684550'], [.54, '#9f5e4d00'], [1, '#a6665148']]);
  c.fill(poly([[-3.54, -.8], [-2.85, .39], [-3.19, 2.35], [-2.1, 3.63], [-3.24, 3.03], [-4.16, 1.6]], .72));
  part(c, ellipse(-1.62, 2.14, 1.08, .66), '#ef9f86', {line: false, shade: false, alpha: .7});
  const nearEye = profile ? 1.18 : -.79;
  part(c, ellipse(nearEye, .36, .82, 1.1), EYE, {line: false, shade: false});
  if (!profile) part(c, ellipse(2.88, .46, .55, .94), EYE, {line: false, shade: false});
  c.fillStyle = EYE_LIGHT;
  c.fill(ellipse(nearEye + .20, -.03, .3, .3));
  if (!profile) c.fill(ellipse(3.02, .13, .22, .27));
  stroke(c, [[1.94, .97], [2.66, 1.17], [3.16, 1.45]], '#ffe1b9', .46, .8);
  stroke(c, [[2.59, 1.17], [3.56, 1.52], [2.91, 1.93]], '#b77561', .5, .82);
  if (captain) {
    c.save(); c.clip(head); beard(c, .1, .2, profile); c.restore();
  }
  else {
    stroke(c, [[.23, 2.72], [1.29, 3.05], [2.63, 2.64]], '#805042', .46);
    stroke(c, [[.42, 3.43], [1.29, 3.66], [2.25, 3.28]], '#ffdfb4', .42, .73);
  }
  c.restore();
}
// The warm strands on the lit cheek and the dark floor of the beard separate face from lapels.
function beard(c, x, y, side) {
  c.save(); c.translate(x, y);
  const cheek = side
    ? [[-3.3, -.16], [-2.18, 1.04], [-.3, 2.59], [2.14, 2.2], [3.77, 1.94], [3.97, 2.94],
      [2.12, 4.25], [-.72, 4.66], [-2.64, 3.13]]
    : [[-3.95, -.38], [-2.82, .75], [-1.04, 2.38], [.86, 2.36], [2.3, 1.88], [3.66, 2.0],
      [2.39, 3.74], [.62, 4.36], [-1.69, 3.95], [-3.49, 2.09]];
  c.fillStyle = linear(c, -3.55, -.3, 1.5, 4.4,
    [[0, '#a77555'], [.34, '#805039'], [.61, '#5a3a31'], [1, '#38282c']]);
  c.fill(poly(cheek, .32));
  stroke(c, [[side ? -1.84 : -2.76, 1.58], [-1.39, 2.84], [-.05, 3.20]], '#b17a58', .5, .62);
  stroke(c, [[.15, 2.68], [1.17, 2.87], [2.14, 2.58]], '#322529', .43);
  stroke(c, [[.48, 3.10], [1.49, 3.08]], '#bd8360', .36, .76);
  c.restore();
}
function paintedTricorn(c, pal, x, y, view, quarter, field = false) {
  const side = view === '-side', shift = quarter ? -1.15 : side ? .64 : 0;
  c.save(); c.translate(x, y);
  // The new brim sits inside the old front and side profiles at the original sprite scale.
  if (quarter || side) c.scale(.89, 1);
  const spread = side ? 7.72 : 8.55, peak = shift - 2.65, tip = shift + 3.23;
  const body = poly([
    [-spread, .87], [-spread + 2.05, 1.18], [peak, -1.94], [shift + .32, -.94], [tip, -1.60],
    [spread - 1.78, 1.83], [spread, 2.28], [spread - 1.05, 4.05], [3.6, 5.26],
    [shift - 1.76, 5.06], [-spread + 1.16, 4.24],
  ], [1.05, .77, .98, .81, .95, .91, .66, 1.03, 1.46, 1.55, .98]);
  const hatShade = mix(pal.hat, '#332633', .54);
  part(c, body, linear(c, -4.75, -.4, 4.2, 4.72, [
    [0, mix(pal.hat, '#e6c6a0', .43)], [.31, mix(pal.hat, '#8f9aa6', .27)],
    [.57, pal.hat], [1, hatShade],
  ]), {line: materialEdge(pal.hat)});
  c.save(); c.clip(body);
  c.fillStyle = linear(c, shift, -.76, shift, 5.3, [
    [0, mix(pal.hat, '#242636', .38)], [.62, mix(pal.hat, '#131824', .28)], [1, mix(pal.hat, '#82909f', .12)],
  ]);
  c.fill(poly([[peak, -1.85], [shift + .3, -.90], [tip, -1.53], [spread, 2.12],
    [spread - .56, 3.62], [2.82, 4.53], [shift - .42, 3.68], [shift - 2.02, 2.08]], 1.05));
  if (field) {
    const crown = poly([[peak - .56, -.78], [shift + .5, -.27], [tip - .12, -.78],
      [tip + .53, .7], [shift + .16, 2.06], [peak - 1, 1.37]], [1, .49, .67, .79, .84, .78]);
    part(c, crown, linear(c, peak - 1, -.73, tip, 1.77,
      [[0, mix(pal.hat, '#e8cca5', .39)], [.46, mix(pal.hat, '#94a3ae', .33)],
        [1, mix(pal.hat, '#322f47', .28)]]), {line: false, shade: false, alpha: .66});
  }
  const trim = linear(c, -spread + 2, .32, spread - 1, 3.6, [
    [0, mix(pal.band, '#fff1c9', .69)], [.37, pal.band], [.68, mix(pal.band, '#c49157', .42)],
    [1, mix(pal.band, '#91562f', .66)],
  ]);
  stroke(c, [[-spread + .53, 1.5], [-spread + 2.29, 1.69], [peak + .15, -1.05], [shift + .49, -.31],
    [tip - .3, -.81], [spread - 1.73, 2.41], [spread - .46, 2.72]], trim, .74);
  stroke(c, [[-spread + 1.73, 3.4], [shift - 1.59, 4.22], [2.95, 4.51], [5.78, 4.06]],
    mix(hatShade, '#49383c', .50), .67, .92);
  if (view !== '-back') {
    const badgeX = side ? 2.05 : shift + .74;
    c.fillStyle = brass(c, badgeX - .55, .15, badgeX + .9, 2.3);
    c.fill(ellipse(badgeX, 1.65, .76, .82));
    stroke(c, [[badgeX - .68, 2.65], [badgeX, 2.94], [badgeX + .72, 2.54]],
      mix(pal.band, '#ffe4b0', .55), .39);
  }
  c.restore(); c.restore();
}
// The tricorn: a wide upturned brim, a rounded crown and a coloured band.
function hat(c, pal, x, y, view, sunlight) {
  if (sunlight) return paintedTricorn(c, pal, x, y, view, false);
  const edge = view === '-side' ? [[x - 7.4, y + .4], [x - 3, y + 3], [x + 3.6, y + 3], [x + 7.6, y + 1.2], [x + 5.8, y + 6], [x - 5.8, y + 6.2]]
      : [[x - 8.4, y - .8], [x - 3.6, y + 3.6], [x + 3.6, y + 3.6], [x + 8.4, y - .8], [x + 6.4, y + 6.2], [x - 6.4, y + 6.2]];
  const brim = poly(edge, [1.4, 2, 2, 1.4, 2, 2]);
  part(c, rect(x - 4.2, y - 1.8, 8.4, 6.6, 3.4), pal.hat,
    {depth: 1.4, gloss: ellipse(x - 1.8, y + .3, 1.6, .9)});
  part(c, rect(x - 4, y + 1.6, 8, 1.7, .6), pal.band, {depth: .6, width: .8});
  const brimColour = mix(pal.hat, INK, .12);
  part(c, brim, brimColour, {depth: 1.1, gloss: rect(x - 5, y + 3.4, 4, .8, .4)});
  const badge = ellipse(x, y + 4.4, 1.2, 1);
  part(c, badge, pal.band, {width: .6, shade: false});
}
function captainBody(c, pal, view, step, {armed = false, originalMaterial = false} = {}) {
  const cx = 12, back = view.startsWith('-back'), side = view === '-side', diagonal = view.endsWith('-diagonal');
  const sunlight = !originalMaterial;
  if (sunlight) c.outlineStops = OUTLINE_LIGHT;
  shadow(c, cx, 29.2, 6.6, 1.9);
  // Legs: a walk frame lifts one boot (front and back) or swings them apart (side).
  const lift = step === '-walk-1' ? 1 : step === '-walk-2' ? 2 : 0;
  if (side) {
    const swing = lift === 1 ? 2.2 : lift === 2 ? -2.2 : 0;
    boots(c, [[cx - 1.8 - swing, 23.4, 6 - (lift ? .6 : 0)], [cx - 1.8 + swing, 23.4, 6]], sunlight);
  } else boots(c, [[cx - 4.4, 23.4 - (lift === 1 ? 1.2 : 0), 6], [cx + .8, 23.4 - (lift === 2 ? 1.2 : 0), 6]], sunlight);
  const arm = (x, y, angle) => {
    c.save(); c.translate(x, y); c.rotate(angle);
    const sleeve = linear(c, -1.56, -.45, 1.61, 5.93, [
      [0, mix(pal.coat, '#eac38d', .49)], [.28, mix(pal.coat, '#8eacb3', .28)], [.59, pal.coat],
      [1, mix(pal.coat, '#252836', .67)],
    ]);
    const edge = materialEdge(pal.coat);
    const armCloth = rect(-1.6, -.6, 3.2, 6.6, 1.6);
    part(c, armCloth, sleeve, {line: edge});
    c.save(); c.clip(armCloth);
    stroke(c, [[-.92, 1.22], [-.65, 2.04], [-.45, 3.75]], mix(pal.coat, '#e5e3bf', .38), .42, .82);
    stroke(c, [[-.99, 5.26], [.94, 5.46]], '#c79457', .55);
    c.restore();
    part(c, ellipse(0, 6.4, 1.6), skin(c, 0, 6.4, 1.6),
      {depth: .7, gloss: ellipse(-.4, 6, .59, .44), light: '#ffe6c4', line: edge});
    stroke(c, [[-.48, 6.75], [.07, 7.03], [.59, 6.91]], '#ac765e', .38, .68);
    c.restore();
  };
  const swing = step === '-walk-1' ? .35 : step === '-walk-2' ? -.35 : 0;
  const coat = side ? poly([[cx - 3.6, 15], [cx + 3.4, 15], [cx + 4.4, 24.4], [cx - 5.6, 25]], [3, 3, 1.6, 1.6])
      : poly([[cx - 4.8, 15], [cx + 4.8, 15], [cx + 6.4, 25], [cx - 6.4, 25]], [3.2, 3.2, 1.8, 1.8]);
  const coatPaint = sunlight ? cloth(c, cx - 5, 15, cx + 5, 25, pal.coat) : pal.coat;
  const coatEdge = sunlight ? materialEdge(pal.coat) : undefined;
  part(c, coat, coatPaint, {depth: 2.2, gloss: ellipse(cx - 2.6, 17.4, 1.3, 2.2),
    light: sunlight ? mix(pal.coat, '#f4deb3', .34) : undefined, line: coatEdge});
  if (!back && !side) {
    const collar = [[cx - 2, 15.2], [cx + 2, 15.2], [cx, 19.6]];
    part(c, poly(collar, .6), sunlight ? '#e5d0a8' : '#f6efe0',
      {depth: .5, width: .8, line: sunlight ? materialEdge('#b38351') : undefined});
    for (const y of [19.8, 22.4]) part(c, ellipse(cx + 2.4, y, .62),
      sunlight ? brass(c, cx + 1.9, y - .5, cx + 2.8, y + .6) : GOLD,
      {width: .6, shade: false, line: coatEdge});
  }
  if (back) stroke(c, line([[cx, 20.5], [cx, 25]]), mix(pal.coat, INK, .45), .8);
  const belt = rect(side ? cx - 4 : cx - 5.4, 20.6, side ? 8 : 10.8, 1.9, .7);
  part(c, belt, '#3a2a24', {depth: .5, width: .8, line: coatEdge});
  if (!back) {
    const buckleX = side ? cx + 1.2 : cx - 1.2;
    part(c, rect(buckleX, 20.3, 2.4, 2.5, .6), sunlight ? brass(c, buckleX, 20.3, buckleX + 2.4, 22.8) : GOLD,
      {width: .6, shade: false, line: coatEdge});
    if (sunlight) part(c, rect(buckleX + .79, 21.18, .82, .55, .17), '#855530', {line: false, shade: false});
  }
  if (sunlight) {
    c.save(); c.clip(coat);
    if (!back) {
      const lapelX = cx + (side ? -.6 : -3.1);
      c.fillStyle = linear(c, lapelX - 1.25, 15.2, lapelX + 2.4, 20.1, [
        [0, mix(pal.coat, '#ffdb9d', .60)], [.39, mix(pal.coat, '#c8b3a0', .50)], [1, mix(pal.coat, '#28384a', .63)],
      ]);
      c.fill(poly([[lapelX - 1.36, 15.26], [lapelX + .42, 15.15], [lapelX + 1.95, 18.9],
        [lapelX + 1.31, 19.85], [lapelX - .18, 17.82], [lapelX - 1.11, 17.43]], .45));
      stroke(c, [[lapelX - .72, 15.37], [lapelX - .04, 16.97], [lapelX + 1.35, 18.85]],
        mix(pal.band, '#ffe0a4', .55), .53, .88);
    }
    const fold = linear(c, cx + 1.2, 18.1, cx + 5.3, 23.7, [
      [0, '#26344600'], [.54, '#24344f66'], [1, '#24233ba9'],
    ]);
    c.fillStyle = fold;
    c.fill(poly([[cx + 2.15, 17.55], [cx + 3.86, 20.11], [cx + 4.68, 23.52],
      [cx + 1.16, 24.25], [cx + 1.87, 22.56]], 1.1));
    stroke(c, side ? [[cx - 3.6, 23.6], [cx - 3.9, 25], [cx + .4, 24.9]]
      : [[cx - 5, 23.9], [cx - 3, 24.8], [cx + 3.7, 24.8]], mix(pal.band, '#c89452', .52), .62, .82);
    stroke(c, [[cx + 4.7, 22.65], [cx + 3, 23.8], [cx + 1.8, 24.1]], mix(pal.coat, '#263c54', .55), .56, .75);
    c.restore();
  }
  if (!armed) {
    if (side) arm(cx + .4, 16.4, swing);
    else { arm(cx - 5.4, 16.2, .16 + swing * .4); arm(cx + 5.4, 16.2, -.16 - swing * .4); }
  }
  // The head: big and round, hair peeking out under the hat.
  const hx = side ? cx + 1 : diagonal ? cx + 2 : cx, hy = 10.6;
  const head = back ? (sunlight ? cloth(c, hx - 4.8, hy - 3.4, hx + 5.3, hy + 5.3, '#7a4a2e') : '#7a4a2e')
    : sunlight ? skin(c, hx, hy + .4, 5.5) : SKIN;
  const faceEdge = sunlight ? materialEdge('#bb8e74') : undefined;
  const faceShape = ellipse(hx, hy + .4, 5.5, 5.1);
  part(c, faceShape, head, {depth: 1.6, shade: back ? undefined : SKIN_DARK, line: faceEdge});
  if (!back) {
    if (sunlight) facePlanes(c, hx + (side ? 1 : .1), hy + .5, 4.4);
    if (side) part(c, poly([[hx - 5.4, hy - 1.6], [hx - 1, hy - 2.6], [hx - 2.4, hy + 2.2], [hx - 5.2, hy + 3.4]], 1.4),
      '#7a4a2e', {depth: .8, line: faceEdge});
    else for (const s of [-1, 1]) part(c, poly([[hx + s * 5.6, hy - 1.4], [hx + s * 3, hy - 2.4], [hx + s * 3.6, hy + 1.4], [hx + s * 5.4, hy + 2.6]], 1.2),
      '#7a4a2e', {depth: .6, line: faceEdge});
    face(c, hx + (side || diagonal ? 1 : 0), hy + .4, {side, sunlight});
    if (sunlight) {
      c.save(); c.clip(faceShape); beard(c, hx + .21, hy + .25, side); c.restore();
    }
  }
  hat(c, pal, hx, hy - 7, view, sunlight);
}
function fieldBoot(c, x, lift, facing, far, colour = PANTS) {
  const at = 29.4 - lift, knee = x - (facing - .5) * .65, toe = x + facing * 1.24;
  const upper = poly([[knee - 1.44, at - 7.1], [knee + 1.84, at - 7.1], [x + 1.3, at - 2.2],
    [x - 1.16, at - 2.0]], [.98, .91, .81, .79]);
  const pants = mix(colour, far ? '#69768a' : '#a6a3a0', far ? .17 : .34);
  part(c, upper, cloth(c, knee - 1.4, at - 7.8, x + 1.7, at - 2.12, pants),
    {line: '#4c4145', width: .66, shade: false});
  const leather = far ? '#654631' : '#986a46';
  const shoe = poly([[x - 1.36, at - 3.9], [x + 1.37, at - 4.04], [toe + 1.56, at - 1.69],
    [toe + 1.58, at - .27], [x - 1.66, at], [x - 1.87, at - 1.49]], [.66, .65, .97, .72, .67, .78]);
  part(c, shoe, linear(c, x - 1.72, at - 3.83, toe + 1.33, at,
    [[0, '#c79b6b'], [.35, leather], [.7, '#734e36'], [1, '#3e3030']]),
    {line: '#513b33', width: .73, shade: false});
  stroke(c, [[x - 1.38, at - .78], [toe + .11, at - .59], [toe + 1.23, at - .88]], '#4e372e', .45);
  stroke(c, [[x - .76, at - 3.05], [x - .26, at - 2.36], [toe + .69, at - 2.08]], '#dfad76', .47, far ? .52 : .88);
}

function fieldSleeve(c, x, y, swing, far, pal) {
  c.save(); c.translate(x, y); c.rotate(swing);
  if (far) c.scale(.84, .93);
  const body = poly([[-1.21, -.6], [1.15, -.69], [1.6, .78], [1.38, 3.41], [.94, 5.63],
    [-1.27, 5.66], [-1.52, 3.09], [-1.53, .45]], [.79, .83, .72, .57, .47, .51, .72, .77]);
  const clothColour = far ? mix(pal.coat, '#414653', .35) : pal.coat;
  part(c, body, cloth(c, -1.67, -.64, 2.35, 6.12, clothColour),
    {line: mix(clothColour, '#634639', .69), width: .67, shade: false});
  stroke(c, [[-1.05, .38], [-.79, 1.63], [-.69, 2.66]], mix(clothColour, '#f3d8a3', .44), .46, far ? .53 : .94);
  part(c, rect(-1.27, 4.91, 2.51, 1.08, .47),
    linear(c, -1.3, 4.8, 1.5, 6, [[0, '#e4bf83'], [.48, '#a67755'], [1, '#664637']]),
    {line: '#78533c', width: .37, shade: false});
  part(c, ellipse(-.02, 6.37, 1.17, 1.27, -.12), skin(c, -.26, 6.03, 1.15),
    {line: '#8f634e', width: .57, shade: false});
  c.restore();
}

// The field coat is cut above the knees and the nearer shoulder turns across the chest.
// Armed and fallen figures keep their own silhouettes and existing pose painters.
function fieldCaptain(c, pal, view, step, bearded) {
  c.outlineStops = FIELD_EDGE;
  const side = view === '-side', back = view === '-back';
  const stride = step === '-walk-1' ? -1 : step === '-walk-2' ? 1 : 0;
  const x = 12 + (side ? .56 : back ? -.08 : .11);
  const farBoot = side ? x + .65 + stride * 2.45 : x + 2.13;
  const nearBoot = side ? x - 1.44 - stride * 2.1 : x - 2.34;
  shadow(c, 12, 29.2, 6.6, 1.9);
  fieldBoot(c, farBoot, stride === 1 ? 1.24 : 0, side ? 1 : .4, true, pal.pants);
  fieldBoot(c, nearBoot, stride === -1 ? 1.24 : 0, side ? 1 : .3, false, pal.pants);
  if (!side) fieldSleeve(c, x + (back ? 4.17 : 4.3), 15.75, -.18 - stride * .17, true, pal);
  const shoulder = side ? 3.44 : 4.5, far = side ? 3.12 : 3.54;
  const body = poly([[x - shoulder, 15.18], [x - 2.55, 13.87], [x + 2.52, 14.17],
    [x + far, 15.71], [x + 3.06, 19.16], [x + far + .62, 23.03], [x + 1.14, 23.81],
    [x + .38, 22.32], [x - .93, 23.97], [x - shoulder - .47, 23.74], [x - 3.7, 19.85]],
  [1.35, 1.51, 1.35, .92, 1.13, .77, .77, .4, .53, .73, 1.05]);
  const coat = linear(c, x - 4.31, 14.25, x + 4.34, 23.94,
    [[0, mix(pal.coat, '#f6d6a2', .53)], [.31, mix(pal.coat, '#c2d4c4', .26)], [.53, pal.coat],
      [.76, mix(pal.coat, '#405069', .30)], [1, mix(pal.coat, '#302f44', .58)]]);
  part(c, body, coat, {line: mix(pal.coat, '#654b45', .65), width: .81, shade: false});
  c.save(); c.clip(body);
  const fold = poly([[x - 4.2, 14.85], [x - .62, 14.15], [x + 1.2, 19.43],
    [x - .32, 22.1], [x - 3.92, 24.16], [x - 2.72, 20.31]], .64);
  part(c, fold, linear(c, x - 3.1, 14.91, x - .3, 23.95,
    [[0, mix(pal.coat, '#f1dfb2', .65)], [.44, mix(pal.coat, '#c9dbc6', .34)],
      [1, mix(pal.coat, '#415a6c', .28)]]), {line: false, shade: false, alpha: .74});
  const turn = poly([[x + 2.52, 14.62], [x + far, 15.72], [x + 3.13, 19.4], [x + far + .69, 23.53],
    [x + 1.61, 23.54], [x + 1.73, 21], [x + .86, 19.7]], .57);
  part(c, turn, linear(c, x + 2.42, 15.08, x + 3.84, 23.86,
    [[0, mix(pal.coat, '#769094', .29)], [.58, mix(pal.coat, '#314f62', .49)],
      [1, mix(pal.coat, '#373342', .69)]]), {line: false, shade: false, alpha: .68});
  if (back) {
    stroke(c, [[x -.9, 15.02], [x + .05, 18.83], [x - .35, 21.44], [x + .41, 24.1]],
      mix(pal.coat, '#384453', .63), .66, .92);
  } else {
    const placketX = x + (side ? 1.79 : 1.16);
    const shirt = poly([[placketX - 2.19, 14.19], [placketX + 1.21, 14.63], [placketX + .99, 16.96],
      [placketX + .43, 19.23], [placketX - .65, 17.89]], .44);
    part(c, shirt, cloth(c, placketX - 1.66, 14.2, placketX + 1.05, 19.15, '#eee1c5'),
      {line: '#967359', width: .46, shade: false});
    stroke(c, [[placketX - 2.62, 14.76], [placketX - 1.22, 16.3], [placketX -.1, 18.85]],
      mix(pal.band, '#fbe7b6', .54), .75);
    stroke(c, [[placketX + 1.96, 15.46], [placketX + 1.37, 17.61], [placketX + .63, 18.84]],
      mix(pal.coat, '#3c3d4f', .73), .5, .86);
    for (const y of [18.7, 22.36]) part(c, ellipse(placketX + 1.52, y, .52),
      brass(c, placketX + 1.1, y - .48, placketX + 2.02, y + .48), {line: false, shade: false});
  }
  const belt = new Path2D();
  belt.moveTo(x - 4.89, 19.85); belt.quadraticCurveTo(x, 20.8, x + 4.13, 20.32);
  stroke(c, belt, '#644937', 1.62);
  stroke(c, belt, '#b08053', .59, .95);
  if (!back) {
    const buckle = x + (side ? 1.61 : .56);
    part(c, rect(buckle, 19.52, 1.89, 2.07, .43), brass(c, buckle, 19.59, buckle + 1.7, 21.54),
      {line: '#8c623d', width: .5, shade: false});
    part(c, rect(buckle + .59, 20.23, .74, .43, .11), '#a37147', {line: false, shade: false});
  }
  stroke(c, [[x - 4.68, 23.12], [x - 3.27, 23.52], [x - 1.62, 23.72]],
    mix(pal.band, '#d6a36f', .48), .52, .94);
  c.restore();
  fieldSleeve(c, x + (side ? -.95 : -4.18), 15.64, stride * .23 + .14, false, pal);
  const head = x + (side ? 1.23 : .1), y = 10.75;
  if (back) {
    const hair = poly([[head - 4.65, y - 2.26], [head - 2.93, y - 4.0], [head + 3.31, y - 4.1],
      [head + 4.97, y - 1.64], [head + 3.84, y + 3.25], [head + .4, y + 4.22], [head - 3.67, y + 3.12]], 1.26);
    part(c, hair, cloth(c, head - 3.65, y - 1.4, head + 3.96, y + 4.15, '#825536'),
      {line: '#765238', width: .74, shade: false});
    stroke(c, [[head - 3.33, y + .09], [head - 2.76, y + 1.72], [head - 1.57, y + 2.61]], '#b68854', .52, .77);
  } else quarterHead(c, head, y, side ? .86 : .9, bearded, side);
  c.save(); c.translate(head, 3.76); c.scale(side ? .94 : .96, .91);
  paintedTricorn(c, pal, 0, 0, view, view === '', true);
  c.restore();
}

function captain(pal, view, step, bearded = true) { return c => fieldCaptain(c, pal, view, step, bearded); }
// The musket pose, facing right: the captain stands at the middle of a 48 px box, the long gun level.
export function musketPose(pal, firing, angle = null) {
  return approvedMusketPose(pal, firing, angle);
}
// The approved musket path stays isolated; its pixel fingerprints are checked in Chromium.
function approvedMusketPose(pal, firing, angle = null) {
  return c => {
    // Keep the body upright; only the weapon and its arms turn toward the target.
    const tilt = Math.abs(angle ?? 0), back = angle < 0;
    const view = tilt < Math.PI / 8 ? '-side' : tilt > 3 * Math.PI / 8
      ? (back ? '-back' : '') : (back ? '-back-diagonal' : '-front-diagonal');
    const body = () => { c.save(); c.translate(12, 0); captainBody(c, pal, view, '', {armed: true, originalMaterial: true}); c.restore(); };
    // Facing away: the captain occludes the musket. Facing toward us: the gun is in front.
    if (angle === null || angle >= 0) body();
    const turn = angle ?? 0, reach = angle === null ? 1 : .6, kick = firing ? -1 : 0;
    const shoulder = 24 + (angle !== null && angle < 0 ? 8 * Math.abs(Math.sin(angle)) : 0);
    // Only these two sleeves/hands belong to the firing pose; the body's idle arms are omitted.
    const hands = [[19, 26, 19.6], [29, 31.4, 19]];
    for (const [from, x, y] of hands) {
      const dx = (x + kick - 24) * reach, dy = y - 18;
      const to = [shoulder + Math.cos(turn) * dx - Math.sin(turn) * dy,
        18 + Math.sin(turn) * dx + Math.cos(turn) * dy];
      const sleeve = [[from, 16.2], to];
      stroke(c, sleeve, INK, 4.6); stroke(c, sleeve, pal.coat, 3.1);
    }
    c.save();
    if (angle !== null) {
      // Raise the grip toward the visible shoulder as the captain turns away.
      c.translate(shoulder, 18); c.rotate(angle); c.scale(.6, 1); c.translate(-24, -18);
    }
    c.save(); c.translate(kick, 0);
    part(c, poly([[20, 17.2], [26, 16], [29, 18.6], [21.5, 20.6]], 1), '#8a5a36', {depth: .8});
    part(c, rect(25, 15.6, 18.5, 1.9, .9), '#3b3f4a', {depth: .6, gloss: rect(27, 15.9, 14.5, .5, .25)});
    part(c, rect(28, 17.2, 7, 1.6, .6), '#8a5a36', {depth: .5, width: .8});
    for (const [, x, y] of hands) part(c, ellipse(x, y, 1.5), SKIN, {depth: .6});
    c.restore(); c.restore();
    if (angle !== null && angle < 0) body();
  };
}
// Compact sleeves follow the gun; the bomb has separate holding and throwing positions.
export function weaponGripLayout(weapon, firing, angle = null) {
  const turn = angle ?? 0, sine = Math.sin(turn), back = sine < 0, depth = Math.abs(sine);
  const scale = angle === null ? 1 : .6;
  // Leave room for the long rifle's muzzle outline when it points down.
  const origin = [24 + (back ? 8 * depth : 0), 18 - (weapon === 'long_rifle' && !back ? depth : 0)];
  const point = ([x, y], offset = 0) => {
    const dx = (x - 24 - (firing && weapon !== 'fire_bombs' ? .6 : 0)) * scale, dy = y - 18;
    return [origin[0] + Math.cos(turn) * dx - sine * dy + offset, origin[1] + sine * dx + Math.cos(turn) * dy];
  };
  const blend = (side, vertical) => side.map((value, i) => value + (vertical[i] - value) * depth);
  const shoulders = [[19, 16.2], [29, 16.2]];
  let hands = [{local: [27, 19.6], offset: 0}, {local: [35, 19], offset: 0}];
  let elbows = [blend([20, 19.7], back ? [25, 16] : [20, 21]),
    blend([29.5, 20.4], back ? [31.2, 15] : [26.5, 20.5])];
  let bombCenter = null;
  if (weapon === 'pistols') {
    // One pistol fires; the other is held safely down beside the rear hip.
    const grip = blend([35, 18.7], back ? [34.5, 11.5] : [31.2, 22.1]);
    if (firing) {grip[0] -= Math.cos(turn) * .45; grip[1] -= sine * .45;}
    hands = [{point: [15.3, 22.5], local: null, lowered: true}, {point: grip, local: null, aimed: true}];
    elbows = [[17, 20], blend([31, 19.2], back ? [31.2, 15.5] : [32.6, 20.3])];
  }
  if (weapon === 'fire_bombs') {
    shoulders[0] = [19, 16.8];
    hands = [{point: [17.8, 23], local: null}, {point: firing
      ? blend([37.5, 14.5], back ? [33.5, 8.5] : [31, 25.8]) : [33.2, 24], local: null}];
    elbows = [[17, 20.5], firing
      ? blend([32.2, 17], back ? [33, 13.5] : [32, 20.5]) : [33, 20]];
    if (!firing) bombCenter = [34.7, 21.5];
  }
  for (const hand of hands) hand.point ??= point(hand.local, hand.offset);
  const arms = hands.map((hand, i) => ({shoulder: shoulders[i], elbow: elbows[i], wrist: hand.point}));
  return {origin, turn, scale, back, hands, arms, bombCenter, bombs: bombCenter ? 1 : 0};
}

export function weaponPose(pal, weapon, firing, angle = null) {
  if (weapon === 'musket') return approvedMusketPose(pal, firing, angle);
  const pose = weaponGripLayout(weapon, firing, angle);
  return c => {
    const tilt = Math.abs(angle ?? 0), view = tilt < Math.PI / 8 ? '-side' : tilt > 3 * Math.PI / 8
      ? (pose.back ? '-back' : '') : (pose.back ? '-back-diagonal' : '-front-diagonal');
    const body = () => {
      const firstShadow = c.shadows?.length;
      c.save(); c.translate(12, 0); captainBody(c, pal, view, '', {armed: true}); c.restore();
      // Deferred shadows are stored without the canvas transform: keep this one under the feet.
      if (firstShadow !== undefined) c.shadows[firstShadow][0] += 12;
    };
    const onWeapon = (draw, offset = 0) => {
      c.save(); c.translate(pose.origin[0] + offset, pose.origin[1]); c.rotate(pose.turn); c.scale(pose.scale, 1);
      c.translate(-24 - (firing && weapon !== 'fire_bombs' ? .6 : 0), -18); draw(); c.restore();
    };
    const sleeve = ({shoulder, elbow, wrist}) => {
      const [x, y] = shoulder, [endX, endY] = wrist;
      stroke(c, [shoulder, elbow, wrist], materialEdge(pal.coat), 4.6);
      stroke(c, [shoulder, elbow, wrist], cloth(c, x, y, endX, endY, pal.coat), 3.1);
    };
    const hand = point => part(c, ellipse(point[0], point[1], weapon === 'pistols' ? 1.1 : 1.35, 1.3), SKIN, {depth: .6});
    const pistol = hand => {
      const paintPistol = (x, y) => {
        part(c, poly([[x - 1.5, y - 2.7], [x + 1.4, y - 2.4], [x + .7, y + 2], [x - 1.5, y + 1.6]], .7), '#9f643a', {depth: .5});
        part(c, rect(x - 1, y - 3.6, 11, 2.6, .7), '#687281', {depth: .5, gloss: rect(x, y - 3.2, 7.5, .5, .2)});
        part(c, ellipse(x + 1.5, y - .7, 1.6, 1.2), '#b8924f', {width: .6, depth: .4});
      };
      if (hand.lowered) {
        c.save(); c.translate(...hand.point); c.rotate(Math.PI / 2); c.scale(.7, 1); paintPistol(0, 0); c.restore();
      } else {
        c.save(); c.translate(...hand.point); c.rotate(pose.turn); c.scale(Math.max(.8, pose.scale), 1); paintPistol(0, 0); c.restore();
      }
    };
    if (weapon === 'fire_bombs') {
      // The throwing hand cradles the bomb beside the hip, then follows through toward the target.
      c.save(); c.translate(24, 29); c.rotate((firing ? .11 : -.05) * Math.cos(pose.turn)); c.translate(-24, -29);
      sleeve(pose.arms[0]);
      body();
      sleeve(pose.arms[1]);
      if (pose.bombCenter) {
        const [x, y] = pose.bombCenter;
        part(c, ellipse(x, y, 2.7), '#343a42', {depth: .8, gloss: ellipse(x - .8, y - .8, .75)});
        part(c, rect(x - .7, y - 3.6, 1.4, 1.4, .4), '#a46e32', {depth: .4});
        stroke(c, [[x, y - 3.6], [x - 1, y - 5]], '#dcb772', 1);
      }
      hand(pose.hands[0].point);
      if (firing) {
        c.save(); c.translate(...pose.hands[1].point); c.rotate(pose.turn);
        part(c, poly([[-1.4, -.5], [-.8, -1.25], [0, -1.1], [.2, -.4], [2.1, -.4],
          [2.3, .35], [1.1, .95], [-1, .65]], .45), SKIN, {depth: .3, width: .65});
        c.restore();
      } else hand(pose.hands[1].point);
      c.restore();
      return;
    }
    // The far sleeve belongs behind the coat, not across the shirt like a blue strap.
    sleeve(pose.arms[0]);
    if (!pose.back) body();
    sleeve(pose.arms[1]);
    if (weapon === 'pistols') pistol(pose.hands[1]);
    else onWeapon(() => {
      part(c, poly([[21, 16], [26, 16], [28.5, 18.5], [27, 20.5], [24.5, 18.5], [21, 19]], .7), '#8a5a36', {depth: .6});
      const length = weapon === 'long_rifle' ? 21 : 14;
      part(c, rect(25, 15.2, length, 2, .7), '#3b3f4a', {depth: .5});
      part(c, rect(29, 17, 9, 1.3, .5), '#8a5a36', {depth: .4});
      if (weapon === 'blunderbuss') {
        part(c, poly([[34, 15.2], [40, 13.8], [40, 18.6], [34, 17.2]], .7), '#b8924f', {depth: .5});
        part(c, ellipse(40, 16.2, .6, 1.7), '#27323b', {depth: .3, width: .5});
      }
      else part(c, rect(30, 13, 5, 1.4, .5), '#c8b47a', {depth: .4});
    });
    for (const grip of pose.hands) if (!grip.lowered) hand(grip.point);
    if (pose.back) body();
    if (weapon === 'pistols') {pistol(pose.hands[0]); hand(pose.hands[0].point);}
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
  const look = {gunner: {shirt: '#e8e2d2', stripe: '#307681', cap: '#9c5140', pants: '#515060'},
    carpenter: {shirt: '#d8a35a', stripe: null, cap: '#5a6b7a', pants: '#50484b'},
    lookout: {shirt: '#3a78c8', stripe: '#e8e2d2', cap: '#25324a', pants: '#475771'}}[kind];
  return c => {
    c.outlineStops = FIELD_EDGE;
    const cx = 8; shadow(c, cx, 29.3, 4.8, 1.4);
    const shirtEdge = mix(look.shirt, '#684b41', .68);
    fieldBoot(c, cx + 1.85, 0, .22, true, look.pants);
    fieldBoot(c, cx - 1.95, 0, .24, false, look.pants);
    part(c, ellipse(cx + 3.75, 21.72, 1.0), skin(c, cx + 3.75, 21.72, 1), {depth: .45, width: .7, line: shirtEdge});
    const shirt = poly([
      [cx - 3.88, 17.98], [cx - 1.74, 16.38], [cx + 2.89, 17.16], [cx + 3.18, 19.92],
      [cx + 3.58, 23.92], [cx + 1.15, 24.58], [cx - 3.97, 24.02],
    ], [1.2, 1.7, 1.5, 1.2, 1.1, .8, 1]);
    part(c, shirt, cloth(c, cx - 3.2, 16.69, cx + 3.5, 24.6, look.shirt),
      {line: shirtEdge, width: .78, shade: false});
    if (look.stripe) {
      const stripe = cloth(c, cx - 3.9, 19.2, cx + 3.9, 22.3, look.stripe);
      c.save(); c.clip(shirt); c.fillStyle = stripe;
      for (const y of [19.2, 21.6]) c.fill(poly([
        [cx - 4.1, y - .16], [cx - .5, y + .25], [cx + 2.3, y + .15], [cx + 3.8, y - .14],
        [cx + 3.8, y + .69], [cx + 2.3, y + 1.22], [cx - .5, y + 1.39], [cx - 4.1, y + .83],
      ], .4));
      c.restore();
    }
    c.save(); c.clip(shirt);
    const shoulder = poly([[cx - 3.91, 17.73], [cx - 2.14, 16.65], [cx - .19, 17.87], [cx - 1.08, 21.65], [cx - 3.4, 23.7]], .59);
    part(c, shoulder, linear(c, cx - 3.2, 17.14, cx - .8, 23.62,
      [[0, '#fff0c0a0'], [.47, '#ecdca046'], [1, '#b08a8300']]), {line: false, shade: false});
    stroke(c, [[cx - 3.43, 23.79], [cx - 1.02, 24.14], [cx + 1.58, 24.2], [cx + 3.26, 23.81]], '#e8bc84', .48, .82);
    c.restore();
    if (kind === 'carpenter') {
      part(c, poly([[cx - 2.58, 19.8], [cx + 2.77, 20.18], [cx + 2.94, 24.84], [cx + .8, 25.4], [cx - 2.87, 24.9]], .85),
        cloth(c, cx - 2.7, 20, cx + 2.5, 25.4, '#7a5236'), {depth: .8, line: shirtEdge});
      stroke(c, [[cx - 2.3, 21.5], [cx - 2.2, 24.4], [cx + 1.9, 24.4]], '#d39e68', .35, .78);
      part(c, rect(cx + 3.4, 18.6, 1.2, 6, .4), '#8a5a36', {width: .7});
      part(c, rect(cx + 2.2, 17.6, 3.6, 1.8, .5), linear(c, cx + 3, 17.6, cx + 3, 19.4,
        [[0, '#ede9cf'], [.4, '#b0bdc3'], [1, '#687782']]), {width: .7});
    }
    if (kind === 'gunner') { part(c, rect(cx - 6.4, 13, 1.1, 13, .5), '#8a5a36', {width: .7}); part(c, ellipse(cx - 5.85, 12.6, 1.1, 1.3), '#3a2a24', {width: .7}); }
    const sleeve = poly([[cx - 4.59, 18.07], [cx - 2.65, 17.32], [cx - 2.35, 20.61],
      [cx - 2.63, 22.14], [cx - 4.51, 22.04]], .77);
    part(c, sleeve, cloth(c, cx - 4.63, 17.35, cx - 2.04, 22.33, look.shirt),
      {width: .67, line: shirtEdge, shade: false});
    stroke(c, [[cx - 4.32, 21.54], [cx - 2.75, 21.67]], mix(look.shirt, '#b18b5f', .6), .45);
    part(c, ellipse(cx - 3.83, 22.54, 1.35), skin(c, cx - 3.83, 22.54, 1.35), {depth: .5, width: .8, line: shirtEdge});
    quarterHead(c, cx + .25, 12.49, .75);
    // Headwear: the gunner's bandana, the carpenter's cap, the lookout's cap with a spyglass.
    const cap = poly([
      [cx - 4.38, 11.57], [cx - 3.06, 8.2], [cx + 2.52, 7.92], [cx + 3.66, 10.35],
      [cx + 4.36, 11.02], [cx + 2.1, 11.61], [cx - 1.6, 11.48],
    ], [1.1, 2.05, 2.4, 1.3, .57, .9, 1.22]);
    const capEdge = mix(look.cap, '#735243', .61);
    part(c, cap, cloth(c, cx - 3.5, 8, cx + 3.5, 11.4, look.cap), {depth: .9, line: capEdge});
    c.save(); c.clip(cap);
    const capFace = linear(c, cx - 2.9, 8.5, cx + 2.6, 11.2, [
      [0, mix(look.cap, '#edcba0', .64)], [.42, look.cap], [1, mix(look.cap, '#382830', .50)],
    ]);
    c.fillStyle = capFace;
    c.fill(poly([[cx - 3.32, 10.4], [cx - 1.35, 8.64], [cx + 1.18, 8.72],
      [cx + 2.81, 9.88], [cx + 1.75, 10.51]], .53));
    stroke(c, [[cx - 3.18, 10.93], [cx - 1.22, 10.62], [cx + 2.41, 10.89]],
      mix(look.cap, '#c79969', .43), .4, .88);
    c.restore();
    if (kind === 'gunner') {
      part(c, poly([[cx + 3.6, 10.4], [cx + 6.4, 11.6], [cx + 5, 13]], .6),
        look.cap, {depth: .4, width: .8, line: capEdge});
      part(c, rect(cx - 1.22, 9.72, 3.4, .84, .3), GOLD, {line: false, shade: false});
    }
    if (kind === 'lookout') {
      part(c, rect(cx + 2.6, 14.6, 5, 1.8, .7), brass(c, cx + 2.6, 14.6, cx + 4, 16.4), {depth: .5, width: .8});
      part(c, rect(cx + 6.2, 14.3, 1.4, 2.4, .5), brass(c, cx + 6.1, 14.3, cx + 7.6, 16.7), {width: .7});
    }
  };
}
// Pirates on foot (the boarders): red bandana, eye patch, striped shirt and a cutlass.
function boarderSleeve(c, far) {
  const sleeve = poly([[-1.13, -.45], [1.15, -.47], [1.51, 1.13], [1.35, 3.62], [.94, 5.4],
    [-1.20, 5.3], [-1.45, 3.29], [-1.52, .72]], [.76, .74, .63, .61, .51, .5, .63, .7]);
  const linen = far ? '#ddd3c6' : '#f4ece0', edge = far ? '#795a50' : '#8d6952';
  part(c, sleeve, cloth(c, -1.7, -.36, 1.58, 5.33, linen), {line: edge, width: .72, shade: false});
  stroke(c, [[-1.01, 1.06], [-.7, 2.98], [-.61, 3.9]], '#fff0bf', .4, far ? .52 : .82);
  stroke(c, [[-1.01, 4.83], [1.01, 4.96]], '#b99973', .42, .83);
  part(c, ellipse(0, 5.6, 1.44, 1.32, -.13), skin(c, -.27, 5.23, 1.45), {line: edge, width: .69, shade: false});
}

function boarder(step = '', hit = false) {
  return c => {
    c.outlineStops = BOARDER_EDGE;
    const cx = 12; shadow(c, cx, 29.2, 6.2, 1.8);
    c.save();
    if (hit) { c.translate(cx, 29); c.rotate(-.18); c.translate(-cx, -29); }
    const lift = step === '-walk-1' ? 1 : step === '-walk-2' ? 2 : 0;
    const shirtEdge = '#896451';
    fieldBoot(c, cx + 2.4, lift === 2 ? 1.2 : 0, .35, true, '#2f2a3a');
    fieldBoot(c, cx - 2.4, lift === 1 ? 1.2 : 0, .42, false, '#2f2a3a');
    const shirt = poly([[cx - 4.99, 15.92], [cx - 2.73, 14.7], [cx + 2.72, 15.1], [cx + 4.88, 16.12],
      [cx + 4.21, 19.31], [cx + 5.49, 23.53], [cx + 1.35, 24.39], [cx - 5.67, 23.92], [cx - 4.28, 20.13]],
    [1.43, 1.75, 2.23, 1.03, 1.18, .96, 1.29, 1.14, 1.31]);
    const canvasShirt = cloth(c, cx - 4.63, 14.7, cx + 5.02, 24.43, '#f4ece0');
    part(c, shirt, canvasShirt, {line: shirtEdge, width: .88, shade: false});
    c.save(); c.clip(shirt);
    const stripe = linear(c, cx - 3.9, 16.61, cx + 4.7, 24.31, [
      [0, '#e57c56'], [.31, '#dd634a'], [.57, '#b9403a'], [1, '#753237'],
    ]);
    c.fillStyle = stripe;
    for (const y of [16.98, 19.51, 22.12]) {
      const band = new Path2D();
      band.moveTo(cx - 5.7, y - .64);
      band.bezierCurveTo(cx - 2.46, y + .21, cx + 1.36, y + .52, cx + 5.72, y - .22);
      band.lineTo(cx + 5.64, y + .94);
      band.bezierCurveTo(cx + 1.9, y + 1.46, cx - 2.3, y + 1.35, cx - 5.65, y + .59);
      band.closePath(); c.fill(band);
    }
    const shade = poly([[cx + 1.8, 15.29], [cx + 4.98, 15.92], [cx + 4.4, 19.59], [cx + 6.15, 24.2],
      [cx + 1.63, 24.53], [cx + 2.19, 21.93], [cx + 2.59, 19.29]], .79);
    part(c, shade, linear(c, cx + 1.24, 15.17, cx + 5.51, 23.79,
      [[0, '#8f495d10'], [.37, '#79566549'], [1, '#4d394e91']]), {line: false, shade: false});
    stroke(c, [[cx - 3.89, 16.37], [cx - 2.95, 17.55], [cx - 2.71, 18.69]], '#fff3cb', .57, .87);
    stroke(c, [[cx - 3.21, 19.39], [cx - 2.43, 20.09], [cx - 2.28, 21.09]], '#fce0b6', .51, .79);
    c.restore();
    const belt = new Path2D();
    belt.moveTo(cx - 5.25, 21.76); belt.quadraticCurveTo(cx - .42, 22.45, cx + 4.68, 21.82);
    stroke(c, belt, '#574033', 1.74);
    stroke(c, belt, linear(c, cx - 4.72, 21.6, cx + 4.71, 22.54,
      [[0, '#a77a56'], [.43, '#795c45'], [1, '#65453e']]), .62);
    part(c, rect(cx - .56, 21.36, 1.86, 1.82, .43), brass(c, cx - .62, 21.26, cx + 1.4, 23.08),
      {line: '#9f774d', width: .37, shade: false});
    part(c, rect(cx + .03, 21.89, .73, .58, .13), '#845735', {line: false, shade: false});
    // The cutlass arm up (walking and standing), dropped when hit, brought down forward on a hack.
    const raise = hit ? -.5 : step === '-hack' ? -.9 : step === '-walk-1' ? -2.5 : step === '-walk-2' ? -2.8 : -2.65;
    c.save(); c.translate(cx + 4.6, 16.6); c.rotate(raise);
    part(c, blade(), linear(c, -.95, 8.76, 1.06, 11.65,
      [[0, '#f8ead2'], [.35, '#e1eaeb'], [.63, '#a8bfc5'], [1, '#7a8e99']]),
      {line: '#5a5a61', width: .79, shade: false, gloss: rect(-.15, 7.4, .43, 4.6, .2), light: '#f9fff4'});
    part(c, rect(-1.9, 6.1, 3.8, 1.1, .5), brass(c, -1.83, 6.08, 1.88, 7.21),
      {line: '#8a6546', width: .64, shade: false});
    boarderSleeve(c, true);
    c.restore();
    c.save(); c.translate(cx - 5, 16.6); c.rotate(.2);
    boarderSleeve(c, false); c.restore();
    const faceEdge = '#90694f';
    part(c, ellipse(cx - 4.55, 10.96, 1.07, 1.28), skin(c, cx - 4.8, 10.56, 1.25),
      {line: faceEdge, width: .64, shade: false});
    const head = poly([[cx - 4.76, 8.24], [cx - .9, 6.75], [cx + 3.9, 7.4], [cx + 4.65, 10.6],
      [cx + 4.88, 11.5], [cx + 4.26, 12.85], [cx + 2.69, 14.87], [cx + .31, 15.87],
      [cx - 3.19, 14.93], [cx - 4.69, 13.29]], [1.46, 1.95, 1.55, .65, .55, .75, .96, 1.23, 1.17, 1.12]);
    part(c, head, skin(c, cx - .52, 10.82, 4.9), {line: faceEdge, width: .82, shade: false});
    c.save(); c.clip(head);
    facePlanes(c, cx - .38, 11.03, 4.42);
    const jaw = poly([[cx - 4.74, 11.89], [cx - 2.77, 13.22], [cx - .81, 14.02], [cx + 2.05, 13.68],
      [cx + 3.81, 12.55], [cx + 3.1, 14.95], [cx + .13, 16.02], [cx - 3.49, 15.29]], .72);
    part(c, jaw, linear(c, cx - 3.2, 12.87, cx + 1.56, 15.82,
      [[0, '#995d4d50'], [.56, '#8d584744'], [1, '#5a394b70']]), {line: false, shade: false});
    c.restore();
    if (hit) { stroke(c, line([[cx - 3, 10.4], [cx - 1.2, 11.6]]), INK, .8); stroke(c, line([[cx - 3, 11.6], [cx - 1.2, 10.4]]), INK, .8); }
    else { part(c, ellipse(cx - 2, 11.2, .8, 1.1), EYE, {line: false, shade: false}); c.fillStyle = EYE_LIGHT; c.fill(ellipse(cx - 1.75, 10.8, .28, .32)); }
    const patch = linear(c, cx + 1.3, 10.1, cx + 3.3, 12.3, [[0, '#5d4a43'], [.39, '#3f3430'], [1, '#271f22']]);
    stroke(c, line([[cx - 4.6, 8.8], [cx + 4.8, 12.6]]), EYE, .55);
    part(c, poly([[cx + .89, 10.33], [cx + 2.48, 10.13], [cx + 3.55, 11.13],
      [cx + 3.31, 12.46], [cx + 1.91, 12.68], [cx + .88, 11.71]], .6),
      patch, {line: '#423130', width: .37, shade: false});
    stroke(c, [[cx - .48, 11.76], [cx + .28, 12.1], [cx + .03, 12.54]], '#fbd8b3', .46, .9);
    stroke(c, hit ? ellipse(cx, 14, 1, .8) : line([[cx - 1.26, 13.98], [cx + .12, 13.64], [cx + 1.34, 13.57]]), EYE, .65);
    // The bandana with white spots and its knot.
    const scarf = poly([[cx - 5.6, 9.6], [cx - 4.6, 5.6], [cx, 4.4], [cx + 4.6, 5.6], [cx + 5.6, 9.6]], [1, 2, 3, 2, 1]);
    const scarfEdge = '#955849';
    part(c, scarf, linear(c, cx - 5, 5, cx + 4, 9.9, [[0, '#f0a278'], [.39, '#d95843'], [1, '#892f38']]),
      {width: .85, line: scarfEdge, shade: false});
    c.save(); c.clip(scarf);
    c.fillStyle = linear(c, cx - 2.6, 5.6, cx + 3.7, 9.72, [
      [0, '#ffbd8940'], [.44, '#982f3920'], [1, '#712739cc'],
    ]);
    c.fill(poly([[cx + .2, 5.05], [cx + 3.1, 5.77], [cx + 4.89, 7.22], [cx + 5.37, 9.34],
      [cx + 1.5, 9.2], [cx - .4, 7.79]], 1));
    stroke(c, [[cx - 4.6, 7.4], [cx - 2.8, 5.85], [cx + .1, 5.35]], '#ffc698', .55, .84);
    stroke(c, [[cx - 4.35, 9.11], [cx + .7, 8.98], [cx + 4.6, 9.34]], '#7f2f35', .63, .84);
    for (const [x, y, light] of [[-2.6, 7.4, '#fff4d9dc'], [.6, 6.2, '#fff4d9cf'], [3, 8, '#efd0b6b2'], [-.6, 8.6, '#f0d8becc']]) {
      c.fillStyle = light;
      c.fill(ellipse(cx + x, y, .56));
    }
    c.restore();
    const knot = poly([[cx - 5.2, 8.6], [cx - 8.4, 8], [cx - 7.8, 11], [cx - 5.4, 10]], .7);
    part(c, knot, linear(c, cx - 8.35, 8.19, cx - 5.15, 10.48,
      [[0, '#f59369'], [.41, '#cb4841'], [1, '#8b333c']]), {width: .72, line: scarfEdge, shade: false});
    stroke(c, [[cx - 7.49, 8.82], [cx - 6.45, 9.26], [cx - 5.77, 9.35]], '#f7b48a', .43, .78);
    c.restore();
    if (hit) for (const [x, y] of [[cx - 7, 5], [cx + 7.5, 6.5]]) part(c, poly([[x, y - 1.6], [x + .5, y - .4], [x + 1.6, y], [x + .5, y + .4], [x, y + 1.6], [x - .5, y + .4], [x - 1.6, y], [x - .5, y - .4]], .2), '#fff3b0', {width: .6, shade: false});
  };
}
const blade = () => poly([[-.8, 6.6], [.8, 6.6], [1.1, 11], [-.2, 13.4], [-.9, 11.6]], .4);
// The island's militia (a Barracks house, GAME-V3.md "Houses"): defenders, not captains, so no tricorn and no long
// coat. A round brass helmet with a crest, a teal tunic with a white cross-belt (the island's banner colour; the
// pirates wear red), a round wooden shield with a gold star and a spear. Facing right; 24 x 32 like a boarder.
const MILITIA = {tunic: '#2c9aa6', dark: '#1f6f78', belt: '#f6efe0', helmet: '#e2b75a', crest: '#3a6fd8'};
function militiaFigure(step = '', {strike = false, hit = false} = {}) {
  return c => {
    c.outlineStops = FIELD_EDGE;
    const cx = 11; shadow(c, cx + 1, 29.2, 6.4, 1.8);
    c.save();
    if (hit) { c.translate(cx, 29); c.rotate(-.16); c.translate(-cx, -29); }
    const lift = step === '-walk-1' ? 1 : step === '-walk-2' ? 2 : 0;
    fieldBoot(c, cx + 2.4, lift === 2 ? 1.2 : 0, .52, true, '#3b4466');
    fieldBoot(c, cx - 2.4, lift === 1 ? 1.2 : 0, .39, false, '#3b4466');
    // Give both spear poses room for the silhouette outline inside the existing frame.
    if (strike) {
      part(c, rect(cx - 2, 18.4, 11.8, 1.3, .6), '#8a5a36', {depth: .4, width: .8});
      part(c, poly([[cx + 8.5, 16.8], [cx + 11.65, 19], [cx + 8.5, 21.2]], .35), '#dfe6ea', {depth: .4, width: .8});
    } else {
      part(c, rect(cx + 5.6, 5.6, 1.3, 22, .6), '#8a5a36', {depth: .4, width: .8});
      part(c, poly([[cx + 4.55, 6.3], [cx + 6.25, 2.8], [cx + 7.95, 6.3]], .35), '#dfe6ea', {depth: .4, width: .8});
    }
    const tunic = poly([[cx - 5, 15.92], [cx - 2.8, 14.76], [cx + 4.62, 15.4], [cx + 5.36, 19.7],
      [cx + 5.4, 23.94], [cx + .25, 24.52], [cx - 5.8, 23.9]], [1.35, 2.1, 2.6, 1.3, 1.4, 1.18, 1.1]);
    part(c, tunic, cloth(c, cx - 4.9, 15.3, cx + 5.3, 24.6, MILITIA.tunic),
      {line: '#4b5753', width: .76, shade: false, gloss: ellipse(cx - 2.6, 17.6, 1.2, 2), light: mix(MILITIA.tunic, '#ffffff', .3)});
    c.save(); c.clip(tunic); c.strokeStyle = MILITIA.belt; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 5, 15.6); c.lineTo(cx + 5.6, 23.6); c.stroke(); c.restore();
    part(c, rect(cx - 5.6, 21.4, 11.2, 1.8, .6), '#3a2a24', {depth: .4, width: .8});
    part(c, rect(cx - 1.1, 21.1, 2.2, 2.4, .5), brass(c, cx - 1.1, 21.1, cx + 1.1, 23.5), {width: .6, shade: false});
    // The spear hand (forward when striking), then the shield on the near arm.
    part(c, ellipse(strike ? cx + 4.4 : cx + 6.2, strike ? 19 : 18.6, 1.5), SKIN, {depth: .6});
    const shieldX = cx - 4.4, shieldFace = ellipse(shieldX, 19.6, 4.4, 4.6);
    part(c, shieldFace, linear(c, shieldX - 3.6, 16, shieldX + 3.6, 23.4,
      [[0, '#d6a25d'], [.45, '#a8693a'], [1, '#724b2f']]), {depth: 1.2, width: 1.1});
    stroke(c, ellipse(shieldX, 19.6, 3.4, 3.6), '#8c582d', .7);
    c.save(); c.clip(shieldFace); c.beginPath(); c.ellipse(shieldX, 19.6, 3.8, 4, 0, 3.4, 4.65);
    c.strokeStyle = '#f7ce82'; c.lineWidth = .57; c.stroke(); c.restore();
    part(c, poly([[cx - 4.4, 17.2], [cx - 3.7, 18.9], [cx - 2, 19.6], [cx - 3.7, 20.3], [cx - 4.4, 22], [cx - 5.1, 20.3], [cx - 6.8, 19.6], [cx - 5.1, 18.9]], .2),
      brass(c, shieldX - 1.5, 17.2, shieldX + 1.5, 22), {width: .6, shade: false});
    // The head, a short beard and the round helmet with its crest.
    part(c, ellipse(cx, 11, 5.1, 4.8), skin(c, cx, 11, 5.1), {depth: 1.5, shade: SKIN_DARK});
    if (hit) { stroke(c, line([[cx + .4, 10.6], [cx + 2.2, 11.8]]), INK, .8); stroke(c, line([[cx + .4, 11.8], [cx + 2.2, 10.6]]), INK, .8); }
    else { part(c, ellipse(cx + 1.6, 11.2, .8, 1.1), INK, {line: false, shade: false}); c.fillStyle = '#fff'; c.fill(ellipse(cx + 1.85, 10.8, .28, .32)); }
    part(c, ellipse(cx + 3.6, 13.2, .9, .6), '#ef9f86', {line: false, shade: false, alpha: .6});
    part(c, poly([[cx - 3.6, 13], [cx + 3.4, 13], [cx + 2, 16], [cx - 2.2, 16]], 1.2), '#7a4a2e', {depth: .5, width: .8});
    part(c, poly([[cx - 6.6, 9.2], [cx + 6.6, 9.2], [cx + 5.4, 10.6], [cx - 5.4, 10.6]], .6), mix(MILITIA.helmet, INK, .15), {depth: .5, width: .9});
    part(c, ellipse(cx, 8.6, 4.6, 3.9), linear(c, cx - 3.8, 5.4, cx + 3.9, 11.2,
      [[0, '#fff1b0'], [.42, MILITIA.helmet], [.68, '#bd904c'], [1, '#80583c']]),
    {width: 1, gloss: ellipse(cx - 1.8, 7, 1.4, .8), light: '#ffe9ad'});
    part(c, poly([[cx - 3.4, 5.2], [cx + .4, 3], [cx + 3.6, 5.2], [cx, 4.8]], .6), MILITIA.crest, {depth: .5, width: .8});
    c.restore();
  };
}

/** Every people frame: name -> [width, height, anchor, draw]. */
export function peopleFrames() {
  const frames = {};
  CAPTAIN_PALETTES.forEach((pal, i) => {
    for (const view of VIEWS) for (const step of STEPS) {
      const draw = captain(pal, view, step);
      frames[`captain-${i + 1}${view}${step}`] = [24, 32, 3, draw, FIELD_OUTLINE];
      if (i === 0) frames[`explorer${view}${step}`] = [24, 32, 3, draw, FIELD_OUTLINE];
    }
  });
  // The story crew skins other captains wore before (deckhand, navigator, cook, salvager) are captains 2-5.
  ['deckhand', 'navigator', 'cook', 'salvager'].forEach((role, i) => {
    for (const view of VIEWS) for (const step of STEPS) {
      frames[`crew-${role}${view}${step}`] = [24, 32, 3, captain(CAPTAIN_PALETTES[i + 1], view, step, false), FIELD_OUTLINE];
    }
  });
  // Your captain's poses in waves wear your colour (setPoseColour, the lobby's index 0-9) when painted.
  frames['captain-musket-1'] = [48, 32, 3, c => musketPose(posePalette(), false)(c)];
  frames['captain-musket-2'] = [48, 32, 3, c => musketPose(posePalette(), true)(c)];
  frames['captain-cutlass'] = [48, 32, 3, c => cutlassPose(posePalette())(c)];
  // Every colour's poses, for the captain's own body (src/pirates/poses.js): your character and a teammate's
  // figure fire and strike in their own colour instead of a second captain drawn where the shot was fired.
  CAPTAIN_PALETTES.forEach((pal, i) => {
    for (const weapon of ['musket', 'pistols', 'blunderbuss', 'long_rifle', 'fire_bombs']) {
      frames[`captain-${i + 1}-${weapon}-1`] = [48, 32, 3, weaponPose(pal, weapon, false)];
      frames[`captain-${i + 1}-${weapon}-2`] = [48, 32, 3, weaponPose(pal, weapon, true)];
    }
    frames[`captain-${i + 1}-cutlass`] = [48, 32, 3, cutlassPose(pal)];
  });
  // Captain health: every colour's fallen captain (a wave shows each captain who is down in their colour).
  CAPTAIN_PALETTES.forEach((pal, i) => { frames[`captain-down-${i + 1}`] = [40, 24, 3, fallenCaptain(pal)]; });
  for (const kind of ['gunner', 'carpenter', 'lookout']) frames[`crew-${kind}`] = [16, 32, 3, crewFigure(kind), FIELD_OUTLINE];
  frames.boarder = [24, 32, 3, boarder(), BOARDER_OUTLINE];
  frames['boarder-walk-1'] = [24, 32, 3, boarder('-walk-1'), BOARDER_OUTLINE];
  frames['boarder-walk-2'] = [24, 32, 3, boarder('-walk-2'), BOARDER_OUTLINE];
  frames['boarder-hit'] = [24, 32, 3, boarder('', true), BOARDER_OUTLINE];
  frames['boarder-hack'] = [24, 32, 3, boarder('-hack'), BOARDER_OUTLINE];
  frames.militia = [24, 32, 3, militiaFigure(), FIELD_OUTLINE];
  frames['militia-walk-1'] = [24, 32, 3, militiaFigure('-walk-1'), FIELD_OUTLINE];
  frames['militia-walk-2'] = [24, 32, 3, militiaFigure('-walk-2'), FIELD_OUTLINE];
  frames['militia-strike'] = [24, 32, 3, militiaFigure('', {strike: true}), FIELD_OUTLINE];
  frames['militia-hit'] = [24, 32, 3, militiaFigure('', {hit: true}), FIELD_OUTLINE];
  return frames;
}
