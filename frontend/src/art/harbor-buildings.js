// Saltreach paintings keep the original catalog boxes and mount points.
import {ellipse, linear, mix, part, poly, radial, rect, shadow, stroke, svg} from './paint.js';
import {pixelById} from '../pixel/catalog.js';

const EDGE = '#554139';
const BRASS = '#e1b468';
const STONE = ['#eedab2', '#cabe99', '#9a826b'];
const SLATE = ['#56729a', '#304568', '#202d49'];
const JADE = ['#608477', '#38645f', '#24434a'];
const CLAY = ['#b47250', '#924939', '#5f342d'];
const roofOptions = {line: '#493e39', width: .85, shade: false};
const edge = (width = .85) => ({line: EDGE, width, shade: false});
const shape = (c, points, fill, radius = 1, options = edge()) => part(c, poly(points, radius), fill, options);
const box = (c, x, y, w, h, fill, radius = 1, options = edge()) => part(c, rect(x, y, w, h, radius), fill, options);
const fade = (c, a, b, colors) => linear(c, ...a, ...b, [[0, colors[0]], [.52, colors[1]], [1, colors[2]]]);
const by = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function pin(c, x, y, radius = 1) {
  part(c, ellipse(x, y, radius, radius * .86), BRASS, {line: '#80603f', width: .42, depth: .4,
    gloss: ellipse(x - radius * .22, y - radius * .24, radius * .30)});
}

function tiles(c, quad, colors, rows, cols, light) {
  const [a, b, t, d] = quad;
  const at = (u, v) => by(by(a, b, u), by(d, t, u), v);
  c.save(); c.clip(poly(quad, .75));
  shape(c, quad, fade(c, a, t, colors), .8, {line: false});
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? .5 : 0, v0 = row / rows, v1 = (row + 1) / rows;
    for (let column = -1; column < cols; column++) {
      const u = (column + shift) / cols, v = u + 1 / cols;
      const variation = Math.sin(column * 4.07 + row * 5.35) * .09;
      const top = mix(colors[0], colors[1], .24 + (light ? .15 : .38) * (1 + variation) + row * .17 / rows);
      const front = mix(colors[1], colors[2], .15 + Math.cos(row * 2.38 + column * 1.97) * .14);
      const tile = [at(u + .015 / cols, v0), at(v - .015 / cols, v0), at(v - .037 / cols, v1), at(u + .023 / cols, v1)];
      shape(c, tile, fade(c, tile[0], tile[3], [top, mix(top, front, .52), front]), .52,
        {line: colors[2], width: .46, shade: false});
      const near = at(u + .06 / cols, v0 + .09 / rows), far = at(v - .13 / cols, v0 + .09 / rows);
      stroke(c, [near, far], mix(top, '#e3eee9', .24), .44, .55);
    }
  }
  c.restore();
  stroke(c, [...quad, a], colors[2], .85, .9);
}

function roof(c, x, right, peak, eave, colors, {shift = 0, rows = 6, trim = '#b77848'} = {}) {
  const a = [x + 14 + shift, peak + 1.7], b = [right - 11, peak - .4];
  const r = [right - 4, peak - 4], f = [right + 5, eave - 8];
  const g = [right - 10, eave + .8], e = [x - 4, eave - .7];
  const left = x + 14 + shift;
  shape(c, [b, r, f, g], fade(c, r, g, [colors[1], colors[2], '#242b38']), 1.1, roofOptions);
  tiles(c, [b, r, f, g], [colors[1], colors[2], '#243143'], rows, 2, false);
  tiles(c, [a, b, g, e], colors, rows, Math.max(4, Math.floor((right - x) / 12)), true);
  shape(c, [a, [left + 1, peak - 1.2], r, b], mix(colors[0], '#ebe6d2', .20), .75, roofOptions);
  shape(c, [e, g, f, [f[0] - .3, f[1] + 3.8], [g[0] - 1, g[1] + 4.3], [e[0] + 2, e[1] + 4.2]],
    fade(c, [x, eave - 1], [right, eave + 6], [mix(trim, '#ffe0a5', .48), trim, '#766047']), 1.1, roofOptions);
  stroke(c, [[e[0] + 2.6, e[1] + .1], [g[0] - 3, g[1] + .9]], '#f2d1a580', .85);
  for (const pt of [[e[0] + 3, e[1] + 2.4], [g[0] - 3, g[1] + 2.4], [f[0] - 2.2, f[1] + 2.2]]) pin(c, ...pt, .81);
}

