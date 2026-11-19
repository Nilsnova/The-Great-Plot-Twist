import {ellipse, linear, part, poly, radial, rect, shadow, stroke, svg} from './paint.js';

const INK = '#3c2927', WOOD = '#a86c42', BRASS = '#c29a5e';
const SKIFF_EYE = [6.7, 10.9];

// The rope joins these painted eyes. Coordinates are in each frame's logical pixels.
export const MOORING_EYES = Object.freeze({
  'home-mooring-bollard': Object.freeze([17, 13]),
  'home-mooring-skiff': Object.freeze(SKIFF_EYE),
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
  c.outlineStops = [[0, '#7c5f44'], [.38, '#65503d'], [.69, '#4b473e'], [1, '#2b4650']];
  shadow(c, 25, 24.6, 15.1, 1.5, .19);
  const hull = svg('M3.4 8.3 C11 11.4 28.1 12.3 44.8 12.2 Q46.1 15.2 44.5 18.7 Q42.1 23.1 33.6 24.5 C20.5 26.3 8.2 22.2 3.4 8.3 Z');
  const seam = linear(c, 15, 10, 24, 25, [[0, '#79604a'], [.48, '#334d56'], [1, '#243745']]);
  const plankShade = linear(c, 17, 12, 21, 26, [[0, '#366581'], [.37, '#3b6b81'], [.72, '#214861'], [1, '#193143']]);
  part(c, hull, plankShade, {line: seam, width: 1, shade: false});
  c.save(); c.clip(hull);
  part(c, svg('M2.2 8.3 Q11.3 10.4 14.2 12.42 Q12.46 17.29 19.24 22.68 L19.81 25 L2.1 22.41 Z'),
    linear(c, 8, 9, 18, 23, [[0, '#a98053'], [.39, '#81654e'], [.67, '#446276'], [1, '#233c50']]),
    {line: false, shade: false});
  part(c, svg('M39.77 12 Q43.91 10.47 46.15 11.29 L46.8 23.15 L31.23 25.79 Q39.27 21.35 39.77 12 Z'),
    linear(c, 39.5, 12.3, 42, 23, [[0, '#be8f61'], [.37, '#a67856'], [.67, '#446579'], [1, '#233c50']]),
    {line: false, shade: false, alpha: .79});
  const sheer = svg('M4.07 10.85 C13.4 16.99 22.6 20.63 32.55 19.41 Q40.99 18.58 45.49 15.59');
  stroke(c, sheer, '#8b5e40', 2.3);
  stroke(c, sheer, linear(c, 8.2, 13, 44.1, 18.9,
    [[0, '#b0835c'], [.42, '#daa96c'], [.71, '#e6b67a'], [1, '#b7824e']]), 1.24);
  stroke(c, svg('M10.17 14.36 Q17.43 18.56 25.3 18.91 M36.18 18.77 Q40.61 17.95 42.37 17.01'), '#efc389', .51, .83);
  stroke(c, svg('M8.5 16.8 Q18.4 22.1 30.4 22.7 Q38.4 22.9 42.1 20.4'), '#203b4f', .74);
  stroke(c, svg('M11 18.64 Q19.3 22.94 28.6 23.2 M34.3 23.03 Q38.4 22.97 40.5 21.7'), '#78a7ad', .49, .67);
  c.restore();

  const rail = svg('M3.4 8.3 Q10.9 3.8 23 4.5 Q37.9 5 44.8 12.2 Q41.9 16.9 31.6 17.8 Q14 18.2 3.4 8.3 Z');
  part(c, rail, linear(c, 17, 5, 24, 18,
    [[0, '#e4b27a'], [.48, '#c99158'], [.78, '#9b6948'], [1, '#744e3c']]), {line: '#76563e', width: .89});
  const interior = svg('M7.1 8.7 Q13.8 5.5 23.6 6.4 Q36.2 6.9 42.1 12.2 Q36.2 16.8 25.9 15.9 Q13.7 15.5 7.1 8.7 Z');
  part(c, interior, '#845e43', {line: '#6a4b39', width: .56, shade: '#513830', depth: 1.4});
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

  stroke(c, svg('M5.31 8.14 Q12.63 5.03 18.09 5.04 M24.2 5.17 Q33.81 5.23 37.3 7.6'), '#ebbf8d', .64, .89);
  stroke(c, svg('M8.2 12.2 Q16.9 17.1 26.5 17 M27.4 17.3 Q37.6 17.7 43.2 13.7'), '#e3ad77', .63);
  part(c, ellipse(...SKIFF_EYE, 1.45, .91, .6), BRASS, {line: '#654b37', width: .57, depth: .43});
  part(c, rect(41.7, 15.3, 2.4, 1.23, .4), '#af8253', {line: '#674b38', width: .42, depth: .54});

  // A slanting yard and rounded linen carry the tender's anchor above the deck.
  stroke(c, [[23.4, 1.9], [23.9, 16.55]], '#62432e', 1.24);
  stroke(c, [[23.1, 2.1], [23.65, 16.15]], '#ce9960', .46);
  part(c, ellipse(23.4, 1.84, .69, .55), BRASS, {line: '#6a4b35', width: .32, shade: false});
  stroke(c, svg('M9.1 9.2 L16.6 3.62 L23.32 2.19 L31.75 7.2 L40.45 12.46'), '#a7825e', .45, .85);
  const sail = svg('M17 4.09 Q23.55 5.64 31.48 7.51 Q31.13 10.79 33.66 13.56 Q23.74 11.61 14.64 12.98 Q16.92 9.72 17 4.09 Z');
  part(c, sail, linear(c, 15.7, 8, 33.72, 11.4,
    [[0, '#bf9c75'], [.26, '#e9cd9e'], [.49, '#f9ebc6'], [.75, '#e9d0a3'], [1, '#b58f65']]),
    {line: '#977752', width: .49, shade: false});
  c.save(); c.clip(sail);
  part(c, svg('M17.87 3.83 Q22.61 7.22 19.85 12.87 Q24.27 12.21 26.6 13.01 Q24.63 7.94 24.91 5.31 Z'),
    linear(c, 18.7, 6.12, 22.8, 12.51, [[0, '#f3dea7'], [.47, '#fff2d1'], [1, '#e6c99b']]),
    {line: false, shade: false, alpha: .61});
  part(c, svg('M28.16 6.06 Q26.19 9.05 30.19 13.05 L34.53 14.16 L32.51 7.3 Z'),
    '#9d775c', {line: false, shade: false, alpha: .27});
  stroke(c, svg('M18.66 5.43 Q18.67 9.26 17.14 11.88 M28.27 7.2 Q27.05 10.58 29.82 12.18 M16.55 11.74 Q24.13 10.84 31.61 12.41'),
    '#b1936e', .46, .84);
  c.restore();
  const mark = svg('M23.65 7.02 L23.39 10.75 M21.92 8.52 L25.09 8.69 M21.13 9.32 Q21.43 10.69 23.39 10.75 Q25.32 11.12 26.02 9.65');
  stroke(c, mark, '#34566e', .68);
  part(c, ellipse(23.69, 6.92, .54, .54), '#34566e', {line: false, shade: false});
  stroke(c, [[16, 3.47], [32.58, 7.34]], '#67462e', 1.08);
  stroke(c, [[16.42, 3.21], [32.38, 7.03]], '#d4a06c', .42);
  stroke(c, [[15.06, 12.61], [12.19, 13.12]], '#bc9565', .46);
  stroke(c, [[33.24, 13.56], [38.86, 14.12]], '#ad855f', .47);
}

function harborRowboat(c) {
  shadow(c, 32, 32, 26.5, 4.8, .26);
  const hull = svg('M5.7 18 Q12 7.4 40 5.5 Q50 6.4 58.6 13.2 L58.6 21 Q53 27.6 44.8 30.5 Q28.1 33.6 16 31.5 Q7.7 27.7 5.7 18 Z');
  part(c, hull, linear(c, 18, 9, 36, 32,
    [[0, '#ce9a5f'], [.36, '#a87543'], [.61, '#846044'], [1, '#374b58']]), {line: '#413132', width: 1});
  const well = svg('M9.3 17.9 Q16.5 9.3 40.7 8.9 Q49.1 9.4 54.7 14.2 L53.6 19.5 Q47.3 25.7 40.5 26.8 Q29 30.5 18 27.8 Q10.9 24.9 9.3 17.9 Z');
  part(c, well, linear(c, 16, 11, 24, 26, [[0, '#93623e'], [.48, '#644333'], [1, '#3c3d44']]),
    {line: '#e2aa71', width: 1.3, shade: false});
  for (const x of [23, 39]) {
    part(c, poly([[x - 2, 12.7], [x + 2, 12.1], [x, 25.8], [x - 3.9, 26.5]], .5),
      '#ca9a64', {line: '#604739', width: .65, depth: .75});
    stroke(c, [[x - .5, 14.1], [x - 2.8, 24.7]], '#e5bd80', .62);
  }
  stroke(c, svg('M9.6 23.4 Q20.4 34.4 43 29 Q51 27 56 21.6'), '#e0a45e', .78);
  stroke(c, svg('M16.6 9.5 L42.6 27.4 Q44.7 28.7 45.8 26.7 L18.1 8.2'), '#644731', 1.75);
  stroke(c, [[17.4, 8.9], [44.6, 27.3]], '#dda968', .96);
}

function coastalSailboat(dark) {
  return (c, {w}) => {
    const mast = w / 2 - 8, bow = w - 10;
    const linen = dark ? ['#84928b', '#617773', '#354c50'] : ['#fff1cc', '#e7cfa1', '#b69a71'];
    const cloth = linear(c, mast - 19, 43, mast + 32, 74,
      [[0, linen[2]], [.17, linen[1]], [.45, linen[0]], [.73, linen[1]], [1, linen[2]]]);
    shadow(c, w / 2, 102, w / 2 - 8, 4, .29);
    stroke(c, [[mast, 14], [mast, 86]], '#574033', 3.4);
    stroke(c, [[mast - .64, 15], [mast - .64, 83]], '#c2925a', .9);
    const main = svg(`M${mast - 2} 19 Q${mast + 12} 48 ${bow - 6} 74 Q${mast + 16} 74 ${mast - 2} 79 Z`);
    const jib = svg(`M${mast - 4} 19 Q${mast - 13} 48 16 76 Q${mast - 12} 76 ${mast - 4} 79 Z`);
    for (const sail of [jib, main]) part(c, sail, cloth, {line: '#625141', width: .95, shade: false});
    c.save(); c.clip(main);
    part(c, svg(`M${mast - 1} 24 Q${mast + 5} 57 ${mast + 13} 75 L${mast + 6} 80 L${mast - 3} 80 Z`),
      linen[2], {line: false, shade: false, alpha: .32});
    part(c, svg(`M${mast + 4} 33 Q${mast + 20} 61 ${bow - 17} 71 Q${mast + 13} 66 ${mast + 4} 33 Z`),
      linen[0], {line: false, shade: false, alpha: .5});
    stroke(c, svg(`M${mast + 2} 77 Q${mast + 15} 70 ${bow - 7} 73`), linen[2], 1.2, .83);
    c.restore();
    stroke(c, svg(`M${mast - 5} 35 Q${mast - 12} 57 20 74 M${mast + 2} 34 Q${mast + 16} 57 ${bow - 13} 73`),
      linen[2], .92, .9);
    if (dark) {
      const fore = mast + 31;
      stroke(c, [[fore, 25], [fore, 84]], '#504034', 2.2);
      part(c, svg(`M${fore + 2} 29 Q${fore + 9} 52 ${w - 8} 73 L${fore + 2} 77 Z`), cloth,
        {line: '#354349', width: .92, shade: false});
    }
    const flag = svg(`M${mast + 2} 14 Q${mast + 9} 14 ${mast + 16} 18 L${mast + 2} 22 Z`);
    part(c, flag, dark ? '#8d473c' : '#315477', {line: '#524039', width: .7, shade: false});
    stroke(c, [[mast + 4, 16], [mast + 10, 17.4]], '#e0ab5f', .75);
    const hull = svg(`M7 86 Q${mast + 9} 85 ${bow} 82 Q${bow - 2} 95 ${bow - 13} 98 Q${bow - 22} 104 25 102 Q14 99 7 86 Z`);
    part(c, hull, linear(c, 15, 83, 21, 103,
      [[0, '#d4a164'], [.27, dark ? '#84563e' : '#a47247'], [.47, '#4b6471'], [.72, '#254159'], [1, '#183142']]),
      {line: '#433133', width: 1.2, shade: false});
    c.save(); c.clip(hull);
    const deck = svg(`M8 86 Q${mast + 10} 86 ${bow - .5} 82 Q${bow - 8} 88 ${mast + 14} 91 Q24 92 8 86 Z`);
    part(c, deck, linear(c, 16, 83, 33, 91, [[0, '#e5bd83'], [.53, '#bc8553'], [1, '#72503a']]),
      {line: false, shade: false});
    c.clip(deck);
    for (const x of [21, 31, mast, mast + 14, mast + 22, bow - 12])
      stroke(c, [[x, 84.8], [x + 4, 91.7]], '#846044', .77);
    c.restore();
    stroke(c, svg(`M12 89 Q${mast + 9} 92 ${bow - 5} 86 M20 97 Q${mast + 14} 103 ${bow - 11} 93`),
      '#4c3a36', 1.01);
    stroke(c, svg(`M11 88 Q${mast + 9} 90 ${bow - 4} 85`), '#e5ad61', 1.28);
    for (const x of [26, 34, w - 35, w - 27]) part(c, ellipse(x, 91.7, .8, .68),
      '#d2a160', {line: '#654b37', width: .45, shade: false});
  };
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
    'home-mooring-skiff': [48, 27, 2.5, skiff, {outline: .55}],
    boat: [64, 40, 8, harborRowboat, {outline: .45}],
    sailboat: [96, 112, 10, coastalSailboat(false), {outline: .5}],
    'dark-schooner': [128, 112, 10, coastalSailboat(true), {outline: .5}],
    'home-bench': [48, 32, 3, bench, {outline: .29}],
    'home-barrel': [24, 32, 3, barrel, {outline: .34}],
    'home-lantern': [16, 24, 2, lantern, {outline: .23}],
  };
}
