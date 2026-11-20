// The pirates' fleet and the fight in the clean cartoon style (its own chunk, loaded with a wave):
// the sloop, the brig, the flagship and the warship (three bobbing frames each, bow to the right),
// the wreck, shots and shells, splashes, smoke, fire, explosions and the musket flash. Original designs.
// The gunboat (docs/GAME-V3.md §4.1) is its own small hull, with its muzzle flash and the "jammed" mark of a tower.
// Boxes and anchors are the old atlas's: the anchor is the waterline (ships) or the centre (puffs).
import {INK, ellipse, line, linear, mix, part, poly, radial, rect, stroke} from './paint.js';

const GOLD = '#f2c14e', SEA_FOAM = '#f2fbff';
// Ship specs: hull length and height above water, colours, masts [x, height, sails] in hull units.
const SHIPS = {
  sloop: {w: 64, h: 64, anchor: 10, hull: [6, 52, 11], wood: '#805137', stripe: '#e8bb80', sail: '#efe0b8', flag: '#202c41',
    masts: [{x: .5, top: 6, sails: ['lateen']}], ports: 0, castle: 0, sailMark: '#333542',
    railShadow: '#9c6b43', hullBlue: '#426d89'},
  brig: {w: 96, h: 80, anchor: 11, hull: [8, 82, 15], wood: '#89583d', stripe: '#b95743', sail: '#ebd7ae', flag: '#252b3a',
    masts: [{x: .32, top: 10, sails: ['square', 'square']}, {x: .66, top: 6, sails: ['square', 'square']}], ports: 3, castle: 1, sailMark: '#343748'},
  flagship: {w: 128, h: 112, anchor: 13, hull: [8, 112, 20], wood: '#653f39', stripe: GOLD, sail: '#aa3b38', flag: '#341b2c',
    masts: [{x: .25, top: 18, sails: ['square', 'square']}, {x: .52, top: 8, sails: ['square', 'square', 'square']}, {x: .78, top: 16, sails: ['square', 'square']}], ports: 4, castle: 2},
  warship: {w: 160, h: 128, anchor: 14, hull: [8, 146, 26], wood: '#333e54', stripe: GOLD, sail: '#384659', flag: '#222438',
    masts: [{x: .22, top: 18, sails: ['square', 'square']}, {x: .5, top: 6, sails: ['square', 'square', 'square']}, {x: .78, top: 14, sails: ['square', 'square']}], ports: 6, castle: 2, decks: 2},
};
const BOB = [0, -1, .6], BILLOW = [1, 1.08, .95];
const FLEET_EDGE = [[0, '#735a45'], [.41, '#57443a'], [.72, '#443a3c'], [1, '#2b424d']];

// Windward cloth is lighter and rounder than the narrow leeward return.
function cloth(c, path, left, right, top, bottom, colour, billow, edgeWidth) {
  const span = right - left, drop = bottom - top;
  const light = mix(colour, '#eee1c7', .31), shade = mix(colour, '#282f44', .39);
  const boundSeam = linear(c, left, top, right, bottom, [
    [0, mix(colour, '#a27b55', .5)], [.43, mix(colour, '#84654b', .58)], [1, mix(colour, '#433344', .65)],
  ]);
  part(c, path, linear(c, left, top + drop * .11, right, top + drop * .65,
    [[0, mix(colour, shade, .69)], [.29, mix(colour, light, .72)], [.49, light], [.73, colour], [1, shade]]),
    {line: boundSeam, width: edgeWidth, shade: false});
  c.save(); c.clip(path);
  const crest = span * (.13 + .41 * (billow - 1));
  const loft = new Path2D();
  loft.moveTo(left + span * .11, top + drop * .15);
  loft.bezierCurveTo(left + span * .32 + crest, top + drop * .26, left + span * .49 + crest, top + drop * .60, left + span * .34, bottom);
  loft.quadraticCurveTo(left + span * .8, top + drop * .65, left + span * .47, top);
  loft.closePath();
  part(c, loft, linear(c, left + span * .47, top, left + span * .50, bottom,
    [[0, mix(colour, shade, .13)], [.49, light], [1, colour]]), {line: false, shade: false, alpha: .38});
  const curl = new Path2D();
  curl.moveTo(right - span * .22, top - 1);
  curl.quadraticCurveTo(right - span * .05 + crest, top + drop * .52, right - span * .27, bottom + 1);
  curl.lineTo(right + span, bottom + drop); curl.lineTo(right + span, top); curl.closePath();
  part(c, curl, linear(c, right - span * .12, top, right + span * .06, bottom,
    [[0, colour], [.53, shade], [1, mix(shade, '#352f3a', .29)]]), {line: false, shade: false, alpha: .42});
  const seam = new Path2D();
  seam.moveTo(left + span * .22, top + 1.8);
  seam.quadraticCurveTo(left + span * .16 + crest, top + drop * .45, left + span * .20, bottom - 1);
  seam.moveTo(left + span * .73, top + 1.6);
  seam.quadraticCurveTo(left + span * .73 + crest, top + drop * .43, left + span * .69, bottom - .7);
  stroke(c, seam, mix(shade, '#58412e', .23), .57, .47);
  const binding = new Path2D();
  binding.moveTo(left + 1, top + 2.2);
  binding.quadraticCurveTo(left + span * .41, top + 3.5, right - .4, top + 1.7);
  stroke(c, binding, light, .58, .72);
  const foot = new Path2D();
  foot.moveTo(left + .5, bottom - 2);
  foot.quadraticCurveTo(left + span * .43, bottom + 1.4 * billow, right + .8, bottom - 2.5);
  stroke(c, foot, mix(shade, '#4f3944', .24), .83, .78);
  c.restore();
}

