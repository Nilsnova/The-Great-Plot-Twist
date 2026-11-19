import {ellipse, linear, part, poly, radial, rect, shadow, stroke, svg} from './paint.js';

const INK = '#3c2927', WOOD = '#a86c42', BRASS = '#c29a5e';
const SAIL_ROOM = 25, SKIFF_EYE = [6.7, 10.9];

// The rope joins these painted eyes. Coordinates are in each frame's logical pixels.
export const MOORING_EYES = Object.freeze({
  'home-mooring-bollard': Object.freeze([17, 13]),
  'home-mooring-skiff': Object.freeze([SKIFF_EYE[0], SKIFF_EYE[1] + SAIL_ROOM]),
});
// Top-left texture coordinates of the glass opening, away from the metal frame.
export const HOME_LANTERN_LIGHT = Object.freeze([.292, .261, .689, .527]);

function bollard(c) {
  shadow(c, 16, 23, 12.5, 2.4, .27);
  const post = svg('M10 22 L11.3 8 Q12 5.3 16.7 5.3 Q21 5.4 21 8.2 L22.2 21.7 Q18 24.4 10 22 Z');
  const endGrain = svg('M10.9 7.9 Q11.1 5.2 16.3 4.8 Q21 4.7 21.4 7.5 Q20.8 9.5 16.4 10 Q12.2 10 10.9 7.9 Z');
  part(c, post, linear(c, 10, 12, 23, 18, [[0, '#e2ae76'], [.42, WOOD], [1, '#66422e']]), {line: INK, width: .9});
  stroke(c, svg('M13.4 11.4 Q12.9 17 13.4 21 M19.4 16 Q20.1 18 19.6 21.1'), '#613c2b', .6, .56);
  part(c, endGrain, '#c7925d', {line: INK, width: .9, depth: .8, gloss: ellipse(15.8, 6.4, 2.8, .65)});
  stroke(c, svg('M14.1 7.8 Q15.5 6.9 18.5 7.4'), '#8a5639', .55, .72);
  const strap = svg('M11.4 11.3 Q15.8 13.6 21.2 11 L21.4 13.7 Q16.1 16.1 11.2 14 Z');
  part(c, strap, BRASS, {line: '#61452e', width: .64, depth: .8});
  part(c, ellipse(17, 13, .85), '#eee0ab', {line: '#705032', width: .42, shade: false});

  // A spare bight on the sand makes the post read as a working mooring.
  const coil = svg('M13 14.5 C11 17 7 17.2 5.1 19.5 C1.5 23.6 17.8 24.8 17.2 20.8 C16.8 18.7 4.1 18.5 6.8 21.2 C8 22.4 12.8 22.7 14.3 21 L12.3 20.6');
  stroke(c, coil, '#67472f', 1.85);
  stroke(c, coil, '#c7a371', 1.03);
}

