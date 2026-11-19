// The pirates' fleet and the fight in the clean cartoon style (its own chunk, loaded with a wave):
// the sloop, the brig, the flagship and the warship (three bobbing frames each, bow to the right),
// the wreck, shots and shells, splashes, smoke, fire, explosions and the musket flash. Original designs.
// The gunboat (docs/GAME-V3.md §4.1) is its own small hull, with its muzzle flash and the "jammed" mark of a tower.
// Boxes and anchors are the old atlas's: the anchor is the waterline (ships) or the centre (puffs).
import {INK, ellipse, line, linear, mix, part, poly, radial, rect, stroke} from './paint.js';

const GOLD = '#f2c14e', SEA_FOAM = '#f2fbff';
// Ship specs: hull length and height above water, colours, masts [x, height, sails] in hull units.
const SHIPS = {
  sloop: {w: 64, h: 64, anchor: 10, hull: [6, 52, 11], wood: '#9a603d', stripe: '#cda15d', sail: '#efe0b8', flag: '#202c41',
    masts: [{x: .5, top: 6, sails: ['lateen']}], ports: 0, castle: 0},
  brig: {w: 96, h: 80, anchor: 11, hull: [8, 82, 15], wood: '#89583d', stripe: '#b95743', sail: '#ebd7ae', flag: '#252b3a',
    masts: [{x: .32, top: 10, sails: ['square', 'square']}, {x: .66, top: 6, sails: ['square', 'square']}], ports: 3, castle: 1},
  flagship: {w: 128, h: 112, anchor: 13, hull: [8, 112, 20], wood: '#653f39', stripe: GOLD, sail: '#aa3b38', flag: '#341b2c',
    masts: [{x: .25, top: 18, sails: ['square', 'square']}, {x: .52, top: 8, sails: ['square', 'square', 'square']}, {x: .78, top: 16, sails: ['square', 'square']}], ports: 4, castle: 2},
  warship: {w: 160, h: 128, anchor: 14, hull: [8, 146, 26], wood: '#333e54', stripe: GOLD, sail: '#384659', flag: '#222438',
    masts: [{x: .22, top: 18, sails: ['square', 'square']}, {x: .5, top: 6, sails: ['square', 'square', 'square']}, {x: .78, top: 14, sails: ['square', 'square']}], ports: 6, castle: 2, decks: 2},
};
const BOB = [0, -1, .6], BILLOW = [1, 1.08, .95];

// Give each existing sail a broad windward fold and a stitched edge inside its silhouette.
function cloth(c, path, left, right, top, bottom, colour, billow, edgeWidth) {
  const span = right - left, drop = bottom - top;
  const light = mix(colour, '#fff0cb', .29), shade = mix(colour, '#382c43', .37);
  part(c, path, linear(c, left, top, right, bottom,
    [[0, light], [.45, colour], [.74, mix(colour, shade, .6)], [1, shade]]),
    {width: edgeWidth, shade: false});
  c.save(); c.clip(path);
  const fold = new Path2D(), crest = span * .1 * billow;
  fold.moveTo(left + span * .29, top);
  fold.quadraticCurveTo(left + span * .24 + crest, top + drop * .47, left + span * .23, bottom - 1);
  fold.quadraticCurveTo(left + span * .47 + crest, top + drop * .55, left + span * .42, top);
  fold.closePath();
  part(c, fold, light, {line: false, shade: false, alpha: .57});
  const seam = new Path2D();
  seam.moveTo(left + span * .67, top + 1);
  seam.quadraticCurveTo(left + span * .68 + crest, top + drop * .45, left + span * .64, bottom - 1);
  stroke(c, seam, shade, .68, .68);
  const foot = new Path2D();
  foot.moveTo(left + .5, bottom - 2);
  foot.quadraticCurveTo(left + span * .53, bottom + 1.4 * billow, right + .8, bottom - 2.5);
  stroke(c, foot, shade, .7, .73);
  stroke(c, line([[left + span * .33, bottom - 2], [left + span * .49, bottom - 1.15]]),
    light, .6, .84);
  c.restore();
}

