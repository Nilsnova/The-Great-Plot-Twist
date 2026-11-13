// The pirates' fleet and the fight in the clean cartoon style (its own chunk, loaded with a wave):
// the sloop, the brig, the flagship and the warship (three bobbing frames each, bow to the right),
// the wreck, shots and shells, splashes, smoke, fire, explosions and the musket flash. Original designs.
// The gunboat (docs/GAME-V3.md §4.1) is its own small hull, with its muzzle flash and the "jammed" mark of a tower.
// Boxes and anchors are the old atlas's: the anchor is the waterline (ships) or the centre (puffs).
import {INK, ellipse, line, mix, part, poly, rect, stroke} from './paint.js';

const GOLD = '#f2c14e', SEA_FOAM = '#f2fbff';
// Ship specs: hull length and height above water, colours, masts [x, height, sails] in hull units.
const SHIPS = {
  sloop: {w: 64, h: 64, anchor: 10, hull: [6, 52, 11], wood: '#8a4f2e', stripe: '#d9a35a', sail: '#f4ead2', patch: '#e2d2ae', flag: '#2b2430',
    masts: [{x: .5, top: 6, sails: ['lateen']}], ports: 0, castle: 0},
  brig: {w: 96, h: 80, anchor: 11, hull: [8, 82, 15], wood: '#7a3f2c', stripe: '#c8423b', sail: '#f4ead2', patch: '#ddcba4', flag: '#2b2430',
    masts: [{x: .32, top: 10, sails: ['square', 'square']}, {x: .66, top: 6, sails: ['square', 'square']}], ports: 3, castle: 1},
  flagship: {w: 128, h: 112, anchor: 13, hull: [8, 112, 20], wood: '#4a2f3e', stripe: GOLD, sail: '#b8323a', patch: '#9a2630', flag: '#1a1420',
    masts: [{x: .25, top: 18, sails: ['square', 'square']}, {x: .52, top: 8, sails: ['square', 'square', 'square']}, {x: .78, top: 16, sails: ['square', 'square']}], ports: 4, castle: 2},
  warship: {w: 160, h: 128, anchor: 14, hull: [8, 146, 26], wood: '#2f3446', stripe: GOLD, sail: '#2b2733', patch: '#3a3644', flag: '#1a1420',
    masts: [{x: .22, top: 18, sails: ['square', 'square']}, {x: .5, top: 6, sails: ['square', 'square', 'square']}, {x: .78, top: 14, sails: ['square', 'square']}], ports: 6, castle: 2, decks: 2},
};
const BOB = [0, -1, .6], BILLOW = [1, 1.08, .95];