function masonry(c, x, y, right, yBase, palette = STONE) {
  // The bright face and the narrow side share courses and converge on the same foot.
  const front = [[x, y], [right - 13, y + 1], [right - 13, yBase], [x, yBase - .9]];
  const flank = [[right - 13, y + 1], [right, y - 5], [right, yBase - 7], [right - 13, yBase]];
  shape(c, flank, fade(c, flank[0], flank[2], [palette[1], palette[2], '#796957']), 1.55);
  shape(c, front, fade(c, [x - 7, y + 1], [right - 14, yBase], palette), 1.5);
  c.save(); c.clip(poly(front, 1.5));
  for (let row = y + 8, i = 0; row < yBase; row += 7.1, i++) {
    stroke(c, [[x, row], [right - 13, row + .45]], '#766149', .59, .38);
    stroke(c, [[x + .5, row + .72], [right - 13, row + 1.1]], '#fdf1ce', .48, .47);
    const offset = i % 2 ? 6 : 15;
    for (let joint = x + offset; joint < right - 14; joint += 17) {
      stroke(c, [[joint, row - 6.4], [joint + .4, row]], '#785f46', .47, .43);
      if (joint + 6 < right - 13) stroke(c, [[joint + 1.4, row - 5.5], [joint + 5.9, row - 5.7]], '#fff0cd', .58, .64);
    }
  }
  c.fillStyle = linear(c, 0, y, 0, y + 13, [[0, '#50423884'], [1, '#66564700']]);
  c.fillRect(x, y, right - 13 - x, 13);
  c.restore();
  for (let row = y + 7; row < yBase; row += 7.5)
    stroke(c, [[right - 12, row], [right - 1.3, row - 5.3]], '#5f554a', .6, .68);

  const sill = [[x - 3.2, yBase - .7], [right - 13, yBase], [right + 2.8, yBase - 7], [right + 2, yBase - 3.1],
    [right - 13, yBase + 2.5], [x - 3.3, yBase + 2.2]];
  shape(c, sill, fade(c, sill[0], sill[3], ['#c9b798', '#9d8d76', '#76675c']), .94);
  stroke(c, [sill[0], sill[1], sill[2]], '#e0cbaa', .75);
  return right - 13;
}

function door(c, x, y, w, h, {planks = ['#bc8c5b', '#88552f', '#5c3927'], stone = false} = {}) {
  box(c, x - 2.1, y - 2.2, w + 4.2, h + 3, stone ? '#a59578' : '#794c37', 3);
  box(c, x, y, w, h, fade(c, [x, y + 3], [x + w, y + h], planks), 2.65, edge(.72));
  for (let k = 1; k < 4; k++) {
    const sx = x + k * w / 4;
    stroke(c, [[sx, y + (k === 2 ? 2 : 3.6)], [sx + .22, y + h - 1.3]], '#372b2a', .53, .66);
    stroke(c, [[sx + .6, y + 7], [sx + .9, y + h - 2]], '#e6bb82', .43, .49);
  }
  for (const t of [.27, .73]) {
    box(c, x + .45, y + h * t, w * .28, 1.8, '#536074', .48, edge(.55));
    pin(c, x + 1.35, y + h * t + .9, .54);
  }
  pin(c, x + w * .72, y + h * .55, 1.23);
}

function stoneSteps(c, x, bottom, w) {
  shape(c, [[x, bottom - 4], [x + w, bottom - 4], [x + w + 2, bottom - 1], [x - 2, bottom - 1]],
    '#d6c5a8', .74, edge(.62));
  shape(c, [[x - 2, bottom - 1], [x + w + 2, bottom - 1], [x + w + 3, bottom + 2.2], [x - 3, bottom + 2.2]],
    '#a39279', .76, edge(.68));
  stroke(c, [[x - 1, bottom - .55], [x + w + 1, bottom - .55]], '#fff1c7', .64, .8);
}