function skiff(c) {
  shadow(c, 25, 24.6 + SAIL_ROOM, 15.1, 1.5, .29);
  c.save();
  c.translate(0, SAIL_ROOM);
  const hull = svg('M3.4 8.3 C11 11.4 28.1 12.3 44.8 12.2 Q46.1 15.2 44.5 18.7 Q42.1 23.1 33.6 24.5 C20.5 26.3 8.2 22.2 3.4 8.3 Z');
  const plankShade = linear(c, 19, 9, 22, 25, [[0, '#719da7'], [.34, '#3e7893'], [.68, '#234f71'], [1, '#16354f']]);
  part(c, hull, plankShade, {line: '#283641', width: 1, shade: false});
  c.save(); c.clip(hull);
  stroke(c, svg('M4.5 11.6 Q15.7 20.6 32.8 19.6 Q41 18.9 45.5 16.5'), '#a67b49', 1.8, .96);
  stroke(c, svg('M6.4 13.1 Q16 19.9 31.7 19.1 Q39.5 18.8 43.4 17.0'), '#efc37f', .58, .86);
  c.restore();
  stroke(c, svg('M8.5 16.8 Q18.4 22.1 30.4 22.7 Q38.4 22.9 42.1 20.4'), '#263b50', .72);
  stroke(c, svg('M10.6 18.3 Q19.3 22.6 28.6 23.1'), '#72aec5', .49, .68);

  const rail = svg('M3.4 8.3 Q10.9 3.8 23 4.5 Q37.9 5 44.8 12.2 Q41.9 16.9 31.6 17.8 Q14 18.2 3.4 8.3 Z');
  part(c, rail, linear(c, 16, 5, 20, 18, [[0, '#eec58b'], [.43, '#bc814c'], [1, '#7a4a33']]), {line: INK, width: .89});
  const interior = svg('M7.1 8.7 Q13.8 5.5 23.6 6.4 Q36.2 6.9 42.1 12.2 Q36.2 16.8 25.9 15.9 Q13.7 15.5 7.1 8.7 Z');
  part(c, interior, '#714c38', {line: '#553c32', width: .61, shade: '#503734', depth: 1.5});
  c.save();
  c.clip(interior);
  part(c, svg('M9.2 10.3 Q17.1 9 23 9.7 L41 14.2 L33.7 16.2 L15.7 15.2 Z'), '#a6714b', {line: false, depth: 1.1});
  stroke(c, svg('M10.6 11.1 Q21.9 11.9 35.8 15.2 M12.5 12.8 Q21.8 13.6 32.9 15.7'), '#654538', .52);
  for (const [x, y] of [[14.1, 6.6], [24, 7.2], [33.9, 8.4]]) {
    part(c, svg(`M${x} ${y} l3.65 .2 l-1.15 7.4 l-3.8 -.34 Z`), '#d9a06a', {line: '#684533', depth: .9, width: .64});
  }
  const oilskin = svg('M30.8 10 Q33.9 8.7 37.6 10.9 L36 14.4 Q33.5 15.5 29.7 13.7 Z');
  part(c, oilskin, '#517185', {line: '#354c61', width: .67, depth: .88});
  stroke(c, svg('M31.4 10.8 Q34.1 10.7 36.1 11.9 M32.4 11.6 L31.5 13.4'), '#a4bab7', .45, .65);
  c.restore();

  // A loose linen sail, rigged to the tender's existing hull and ballast.
  stroke(c, [[25.7, 14.4], [23.2, -21.5]], '#684533', 2.25);
  stroke(c, [[25.1, 13.1], [22.8, -21.1]], '#d79a5d', .78);
  stroke(c, svg('M22.9 -20.6 L14.3 8.3 M24.6 -20.2 L39.8 12.5'), '#957955', .51, .88);
  const sail = svg('M24 -20.5 Q32.5 -18.1 40.5 -16.4 Q37.4 -9.3 39.6 2.8 Q31.6 1.1 24.6 5.7 Q26.3 -4.9 24 -20.5 Z');
  part(c, sail, linear(c, 23, -15, 41, 2, [[0, '#fff6d8'], [.48, '#ecdab0'], [1, '#b89565']]),
    {line: '#785e49', width: .67, shade: false});
  stroke(c, svg('M25.7 -17.6 Q31 -9.1 27.4 1.8 M27 3.7 Q34 .4 38.7 1.5 M26.1 -19.4 Q33.3 -17.8 39 -15.8'), '#ac905e', .5, .64);
  const compass = svg('M32.6 -15.1 L33.5 -10.3 L36.7 -8.3 L33.3 -7.9 L31.9 -3.6 L31.1 -8.3 L28.2 -10.1 L31.4 -10.6 Z');
  part(c, compass, '#35526d', {line: '#46647c', width: .36, shade: false});
  stroke(c, [[23.9, 5.5], [40, 2.2]], '#794e36', .92);
  part(c, svg('M23.1 -21.5 Q19.1 -23.6 14.1 -21.6 L16.2 -19.2 L13.8 -17.7 Q18.8 -18.9 23.3 -19.2 Z'),
    '#315477', {line: '#3c4350', width: .44, shade: false});

  stroke(c, svg('M5.3 8.1 Q14.9 3.8 26.8 5.2 Q32.2 5.5 37.3 7.6'), '#f0c99a', .7, .84);
  stroke(c, svg('M8.2 12.2 Q16.9 17.1 26.5 17 Q37.6 17.7 43.2 13.7'), '#e3aa72', .63);
  part(c, ellipse(...SKIFF_EYE, 1.45, .91, .6), BRASS, {line: '#654b37', width: .57, depth: .43});
  part(c, rect(41.7, 15.3, 2.4, 1.23, .4), '#af8253', {line: '#674b38', width: .42, depth: .54});
  c.restore();
}