function sail(c, kind, x, top, bottom, half, billow, spec, skull) {
  if (kind === 'lateen') {
    const p = new Path2D(); p.moveTo(x + 1, top); p.quadraticCurveTo(x + half * 2.1 * billow, (top + bottom) / 2, x + 1.5, bottom);
    p.lineTo(x - half * .7, bottom - 1); p.quadraticCurveTo(x - half * .2, (top + bottom) / 2 + 2, x + 1, top); p.closePath();
    cloth(c, p, x - half * .7, x + half * 1.12, top, bottom, spec.sail, billow, 1.2);
    stroke(c, line([[x - half * .6, bottom - 1.2], [x + 2, bottom - .6]]), mix(spec.sail, INK, .45), .8);
    return;
  }
  const bulge = 2.4 * billow, p = new Path2D();
  p.moveTo(x - half, top); p.quadraticCurveTo(x, top + 1.4, x + half, top);
  p.quadraticCurveTo(x + half + bulge, (top + bottom) / 2, x + half * 1.04, bottom);
  p.quadraticCurveTo(x, bottom + bulge * 1.4, x - half * 1.04, bottom);
  p.quadraticCurveTo(x - half + bulge * .6, (top + bottom) / 2, x - half, top); p.closePath();
  cloth(c, p, x - half, x + half, top, bottom, spec.sail, billow, 1.2);
  if (skull) {
    const cy = (top + bottom) / 2 + 1, r = Math.min(half, bottom - top) * .26, bone = mix(spec.sail, '#ffffff', .72);
    stroke(c, line([[x - r * 1.6, cy + r * 1.5], [x + r * 1.6, cy - r * .2]]), bone, r * .5); stroke(c, line([[x + r * 1.6, cy + r * 1.5], [x - r * 1.6, cy - r * .2]]), bone, r * .5);
    part(c, ellipse(x, cy, r, r * .92), bone, {line: false, shade: false});
    for (const dx of [-.4, .4]) part(c, ellipse(x + dx * r, cy, r * .26, r * .3), spec.sail, {line: false, shade: false});
  }
}

// A warm upper rail, curved plank seams and cooler timbers where the hull meets the water.
function plankHull(c, path, x0, x1, deck, wl, wood, stripe, stripeTop, stripeHeight, edgeWidth) {
  const length = x1 - x0, planks = mix(wood, '#211a26', .39);
  const light = mix(wood, '#eca969', .31), wet = mix(planks, '#39585a', .21);
  part(c, path, linear(c, x0, deck - 2, x0 + length * .2, wl,
    [[0, light], [.34, mix(wood, light, .47)], [.56, wood], [.82, planks], [1, wet]]),
    {width: edgeWidth, shade: false});
  c.save(); c.clip(path);
  for (let y = deck + 3.6; y < wl; y += 3.9) {
    const seam = new Path2D();
    seam.moveTo(x0, y - 1);
    seam.quadraticCurveTo(x0 + length * .53, y + 1.4, x1, y - 1.5);
    stroke(c, seam, planks, .72, .77);
  }
  c.fillStyle = linear(c, x0, stripeTop, x0 + length * .24, stripeTop + stripeHeight,
    [[0, mix(stripe, '#fff0c4', .25)], [.48, stripe], [1, mix(stripe, '#7e442b', .22)]]);
  c.fillRect(x0, stripeTop, length, stripeHeight);
  stroke(c, line([[x0 + length * .08, stripeTop + .4], [x1 - 3, stripeTop + .4]]),
    mix(stripe, '#fff0c4', .52), .66, .84);
  const railY = deck + length * .008;
  for (let x = x0 + length * .23; x < x1 - length * .15; x += length < 60 ? 7.8 : 9.6) {
    stroke(c, line([[x, railY + 1.2], [x + 1.5, railY + 1.2]]), light, .47, .78);
  }
  stroke(c, line([[x0 + length * .22, deck + 1.1], [x0 + length * .75, deck + .9], [x1 - 4, deck - 1]]), light, .82, .82);
  stroke(c, line([[x0 + length * .16, wl - .6], [x0 + length * .6, wl - .5], [x1 - 8, wl - 2.1]]),
    mix(wet, '#72a5a5', .48), .8, .57);
  c.restore();
}