function windowFrame(c, x, y, w, h, {bars = false, timber = false} = {}) {
  box(c, x - 2.25, y - 2.15, w + 4.5, h + 4.3,
    fade(c, [x - 3, y], [x + w + 2, y + h], timber ? ['#c18e5e', '#805a38', '#593d2d'] : ['#e7d4ad', '#b6a088', '#97806b']), 2.6);
  box(c, x, y, w, h, fade(c, [x, y], [x + w, y + h], ['#557c83', '#335965', '#223748']), 1.58, edge(.69));
  shape(c, [[x + .9, y + 1.3], [x + w * .78, y + .9], [x + w * .36, y + h - 1.1], [x + .65, y + h - 3]],
    '#b8dfd650', .53, {line: false});
  for (const share of bars ? [.25, .5, .75] : [.5])
    stroke(c, [[x + w * share, y + .6], [x + w * share, y + h - .3]], bars ? '#645f57' : '#b49667', bars ? 1.25 : 1.15);
  stroke(c, [[x + .5, y + h * .48], [x + w - .5, y + h * .48]], bars ? '#645f57' : '#b49667', bars ? 1.2 : 1.12);
  box(c, x - 2.55, y + h + .55, w + 5.1, 2.65, timber ? '#956344' : '#bea98c', .71, edge(.65));
  stroke(c, [[x - 1.45, y + h + .88], [x + w + 1.6, y + h + .88]], '#ffe6b5', .67, .8);
}

function clock(c, x, y, radius, {ball = false} = {}) {
  part(c, ellipse(x, y, radius + 1.4), fade(c, [x - radius, y - radius], [x + radius, y + radius],
    ['#f0c484', '#aa7544', '#785236']), {line: EDGE, width: .82, shade: false});
  part(c, ellipse(x, y, radius), fade(c, [x - radius, y - radius], [x + radius, y + radius],
    ['#fff2cb', '#e1c694', '#ad875d']), {line: '#694a33', width: .66, shade: false});
  if (ball) {
    stroke(c, svg(`M${x - radius * .80} ${y - radius * .19} Q${x} ${y - radius * .42} ${x + radius * .84} ${y + radius * .24}`),
      '#776750', .68);
    stroke(c, svg(`M${x + radius * .40} ${y - radius * .79} Q${x - radius * .22} ${y - radius * .39} ${x - radius * .27} ${y + radius * .88}`),
      '#776750', .68);
    return;
  }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, u = Math.cos(a), v = Math.sin(a), s = i % 3 === 0 ? .63 : .77;
    stroke(c, [[x + radius * s * u, y + radius * s * v], [x + radius * .87 * u, y + radius * .87 * v]], '#794b35', .65);
  }
  stroke(c, [[x - .2, y - radius * .55], [x, y], [x + radius * .53, y + radius * .26]], '#5c3e31', 1.06);
  pin(c, x, y, .64);
}

function brassLamp(c, x, y) {
  stroke(c, [[x - 2.5, y - 4], [x + .1, y - 4.7], [x, y - 2]], '#6c4d32', 1.02);
  shape(c, [[x - 2.3, y - 1.3], [x + 2.25, y - 1.3], [x + 1.85, y + 2.8], [x - 1.86, y + 2.8]],
    fade(c, [x - 2, y], [x + 2, y + 2.5], ['#ffe1a0', '#e4aa55', '#9c683a']), .44, edge(.57));
  stroke(c, [[x - 2.45, y - 1.4], [x + 2.4, y - 1.4]], '#795935', .74);
  stroke(c, [[x - 2.1, y + 2.85], [x + 2.05, y + 2.85]], '#795935', .74);
}