function bench(c) {
  shadow(c, 26, 29, 19, 2.5, .16);
  shadow(c, 14, 28.5, 6.8, 1.45, .24);
  shadow(c, 36, 28.5, 6.4, 1.45, .22);
  const rim = {line: '#655447', width: .49, shade: false};
  for (const x of [10, 34]) {
    part(c, poly([[x, 12], [x + 2.7, 11.4], [x + 3.9, 22], [x + .7, 24]], .48), '#775137', rim);
    part(c, poly([[x - 1.2, 20], [x + 4.7, 20], [x + 7, 18.25], [x + 7.2, 26.9],
      [x + 4.25, 29.1], [x - 1.2, 29.1]], .86), '#ac9a80', rim);
    part(c, poly([[x + 4.7, 20], [x + 7, 18.25], [x + 7.2, 26.9], [x + 4.25, 29.1]], .4), '#78695e', {line: false, shade: false});
    stroke(c, [[x - .45, 25.15], [x + 3.38, 25.48]], '#817366', .43, .83);
  }
  part(c, poly([[6, 10], [9, 8], [41, 8], [43, 9.8], [40.5, 11.25]], .63), '#dab184', rim);
  part(c, poly([[6, 10.2], [43, 9.8], [42.4, 14], [6.5, 14.3]], .72),
    linear(c, 0, 9.6, 0, 14.5, [[0, '#bd8955'], [.65, '#9c663e'], [1, '#6d4b35']]), rim);
  part(c, poly([[4.6, 20.2], [9.3, 16.4], [41.15, 16.4], [45, 19.7], [43.2, 21.25]], .8),
    linear(c, 0, 16.25, 0, 21, [[0, '#9f7049'], [.45, '#c8925b'], [1, '#e4b480']]), rim);
  part(c, poly([[4.6, 20.2], [45, 19.7], [43.8, 23.3], [5.45, 23.7]], .75),
    linear(c, 0, 19.5, 0, 24, [[0, '#aa754d'], [.65, '#855938'], [1, '#654535']]), rim);
  stroke(c, svg('M10 17.65 Q18.6 17.4 23.9 17.8 T40 17.7 M7.5 19.1 Q15.2 18.4 21.9 19.1 T42 18.8'), '#8e633f', .36, .74);
  stroke(c, [[6.8, 20.55], [42.65, 20.2]], '#f0c192', .45, .86);
  for (const x of [11.5, 38]) part(c, ellipse(x, 12, .63, .56), '#d2a56e', {line: '#735239', width: .32, shade: false});
}