function sail(c, kind, x, top, bottom, half, billow, spec, skull) {
  if (kind === 'lateen') {
    const p = new Path2D(); p.moveTo(x + 1, top); p.quadraticCurveTo(x + half * 2.1 * billow, (top + bottom) / 2, x + 1.5, bottom);
    p.lineTo(x - half * .7, bottom - 1); p.quadraticCurveTo(x - half * .2, (top + bottom) / 2 + 2, x + 1, top); p.closePath();
    part(c, p, spec.sail, {depth: 2.4, dx: -1.4, width: 1.2, shade: mix(spec.sail, '#3a1f3c', .22)});
    stroke(c, line([[x - half * .6, bottom - 1.2], [x + 2, bottom - .6]]), mix(spec.sail, INK, .45), .8);
    return;
  }
  const bulge = 2.4 * billow, p = new Path2D();
  p.moveTo(x - half, top); p.quadraticCurveTo(x, top + 1.4, x + half, top);
  p.quadraticCurveTo(x + half + bulge, (top + bottom) / 2, x + half * 1.04, bottom);
  p.quadraticCurveTo(x, bottom + bulge * 1.4, x - half * 1.04, bottom);
  p.quadraticCurveTo(x - half + bulge * .6, (top + bottom) / 2, x - half, top); p.closePath();
  part(c, p, spec.sail, {depth: 2.2 * billow, dx: -1.6, width: 1.2, shade: mix(spec.sail, '#3a1f3c', .24), gloss: rect(x - half + 2, top + 2, 2, bottom - top - 4, 1), light: mix(spec.sail, '#ffffff', .3)});
  if (skull) {
    const cy = (top + bottom) / 2 + 1, r = Math.min(half, bottom - top) * .26, bone = mix(spec.sail, '#ffffff', .72);
    stroke(c, line([[x - r * 1.6, cy + r * 1.5], [x + r * 1.6, cy - r * .2]]), bone, r * .5); stroke(c, line([[x + r * 1.6, cy + r * 1.5], [x - r * 1.6, cy - r * .2]]), bone, r * .5);
    part(c, ellipse(x, cy, r, r * .92), bone, {line: false, shade: false});
    for (const dx of [-.4, .4]) part(c, ellipse(x + dx * r, cy, r * .26, r * .3), spec.sail, {line: false, shade: false});
  }
}
function hull(c, spec, wl, frame) {
  const [x0, x1, height] = spec.hull, deck = wl - height, mid = (x0 + x1) / 2, len = x1 - x0;
  const p = new Path2D();
  p.moveTo(x0, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .16, deck - (spec.castle ? 6 : 2)); p.lineTo(x0 + len * .2, deck);
  p.lineTo(x1 - len * .14, deck); p.quadraticCurveTo(x1 - len * .02, deck - 1, x1, deck - 4);
  p.quadraticCurveTo(x1 - len * .06, wl, x1 - len * .2, wl + 2); p.lineTo(x0 + len * .12, wl + 2);
  p.quadraticCurveTo(x0 + 1, wl - 2, x0, deck - (spec.castle ? 6 : 2)); p.closePath();
  part(c, p, spec.wood, {depth: 3, dx: -.4, width: 1.4, gloss: rect(x0 + len * .22, deck + 1.4, len * .6, 1.2, .6), light: mix(spec.wood, '#ffffff', .25)});
  // Planks, the coloured stripe and gun ports (two rows on the warship).
  c.save(); c.clip(p);
  for (let y = deck + 4; y < wl; y += 4) stroke(c, line([[x0, y], [x1, y]]), mix(spec.wood, INK, .35), .6);
  c.fillStyle = spec.stripe; c.fillRect(x0, deck + height * .3, len, Math.max(2.2, height * .14));
  c.restore();
  stroke(c, line([[x0 + len * .14, deck + height * .3], [x1 - 2, deck + height * .3]]), INK, .7);
  const rows = spec.decks === 2 ? [deck + height * .5, deck + height * .76] : [deck + height * .56];
  for (const y of rows) for (let i = 0; i < spec.ports; i++) {
    const x = x0 + len * (.26 + i * (.56 / Math.max(1, spec.ports - 1)));
    part(c, rect(x - 2, y - 1.8, 4, 3.6, 1), '#1a1218', {width: .8, shade: false});
    part(c, rect(x - 2.4, y - 3.4, 4.8, 1.4, .6), mix(spec.wood, '#ffffff', .2), {width: .6, shade: false});
  }
  // The stern castle with lit windows; a rail along the deck.
  if (spec.castle) {
    const ch = spec.castle * 5;
    part(c, rect(x0 + 1, deck - 6 - ch, len * .2, ch + 1, 1.4), mix(spec.wood, '#ffffff', .12), {depth: 1.4, width: 1.2});
    for (let i = 0; i < spec.castle + 1; i++) part(c, rect(x0 + 3 + i * 5, deck - 4 - ch, 3, 3.4, .8), '#ffd166', {width: .7, shade: false});
    part(c, rect(x0, deck - 7.4 - ch, len * .22, 2, .8), spec.stripe, {width: .8, shade: false});
  }
  stroke(c, line([[x0 + len * .2, deck - 2.4], [x1 - len * .12, deck - 2.4]]), INK, 1.1);
  for (let x = x0 + len * .22; x < x1 - len * .12; x += 5) stroke(c, line([[x, deck - 2.4], [x, deck]]), INK, .7);
  // The bowsprit and a figure-head bead.
  stroke(c, line([[x1 - 4, deck - 3], [x1 + Math.min(10, len * .14), deck - 8]]), INK, 2.4); stroke(c, line([[x1 - 4, deck - 3], [x1 + Math.min(10, len * .14), deck - 8]]), mix(spec.wood, '#ffffff', .2), 1);
  part(c, ellipse(x1 - 1, deck - 3.2, 1.6), GOLD, {width: .7, shade: false});
  return {deck, mid, len};
}
function waterline(c, spec, wl, frame) {
  const [x0, x1] = spec.hull, len = x1 - x0;
  // Foam at the bow and lapping crescents along the hull, moving with the frame.
  const phase = frame * 3.2;
  for (let x = x0 + 4 + phase; x < x1 - 4; x += 9.5) stroke(c, line([[x, wl + 1.4], [x + 4, wl + .6], [x + 7, wl + 1.4]]), SEA_FOAM, 1.2, .9);
  part(c, ellipse(x1 - len * .08, wl + .6, 5 + frame, 2), SEA_FOAM, {line: '#8fd3e8', width: .8, shade: false});
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
      part(c, rect(x - 1.3, top, 2.6, deck - top + 2, 1), '#6b4a2e', {width: 1, shade: false});
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
    c.save(); c.beginPath(); c.rect(0, 0, spec.w, wl + 1.2 - BOB[frame]); c.clip(); hull(c, spec, wl, frame); c.restore();
    c.restore();
    waterline(c, spec, wl, frame);
  };
}
// The gunboat: a small, low, dark hull with a red stripe, a short mast with a red pennant, a patched jib and a
// deck gun on a swivel behind a shield, its muzzle at the bow (bow to the right). Three bobbing frames.
const GUNBOAT = {w: 56, h: 44, anchor: 8};
function gunboat(frame) {
  return (c, {h}) => {
    const wl = h - GUNBOAT.anchor, x0 = 4, x1 = 50, deck = wl - 12, wood = '#2f343e', red = '#d8352a';
    c.save(); c.globalAlpha = .3; c.fillStyle = '#0d3a5a'; c.fill(ellipse(27, wl + 1.6, 26, 3)); c.restore();
    c.save(); c.translate(0, BOB[frame]);
    // Mast, a patched jib and the red pennant.
    part(c, rect(18.2, 5, 2.4, deck - 3, 1), '#6b4a2e', {width: 1, shade: false});
    const jib = new Path2D(); jib.moveTo(20.6, 8); jib.quadraticCurveTo(29 * BILLOW[frame], 17, 33, deck - 2.6); jib.lineTo(20.6, deck - 2.6); jib.closePath();
    part(c, jib, '#d9d0bc', {depth: 1.4, dx: -1.2, width: 1, shade: mix('#d9d0bc', '#3a1f3c', .24)});
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
    part(c, p, wood, {depth: 2.4, dx: -.4, width: 1.3, gloss: rect(x0 + 8, deck + .6, 30, 1, .5), light: mix(wood, '#ffffff', .28)});
    c.save(); c.clip(p);
    for (let y = deck + 3.6; y < wl; y += 3.6) stroke(c, line([[x0, y], [x1 + 2, y]]), mix(wood, INK, .45), .6);
    c.fillStyle = red; c.fillRect(x0, deck + 4, x1 - x0 + 3, 2.2);
    c.restore();
    stroke(c, line([[x0 + 6, deck + 4], [x1 - 2, deck + 4]]), INK, .7);
    for (const x of [14, 24]) part(c, rect(x - 1.8, deck + 7, 3.6, 2.8, .7), '#14110f', {width: .7, shade: false});
    c.restore();
    // The deck gun: a round swivel mount, a shield plate and a short thick barrel with a brass muzzle ring.
    const gx = 35, gy = deck - 2;
    const barrel = poly([[gx - 2, gy - 8.2], [gx + 14.5, gy - 9.6], [gx + 14.5, gy - 4.6], [gx - 2, gy - 4]], 1);
    part(c, barrel, '#444a58', {depth: 1.4, width: 1.1, gloss: rect(gx, gy - 8.4, 13, 1, .5)});
    part(c, rect(gx + 12.2, gy - 10, 3.4, 6.2, 1), '#e0b04a', {width: .9, shade: false});
    part(c, ellipse(gx + 14.6, gy - 7.1, .9, 1.7), '#14110f', {line: false, shade: false});
    part(c, poly([[gx - 5.5, gy + 1], [gx - 4.4, gy - 11], [gx - 1.2, gy - 11.6], [gx - .6, gy + 1]], 1), '#5a606d', {depth: 1.2, width: 1.1, gloss: rect(gx - 4.6, gy - 10, 1.2, 9, .4)});
    part(c, ellipse(gx + 1, gy - .6, 4.6, 2.4), '#2a2d36', {width: 1, shade: false});
    // A rail along the stern and a gold bead at the bow.
    stroke(c, line([[x0 + 6, deck - 3.4], [28, deck - 3.4]]), INK, 1); for (const x of [x0 + 8, 14, 20, 26]) stroke(c, line([[x, deck - 3.4], [x, deck - 1]]), INK, .7);
    part(c, ellipse(x1 - 1, deck - 3.6, 1.5), GOLD, {width: .7, shade: false});
    c.restore();
    // Foam at the bow and lapping crescents along the hull.
    for (let x = x0 + 6 + frame * 3; x < x1 - 8; x += 9) stroke(c, line([[x, wl + 1.4], [x + 3.6, wl + .6], [x + 6.4, wl + 1.4]]), SEA_FOAM, 1.2, .9);
    part(c, ellipse(x1 - 3.6, wl + .6, 5 + frame, 2), SEA_FOAM, {line: '#8fd3e8', width: .8, shade: false});
  };
}
// The gunboat's muzzle flash (a hot burst with a smoke ring), 24 x 20, the muzzle on the left edge.
function gunboatFlash(c, {h}) {
  const cy = h / 2, star = poly([[1, cy - 2.4], [7, cy - 7.6], [8.6, cy - 2.6], [18, cy - 4.6], [13, cy], [18, cy + 4.6], [8.6, cy + 2.6], [7, cy + 7.6], [1, cy + 2.4]], .8);
  part(c, star, '#ffd35a', {line: '#e8742a', width: 1.1, shade: false});
  part(c, ellipse(7.2, cy, 4, 3), '#fff6c8', {line: false, shade: false}); part(c, ellipse(5.2, cy, 1.8, 1.4), '#ffffff', {line: false, shade: false});
  puff('#d7d3cc', '#8d8a86', [[16, cy - 6, 2.4], [20, cy + 1, 2.8], [15, cy + 6.5, 2]], .85)(c);
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
function puff(colour, edge, blobs, alpha = 1) {
  return c => {
    const all = new Path2D(); for (const [x, y, r] of blobs) all.addPath(ellipse(x, y, r, r * .92));
    c.save(); c.globalAlpha = alpha; c.lineWidth = 1.6; c.strokeStyle = edge; for (const [x, y, r] of blobs) c.stroke(ellipse(x, y, r, r * .92));
    c.fillStyle = mix(colour, edge, .35); c.fill(all); c.clip(all); c.translate(-1.2, -1.6); c.fillStyle = colour; c.fill(all); c.restore();
  };
}
const smokeFrames = [
  puff('#f4f1ea', '#9a96a2', [[16, 17, 5], [12, 15, 3.6], [20, 14.6, 3.4]]),
  puff('#ebe7e0', '#9a96a2', [[16, 15.6, 6.6], [10.4, 17, 4.6], [21.6, 17, 4.4], [15, 10.6, 4.2]], .92),
  puff('#e2ded8', '#a6a2ae', [[16, 13.4, 7.4], [9, 16.4, 5], [23, 16, 5], [17, 7.6, 4.4]], .7),
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
    const g = h - 4, cx = w / 2, edge = '#3d9ec0';
    const ring = frame === 2 ? 11 : 6 + frame * 3;
    stroke(c, ellipse(cx, g, ring, ring * .32), frame === 2 ? '#bfeaf6' : SEA_FOAM, 1.4, frame === 2 ? .7 : 1);
    if (frame === 0) part(c, poly([[cx - 4, g], [cx - 2, g - 11], [cx, g - 15], [cx + 2, g - 11], [cx + 4, g]], [1, 1.4, 1.4, 1.4, 1]), '#dff6ff', {line: edge, width: 1.1, shade: '#a8def0'});
    if (frame === 1) for (const [x, height] of [[-7, 10], [-3.5, 17], [0, 20], [3.5, 16], [7, 11]]) part(c, poly([[cx + x - 1.8, g], [cx + x * 1.3, g - height], [cx + x + 1.8, g]], [.8, 1.6, .8]), '#dff6ff', {line: edge, width: 1, shade: '#a8def0'});
    const drops = frame === 0 ? [[-5, 12], [5, 13]] : frame === 1 ? [[-10, 18], [10, 19], [-2, 24]] : [[-12, 6], [12, 7], [-5, 12], [6, 13]];
    for (const [x, y] of drops) part(c, ellipse(cx + x, g - y, 1.4, 1.7), '#dff6ff', {line: edge, width: .8, shade: false});
  };
}
function explosion(frame) {
  return (c, {w, h}) => {
    const cx = w / 2, cy = h / 2;
    if (frame === 0) {
      const star = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 4 : 9; star.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      part(c, poly(star, .6), '#fff3b0', {line: '#f29e38', width: 1.2, shade: false}); part(c, ellipse(cx, cy, 3.4), '#ffffff', {line: false, shade: false}); return;
    }
    if (frame === 3) { puff('#8f8a96', '#5a5662', [[cx, cy - 2, 6], [cx - 7, cy + 2, 4.6], [cx + 7, cy + 1.6, 4.6], [cx - 1, cy - 9, 3.6]], .75)(c); return; }
    const big = frame === 1 ? 1 : 1.12;
    puff(frame === 1 ? '#ffb43a' : '#ff8a2c', '#b5401c', [[cx, cy, 8 * big], [cx - 8, cy + 3, 5.4 * big], [cx + 8, cy + 2, 5.6 * big], [cx + 1, cy - 8, 5 * big]])(c);
    part(c, ellipse(cx - 1, cy + 1, 4.6 * big, 4 * big), '#ffe27a', {line: false, shade: false});
    if (frame === 2) puff('#77727e', '#4a4652', [[cx - 6, cy - 9, 3.6], [cx + 5, cy - 10, 3.2]], .8)(c);
  };
}
function musketFlash(c, {w, h}) {
  const cy = h / 2, p = poly([[2, cy - 2], [8, cy - 5.6], [7, cy - 1.6], [14.6, cy], [7, cy + 1.6], [8, cy + 5.6], [2, cy + 2]], .7);
  part(c, p, '#fff3b0', {line: '#f29e38', width: 1, shade: false}); part(c, ellipse(5.4, cy, 2.4, 1.6), '#ffffff', {line: false, shade: false});
}
function flagTrophy(c, {h}) {
  const g = h - 4; part(c, rect(6, 6, 2.4, g - 6, 1), '#6b4a2e', {width: .9});
  const flag = new Path2D(); flag.moveTo(8, 7); flag.quadraticCurveTo(17, 5, 27, 8); flag.lineTo(26, 20); flag.quadraticCurveTo(17, 17, 8, 20); flag.closePath();
  part(c, flag, '#2b2430', {width: 1.1, shade: false}); part(c, ellipse(17, 12.6, 2.6, 2.4), '#f4ece0', {line: false, shade: false});
  part(c, ellipse(7.2, 5.4, 1.6), GOLD, {width: .7, shade: false});
}
const NONE = {outline: 0};
/** Every fleet frame: name -> [width, height, anchor, draw, options]. */
export function fleetFrames() {
  const frames = {};
  for (const kind of Object.keys(SHIPS)) for (const frame of [0, 1, 2]) frames[`pirate-${kind}-${frame + 1}`] = [SHIPS[kind].w, SHIPS[kind].h, SHIPS[kind].anchor, ship(kind, frame)];
  for (const frame of [0, 1, 2]) {
    frames[`fx-smoke-${frame + 1}`] = [32, 32, 16, smokeFrames[frame], NONE];
    frames[`fx-fire-${frame + 1}`] = [32, 32, 4, fire(frame), NONE];
    frames[`pirate-splash-${frame + 1}`] = [32, 32, 4, splash(frame), NONE];
  }
  for (const frame of [0, 1, 2, 3]) frames[`fx-explosion-${frame + 1}`] = [32, 32, 16, explosion(frame), NONE];
  Object.assign(frames, {
    'pirate-cannonball': [16, 16, 8, ball(false)], 'fx-mortar-shell': [16, 16, 8, ball(true)], 'fx-musket-flash': [16, 16, 8, musketFlash, NONE],
    'pirate-wreck': [64, 48, 8, wreck], 'pirate-flag-trophy': [32, 48, 4, flagTrophy],
    'fx-gunboat-flash': [24, 20, 10, gunboatFlash, NONE], 'fx-jam-1': [28, 28, 14, jamMark(0), NONE], 'fx-jam-2': [28, 28, 14, jamMark(1), NONE],
  });
  for (const frame of [0, 1, 2]) frames[`pirate-gunboat-${frame + 1}`] = [GUNBOAT.w, GUNBOAT.h, GUNBOAT.anchor, gunboat(frame)];
  return frames;
}
