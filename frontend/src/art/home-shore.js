import {ellipse, linear, part, rect, shadow, stroke, svg} from './paint.js';

const INK = '#3c2927', WOOD = '#a86c42', BRASS = '#c29a5e';
const SKIFF_WIDTH = 76, HULL_SCALE = SKIFF_WIDTH / 48, SAIL_ROOM = 36;
const SKIFF_EYE = [6.7, 10.9];

// The rope joins these painted eyes. Coordinates are in each frame's logical pixels.
export const MOORING_EYES = Object.freeze({
  'home-mooring-bollard': Object.freeze([17, 13]),
  'home-mooring-skiff': Object.freeze([SKIFF_EYE[0] * HULL_SCALE, SKIFF_EYE[1] + SAIL_ROOM]),
});

function bollard(c) {
  shadow(c, 16, 23, 12.5, 2.4, .21);
  const post = svg('M10 22 L11.3 8 Q12 5.3 16.7 5.3 Q21 5.4 21 8.2 L22.2 21.7 Q18 24.4 10 22 Z');
  const endGrain = svg('M10.9 7.9 Q11.1 5.2 16.3 4.8 Q21 4.7 21.4 7.5 Q20.8 9.5 16.4 10 Q12.2 10 10.9 7.9 Z');
  part(c, post, linear(c, 10, 12, 23, 18, [[0, '#cf9762'], [.48, WOOD], [1, '#704330']]), {line: INK, width: .9});
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
  c.save();
  c.scale(HULL_SCALE, 1);
  c.translate(0, SAIL_ROOM);
  shadow(c, 25, 24.6, 17.4, 1.65, .27);
  stroke(c, svg('M4.9 17.2 Q7.4 21.3 11.6 21.9 M10.3 23.2 Q24.4 28.1 38 24.1 M39.8 23.6 Q42.8 22.6 44.3 21'), '#b3eee5', .64, .53);
  const hull = svg('M3.4 8.3 C11 11.4 28.1 12.3 44.8 12.2 Q46.1 15.2 44.5 18.7 Q42.1 23.1 33.6 24.5 C20.5 26.3 8.2 22.2 3.4 8.3 Z');
  const plankShade = linear(c, 14, 11, 26, 24, [[0, '#b57141'], [.35, '#855239'], [.66, '#35516c'], [1, '#1a3048']]);
  part(c, hull, plankShade, {line: '#29343a', width: .94, shade: false});
  stroke(c, svg('M6.5 13.6 Q15.4 20.2 27.9 20.1 Q39.4 20.4 43.9 16.2'), '#e3a752', .82);
  stroke(c, svg('M8.5 16.8 Q18.4 22.1 30.4 22.7 Q38.4 22.9 42.1 20.4'), '#5b7a8f', .64);
  stroke(c, svg('M11.1 17.8 Q19.3 22.6 28.6 23.1 M37.6 21.1 L40.1 20.2'), '#c7925f', .46, .75);

  const rail = svg('M3.4 8.3 Q10.9 3.8 23 4.5 Q37.9 5 44.8 12.2 Q41.9 16.9 31.6 17.8 Q14 18.2 3.4 8.3 Z');
  part(c, rail, linear(c, 16, 5, 20, 18, [[0, '#d1a06c'], [.52, '#ba824f'], [1, '#89553a']]), {line: INK, width: .89});
  const interior = svg('M7.1 8.7 Q13.8 5.5 23.6 6.4 Q36.2 6.9 42.1 12.2 Q36.2 16.8 25.9 15.9 Q13.7 15.5 7.1 8.7 Z');
  part(c, interior, '#714c38', {line: '#553c32', width: .61, shade: '#503734', depth: 1.5});
  c.save();
  c.clip(interior);
  part(c, svg('M9.2 10.3 Q17.1 9 23 9.7 L41 14.2 L33.7 16.2 L15.7 15.2 Z'), '#a6714b', {line: false, depth: 1.1});
  stroke(c, svg('M10.6 11.1 Q21.9 11.9 35.8 15.2 M12.5 12.8 Q21.8 13.6 32.9 15.7'), '#654538', .52);
  for (const [x, y] of [[14.1, 6.6], [24, 7.2], [33.9, 8.4]]) {
    part(c, svg(`M${x} ${y} l3.65 .2 l-1.15 7.4 l-3.8 -.34 Z`), '#d9a06a', {line: '#684533', depth: .9, width: .64});
  }
  const chest = svg('M29.2 8.9 L34.7 7.8 L39.2 10.7 L38.7 14.8 L33.1 15.3 L28.8 12.4 Z');
  part(c, chest, linear(c, 29, 8, 38, 15, [[0, '#da9a5d'], [.50, '#b27545'], [1, '#623e2b']]),
    {line: '#613e2e', width: .67, depth: .82});
  stroke(c, svg('M29.6 9.1 L33.7 11.8 L38.5 11 M33.7 11.8 L33.2 15 M36.6 8.9 L35.8 12.5'), '#e2b074', .63);
  c.restore();

  // The square sail borrows the original concept's billow, stitched hem and painted skull.
  stroke(c, svg('M15.9 6.8 Q20.1 -10.2 18.5 -30.2 M37.5 10.9 L36.1 -17.1'), '#66472e', .66, .88);
  stroke(c, [[23.5, 14.8], [20.3, -32.2]], '#603d2a', 1.85);
  stroke(c, [[23.1, 14.1], [19.9, -31.5]], '#d3985d', .62);
  part(c, ellipse(20.15, -32.3, 1.06), '#e5b875', {line: '#704d32', width: .42, depth: .51});
  const sail = svg('M12.4 -25.3 Q23.6 -23.3 37.4 -16.7 C33.8 -10.6 36.6 -2.8 42.1 5.3 Q30.7 1.4 16.3 7.5 Q18 -2.6 12.4 -25.3 Z');
  part(c, sail, linear(c, 14, -22, 39, 4, [[0, '#f4d7a3'], [.25, '#fff0c6'], [.55, '#f5e0b3'],
    [.78, '#dfbf8e'], [1, '#c49467']]), {line: '#8b693f', width: .64, shade: false});
  const fold = svg('M13.1 -24.2 C21.8 -12.7 20.8 -2.2 16.9 6.4 Q19.4 -3.7 13.1 -24.2 Z');
  part(c, fold, '#bb946a', {line: false, alpha: .37, shade: false});
  stroke(c, svg('M13.1 -23.7 Q24.1 -21.8 36.3 -15.9 M16.9 6.2 Q30.5 .5 39.8 4.2'),
    '#9f7e59', .43, .86);
  stroke(c, svg('M15.8 -20.3 C19.7 -11.7 18.8 -2.4 17.6 2 M35.3 -14.8 Q32.7 -4.7 37.6 2.1'), '#c3976d', .50, .58);
  const mark = svg('M23.6 -9.6 C23.7 -14.9 30.1 -14.4 32 -11 C33.3 -8.5 31.3 -6.5 30.4 -6.2 L30.1 -4.7 L26.2 -4.6 L25.9 -6.2 Q23.6 -7.4 23.6 -9.6 Z');
  part(c, mark, '#543e2d', {line: false, shade: false});
  part(c, ellipse(26.4, -9.2, 1.09, 1.25), '#eddaaf', {line: false, shade: false});
  part(c, ellipse(29.6, -9.2, 1.06, 1.19), '#eddaaf', {line: false, shade: false});
  stroke(c, svg('M24.2 -3.5 L32.7 .9 M31.9 -3.5 L23.5 1.1 M24.1 -4.2 L23.7 -2.9 M33.3 .3 L32.2 1.4 M31.2 -4.2 L32.4 -2.9 M22.8 .4 L23.8 1.7'),
    '#614a34', 1);
  stroke(c, [[11.7, -26.5], [38.7, -17.6]], '#684426', 1.44);
  stroke(c, [[11.6, -26.9], [38.4, -18.03]], '#dca36a', .50);
  stroke(c, svg('M21.2 -24.8 L20.6 -22.1 M22 -24.4 L21.4 -21.8 M39.7 5.2 L41.6 11.2'), '#8f6b42', .55);

  stroke(c, svg('M5.3 8.1 Q14.9 3.8 26.8 5.2 Q32.2 5.5 37.3 7.6'), '#f0c99a', .7, .84);
  stroke(c, svg('M8.2 12.2 Q16.9 17.1 26.5 17 Q37.6 17.7 43.2 13.7'), '#e3aa72', .63);
  part(c, ellipse(...SKIFF_EYE, 1.45, .91, .6), BRASS, {line: '#654b37', width: .57, depth: .43});
  part(c, rect(41.7, 15.3, 2.4, 1.23, .4), '#af8253', {line: '#674b38', width: .42, depth: .54});
  c.restore();
}

export function homeShoreFrames() {
  return {
    'home-mooring-bollard': [32, 27, 4, bollard, {outline: .55}],
    'home-mooring-skiff': [SKIFF_WIDTH, 27 + SAIL_ROOM, 2.5, skiff, {outline: .55}],
  };
}