const OFFICE_PANES = [29.5, 85.5];
function office(c) {
  const g = 146;
  shadow(c, 66, g + 1.2, 54, 7.2, .32);
  shadow(c, 71, g, 45, 3.6, .22);
  masonry(c, 51, 24, 84, 88);
  shape(c, [[45, 25], [64.6, 8], [70.6, 9.4], [87, 24.6], [77, 27.8], [51, 26.6]],
    fade(c, [50, 11], [83, 27], [JADE[0], JADE[1], JADE[2]]), 1.13);
  stroke(c, [[48, 24], [64.9, 10], [83.9, 24.2]], '#93b3a0', 1.09, .8);
  stroke(c, [[63.9, 12.4], [75.9, 23.8]], '#436563', .7);
  clock(c, 64.7, 41.2, 8.1);
  box(c, 53, 54.8, 22.1, 8.3, fade(c, [54, 54], [76, 62.6], ['#bd8b5d', '#946136', '#66442d']), 1.2);
  stroke(c, [[55, 56.5], [72.7, 56.5]], '#e1b17e', .74);
  for (const x of [56.4, 71.7]) pin(c, x, 60.4, .72);

  masonry(c, 20, 91, 112, 144.2);
  shape(c, [[87, 46], [97, 45], [101.5, 48], [100.6, 75], [88, 76]],
    fade(c, [87, 49], [101, 67], ['#d7c1a1', '#b6a085', '#806d5b']), 1.15);
  box(c, 85.4, 44, 16.9, 4, '#b7a18d', .95);
  stroke(c, [[87.5, 44.9], [100.3, 44.9]], '#e9d3b2', .79);
  for (const y of [55, 63.4, 70.7]) stroke(c, [[87.5, y], [100, y - .7]], '#665c4f', .59, .66);
  roof(c, 13.5, 115, 59.8, 92, CLAY, {trim: '#a56749', rows: 6});
  for (const x of OFFICE_PANES) windowFrame(c, x, 112, 12.5, 15.8, {timber: true});
  box(c, 27, 100, 20, 5.9, '#396b6a', 1.02, edge(.7));
  stroke(c, [[29.5, 101.64], [44.5, 101.64]], '#92ad88', .73);
  for (const x of [29, 45]) pin(c, x, 104, .53);
  door(c, 54.4, 111.1, 19.3, 32, {planks: ['#889775', '#5e7157', '#3b4e46']});
  stoneSteps(c, 53.4, g - .2, 22);
  brassLamp(c, 50.2, 115);
  brassLamp(c, 79.3, 115);
  stroke(c, [[108.3, 96], [108.3, 124.5]], '#725236', 1.5);
  shape(c, [[108.4, 97.4], [116, 99.3], [119, 103.2], [108.4, 106]], '#385a71', .82, edge(.66));
  stroke(c, [[109.4, 98.47], [116.1, 100.1]], '#d4ad64', .63);
}

function officeGlow(c) {
  for (const x of OFFICE_PANES) {
    const y = 112, width = 12.5, height = 15.8;
    c.save();
    c.clip(rect(x + .47, y + .47, width - .94, height - .94, 1.45));
    c.fillStyle = radial(c, x + width * .40, y + height * .47, 8.4,
      [[0, '#fff5be'], [.35, '#ffde85f4'], [1, '#d58f48dd']]);
    c.fillRect(x, y, width, height);
    stroke(c, [[x + width * .5, y + .4], [x + width * .5, y + height - .3]], '#92643d', 1.12);
    stroke(c, [[x + .5, y + height * .48], [x + width - .5, y + height * .48]], '#936945', 1.09);
    c.restore();
  }
}

function stallAwning(c) {
  const colors = [
    ['#fff0c9', '#e7d4ac', '#b69773'],
    ['#7aa398', '#47847b', '#2e655f'],
  ];
  const panels = 8;
  for (let panel = 0; panel < panels; panel++) {
    const left = 20 + panel * 12.5, right = left + 12.5, top = 24 + panel * 11.65, roofRight = top + 11.65;
    const topY = 69.1 + panel * .10, frontY = 83.5 + panel * .16;
    const canopy = svg(`M${top} ${topY} L${roofRight} ${topY + .1} Q${right - 4} ${frontY - 5} ${right} ${frontY} L${left} ${frontY - .15} Q${left + 1.9} ${frontY - 5} ${top} ${topY} Z`);
    const hem = svg(`M${left} ${frontY - .15} L${right} ${frontY} L${right - .9} ${frontY + 3.65} Q${right - 1.3} ${frontY + 6.35} ${left + 7} ${frontY + 6.15} Q${left + 1.9} ${frontY + 6.85} ${left + .7} ${frontY + 4.8} Z`);
    const palette = colors[panel % 2];
    part(c, canopy, fade(c, [top, topY], [left + 1.8, frontY], palette), {line: '#706852', width: .58, shade: false});
    part(c, hem, fade(c, [left, frontY], [right, frontY + 6], [palette[1], palette[2], mix(palette[2], '#60483f', .25)]), edge(.46));
    stroke(c, [[left + .75, frontY + .24], [right - .82, frontY + .34]], '#ffe4ba', .64, .64);
    stroke(c, [[left + 1.6, frontY + 4.7], [right - 2, frontY + 5.2]], '#e3ca9d', .48, .48);
  }
  stroke(c, [[24, 69.25], [117.5, 70.05]], '#72573c', 1.09, .86);
}