function sailMark(c, path, x, y, r, spec) {
  const ink = spec.sailMark ?? mix(spec.sail, '#fff1cf', .83);
  c.save(); c.clip(path);
  stroke(c, [[x - r * 1.45, y + r * 1.57], [x + r * 1.53, y - r * .18]], ink, r * .48);
  stroke(c, [[x + r * 1.46, y + r * 1.45], [x - r * 1.58, y - r * .14]], ink, r * .48);
  part(c, ellipse(x, y - r * .11, r, r * .89), ink, {line: false, shade: false});
  part(c, rect(x - r * .47, y + r * .34, r * .94, r * .67, r * .13), ink, {line: false, shade: false});
  for (const dx of [-.42, .36]) part(c, ellipse(x + dx * r, y, r * .23, r * .36), spec.sail, {line: false, shade: false});
  c.restore();
}

function sail(c, kind, x, top, bottom, half, billow, spec, skull) {
  if (kind === 'lateen') {
    const height = bottom - top, p = new Path2D();
    p.moveTo(x + 1, top);
    p.bezierCurveTo(x + half * .92, top + height * .15, x + half * 1.57 * billow, top + height * .60, x + 1.5, bottom);
    p.quadraticCurveTo(x - half * .22, bottom + .56, x - half * .7, bottom - 1);
    p.bezierCurveTo(x - half * .24, bottom - height * .21, x + .5, top + height * .36, x + 1, top);
    p.closePath();
    cloth(c, p, x - half * .7, x + half * 1.24, top, bottom, spec.sail, billow, .92);
    sailMark(c, p, x + half * (.21 + .34 * (billow - 1)), top + height * .60, half * .27, spec);
    stroke(c, line([[x - half * .6, bottom - 1.2], [x + 2, bottom - .6]]), mix(spec.sail, INK, .45), .8);
    return;
  }
  const bulge = 2.7 * billow, height = bottom - top, p = new Path2D();
  p.moveTo(x - half, top); p.quadraticCurveTo(x, top + 1.96, x + half, top);
  p.bezierCurveTo(x + half + bulge * 1.39, top + height * .31, x + half + bulge * .82, bottom - height * .24, x + half * .95, bottom);
  p.quadraticCurveTo(x - half * .12, bottom + bulge * 1.39, x - half * 1.02, bottom - .66);
  p.bezierCurveTo(x - half - bulge * .32, bottom - height * .27, x - half + bulge * .62, top + height * .36, x - half, top);
  p.closePath();
  cloth(c, p, x - half, x + half, top, bottom, spec.sail, billow, .96);
  if (skull) sailMark(c, p, x + half * (.04 + .35 * (billow - 1)), top + height * .53, Math.min(half, height) * .26, spec);
}

// A warm upper rail, curved plank seams and cooler timbers where the hull meets the water.
function plankHull(c, path, x0, x1, deck, wl, wood, stripe, stripeTop, stripeHeight, edgeWidth,
    {railShadow = '#694630', hullBlue = '#334e65'} = {}) {
  const length = x1 - x0, height = wl - deck, planks = mix(wood, '#322b2e', .47);
  const light = mix(wood, '#e1ac70', .58), wet = mix(planks, '#253e53', .72);
  const timberEdge = linear(c, x0 + length * .16, deck - 2, x0 + length * .22, wl,
    [[0, mix(wood, '#936b4a', .56)], [.42, '#61493a'], [1, '#263843']]);
  part(c, path, linear(c, x0 + length * .67, deck - 3, x0 + length * .57, wl,
    [[0, light], [.39, mix(wood, light, .53)], [.62, wood], [.84, planks], [1, wet]]),
    {line: timberEdge, width: edgeWidth, shade: false});
  c.save(); c.clip(path);
  const sheer = y => {
    const curve = new Path2D();
    curve.moveTo(x0, y - height * .16);
    curve.bezierCurveTo(x0 + length * .21, y + height * .26, x0 + length * .73, y + height * .15, x1, y - height * .23);
    return curve;
  };
  const navyTop = stripeTop - stripeHeight * .63;
  const navy = sheer(navyTop);
  navy.lineTo(x1, wl + 4); navy.lineTo(x0, wl + 4); navy.closePath();
  part(c, navy, linear(c, x0 + length * .7, navyTop, x0 + length * .48, wl + 1,
    [[0, mix(wood, '#456982', .75)], [.39, mix(wood, hullBlue, .86)],
      [.72, mix(wet, '#25435a', .83)], [1, '#26323c']]), {line: false, shade: false});
  const transom = new Path2D();
  transom.moveTo(x0 - 1, deck - height * .46);
  transom.quadraticCurveTo(x0 + length * .093, deck + height * .08, x0 + length * .16, wl + 2);
  transom.lineTo(x0 - 1, wl + 3); transom.closePath();
  part(c, transom, linear(c, x0, deck, x0 + length * .16, wl,
    [[0, mix(wood, '#876244', .58)], [1, '#25384a']]), {line: false, shade: false, alpha: .75});
  const bow = new Path2D();
  bow.moveTo(x1 - length * .19, deck + height * .04);
  bow.quadraticCurveTo(x1 - length * .075, deck + height * .09, x1, deck - height * .39);
  bow.lineTo(x1 + 1, wl + 2);
  bow.lineTo(x1 - length * .29, wl + 2);
  bow.quadraticCurveTo(x1 - length * .11, deck + height * .52, x1 - length * .19, deck + height * .04);
  bow.closePath();
  part(c, bow, linear(c, x1 - length * .13, deck - 1, x1 - length * .15, wl,
    [[0, '#d6a369'], [.37, mix(wood, '#bb8457', .61)], [.64, mix(wet, '#55758a', .62)], [1, '#203648']]),
    {line: false, shade: false, alpha: .71});
  for (let y = stripeTop + stripeHeight * 1.47; y < wl; y += Math.max(3, height * .18)) {
    stroke(c, sheer(y), mix(wet, '#6d8b90', .44), .51, .60);
    stroke(c, sheer(y + .68), mix(wet, '#202a35', .61), .66, .62);
  }
  stroke(c, sheer(stripeTop + stripeHeight * .46), mix(stripe, railShadow, .6), stripeHeight + .74, .9);
  stroke(c, sheer(stripeTop + stripeHeight * .37), linear(c, x0, deck, x1, stripeTop,
    [[0, mix(stripe, '#8f6648', .61)], [.35, stripe], [.73, mix(stripe, '#ffdc91', .31)], [1, stripe]]),
    stripeHeight * .73);
  stroke(c, sheer(stripeTop + .08), mix(stripe, '#f6d0a2', .54), .56, .82);
  stroke(c, sheer(deck + .71), mix(light, '#f4cb93', .37), .81, .81);
  stroke(c, sheer(wl - .69), mix(wet, '#7d9ea1', .56), .71, .63);
  c.restore();
}