function barrel(c) {
  shadow(c, 12.7, 29.1, 9.9, 2.3, .19);
  shadow(c, 12.6, 28.7, 6.7, 1.3, .21);
  const wood = svg('M5.3 6.85 Q1.25 16 4.7 24.4 Q5.4 29.1 12.1 29 Q18.8 29 19.5 24.4 Q22.8 16 18.7 6.85 Z');
  part(c, wood, linear(c, 2.4, 13, 21.3, 20, [[0, '#a56a43'], [.27, '#e1aa6e'], [.49, '#b78050'], [.79, '#8a573c'], [1, '#613f33']]), {line: '#674234', width: .55});
  stroke(c, svg('M8.3 8.8 Q5.6 17.7 8.15 27 M11.75 8.9 Q10.5 17.7 11.4 28 M15.5 8.8 Q17 17.3 15.3 27 M6.4 12.5 Q4.7 16.4 5.9 20.5 M14 11.5 Q14.9 14.4 14 17.1'), '#735139', .42, .76);
  for (const y of [10.8, 22.25]) {
    const hoop = svg(`M4.2 ${y} Q12 ${y + 3.65} 19.8 ${y} L20.15 ${y + 2.45} Q12 ${y + 6.4} 3.85 ${y + 2.45} Z`);
    part(c, hoop, linear(c, 4, y, 20.3, y + 2, [[0, '#708ba0'], [.27, '#6b8293'], [.64, '#3a5268'], [1, '#273d54']]), {line: '#413f3b', width: .46, shade: false});
    stroke(c, svg(`M4.65 ${y + .7} Q8.15 ${y + 2.1} 12 ${y + 2.45}`), '#99b4ba', .44);
    part(c, ellipse(7.45, y + 2.6, .5, .48), '#d0a367', {line: '#836344', width: .3, shade: false});
  }
  part(c, ellipse(12, 6.8, 7.45, 3.55), '#bc8857', {line: '#614638', width: .55, depth: .9});
  part(c, ellipse(12, 6.82, 5.9, 2.43), linear(c, 7.1, 4.8, 17.75, 8.4, [[0, '#d7a975'], [1, '#9a6949']]), {line: '#94633f', width: .38, shade: false});
  stroke(c, svg('M7.2 6.26 L16.4 7.16 M9 7.62 L14.4 8.02 M6.31 5.45 Q11.1 3.18 16.05 4.8'), '#805939', .41, .66);
}

function lantern(c) {
  shadow(c, 8.8, 22.3, 4.8, 1.25, .26);
  const trim = {line: '#68513b', width: .43, shade: false};
  part(c, poly([[4.6, 21], [5.85, 19.05], [10.1, 18.85], [11.35, 20.3], [10.75, 22.1], [5.05, 22.25]], .55), '#ac9a7d', trim);
  part(c, rect(7.13, 11.2, 1.95, 9.45, .45), '#3d556b', trim);
  stroke(c, [[7.64, 13.4], [7.6, 19.5]], '#879a99', .41);
  part(c, poly([[3.9, 5.95], [9.65, 6.8], [12.3, 5.65], [11.62, 12], [9.55, 13.3], [4.65, 12.36]], .53),
    radial(c, 6.5, 9.1, 5.1, [[0, '#fff1ad'], [.54, '#f0b751'], [1, '#9d582b']]), trim);
  part(c, poly([[9.64, 6.8], [12.3, 5.7], [11.62, 12], [9.55, 13.3]], .33), '#b47b3c', {line: false, shade: false});
  stroke(c, [[4.4, 6.6], [5.02, 11.75], [9.38, 12.73], [9.75, 6.8], [11.9, 6.07]], '#704b35', .64);
  stroke(c, [[6.98, 6.93], [7.1, 12.08]], '#a06a3a', .45, .88);
  part(c, poly([[3.25, 6], [6.68, 3.7], [9.28, 3.36], [12.9, 5.38], [9.65, 7.16]], .54),
    linear(c, 5.4, 3.5, 10, 7, [[0, '#7e9aaa'], [.46, '#5a7896'], [1, '#2d4866']]), trim);
  stroke(c, [[4.04, 5.98], [9.55, 6.68], [11.93, 5.61]], '#ddb378', .49);
  part(c, ellipse(8.45, 3.2, .84, .75), '#caa56f', trim);
}

export function homeShoreFrames() {
  return {
    'home-mooring-bollard': [32, 27, 4, bollard, {outline: .55}],
    'home-mooring-skiff': [48, 27 + SAIL_ROOM, 2.5, skiff, {outline: .55}],
    'home-bench': [48, 32, 3, bench, {outline: .29}],
    'home-barrel': [24, 32, 3, barrel, {outline: .34}],
    'home-lantern': [16, 24, 2, lantern, {outline: .23}],
  };
}