function market(c) {
  const g = 116;
  shadow(c, 72, g + 1.55, 63, 7, .27);
  shadow(c, 79, g, 54, 3.1, .18);
  masonry(c, 16, 62.7, 128, g - .38);
  box(c, 28, 77, 83, 34, fade(c, [28, 76], [110, 110], ['#605548', '#453e37', '#29392f']), 2.5);
  box(c, 80, 81, 25.5, 33.1, fade(c, [82, 82], [106, 117], ['#312d2a', '#3d372d', '#625345']), 2.7);
  stroke(c, [[81.7, 84.5], [81.7, 112.7]], '#8e7759', 1.4, .88);
  stroke(c, [[86.7, 104.4], [96.2, 104.3], [101.3, 103.5]], '#877153', .79, .75);
  stoneSteps(c, 80.6, g - .95, 25.8);
  box(c, 29, 96.8, 44.5, 12.25, fade(c, [29, 96], [69, 109], ['#b67c4c', '#8f5b37', '#684330']), 1.25);
  for (const x of [33.1, 43.6, 54.2, 64.7]) {
    box(c, x, 98.25, 6.6, 8.3, '#975f3c', .65, edge(.49));
    stroke(c, [[x + .65, 98.85], [x + .7, 105.35]], '#d7a174', .58, .72);
  }
  for (const [x, fill] of [[33.2, '#af7953'], [46.5, '#8e9481'], [58.8, '#c19c56']]) {
    const pot = svg(`M${x} 95.1 Q${x - 3} 91.9 ${x + 1.5} 89.75 L${x + 2.1} 87.5 L${x + 7} 87.55 L${x + 7.6} 89.9 Q${x + 11} 92.6 ${x + 9.6} 95.4 Z`);
    part(c, pot, fill, {line: '#604436', width: .59, depth: 1, gloss: ellipse(x + 2.85, 91.7, .8, 1.1)});
    stroke(c, [[x + 2, 88.22], [x + 7.05, 88.28]], '#e6b58d', .61);
  }
  shape(c, [[26.6, 93.8], [70.8, 93.9], [75.7, 97.1], [27.6, 97.65]], '#c08a58', .88);
  stroke(c, [[28.6, 94.4], [69.3, 94.5]], '#f4c392', .73);
  for (const x of [25.2, 73.9, 111.7]) {
    box(c, x, 75.5, 3.8, 38.4, fade(c, [x, 83], [x + 3.8, 95], ['#d1955e', '#a56b43', '#634531']), .8);
    stroke(c, [[x + .82, 91], [x + .94, 111]], '#ddad79', .57, .8);
    pin(c, x + 2.05, 109.8, .61);
  }
  stallAwning(c);
  roof(c, 12, 131, 24.7, 64.4, JADE, {trim: '#997b52', rows: 7});
}

function flag(c, x, y, direction, color) {
  stroke(c, [[x, y + 1], [x, y + 46]], '#755333', 1.37);
  stroke(c, [[x - .26, y + 1], [x - .26, y + 24]], '#d7ae77', .55);
  const right = x + direction * 11.7, middle = x + direction * 7;
  const cloth = svg(`M${x} ${y + 2} Q${middle} ${y + 1} ${right} ${y + 5} L${middle} ${y + 7.3} L${right - direction} ${y + 11.2} Q${middle} ${y + 8.8} ${x} ${y + 11.6} Z`);
  part(c, cloth, fade(c, [x, y + 2], [right, y + 12], [mix(color, '#f5c587', .32), color, mix(color, '#583837', .43)]),
    {line: '#734f3d', width: .71, shade: false});
  pin(c, x, y + .5, 1.35);
  stroke(c, [[x + direction, y + 2.78], [middle, y + 3.34]], '#efc682', .54);
}

function pavilion(c) {
  const g = 116;
  shadow(c, 72, g + 1.5, 62, 6.65, .28);
  masonry(c, 15.2, 62, 129, g - .25);
  // Both flags sit behind the original pavilion roof.
  flag(c, 28, 13.5, 1, '#b65b49');
  flag(c, 114.8, 13.5, -1, '#63838a');
  roof(c, 12.2, 131.8, 24.7, 65.6, SLATE, {trim: '#ab794c', rows: 7});
  for (const x of [27, 104]) windowFrame(c, x, 86.7, 11.5, 15.1, {timber: true});
  clock(c, 71.5, 77.4, 7.4, {ball: true});
  door(c, 63.1, 89.2, 17.45, 24.6, {planks: ['#66807d', '#436470', '#334656']});
  stoneSteps(c, 62.3, g - .55, 20);
  brassLamp(c, 57, 91.5);
  brassLamp(c, 86, 91.5);
}