function upperDeck(c, x0, x1, deck) {
  const length = x1 - x0, stern = x0 + length * .18, prow = x1 - length * .10;
  const rim = new Path2D();
  rim.moveTo(stern, deck - 2.8);
  rim.quadraticCurveTo(stern + length * .44, deck - 2.5, prow, deck - 3.15);
  rim.quadraticCurveTo(prow - length * .048, deck - .1, prow - length * .094, deck + .92);
  rim.quadraticCurveTo(stern + length * .29, deck + 3.1, stern - length * .02, deck + .07);
  rim.closePath();
  part(c, rim, linear(c, stern, deck - 4, prow, deck + 2,
    [[0, '#b88453'], [.43, '#d6a164'], [.8, '#a97345'], [1, '#654836']]),
    {line: '#805635', width: .69, shade: false});
  c.save(); c.clip(rim);
  for (let at = stern + length * .11; at < prow; at += length * .13) {
    stroke(c, [[at, deck - 3.8], [at - length * .043, deck + 2.2]], '#795033', .55, .86);
  }
  const highlight = new Path2D();
  highlight.moveTo(stern + 1, deck - 2.84);
  highlight.quadraticCurveTo(stern + length * .4, deck - 2.61, prow - 1, deck - 3);
  stroke(c, highlight, '#efc68d', .66, .85);
  c.restore();
}

