import {ellipse, linear, part, rect, shadow, stroke, svg} from './paint.js';

const INK = '#3c2927', WOOD = '#a86c42', BRASS = '#c29a5e';

// The rope joins these painted eyes. Coordinates are in each frame's logical pixels.
export const MOORING_EYES = Object.freeze({
  'home-mooring-bollard': Object.freeze([17, 13]),
  'home-mooring-skiff': Object.freeze([6.7, 10.9]),
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
  shadow(c, 25, 24.6, 15.1, 1.5, .19);
  const hull = svg('M3.4 8.3 C11 11.4 28.1 12.3 44.8 12.2 Q46.1 15.2 44.5 18.7 Q42.1 23.1 33.6 24.5 C20.5 26.3 8.2 22.2 3.4 8.3 Z');
  const plankShade = linear(c, 19, 9, 22, 25, [[0, '#698899'], [.48, '#4c6780'], [.77, '#304760'], [1, '#243950']]);
  part(c, hull, plankShade, {line: '#283641', width: 1, shade: false});
  stroke(c, svg('M8.5 16.8 Q18.4 22.1 30.4 22.7 Q38.4 22.9 42.1 20.4'), '#263b50', .72);
  stroke(c, svg('M10.6 18.3 Q19.3 22.6 28.6 23.1'), '#688292', .48, .64);

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
  const oilskin = svg('M30.8 10 Q33.9 8.7 37.6 10.9 L36 14.4 Q33.5 15.5 29.7 13.7 Z');
  part(c, oilskin, '#517185', {line: '#354c61', width: .67, depth: .88});
  stroke(c, svg('M31.4 10.8 Q34.1 10.7 36.1 11.9 M32.4 11.6 L31.5 13.4'), '#a4bab7', .45, .65);
  c.restore();

  stroke(c, svg('M5.3 8.1 Q14.9 3.8 26.8 5.2 Q32.2 5.5 37.3 7.6'), '#f0c99a', .7, .84);
  stroke(c, svg('M8.2 12.2 Q16.9 17.1 26.5 17 Q37.6 17.7 43.2 13.7'), '#e3aa72', .63);
  part(c, ellipse(...MOORING_EYES['home-mooring-skiff'], 1.45, .91, .6), BRASS, {line: '#654b37', width: .57, depth: .43});
  part(c, rect(41.7, 15.3, 2.4, 1.23, .4), '#af8253', {line: '#674b38', width: .42, depth: .54});
}

export function homeShoreFrames() {
  return {
    'home-mooring-bollard': [32, 27, 4, bollard, {outline: .55}],
    'home-mooring-skiff': [48, 27, 2.5, skiff, {outline: .55}],
  };
}