function jail(c) {
  const g = 100;
  shadow(c, 56, g + 1.15, 46.4, 6.6, .29);
  masonry(c, 15, 53.2, 97.9, g - .7, ['#d1c6ae', '#a69f8b', '#817f74']);
  roof(c, 12, 99, 24.5, 55.4, ['#6f7883', '#4d5665', '#353746'], {trim: '#8b7358', rows: 6});
  box(c, 40.6, 64.5, 29.9, 7.2, fade(c, [41, 63], [70, 72], ['#816c50', '#685841', '#4b443d']), 1.29);
  stroke(c, [[43.6, 66.1], [66.7, 66.2]], '#d1b98a', .68, .8);
  pin(c, 43.1, 69.9, .54);
  pin(c, 67.9, 69.9, .54);
  windowFrame(c, 22.4, 75.6, 11.6, 15, {bars: true});
  windowFrame(c, 72.6, 75.6, 9.15, 15.1, {bars: true});
  door(c, 46.8, 74.4, 17.6, 24.1, {stone: true, planks: ['#8d8d7c', '#535e59', '#384646']});
  stoneSteps(c, 44.5, g - .8, 22.1);
}

function kiosk(c) {
  const g = 84;
  shadow(c, 40, g + 1.6, 32.3, 5, .28);
  masonry(c, 15, 46, 67.4, g - .7);
  const top = 52.45;
  box(c, 20, top, 39.2, 20.1, fade(c, [19, 50], [59, 72], ['#a38058', '#775a43', '#4a3a31']), 1.74);
  box(c, 22.5, top + 2.2, 34.2, 15.35, fade(c, [22, top], [57, top + 17], ['#9f9c76', '#77795c', '#5c6351']), 1.08);
  // Folded papers in the two small bays are painted decoration.
  for (const [x, y, tilt] of [[24.5, 59.3, -.7], [32.7, 57.7, .6], [40.9, 60.6, -.4], [47.7, 57.95, .74]]) {
    shape(c, [[x, y], [x + 6, y + tilt], [x + 5.8, y + 7.3 + tilt], [x - .5, y + 7.6]], '#d6c096', .58,
      {line: '#8c7353', width: .42, shade: false});
    stroke(c, [[x + .8, y + 2.7], [x + 4.8, y + 2.7 + tilt]], '#917c5c', .52);
    stroke(c, [[x + .8, y + 4.9], [x + 4.1, y + 4.7 + tilt]], '#a58f6a', .44);
  }
  box(c, 17.9, 71.2, 44.2, 4.4, fade(c, [18, 71], [61, 75], ['#deb584', '#a97548', '#704b37']), .87);
  stroke(c, [[20.2, 71.87], [59.6, 71.95]], '#efd0a1', .67);
  for (const x of [19.9, 57.9]) pin(c, x, 73.97, .61);
  roof(c, 12.4, 68.5, 24.1, 47.1, CLAY, {trim: '#986748', rows: 5, shift: -1.6});
}

function signal(c) {
  const g = 100;
  shadow(c, 56, g + 1.15, 43, 5.6, .26);
  const mast = 56.4;
  stroke(c, [[mast, 6], [mast, 47]], '#5e4739', 2.1);
  stroke(c, [[mast - .4, 7], [mast - .4, 41]], '#be8d61', .73);
  pin(c, mast, 6, 1.35);
  for (const [y, width] of [[12, 13.2], [19.7, 18.8], [28.2, 23.1]]) {
    stroke(c, [[mast - width / 2, y], [mast + width / 2, y - .8]], '#775b47', 1.33);
    stroke(c, [[mast - width / 2 + .65, y - .12], [mast + width / 2 - .65, y - .85]], '#c4aa79', .51);
    pin(c, mast, y - .36, .71);
  }
  masonry(c, 21.25, 56, 94.1, g - .88);
  roof(c, 17.15, 96.7, 37.8, 58, JADE, {trim: '#b38b60', rows: 4, shift: -2.15});
  windowFrame(c, 32, 70, 9.33, 12.4);
  windowFrame(c, 74.2, 70.3, 6.65, 12.15);
  door(c, 51, 75.4, 13.5, 22.5);
  stoneSteps(c, 48.5, g - .82, 19.5);
  brassLamp(c, 68.7, 78.6);
}