function hull(c, spec, wl) {
  const [x0, x1, height] = spec.hull, deck = wl - height, len = x1 - x0;
  const p = new Path2D();
  p.moveTo(x0, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .16, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .2, deck);
  p.lineTo(x1 - len * .14, deck); p.quadraticCurveTo(x1 - len * .02, deck - 1, x1, deck - 4);
  p.quadraticCurveTo(x1 - len * .06, wl, x1 - len * .2, wl + 2); p.lineTo(x0 + len * .12, wl + 2);
  p.quadraticCurveTo(x0 + 1, wl - 2, x0, deck - (spec.castle ? 6 : 2)); p.closePath();
  plankHull(c, p, x0, x1, deck, wl, spec.wood, spec.stripe, deck + height * .3, Math.max(2.2, height * .14), 1.4);
  // The coloured rail and gun ports (two rows on the warship).
  stroke(c, line([[x0 + len * .14, deck + height * .3], [x1 - 2, deck + height * .3]]), INK, .7);
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
  stroke(c, line([[x0 + len * .2, deck - 2.4], [x1 - len * .12, deck - 2.4]]), INK, 1.1);
  for (let x = x0 + len * .22; x < x1 - len * .12; x += 5) stroke(c, line([[x, deck - 2.4], [x, deck]]), INK, .7);
  // The bowsprit and a figure-head bead.
  stroke(c, line([[x1 - 4, deck - 3], [x1 + Math.min(10, len * .14), deck - 8]]), INK, 2.4); stroke(c, line([[x1 - 4, deck - 3], [x1 + Math.min(10, len * .14), deck - 8]]), mix(spec.wood, '#ffffff', .2), 1);
  part(c, ellipse(x1 - 1, deck - 3.2, 1.6), GOLD, {width: .7, shade: false});
}
function waterline(c, x0, x1, wl, frame, bow) {
  // Foam at the bow and lapping crescents along the hull, moving with the frame.
  const phase = frame * 3.2;
  for (let x = x0 + 4 + phase; x < x1 - 4; x += 9.5) {
    const ripple = new Path2D();
    ripple.moveTo(x, wl + 1.4);
    ripple.quadraticCurveTo(x + 3.6, wl - .1, x + 7, wl + 1.4);
    stroke(c, ripple, SEA_FOAM, 1.1, .68);
  }
  part(c, ellipse(bow, wl + .6, 5 + frame, 2),
    linear(c, bow, wl - 1.4, bow, wl + 2.6, [[0, SEA_FOAM], [.49, '#b9e8f1'], [1, '#70bfd7bc']]),
    {line: '#8fd3e8', width: .74, shade: false});
  const crest = new Path2D();
  crest.moveTo(bow - (5 + frame) * .78, wl + .48);
  crest.quadraticCurveTo(bow, wl - 1.45, bow + (5 + frame) * .83, wl + .27);
  stroke(c, crest, SEA_FOAM, .78, .86);
}
function ship(kind, frame) {
  const spec = SHIPS[kind];
  return (c, {h}) => {
    const wl = h - spec.anchor;
    { const [a, b] = spec.hull; c.save(); c.globalAlpha = .3; c.fillStyle = '#0d3a5a'; c.fill(ellipse((a + b) / 2, wl + 1.6, (b - a) * .54, 3.4)); c.restore(); }
    c.save(); c.translate(0, BOB[frame]);
    const [x0, x1] = spec.hull, len = x1 - x0, deck = wl - spec.hull[2];
    // Masts and sails behind the hull rail; the main mast flies the flag.
    spec.masts.forEach((mast, m) => {
      const x = x0 + len * mast.x, top = mast.top;
      part(c, rect(x - 1.3, top, 2.6, deck - top + 2, 1),
        linear(c, x - 1.3, top, x + 1.3, top, [[0, '#c58f56'], [.55, '#966139'], [1, '#5e4533']]),
        {width: 1, shade: false});
      const rows = mast.sails.length, span = (deck - 6 - top - 6) / rows;
      mast.sails.forEach((kindOf, i) => {
        const t = top + 6 + i * span, b = t + span - 2, half = (kind === 'sloop' ? 13 : (len / (spec.masts.length * 2.4))) * (1 - (rows - 1 - i) * -.06) * (i === 0 && rows > 1 ? .78 : 1);
        if (kindOf === 'square') stroke(c, line([[x - half - 1, t - 1], [x + half + 1, t - 1]]), '#6b4a2e', 1.6);
        sail(c, kindOf, x, t, b, half, BILLOW[frame], spec, i === rows - 1 && m === Math.floor(spec.masts.length / 2) && kind !== 'sloop');
      });
      if (m === Math.floor(spec.masts.length / 2) || spec.masts.length === 1) {
        const wave = frame === 1 ? 1.4 : frame === 2 ? -1 : 0, fw = kind === 'sloop' ? 9 : 12;
        const flag = new Path2D(); flag.moveTo(x + 1, top); flag.quadraticCurveTo(x + fw * .5, top - 1 + wave, x + fw, top + 1); flag.lineTo(x + fw - 1, top + 5 + wave * .5); flag.quadraticCurveTo(x + fw * .5, top + 6 - wave, x + 1, top + 5); flag.closePath();
        part(c, flag, spec.flag, {width: 1, shade: false});
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
    stroke(c, line([[x0 + 6, deck + 4], [x1 - 2, deck + 4]]), INK, .7);
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
  part(c, burst, linear(c, 1, cy, w * .85, cy, [[0, '#ffef9b'], [.25, '#ffd476'], [.52, '#ffbf54'], [1, '#ec7542']]),
    {line: '#e68236', width: .7, shade: false});
  part(c, poly([[1.6, cy], [w * .27, cy - 1.35], [w * .54, cy - .3], [w * .27, cy + .95]], .4),
    '#fffbe2', {line: false, shade: false});
  part(c, ellipse(w * .81, cy - w * .19, .92, .48, -.45), '#ffe095', {line: false, shade: false, alpha: .87});
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
  const stops = ash ? [[0, '#b9adb8ba'], [.48, '#8a8299d6'], [1, '#554c6c00']]
    : [[0, '#fff0d8b0'], [.48, '#dedbdbd1'], [1, '#9999b200']];
  part(c, cloudOutline(blobs), linear(c, 12, top, 16, bottom, stops), {line: false, shade: false, alpha});
}
const smokeFrames = [
  [[[15.8, 16.6, 5.6, .79, -.18], [11.5, 16, 3.5, .7], [19.8, 14.6, 3.5, .75, .25]], .86],
  [[[15.5, 15.3, 6.7, .76, -.18], [9.8, 17, 4.1, .77], [21.3, 14.9, 4.5, .74, -.45], [14.3, 11.8, 4.2, .82]], .71],
  [[[15.7, 13.2, 6.9, .74, -.4], [9.4, 16, 4.4, .67, -.3], [22.6, 14.4, 5.2, .65, .15], [18.4, 9, 4.3, .72, -.22]], .51],
];
function fire(frame) {
  return (c, {w, h}) => {
    const g = h - 4, cx = w / 2, sway = [0, 1.4, -1.2][frame], tall = [15, 18, 13][frame];
    const flame = (x, height, width, colour) => { const p = new Path2D(); p.moveTo(x - width, g); p.quadraticCurveTo(x - width * 1.2, g - height * .5, x + sway, g - height);
      p.quadraticCurveTo(x + width * 1.2, g - height * .5, x + width, g); p.closePath(); return [p, colour]; };
    const [outer] = flame(cx, tall, 7, '#f2552c');
    part(c, outer, '#f2552c', {line: '#8a2416', width: 1.2, shade: false});
    part(c, flame(cx + .5, tall * .66, 4.6)[0], '#ff9a2c', {line: false, shade: false});
    part(c, flame(cx + 1, tall * .36, 2.6)[0], '#ffe27a', {line: false, shade: false});
    for (const [x, y] of [[cx - 6, g - tall - 1 + frame * 2], [cx + 6, g - tall * .8 - frame]]) part(c, ellipse(x, y, 1), '#ffd166', {line: false, shade: false});
  };
}
function splash(frame) {
  return (c, {w, h}) => {
    const g = h - 4, cx = w / 2, ring = [5.9, 8.6, 11.6][frame], depth = ring * .23;
    stroke(c, ellipse(cx, g, ring, depth), '#62c1d6', 1.45, frame === 2 ? .53 : .87);
    const foam = new Path2D();
    foam.ellipse(cx, g, ring, depth, 0, .1, Math.PI * .85);
    stroke(c, foam, SEA_FOAM, 1, frame === 2 ? .58 : .94);

    if (frame < 2) {
      const jets = frame === 0 ? [[0, 15, 1.8, 1.1]] : [[-5.4, 12, -4, 2.1], [0, 20, 2, 2.4], [5.4, 15, 4.2, 2.1]];
      for (const [offset, height, lean, half] of jets) {
        const x = cx + offset, crest = new Path2D();
        crest.moveTo(x - half, g);
        crest.quadraticCurveTo(x - half, g - height * .65, x + lean, g - height);
        crest.quadraticCurveTo(x + lean * .6, g - height * .5, x + half, g);
        crest.closePath();
        part(c, crest, linear(c, x, g - height, x, g, [[0, SEA_FOAM], [.46, '#b9edf3'], [1, '#62bfd8ab']]),
          {line: '#72c4da', width: .65, shade: false});
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
        radial(c, cx, cy, 9.4, [[0, '#fffdec'], [.22, '#ffecad'], [.52, '#ffd478'], [1, '#ec8a3e']]),
        {line: '#e99745', width: .72, shade: false});
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
    part(c, rim, radial(c, cx - 1, cy - 1, 12.4, frame === 1
      ? [[0, '#fff4bf'], [.23, '#ffda79'], [.75, '#f79748'], [1, '#b74e33']]
      : [[0, '#ffe7a2'], [.35, '#ffc062'], [.69, '#e9804c'], [1, '#ab4c3f59']]),
    {line: false, shade: false, alpha: frame === 1 ? .98 : .8});
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