function hull(c, spec, wl) {
  const [x0, x1, height] = spec.hull, deck = wl - height, len = x1 - x0;
  const p = new Path2D();
  p.moveTo(x0, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .16, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .2, deck);
  p.lineTo(x1 - len * .14, deck); p.quadraticCurveTo(x1 - len * .02, deck - 1, x1, deck - 4);
  p.quadraticCurveTo(x1 - len * .06, wl, x1 - len * .2, wl + 2); p.lineTo(x0 + len * .12, wl + 2);
  p.quadraticCurveTo(x0 + 1, wl - 2, x0, deck - (spec.castle ? 6 : 2)); p.closePath();
  const stripeDepth = spec.decks === 2 ? .194 : spec.ports ? .245 : .3;
  plankHull(c, p, x0, x1, deck, wl, spec.wood, spec.stripe, deck + height * stripeDepth, Math.max(2.2, height * .14), 1.4, spec);
  upperDeck(c, x0, x1, deck);
  // The gun ports (two rows on the warship).
  const rows = spec.decks === 2 ? [deck + height * .5, deck + height * .76] : [deck + height * .56];
  for (const y of rows) for (let i = 0; i < spec.ports; i++) {
    const x = x0 + len * (.26 + i * (.56 / Math.max(1, spec.ports - 1)));
    part(c, rect(x - 2, y - 1.8, 4, 3.6, 1), '#201a23', {width: .8, shade: false});
    part(c, rect(x - 2.4, y - 3.4, 4.8, 1.4, .6), mix(spec.wood, '#e5b786', .48), {width: .6, shade: false});
    stroke(c, [[x - 1.25, y + 1.28], [x + 1.23, y + 1.28]], mix(spec.wood, '#d5b597', .43), .52);
    part(c, ellipse(x + 2.1, y - 2.6, .44), GOLD, {line: false, shade: false});
  }
  // The stern castle with lit windows; a rail along the deck.
  if (spec.castle) {
    const ch = spec.castle * 5;
    part(c, rect(x0 + 1, deck - 6 - ch, len * .2, ch + 1, 1.4),
      linear(c, x0, deck - 6 - ch, x0 + len * .15, deck - 5, [[0, mix(spec.wood, '#eab97d', .28)], [1, spec.wood]]),
      {width: 1.2, shade: false});
    for (let i = 0; i < spec.castle + 1; i++) {
      const x = x0 + 3 + i * 5, y = deck - 4 - ch;
      part(c, rect(x, y, 3, 3.4, .8),
        linear(c, x, y, x + 1.8, y + 3.4, [[0, '#fff1ae'], [.56, '#ffd166'], [1, '#d68a3e']]),
        {width: .7, shade: false});
      stroke(c, [[x + 1.5, y + .32], [x + 1.5, y + 3.02]], '#995e42', .49);
    }
    part(c, rect(x0, deck - 7.4 - ch, len * .22, 2, .8), spec.stripe, {width: .8, shade: false});
  }
  const rail = mix(spec.wood, '#584537', .55);
  for (let x = x0 + len * .23; x < x1 - len * .12; x += 5) {
    stroke(c, [[x, deck - 2.48], [x - .45, deck - .34]], rail, .66, .76);
  }
  // The bowsprit and a figure-head bead.
  const bowsprit = [[x1 - 4, deck - 3], [x1 + Math.min(10, len * .14), deck - 8]];
  stroke(c, bowsprit, rail, 2.4);
  stroke(c, bowsprit, mix(spec.wood, '#e9bb78', .57), .97);
  part(c, ellipse(x1 - 1, deck - 3.2, 1.6),
    radial(c, x1 - 1.42, deck - 3.84, 2.1, [[0, '#fce6a4'], [.52, GOLD], [1, '#9b653d']]),
    {line: '#865e41', width: .57, shade: false});
}
function waterline(c, x0, x1, wl, frame, bow) {
  // Broken pale threads slide under darker boards and gather at the bow.
  const phase = [0, 2.8, 5.3][frame];
  let segment = 0;
  for (let x = x0 + 3 + phase; x < x1 - 8; x += 10 + (segment++ % 2) * 4.7) {
    const wide = segment % 2 === 1;
    const width = Math.min(x1 - x - 2, wide ? 7.7 : 5.6), lift = wide ? .44 : 1.02;
    const ripple = new Path2D(); ripple.moveTo(x, wl + 1.9);
    ripple.quadraticCurveTo(x + width * .32, wl + 1.1 - lift, x + width * .64, wl + 1.34);
    ripple.quadraticCurveTo(x + width * .83, wl + 1.89, x + width, wl + 1.24);
    stroke(c, ripple, '#b5e3e2', wide ? .55 : .83, wide ? .53 : .65);
  }
  const lift = [0, .41, -.2][frame], sweep = [0, .75, 2.24][frame];
  const froth = new Path2D();
  froth.moveTo(bow - 6, wl + 1.6);
  froth.bezierCurveTo(bow - 3, wl + .25, bow - 1, wl + 1.15, bow + .6, wl - .71 - lift);
  froth.quadraticCurveTo(bow + 1.44, wl - 1.41 - lift, bow + 2.8, wl - .71);
  froth.quadraticCurveTo(bow + 1.96, wl - .22, bow + 5.2 + sweep, wl + .48);
  froth.quadraticCurveTo(bow + .56, wl + 1.13, bow + .13, wl + 2);
  froth.quadraticCurveTo(bow - 1.8, wl + 1.55, bow - 6, wl + 1.6);
  part(c, froth, linear(c, bow, wl - 1.15, bow, wl + 2.48,
    [[0, '#eafff3'], [.37, '#a3dedc'], [1, '#75bfca36']]), {line: false, shade: false, alpha: .86});
  const glint = new Path2D();
  glint.moveTo(bow - 4, wl + 1.07);
  glint.quadraticCurveTo(bow - 1.1, wl + .93, bow + .51, wl - .49 - lift);
  glint.quadraticCurveTo(bow + 1.65, wl - 1.33 - lift, bow + 2.46, wl - .98);
  stroke(c, glint, '#ecfff5', .63, .86);
  const wash = new Path2D();
  wash.moveTo(bow - 5.8, wl + 2.75);
  wash.quadraticCurveTo(bow - 2.8, wl + 1.83, bow - .1, wl + 2.5);
  wash.moveTo(bow + 1.9, wl + 1.84);
  wash.quadraticCurveTo(bow + 4, wl + 1.12, bow + 4.7 + sweep, wl + 1.25);
  stroke(c, wash, '#acdeda', .58, .59);
}
function ship(kind, frame) {
  const spec = SHIPS[kind];
  return (c, {h}) => {
    c.outlineStops = FLEET_EDGE;
    const wl = h - spec.anchor;
    { const [a, b] = spec.hull; c.save(); c.globalAlpha = .3; c.fillStyle = '#0d3a5a'; c.fill(ellipse((a + b) / 2, wl + 1.6, (b - a) * .54, 3.4)); c.restore(); }
    c.save(); c.translate(0, BOB[frame]);
    const [x0, x1] = spec.hull, len = x1 - x0, deck = wl - spec.hull[2];
    // Masts and sails behind the hull rail; the main mast flies the flag.
    spec.masts.forEach((mast, m) => {
      const x = x0 + len * mast.x, top = mast.top;
      part(c, rect(x - 1.3, top, 2.6, deck - top + 2, 1),
        linear(c, x - 1.3, top, x + 1.3, top, [[0, '#c58f56'], [.55, '#966139'], [1, '#5e4533']]),
        {line: '#634834', width: 1, shade: false});
      const rows = mast.sails.length, span = (deck - 6 - top - 6) / rows;
      mast.sails.forEach((kindOf, i) => {
        const t = top + 6 + i * span, b = t + span - 2, half = (kind === 'sloop' ? 13 : (len / (spec.masts.length * 2.4))) * (1 - (rows - 1 - i) * -.06) * (i === 0 && rows > 1 ? .78 : 1);
        if (kindOf === 'square') stroke(c, line([[x - half - 1, t - 1], [x + half + 1, t - 1]]), '#6b4a2e', 1.6);
        sail(c, kindOf, x, t, b, half, BILLOW[frame], spec, i === rows - 1 && m === Math.floor(spec.masts.length / 2) && kind !== 'sloop');
      });
      if (m === Math.floor(spec.masts.length / 2) || spec.masts.length === 1) {
        const wave = frame === 1 ? 1.4 : frame === 2 ? -1 : 0, fw = kind === 'sloop' ? 9 : 12;
        const flag = new Path2D(); flag.moveTo(x + 1, top); flag.quadraticCurveTo(x + fw * .5, top - 1 + wave, x + fw, top + 1); flag.lineTo(x + fw - 1, top + 5 + wave * .5); flag.quadraticCurveTo(x + fw * .5, top + 6 - wave, x + 1, top + 5); flag.closePath();
        part(c, flag, spec.flag, {line: mix(spec.flag, '#554243', .5), width: 1, shade: false});
        part(c, ellipse(x + fw * .55, top + 2.6, 1.3, 1.2), '#f4ece0', {line: false, shade: false});
        part(c, ellipse(x, top - 1, 1.4), GOLD, {width: .7, shade: false});
      }
    });
    // Rigging from the bowsprit to the fore mast.
    const fore = x0 + len * spec.masts.at(-1).x;
    stroke(c, line([[x1 + Math.min(10, len * .14), deck - 8], [fore, spec.masts.at(-1).top + 4]]), mix(INK, '#ffffff', .2), .7);
    c.save(); c.beginPath(); c.rect(0, 0, spec.w, wl + 1.2 - BOB[frame]); c.clip(); hull(c, spec, wl); c.restore();
    c.restore();
    waterline(c, x0, x1, wl, frame, x1 - len * .08);
  };
}
// The gunboat: a small, low, dark hull with a red stripe, a short mast with a red pennant, a patched jib and a
// deck gun on a swivel behind a shield, its muzzle at the bow (bow to the right). Three bobbing frames.
const GUNBOAT = {w: 56, h: 44, anchor: 8};
function gunboat(frame) {
  return (c, {h}) => {
    c.outlineStops = FLEET_EDGE;
    const wl = h - GUNBOAT.anchor, x0 = 4, x1 = 50, deck = wl - 12, wood = '#3d4656', red = '#b94d37';
    c.save(); c.globalAlpha = .3; c.fillStyle = '#0d3a5a'; c.fill(ellipse(27, wl + 1.6, 26, 3)); c.restore();
    c.save(); c.translate(0, BOB[frame]);
    // Mast, a patched jib and the red pennant.
    part(c, rect(18.2, 5, 2.4, deck - 3, 1), '#6b4a2e', {width: 1, shade: false});
    const jib = new Path2D(); jib.moveTo(20.6, 8); jib.quadraticCurveTo(29 * BILLOW[frame], 17, 33, deck - 2.6); jib.lineTo(20.6, deck - 2.6); jib.closePath();
    cloth(c, jib, 20.6, 33, 8, deck - 2.6, '#e3d2af', BILLOW[frame], 1);
    part(c, poly([[22.4, 15], [26.2, 15], [26.2, 18.4], [22.4, 18.4]], .5), '#b8aa8c', {line: false, shade: false});
    const wave = frame === 1 ? 1.2 : frame === 2 ? -1 : 0, pen = new Path2D();
    pen.moveTo(19.4, 4.4); pen.quadraticCurveTo(8, 3 + wave, 2.4, 6 + wave * 1.4); pen.quadraticCurveTo(8, 7.2 - wave * .6, 19.4, 8.4); pen.closePath();
    part(c, pen, red, {width: 1, shade: false});
    part(c, ellipse(19.4, 3.6, 1.3), GOLD, {width: .7, shade: false});
    // The hull, low and long, with a bow that lifts, planks and one red stripe.
    c.save(); c.beginPath(); c.rect(0, 0, GUNBOAT.w, wl + 1.2 - BOB[frame]); c.clip();
    const p = new Path2D();
    p.moveTo(x0, deck - 3); p.lineTo(x0 + 7, deck - 1); p.lineTo(x1 - 8, deck - 1); p.quadraticCurveTo(x1 - 1, deck - 1.6, x1 + 2, deck - 6);
    p.quadraticCurveTo(x1 - 3, wl, x1 - 12, wl + 2); p.lineTo(x0 + 7, wl + 2); p.quadraticCurveTo(x0, wl - 3, x0, deck - 3); p.closePath();
    plankHull(c, p, x0, x1 + 3, deck, wl, wood, red, deck + 4, 2.2, 1.3);
    upperDeck(c, x0 + 1, x1, deck);
    for (const x of [14, 24]) part(c, rect(x - 1.8, deck + 7, 3.6, 2.8, .7), '#14110f', {width: .7, shade: false});
    c.restore();
    // The deck gun: a round swivel mount, a shield plate and a short thick barrel with a brass muzzle ring.
    const gx = 35, gy = deck - 2;
    const barrel = poly([[gx - 2, gy - 8.2], [gx + 14.5, gy - 9.6], [gx + 14.5, gy - 4.6], [gx - 2, gy - 4]], 1);
    part(c, barrel, linear(c, gx, gy - 9.6, gx, gy - 4, [[0, '#9da2a8'], [.38, '#626979'], [.62, '#444a58'], [1, '#28293b']]),
      {width: 1.1, shade: false});
    part(c, rect(gx + 12.2, gy - 10, 3.4, 6.2, 1),
      linear(c, gx, gy - 10, gx, gy - 3.8, [[0, '#f8d381'], [.43, '#c89442'], [1, '#8d562e']]),
      {width: .9, shade: false});
    part(c, ellipse(gx + 14.6, gy - 7.1, .9, 1.7), '#14110f', {line: false, shade: false});
    part(c, poly([[gx - 5.5, gy + 1], [gx - 4.4, gy - 11], [gx - 1.2, gy - 11.6], [gx - .6, gy + 1]], 1),
      linear(c, gx - 5.5, gy - 10, gx - .6, gy + 1, [[0, '#8c95a3'], [.57, '#596170'], [1, '#383949']]),
      {width: 1.1, shade: false});
    part(c, ellipse(gx + 1, gy - .6, 4.6, 2.4), '#2a2d36', {width: 1, shade: false});
    // A rail along the stern and a gold bead at the bow.
    stroke(c, line([[x0 + 6, deck - 3.4], [28, deck - 3.4]]), INK, 1); for (const x of [x0 + 8, 14, 20, 26]) stroke(c, line([[x, deck - 3.4], [x, deck - 1]]), INK, .7);
    part(c, ellipse(x1 - 1, deck - 3.6, 1.5), GOLD, {width: .7, shade: false});
    c.restore();
    waterline(c, x0 + 2, x1 - 4, wl, frame, x1 - 3.6);
  };
}
// A short flash aimed away from the barrel. Both frames anchor at the left edge.
function powderFlash(c, w, cy) {
  const burst = poly([[1, cy - 1.6], [w * .29, cy - 2.4], [w * .48, cy - w * .27],
    [w * .48, cy - 1.8], [w * .85, cy - .5], [w * .57, cy + 2], [w * .58, cy + w * .22],
    [w * .33, cy + 2.7], [1, cy + 1.6]], .42);
  part(c, burst, radial(c, w * .21, cy - .65, w * .65,
    [[0, '#fff7c1'], [.24, '#ffe59d'], [.54, '#ffc45d'], [.79, '#ed943f'], [1, '#db6333']]),
    {line: '#d47937', width: .7, shade: false});
  const core = poly([[1.6, cy], [w * .27, cy - 1.35], [w * .54, cy - .3], [w * .27, cy + .95]], .4);
  part(c, core, linear(c, 1.6, cy, w * .54, cy - .3, [[0, '#fffdeb'], [.7, '#fff8d3'], [1, '#ffe49c']]),
    {line: false, shade: false});
  part(c, ellipse(w * .81, cy - w * .19, .92, .48, -.45), '#fff0b5', {line: false, shade: false, alpha: .87});
}
function gunboatFlash(c, {w, h}) {
  const cy = h / 2;
  smokePuff(c, [[14, cy - 3.5, 3.6], [19, cy - .5, 3.3], [15.5, cy + 3, 3.1]], .43);
  powderFlash(c, w, cy);
}
// The "jammed" mark over a tower: a broken gear with a crack, and sparks that jump (two frames), 28 x 28 box.
function jamMark(frame) {
  return (c, {w, h}) => {
    const cx = w / 2, cy = h / 2 + 1, teeth = 8, spin = frame ? .2 : 0, gear = new Path2D();
    for (let i = 0; i < teeth * 2; i++) {
      const a = spin + i / (teeth * 2) * Math.PI * 2, r = i % 2 ? 8 : 11.2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? gear.lineTo(x, y) : gear.moveTo(x, y);
    }
    gear.closePath();
    part(c, gear, '#8d96a6', {depth: 1.6, width: 1.3, gloss: ellipse(cx - 3, cy - 3.6, 3, 1.4, -.6)});
    part(c, ellipse(cx, cy, 3.6), '#3b4150', {width: 1, shade: false});
    // The crack, and a missing tooth knocked out of the rim.
    stroke(c, line([[cx + 2, cy - 3.4], [cx + 5.4, cy - .6], [cx + 3.6, cy + 1.6], [cx + 7.6, cy + 5]]), INK, 1.6);
    stroke(c, line([[cx + 2, cy - 3.4], [cx + 5.4, cy - .6], [cx + 3.6, cy + 1.6], [cx + 7.6, cy + 5]]), '#ffe27a', .7);
    // Sparks (two arrangements, so the mark flickers).
    const sparks = frame ? [[4, 5, 3], [24, 7, 2.4], [22, 24, 2], [5, 21, 2.2]] : [[6, 3.4, 2.4], [25, 12, 2.2], [20, 25.4, 2.6], [3, 17, 2]];
    for (const [x, y, r] of sparks) part(c, poly([[x, y - r * 1.5], [x + r * .5, y - r * .4], [x + r * 1.5, y], [x + r * .5, y + r * .4], [x, y + r * 1.5], [x - r * .5, y + r * .4], [x - r * 1.5, y], [x - r * .5, y - r * .4]], .3), '#ffe27a', {line: '#e8742a', width: .8, shade: false});
  };
}
function wreck(c, {w, h}) {
  const wl = h - 8;
  const p = new Path2D(); p.moveTo(6, wl - 9); p.lineTo(30, wl - 4); p.lineTo(46, wl - 7); p.lineTo(56, wl - 2); p.lineTo(58, wl + 2); p.lineTo(8, wl + 2); p.closePath();
  part(c, p, '#5a3a2a', {depth: 2, width: 1.3});
  stroke(c, line([[18, wl - 6], [16, wl + 1]]), INK, .8); stroke(c, line([[40, wl - 6], [41, wl + 1]]), INK, .8);
  part(c, poly([[26, wl - 4], [29, wl - 28], [32, wl - 27], [30, wl - 4]], 1), '#6b4a2e', {width: 1});
  part(c, poly([[30, wl - 26], [41, wl - 22], [33, wl - 15]], 1), '#ddcba4', {depth: 1, width: 1});
  c.save(); c.globalAlpha = .28; c.fillStyle = '#0d3a5a'; c.fill(ellipse(32, wl + 2, 28, 3)); c.restore();
  for (const [x, y] of [[8, wl + 2], [50, wl + 3]]) part(c, rect(x, y - 1, 7, 2, .8), '#8a5a36', {width: .8, shade: false});
  stroke(c, line([[4, wl + 1.2], [12, wl + .4], [20, wl + 1.2]]), SEA_FOAM, 1.1); stroke(c, line([[40, wl + 1.2], [48, wl + .4], [58, wl + 1.2]]), SEA_FOAM, 1.1);
}
function ball(fuse) {
  return (c, {w, h}) => {
    part(c, ellipse(w / 2, h / 2, 4.6), '#30333d', {depth: 1.4, width: 1.2, gloss: ellipse(w / 2 - 1.6, h / 2 - 1.8, 1.4, 1), light: '#9aa1b4'});
    if (fuse) { stroke(c, line([[w / 2 + 2.6, h / 2 - 3.4], [w / 2 + 4, h / 2 - 5.6]]), '#8a5a36', 1.1); part(c, ellipse(w / 2 + 4.3, h / 2 - 6, 1.6), '#ffd166', {line: '#f29e38', width: .7, shade: false}); }
  };
}
function cloudOutline(blobs) {
  const outline = new Path2D();
  for (const [x, y, radius, aspect = .88, tilt = 0] of blobs) outline.addPath(ellipse(x, y, radius, radius * aspect, tilt));
  return outline;
}
// Fill the union once, so overlapping lobes don't increase opacity over a target.
function smokePuff(c, blobs, alpha, ash = false) {
  const top = Math.min(...blobs.map(([, y, r]) => y - r)), bottom = Math.max(...blobs.map(([, y, r]) => y + r));
  const stops = ash ? [[0, '#c3b5abba'], [.48, '#898a94d6'], [1, '#56536700']]
    : [[0, '#f8ead5b0'], [.48, '#cfdbded1'], [1, '#738c9e00']];
  const outline = cloudOutline(blobs);
  part(c, outline, linear(c, 12, top, 16, bottom, stops), {line: false, shade: false, alpha});
  // Paint the illuminated crowns into the existing translucent silhouette.
  c.save(); c.clip(outline); c.globalCompositeOperation = 'source-atop';
  for (const [x, y, radius, aspect = .88, tilt = 0] of blobs) {
    const light = radial(c, x - radius * .31, y - radius * .35, radius * .92,
      [[0, ash ? '#fff0d98c' : '#fff7e6a6'], [.54, '#efe8e242'], [1, '#b9c7d100']]);
    part(c, ellipse(x, y, radius * .94, radius * aspect * .94, tilt), light, {line: false, shade: false});
  }
  c.restore();
}
const smokeFrames = [
  [[[15.8, 16.6, 5.6, .79, -.18], [11.5, 16, 3.5, .7], [19.8, 14.6, 3.5, .75, .25]], .86],
  [[[15.5, 15.3, 6.7, .76, -.18], [9.8, 17, 4.1, .77], [21.3, 14.9, 4.5, .74, -.45], [14.3, 11.8, 4.2, .82]], .71],
  [[[15.7, 13.2, 6.9, .74, -.4], [9.4, 16, 4.4, .67, -.3], [22.6, 14.4, 5.2, .65, .15], [18.4, 9, 4.3, .72, -.22]], .51],
];
function fire(frame) {
  return (c, {w, h}) => {
    const g = h - 4, cx = w / 2, sway = [0, 1.4, -1.2][frame], tall = [15, 18, 13][frame];
    const flame = (x, height, width) => {
      const path = new Path2D();
      path.moveTo(x - width, g);
      path.quadraticCurveTo(x - width * 1.2, g - height * .5, x + sway, g - height);
      path.quadraticCurveTo(x + width * 1.2, g - height * .5, x + width, g);
      path.closePath();
      return path;
    };
    part(c, flame(cx, tall, 7), linear(c, cx - 3, g, cx + sway, g - tall,
      [[0, '#f88732'], [.48, '#ef682e'], [1, '#c84d36']]), {line: '#8a2f25', width: 1.2, shade: false});
    part(c, flame(cx + .5, tall * .66, 4.6), linear(c, cx, g, cx + sway, g - tall * .66,
      [[0, '#ffe08e'], [.48, '#ffbc53'], [1, '#ff983e']]), {line: false, shade: false});
    part(c, flame(cx + 1, tall * .36, 2.6), '#fff4bb', {line: false, shade: false});
    for (const [x, y] of [[cx - 6, g - tall - 1 + frame * 2], [cx + 6, g - tall * .8 - frame]]) part(c, ellipse(x, y, 1), '#ffd166', {line: false, shade: false});
  };
}
function splash(frame) {
  return (c, {w, h}) => {
    const g = h - 4, cx = w / 2, ring = [5.9, 8.6, 11.6][frame], depth = ring * .23;
    const waterline = linear(c, cx - ring, g - depth, cx + ring, g + depth,
      [[0, '#68d5e1'], [.48, '#4da9c2'], [1, '#217f9f']]);
    stroke(c, ellipse(cx, g, ring, depth), waterline, 1.45, frame === 2 ? .53 : .87);
    const foam = new Path2D();
    foam.ellipse(cx, g, ring, depth, 0, .1, Math.PI * .85);
    stroke(c, foam, linear(c, cx - ring, g, cx + ring, g, [[0, '#b0e8ee'], [.39, SEA_FOAM], [1, '#a2e3e9']]),
      1, frame === 2 ? .58 : .94);

    if (frame < 2) {
      const jets = frame === 0 ? [[0, 15, 1.8, 1.1]] : [[-5.4, 12, -4, 2.1], [0, 20, 2, 2.4], [5.4, 15, 4.2, 2.1]];
      for (const [offset, height, lean, half] of jets) {
        const x = cx + offset, crest = new Path2D();
        crest.moveTo(x - half, g);
        crest.quadraticCurveTo(x - half, g - height * .65, x + lean, g - height);
        crest.quadraticCurveTo(x + lean * .6, g - height * .5, x + half, g);
        crest.closePath();
        part(c, crest, linear(c, x + lean - half, g - height, x + half, g,
          [[0, SEA_FOAM], [.33, '#def9f9'], [.60, '#86d8e4'], [1, '#39a5c6ab']]),
          {line: '#67bfcd', width: .65, shade: false});
        const glint = new Path2D();
        glint.moveTo(x + lean * .82, g - height * .88);
        glint.quadraticCurveTo(x + lean * .42, g - height * .54, x - half * .37, g - height * .18);
        c.save(); c.clip(crest); c.globalCompositeOperation = 'source-atop';
        stroke(c, glint, SEA_FOAM, .58, .8);
        c.restore();
      }
    }
    const drops = frame === 0 ? [[-4.4, 9], [5.2, 12]] : frame === 1 ? [[-10, 16], [9.4, 19], [-2, 23]] : [[-11.8, 5], [12, 6], [-5.6, 10], [6.5, 11]];
    for (const [x, y] of drops) part(c, ellipse(cx + x, g - y, .86, 1.46, Math.sign(x) * .47), '#dcf8ff',
      {line: false, shade: false, alpha: frame === 2 ? .7 : .96});
  };
}
function explosion(frame) {
  return (c, {w, h}) => {
    const cx = w / 2, cy = h / 2;
    if (frame === 0) {
      const flash = [[-9, 1], [-3, -1.7], [-4.7, -7.9], [0, -3.2], [5.5, -8.6], [3.8, -1.7],
        [9.3, .7], [3.6, 2.6], [5.2, 7.2], [.3, 3.6], [-4.2, 7.1], [-3.4, 2.6]];
      part(c, poly(flash.map(([x, y]) => [cx + x, cy + y]), .55),
        radial(c, cx - 1.2, cy - .8, 10.1, [[0, '#fffdec'], [.26, '#fff4ce'], [.52, '#ffce76'], [.81, '#f5a44e'], [1, '#db733b']]),
        {line: '#e38e46', width: .72, shade: false});
      return;
    }
    if (frame === 3) {
      smokePuff(c, [[cx, cy - 1, 6.1], [cx - 6.8, cy + 1.8, 4.3], [cx + 6.9, cy + 1.6, 4.4], [cx - 1, cy - 8.6, 3.8]], .67, true);
      return;
    }
    const swell = frame === 1 ? 0 : .8;
    if (frame === 2) smokePuff(c, [[cx - 5.6, cy - 8, 5.1], [cx + 4.8, cy - 7, 5.6]], .55, true);
    const rim = cloudOutline([[cx - 1, cy, 7.6 + swell], [cx - 6.3, cy + 2.8, 4.7 + swell],
      [cx + 6.5, cy + 1.4, 5.1 + swell], [cx + 1.4, cy - 5.6, 5.1 + swell]]);
    part(c, rim, radial(c, cx - 2.5, cy - 2.9, 13.5, frame === 1
      ? [[0, '#fff9d4'], [.23, '#ffe08a'], [.60, '#fbb25c'], [.83, '#d87940'], [1, '#a85137']]
      : [[0, '#ffe9ac'], [.35, '#ffc66a'], [.68, '#df8750'], [1, '#9b565059']]),
    {line: false, shade: false, alpha: frame === 1 ? .98 : .8});
    c.save(); c.clip(rim); c.globalCompositeOperation = 'source-atop';
    const upper = radial(c, cx - 4, cy - 5.1, 8.1, [[0, '#fff8d6b0'], [.41, '#ffe8a369'], [1, '#ffc76200']]);
    part(c, rim, upper, {line: false, shade: false, alpha: frame === 1 ? .9 : .47});
    c.restore();
    for (const [x, y] of [[-11.4, -5.2 - swell], [10.7, 7.5 + swell]])
      part(c, ellipse(cx + x, cy + y, 1.35, .63, Math.sign(x) * .6), '#ffd57c',
        {line: false, shade: false, alpha: frame === 1 ? .88 : .65});
  };
}
function musketFlash(c, {w, h}) {
  powderFlash(c, w, h / 2);
}
function flagTrophy(c, {h}) {
  const g = h - 4; part(c, rect(6, 6, 2.4, g - 6, 1), '#6b4a2e', {width: .9});
  const flag = new Path2D(); flag.moveTo(8, 7); flag.quadraticCurveTo(17, 5, 27, 8); flag.lineTo(26, 20); flag.quadraticCurveTo(17, 17, 8, 20); flag.closePath();
  part(c, flag, '#2b2430', {width: 1.1, shade: false}); part(c, ellipse(17, 12.6, 2.6, 2.4), '#f4ece0', {line: false, shade: false});
  part(c, ellipse(7.2, 5.4, 1.6), GOLD, {width: .7, shade: false});
}
// The harpoon in flight (GAME-V3.md §5, T1), pointing right: a barbed iron head on a pale shaft with a bit of rope
// behind it. The wave renderer turns it along its flight.
function harpoonBolt(c, {w, h}) {
  const cy = h / 2;
  const rope = new Path2D(); rope.moveTo(1, cy); rope.quadraticCurveTo(4, cy + 2.6, 8, cy + .4);
  c.save(); c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke(rope); c.strokeStyle = '#dcbb78'; c.lineWidth = 1.3; c.stroke(rope); c.restore();
  stroke(c, line([[7, cy], [w - 9, cy]]), INK, 3); stroke(c, line([[7, cy], [w - 9, cy]]), '#efe0b8', 1.6);
  part(c, poly([[w - 9, cy], [w - 12.6, cy - 4.4], [w - 11.2, cy], [w - 12.6, cy + 4.4]], .5), '#9aa3b2', {width: .9, shade: false});
  part(c, poly([[w - 9.4, cy - 2], [w - 1.6, cy], [w - 9.4, cy + 2]], .4), '#c3cad6', {width: .9, shade: false});
}
// A ship the harpoon has caught: rings of foam on the water around the hull (drawn under it)...
function slowRipples(c, {w, h}) {
  const cx = w / 2, cy = h / 2 + 1;
  stroke(c, ellipse(cx, cy, w * .46, h * .38), '#8fd3ea', 1.5, .9);
  stroke(c, ellipse(cx, cy, w * .34, h * .27), '#e9f8ff', 1.3, .95);
  for (const [x, y] of [[cx - w * .3, cy - 1], [cx + w * .3, cy + 1]]) part(c, ellipse(x, y, 1.6, 1), '#e9f8ff', {line: false, shade: false});
}
// ...and a small coil of rope over it, so a slowed ship reads at a glance.
function ropeMark(c, {w, h}) {
  const cx = w / 2, cy = h / 2 + 1;
  for (let i = 0; i < 2; i++) part(c, ellipse(cx, cy + 1.6 - i * 2.6, 5.4, 2.6), '#dcbb78', {width: .9, depth: .6, shade: '#9c7a44'});
  stroke(c, ellipse(cx, cy - 1.2, 3.2, 1.3), '#9c7a44', .8);
  part(c, ellipse(cx, cy - 1.4, 1.4, .7), '#5a3b22', {line: false, shade: false});
}
const NONE = {outline: 0};
/** Every fleet frame: name -> [width, height, anchor, draw, options]. */
export function fleetFrames() {
  const frames = {};
  for (const kind of Object.keys(SHIPS)) for (const frame of [0, 1, 2]) frames[`pirate-${kind}-${frame + 1}`] = [SHIPS[kind].w, SHIPS[kind].h, SHIPS[kind].anchor, ship(kind, frame)];
  for (const frame of [0, 1, 2]) {
    const [blobs, alpha] = smokeFrames[frame];
    frames[`fx-smoke-${frame + 1}`] = [32, 32, 16, c => smokePuff(c, blobs, alpha), NONE];
    frames[`fx-fire-${frame + 1}`] = [32, 32, 4, fire(frame), NONE];
    frames[`pirate-splash-${frame + 1}`] = [32, 32, 4, splash(frame), NONE];
  }
  for (const frame of [0, 1, 2, 3]) frames[`fx-explosion-${frame + 1}`] = [32, 32, 16, explosion(frame), NONE];
  Object.assign(frames, {
    'pirate-cannonball': [16, 16, 8, ball(false)], 'fx-mortar-shell': [16, 16, 8, ball(true)], 'fx-musket-flash': [16, 16, 8, musketFlash, NONE],
    'pirate-wreck': [64, 48, 8, wreck], 'pirate-flag-trophy': [32, 48, 4, flagTrophy],
    'fx-harpoon': [32, 12, 6, harpoonBolt, NONE], 'fx-slow-ripples': [64, 20, 10, slowRipples, NONE], 'fx-rope-mark': [16, 16, 8, ropeMark, NONE],
    'fx-gunboat-flash': [24, 20, 10, gunboatFlash, NONE], 'fx-jam-1': [28, 28, 14, jamMark(0), NONE], 'fx-jam-2': [28, 28, 14, jamMark(1), NONE],
  });
  for (const frame of [0, 1, 2]) frames[`pirate-gunboat-${frame + 1}`] = [GUNBOAT.w, GUNBOAT.h, GUNBOAT.anchor, gunboat(frame)];
  return frames;
}