function beacon(c) {
  const g = 114;
  shadow(c, 32, g + 1.4, 23, 5.4, .29);
  const wall = [[22.6, 47], [42.8, 47], [47.7, g - 2], [17, g - 1.5]];
  shape(c, wall, fade(c, [23, 52], [48, 105], ['#e5d5ad', '#c2b590', '#9a8d78']), 1.8);
  c.save(); c.clip(poly(wall, 1.8));
  const band = [[17.2, 76.9], [44.5, 75.55], [47.5, 91.2], [16.8, 91.75]];
  shape(c, band, fade(c, [20, 76], [46, 91.5], ['#be7a58', '#a26348', '#735343']), .74, {line: false});
  shape(c, [[34.3, 47], [43.4, 46.6], [49.15, 114], [36.4, 113.4]],
    linear(c, 34.4, 64, 46, 68, [[0, '#53666f43'], [1, '#475c6f8b']]), .95, {line: false});
  for (const [i, y] of [58.7, 69.1, 80.5, 88.8, 99.7, 107.4].entries()) {
    const left = 21.7 - (y - 54) * .075, mid = i % 2 ? 32.2 : 26.4;
    stroke(c, [[left, y], [38.3, y - .22], [46.9, y - 1.8]], '#645649', .6, .53);
    stroke(c, [[mid, y - 7.2], [mid + .5, y]], '#695748', .51, .55);
    stroke(c, [[left + 1.05, y + 1], [31.4, y + .97]], '#f1d7b2', .59, .65);
  }
  c.restore();
  shape(c, [[14.7, 112.4], [46.3, 111.8], [50, 113.5], [48.7, 116.9], [15.1, 117.5], [13.5, 115.5]],
    fade(c, [14, 112], [48, 117], ['#c5b899', '#a3947b', '#827465']), 1.05);
  door(c, 27.4, 97.05, 9.3, 15.9, {planks: ['#64837f', '#526d63', '#3b524c']});
  stoneSteps(c, 25.8, g - .65, 13.5);

  box(c, 18.6, 27.7, 26.8, 18.45, fade(c, [19, 28], [45, 47], ['#638489', '#467077', '#385467']), 1.25);
  for (const x of [21.5, 32.7]) {
    box(c, x, 30.1, 8.25, 12.45, fade(c, [x, 30.1], [x + 8.25, 42.55], ['#ebdb9d', '#bfad71', '#8f7853']), 1.08, edge(.55));
    shape(c, [[x + .77, 31.0], [x + 5.3, 31.0], [x + 1.0, 38.7]], '#fff3c4a0', .52, {line: false});
    stroke(c, [[x + 4.3, 30.56], [x + 4.45, 42.08]], '#78694d', .55);
  }
  box(c, 17.6, 44.3, 29.8, 4.2, '#a38564', 1.03);
  stroke(c, [[19.7, 45.05], [45.75, 45.05]], '#dbbc88', .66);
  shape(c, [[15.7, 27.6], [31.2, 15.05], [35.4, 15.2], [48.2, 26.35], [44.6, 29.2], [19.1, 29.4]],
    fade(c, [16, 19], [46, 29], [SLATE[0], JADE[1], JADE[2]]), 1.27);
  stroke(c, [[18, 27.1], [31.75, 16.55], [44.9, 26.35]], '#b0b794', .85, .84);
  stroke(c, [[32.8, 16.2], [35.2, 25.8]], '#28464d', .63);
  stroke(c, [[32, 15.1], [32, 7]], '#6c5034', 1.39);
  pin(c, 32, 7.35, 1.44);
}

function pierPost(c, x, y, tall = 14) {
  const top = y - tall;
  box(c, x - 2.1, top + 1.7, 4.2, tall - 1,
    fade(c, [x - 2.1, top], [x + 2.1, y], ['#c29462', '#9a6d47', '#58443a']), 1.41, edge(.68));
  part(c, ellipse(x, top + 1.74, 2.35, 1.64), '#c59766', {line: '#715439', width: .54, depth: .52,
    gloss: ellipse(x - .36, top + 1.31, 1.28, .52)});
  const rope = svg(`M${x - 2.15} ${top + 4.3} Q${x} ${top + 5.4} ${x + 2.1} ${top + 4.75} M${x - 2.12} ${top + 5.48} Q${x} ${top + 6.55} ${x + 2.2} ${top + 5.82}`);
  stroke(c, rope, '#6b543b', 1.15);
  stroke(c, rope, '#c7ac76', .61);
}

