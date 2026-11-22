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
  stroke(c, svg('M11.4 15.03 Q15.1 17.28 21.53 14.99 M11.3 16.06 Q15.78 18.57 21.64 16.13'), '#674a35', .81);
  stroke(c, svg('M11.58 14.79 Q15.8 17.05 21.36 14.69 M11.46 15.85 Q15.76 18.18 21.43 15.92'), '#e0bc88', .55);
  stroke(c, svg('M15.1 5.76 Q17.71 5.38 19.57 6.26 M13.09 20.64 Q15.54 21.3 18.28 21.02'), '#f1cc91', .35, .74);

  // A spare bight on the sand makes the post read as a working mooring.
  const coil = svg('M13 14.5 C11 17 7 17.2 5.1 19.5 C1.5 23.6 17.8 24.8 17.2 20.8 C16.8 18.7 4.1 18.5 6.8 21.2 C8 22.4 12.8 22.7 14.3 21 L12.3 20.6');
  stroke(c, coil, '#67472f', 1.85);
  stroke(c, coil, '#c7a371', 1.03);
}

function skiff(c) {
  c.outlineStops = [[0, '#736044'], [.38, '#6a4f31'], [.69, '#453629'], [1, '#203e4b']];
  shadow(c, 25, 24.6, 15.1, 1.5, .22);
  const hull = svg('M3.4 8.3 C11 11.4 28.1 12.3 44.8 12.2 Q46.1 15.2 44.5 18.7 Q42.1 23.1 33.6 24.5 C20.5 26.3 8.2 22.2 3.4 8.3 Z');
  const seam = linear(c, 15, 10, 24, 25, [[0, '#775337'], [.48, '#3c342f'], [1, '#1c3b4a']]);
  const plankShade = linear(c, 18, 12, 24, 25, [[0, '#be803f'], [.36, '#a66b3e'], [.57, '#386275'], [.79, '#1c415b'], [1, '#152f40']]);
  part(c, hull, plankShade, {line: seam, width: 1, shade: false});
  c.save(); c.clip(hull);
  part(c, svg('M2.2 8.3 Q11.3 10.4 14.2 12.42 Q12.46 17.29 19.24 22.68 L19.81 25 L2.1 22.41 Z'),
    linear(c, 8, 9, 18, 23, [[0, '#a98053'], [.39, '#81654e'], [.67, '#446276'], [1, '#233c50']]),
    {line: false, shade: false});
  part(c, svg('M39.77 12 Q43.91 10.47 46.15 11.29 L46.8 23.15 L31.23 25.79 Q39.27 21.35 39.77 12 Z'),
    linear(c, 39.5, 12.3, 42, 23, [[0, '#be8f61'], [.37, '#a67856'], [.67, '#446579'], [1, '#233c50']]),
    {line: false, shade: false, alpha: .79});
  const sheer = svg('M4.07 10.85 C13.4 16.99 22.6 20.63 32.55 19.41 Q40.99 18.58 45.49 15.59');
  stroke(c, sheer, '#593c2b', 2.52);
  stroke(c, sheer, linear(c, 8.2, 13, 44.1, 18.9,
    [[0, '#b67d44'], [.43, '#e6b476'], [.72, '#e9b172'], [1, '#9d6239']]), 1.55);
  stroke(c, svg('M10.17 14.36 Q17.43 18.56 25.3 18.91 M36.18 18.77 Q40.61 17.95 42.37 17.01'), '#f2cd94', .52, .92);
  stroke(c, svg('M8.5 16.8 Q18.4 22.1 30.4 22.7 Q38.4 22.9 42.1 20.4'), '#23303a', .72);
  stroke(c, svg('M10.2 18.44 Q19.3 22.94 28.6 23.2 M33.1 23.36 Q38.7 22.6 40.5 21.7'), '#69aeb5', .52, .78);
  stroke(c, svg('M18.2 23.08 Q23.4 24.93 29.84 24.39 M37.9 22.69 Q41.75 21.54 43.3 19.8'), '#a07151', .42, .72);
  for (const [x, y] of [[10.4, 15.93], [18.0, 18.75], [29.45, 20.63], [39.44, 19.02]]) {
    part(c, ellipse(x, y, .71, .53), '#a88559', {line: '#4b3d34', width: .33, shade: false});
    part(c, ellipse(x - .18, y - .13, .29, .23), '#e0bb85', {line: false, shade: false, alpha: .86});
  }
  c.restore();

  const rail = svg('M3.4 8.3 Q10.9 3.8 23 4.5 Q37.9 5 44.8 12.2 Q41.9 16.9 31.6 17.8 Q14 18.2 3.4 8.3 Z');
  part(c, rail, linear(c, 17, 5, 24, 18,
    [[0, '#f0c18a'], [.48, '#d49a5e'], [.78, '#a06a41'], [1, '#69442d']]), {line: '#63432d', width: .86});
  const interior = svg('M7.1 8.7 Q13.8 5.5 23.6 6.4 Q36.2 6.9 42.1 12.2 Q36.2 16.8 25.9 15.9 Q13.7 15.5 7.1 8.7 Z');
  part(c, interior, linear(c, 18.5, 6.5, 24.3, 16.2,
    [[0, '#614431'], [.31, '#85583a'], [.68, '#997552'], [1, '#4a362c']]), {line: '#563c30', width: .62, shade: false});
  c.save();
  c.clip(interior);
  part(c, svg('M9.2 10.3 Q17.1 9 23 9.7 L41 14.2 L33.7 16.2 L15.7 15.2 Z'),
    linear(c, 16, 9.6, 29, 16, [[0, '#d5a474'], [.56, '#ae794d'], [1, '#866040']]), {line: false, depth: 1.1});
  stroke(c, svg('M10.6 11.1 Q21.9 11.9 35.8 15.2 M12.5 12.8 Q21.8 13.6 32.9 15.7'), '#654538', .57);
  for (const [x, y] of [[14.1, 6.6], [24, 7.2], [33.9, 8.4]]) {
    part(c, svg(`M${x} ${y} l3.65 .2 l-1.15 7.4 l-3.8 -.34 Z`),
      linear(c, x, y, x + 3.6, y + 5, [[0, '#f0c48d'], [.35, '#ce975f'], [1, '#9d6a46']]),
      {line: '#604231', depth: .92, width: .64});
  }
  const oilskin = svg('M30.8 10 Q33.9 8.7 37.6 10.9 L36 14.4 Q33.5 15.5 29.7 13.7 Z');
  part(c, oilskin, '#517185', {line: '#354c61', width: .67, depth: .88});
  stroke(c, svg('M31.4 10.8 Q34.1 10.7 36.1 11.9 M32.4 11.6 L31.5 13.4'), '#a4bab7', .45, .65);
  c.restore();

  stroke(c, svg('M5.31 8.14 Q12.63 5.03 18.09 5.04 M24.2 5.17 Q33.81 5.23 37.3 7.6'), '#ebbf8d', .64, .89);
  stroke(c, svg('M8.2 12.2 Q16.9 17.1 26.5 17 M27.4 17.3 Q37.6 17.7 43.2 13.7'), '#e3ad77', .63);
  part(c, ellipse(...SKIFF_EYE, 1.45, .91, .6), BRASS, {line: '#654b37', width: .57, depth: .43});
  part(c, rect(41.7, 15.3, 2.4, 1.23, .4), '#af8253', {line: '#674b38', width: .42, depth: .54});

  // A short yard and bellying linen sit within the tender's existing painted frame.
  stroke(c, [[23.4, 1.9], [23.9, 16.55]], '#62432e', 1.24);
  stroke(c, [[23.1, 2.1], [23.65, 16.15]], '#ce9960', .46);
  part(c, ellipse(23.4, 1.84, .69, .55), BRASS, {line: '#6a4b35', width: .32, shade: false});
  const pennant = svg('M22.97 2.84 Q25.93 1.42 30.28 1.71 L29.25 2.82 L31.04 4.29 Q25.9 3.81 23.24 4.98 Z');
  part(c, pennant, linear(c, 23.3, 2, 30.8, 3.9,
    [[0, '#142d49'], [.42, '#436284'], [1, '#182e49']]), {line: '#1f3445', width: .42, shade: false});
  stroke(c, svg('M24.68 3.14 L27.45 3.35 M27.13 2.75 L24.97 3.94'), '#f4deb0', .43);
  part(c, ellipse(26.42, 2.96, .74, .57), '#ead4a4', {line: false, shade: false});
  stroke(c, svg('M8.99 9.23 L15.43 4.93 L23.3 2.22 L31.71 7.13 L40.61 12.52'), '#9e7956', .47, .86);
  const sail = svg('M15.09 5.07 Q24.02 5.55 31.81 7.37 C30.86 10.08 32.77 12.23 34.03 14.35 Q23.94 12.58 12.59 14.11 C14.77 11.29 15.37 8.28 15.09 5.07 Z');
  part(c, sail, linear(c, 13.71, 8, 34.21, 11.75,
    [[0, '#ad8261'], [.20, '#d9b887'], [.42, '#fff1d0'], [.65, '#eed8ae'], [.83, '#cda979'], [1, '#956d53']]),
    {line: '#826045', width: .55, shade: false});
  c.save(); c.clip(sail);
  part(c, svg('M17.05 4.78 C22.52 6.91 20.8 11.94 17.85 13.77 L26.85 13.5 C22.97 11.84 25.12 8.32 25.36 5.93 Z'),
    linear(c, 17.75, 6.25, 23.7, 13.58, [[0, '#f4dbac'], [.46, '#fff3d6'], [1, '#e8ce9c']]),
    {line: false, shade: false, alpha: .72});
  part(c, svg('M28.16 6.06 Q26.19 9.05 30.19 13.55 L34.53 14.56 L32.51 7.3 Z'),
    '#9d775c', {line: false, shade: false, alpha: .23});
  stroke(c, svg('M16.21 6.14 Q16.73 9.47 14.67 12.77 M29.02 7.47 Q28.39 10.26 30.77 12.95 M14.18 13.23 Q23.75 11.95 32.97 13.65'),
    '#a98259', .43, .84);
  c.restore();
  stroke(c, [[14.63, 4.8], [32.63, 7.17]], '#69472d', 1.09);
  stroke(c, [[14.87, 4.52], [32.41, 6.91]], '#deae77', .51);
  stroke(c, [[12.92, 13.64], [10.39, 14.57]], '#b79063', .48);
  stroke(c, [[33.26, 13.97], [38.92, 14.38]], '#ac8258', .5);
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

function barrel(c) {
  shadow(c, 12.7, 29.1, 9.9, 2.3, .19);
  shadow(c, 12.6, 28.7, 6.7, 1.3, .21);
  const wood = svg('M5.3 6.85 Q1.25 16 4.7 24.4 Q5.4 29.1 12.1 29 Q18.8 29 19.5 24.4 Q22.8 16 18.7 6.85 Z');
  part(c, wood, linear(c, 2.4, 13, 21.3, 20, [[0, '#9d623c'], [.27, '#dfa164'], [.49, '#c1844e'], [.79, '#945936'], [1, '#5a392d']]), {line: '#623c2b', width: .55});
  const stave = {line: false, shade: false};
  part(c, svg('M8.52 8.74 Q6.24 17.7 8.34 27.23 L10.06 27.48 Q8.47 17.45 10.42 8.74 Z'),
    linear(c, 7, 11, 11.9, 25, [[0, '#e4a86b'], [.65, '#d39052'], [1, '#ad6c3b']]), stave);
  part(c, svg('M14.78 8.78 Q16.38 17.13 14.7 27.6 L17.19 26.54 Q19.58 16.5 16.89 8.83 Z'),
    linear(c, 15.3, 12, 18.7, 24.9, [[0, '#ab6d3e'], [1, '#75482c']]), stave);
  stroke(c, svg('M8.3 8.8 Q5.6 17.7 8.15 27 M11.75 8.9 Q10.5 17.7 11.4 28 M15.5 8.8 Q17 17.3 15.3 27 M6.4 12.5 Q4.7 16.4 5.9 20.5'), '#754727', .49, .86);
  stroke(c, svg('M9.3 16.1 Q8.8 19.7 9.5 21.8 M14.28 15.7 Q14.92 18.23 14.42 21.85 M17.7 16.4 Q18.12 17.97 17.63 20.1'), '#efbb75', .32, .65);
  for (const y of [10.8, 22.25]) {
    const hoop = svg(`M4.2 ${y} Q12 ${y + 3.65} 19.8 ${y} L20.15 ${y + 2.45} Q12 ${y + 6.4} 3.85 ${y + 2.45} Z`);
    part(c, hoop, linear(c, 4, y, 20.3, y + 2, [[0, '#697f93'], [.22, '#8299a8'], [.54, '#486172'], [1, '#243c54']]), {line: '#413f3b', width: .46, shade: false});
    stroke(c, svg(`M4.92 ${y + .7} Q8.15 ${y + 2.08} 12.3 ${y + 2.47}`), '#bdced0', .48, .95);
    part(c, ellipse(7.45, y + 2.6, .5, .48), '#d0a367', {line: '#836344', width: .3, shade: false});
  }
  part(c, ellipse(12, 6.8, 7.45, 3.55), '#cd9356', {line: '#614638', width: .55, depth: .9});
  part(c, ellipse(12, 6.82, 5.9, 2.43), linear(c, 7.1, 4.8, 17.75, 8.4, [[0, '#e0ac70'], [.45, '#b77d48'], [1, '#895935']]), {line: '#895733', width: .38, shade: false});
  stroke(c, svg('M7.2 6.26 L16.55 7.23 M9 7.82 L14.4 8.19'), '#805132', .43, .74);
  stroke(c, svg('M6.58 5.43 Q10.65 3.69 15.96 4.7'), '#efbc7d', .44, .92);
  part(c, ellipse(14.35, 5.94, .71, .38), '#7d512f', {line: false, shade: false});
}

function lantern(c) {
  shadow(c, 8.8, 22.3, 4.8, 1.25, .26);
  const trim = {line: '#68513b', width: .43, shade: false};
  part(c, poly([[4.6, 21], [5.85, 19.05], [10.1, 18.85], [11.35, 20.3], [10.75, 22.1], [5.05, 22.25]], .55),
    linear(c, 5.72, 19.09, 8.55, 22.1, [[0, '#e4be81'], [.59, '#ac875a'], [1, '#765537']]), trim);
  part(c, rect(7.13, 11.2, 1.95, 9.45, .45),
    linear(c, 7.2, 15, 9.1, 15, [[0, '#697780'], [.43, '#47535d'], [1, '#2b3544']]), trim);
  stroke(c, [[7.64, 13.4], [7.6, 19.5]], '#c5a76f', .43);
  part(c, poly([[3.9, 5.95], [9.65, 6.8], [12.3, 5.65], [11.62, 12], [9.55, 13.3], [4.65, 12.36]], .53),
    radial(c, 6.5, 9.1, 5.1, [[0, '#fff0a9'], [.47, '#f1b04b'], [1, '#90502c']]), trim);
  part(c, poly([[9.64, 6.8], [12.3, 5.7], [11.62, 12], [9.55, 13.3]], .33), '#a56836', {line: false, shade: false});
  stroke(c, [[4.4, 6.6], [5.02, 11.75], [9.38, 12.73], [9.75, 6.8], [11.9, 6.07]], '#815437', .64);
  stroke(c, [[6.98, 6.93], [7.1, 12.08]], '#9d6337', .45, .88);
  part(c, rect(10.12, 8.78, .91, 2.11, .23), '#bb854e', {line: '#733f29', width: .25, shade: false});
  part(c, poly([[3.25, 6], [6.68, 3.7], [9.28, 3.36], [12.9, 5.38], [9.65, 7.16]], .54),
    linear(c, 5.4, 3.5, 10, 7, [[0, '#8c9e9e'], [.46, '#577888'], [1, '#344d65']]), trim);
  stroke(c, [[4.04, 5.98], [9.55, 6.68], [11.93, 5.61]], '#e4ac69', .49);
  part(c, ellipse(8.45, 3.2, .84, .75), '#caa56f', trim);
}

export function homeShoreFrames() {
  return {
    'home-mooring-bollard': [32, 27, 4, bollard, {outline: .55, worldDetail: 7}],
    'home-mooring-skiff': [48, 27, 2.5, skiff, {outline: .55, worldDetail: 7}],
    boat: [64, 40, 8, harborRowboat, {outline: .45}],
    sailboat: [96, 112, 10, coastalSailboat(false), {outline: .5}],
    'dark-schooner': [128, 112, 10, coastalSailboat(true), {outline: .5}],
    'home-barrel': [24, 32, 3, barrel, {outline: .34, worldDetail: 7}],
    'home-lantern': [16, 24, 2, lantern, {outline: .23, worldDetail: 7}],
  };
}