function ferryPier(c) {
  const left = 17, right = 78, back = 38.7, front = 115;
  const top = [[left + 1.8, back], [right - 2.25, back - 1.1], [right, front - 2.5], [left - .65, front]];
  const wetWood = ['#be8b59', '#9e7047', '#79583f'];
  const dryWood = ['#d2a575', '#b28756', '#86613f'];
  for (const [x, y] of [[21, 56], [74, 54], [14.4, 108.5], [80.6, 106.6]]) {
    shape(c, [[x - 1.7, y - 4], [x + 2.1, y - 3], [x + 2.8, y + 7],
      [x - 1.4, y + 8]], '#695244', .84, edge(.57));
    stroke(c, [[x - .85, y - 1.1], [x - .1, y + 6.1]], '#97795b', .62, .72);
  }
  stroke(c, svg('M12 117.5 Q29 121.7 50 120.5 T84 115.8 M22.5 123 Q47 126.6 73 122'), '#b9dfcf', .8, .57);
  stroke(c, svg('M15 120 Q30 123.3 42 122.9 M77 119.3 L82.5 117.65'), '#4a8d84', .79, .68);
  shape(c, [[left - .65, front], [right, front - 2.5], [right - .3, front + 1.85], [left - .25, front + 4.65]],
    fade(c, [left, front], [right, front + 4.65], ['#9b744c', '#785c43', '#57463d']), 1.06);
  shape(c, top, fade(c, top[0], top[2], wetWood), .9);
  for (let row = 0; row < 13; row++) {
    const from = row / 13, to = (row + 1) / 13;
    const a = by(top[0], top[3], from), b = by(top[1], top[2], from);
    const d = by(top[0], top[3], to), t = by(top[1], top[2], to);
    const ramp = row % 3 ? dryWood : wetWood;
    const plank = [a, b, t, d];
    shape(c, plank, fade(c, a, t, ramp), .43, {line: '#604a39', width: .7, shade: false});
    const lo = by(a, d, .23), hi = by(b, t, .23);
    stroke(c, [[lo[0] + 1.7, lo[1]], [hi[0] - 1.2, hi[1]]], '#ecc695', .7, .79);
    const start = 22 + (row * 13.14) % 29;
    stroke(c, svg(`M${start} ${a[1] + 2.7} q7.1 -1.5 16 -1.15`), '#75513b', .62, .6);
    for (const x of [a[0] + 2.8, b[0] - 2.9])
      part(c, ellipse(x, a[1] + 2.78, .63), '#775a41', {line: false, shade: false});
  }
  shape(c, [[37, 8.85], [57.8, 8], [59.8, 38.6], [35.7, 40.1]],
    fade(c, [36, 9], [59, 39], dryWood), .8);
  for (const y of [13, 18, 23, 28, 33, 38]) {
    stroke(c, [[37.2, y + .58], [58.3, y - .35]], '#76553c', .84);
    stroke(c, [[37.6, y - .24], [57.7, y - .94]], '#dfb484', .59, .89);
  }
  // Timbers and ties cast little shadows across the deck at the mooring points.
  for (const [x, y] of [[14.8, 59.8], [79.4, 58.8], [14.5, 116.1], [80.2, 112.9]]) pierPost(c, x, y);
  for (const [x, y, rise] of [[14.3, 48, 1], [79.3, 47.35, -.13]]) {
    const rope = svg(`M${x} ${y} Q${x + rise * 2.6} ${y + 25} ${x} ${y + 55}`);
    stroke(c, rope, '#604937', 1.39);
    stroke(c, rope, '#cfb37d', .6, .92);
  }
}

const drawings = {
  'harbour-office': office,
  'harbour-office-glow': officeGlow,
  'harbour-beacon': beacon,
  'ferry-pier': ferryPier,
  'market-hall': market,
  'sports-pavilion': pavilion,
  jail,
  'prediction-kiosk': kiosk,
  'signal-station': signal,
};

// The standalone pixel library still uses its original drawings. Only Saltreach selects these.
const harborId = asset => `saltreach-${asset}`;
export const harborArtId = asset => Object.hasOwn(drawings, asset) ? harborId(asset) : asset;
export function harborBuildingFrames() {
  return Object.fromEntries(Object.entries(drawings).map(([id, draw]) => {
    const {width, height, size} = pixelById[id];
    return [harborId(id), [width, height, Math.round(height * size[2]), draw,
      {outline: id === 'harbour-office-glow' || id === 'ferry-pier' ? 0 : .55}]];
  }));
}
