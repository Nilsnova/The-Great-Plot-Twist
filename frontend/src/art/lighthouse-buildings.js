// Paint the live outpost on its existing sprite boxes. The legacy asset IDs remain available to other callers.
import {pixelById} from '../pixel/catalog.js';
import {ellipse, linear, mix, part, poly, radial, rect, shadow, stroke, svg} from './paint.js';

const EDGE = '#503e35';
const STONE = ['#f3dcaf', '#c6af89', '#8a7767'];
const SLATE = ['#6687aa', '#3b5478', '#243149'];
const CEDAR = ['#e2ae6d', '#a96c41', '#604235'];
const JADE = ['#8a9b77', '#526953', '#353e3e'];

const fill = (c, path, color, width = .9) => part(c, path, color, {shade: false, line: EDGE, width});
const face = (c, points, color, radius = 1.1) => fill(c, poly(points, radius), color);
const block = (c, x, y, w, h, color, r = 1) => fill(c, rect(x, y, w, h, r), color);
const shade = (c, a, b, colors) => linear(c, ...a, ...b, [[0, colors[0]], [.5, colors[1]], [1, colors[2]]]);
const between = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function rivet(c, x, y, r = 1) {
  part(c, ellipse(x, y, r, r * .92), '#dea551', {line: '#775133', width: .44, depth: .46,
    gloss: ellipse(x - r * .23, y - r * .27, r * .31)});
}

function timber(c, from, to, width) {
  stroke(c, [from, to], EDGE, width + 1.5);
  stroke(c, [from, to], shade(c, [from[0] - width / 2, from[1]], [from[0] + width / 2, from[1] + 1], CEDAR), width);
  const dx = (to[1] - from[1]) * .021, dy = (to[0] - from[0]) * .021;
  stroke(c, [[from[0] - dx, from[1] - dy], [to[0] - dx, to[1] - dy]], '#eed29c', .63, .8);
}

function roofTiles(c, quad, columns, rows, palette = SLATE) {
  const [a, b, d, e] = quad;
  const at = (u, v) => between(between(a, b, u), between(e, d, u), v);
  const shape = poly(quad, 1.2);
  fill(c, shape, shade(c, a, d, palette), 1.0);
  c.save(); c.clip(shape);
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? .52 : 0;
    const v = row / rows, next = (row + 1) / rows;
    for (let col = -1; col < columns; col++) {
      const l = (col + shift) / columns, r = l + 1 / columns;
      const top = at(l + .055 / columns, v), right = at(r - .032 / columns, v);
      const lower = at(r - .06 / columns, next), left = at(l + .035 / columns, next);
      const tone = .27 + .15 * Math.sin(row * 2.58 + col * 2.01) + row * .19 / rows;
      const light = mix(palette[0], palette[1], tone);
      part(c, poly([top, right, lower, left], .64), shade(c, top, lower,
        [light, mix(light, palette[1], .63), mix(palette[1], palette[2], .39)]),
      {line: palette[2], width: .48, shade: false});
      stroke(c, [at(l + .10 / columns, v + .09 / rows), at(r - .15 / columns, v + .09 / rows)],
        mix(light, '#e2ece9', .28), .48, .72);
    }
  }
  c.restore();
}

function eaves(c, a, b, width = 3.5) {
  const near = [a[0] + 1.7, a[1] + width], far = [b[0] - 1.2, b[1] + width];
  face(c, [a, b, far, near], shade(c, a, near, CEDAR), .8);
  stroke(c, [[a[0] + 2, a[1] + .8], [b[0] - 2, b[1] + .8]], '#eaca91', .76, .88);
  rivet(c, a[0] + 3.9, a[1] + width * .52, .7);
  rivet(c, b[0] - 3.8, b[1] + width * .52, .7);
}

function stonework(c, quad, rows, columns, palette = STONE) {
  const [a, b, d, e] = quad;
  const outline = poly(quad, 1.5), at = (u, v) => between(between(a, b, u), between(e, d, u), v);
  fill(c, outline, shade(c, a, d, palette));
  c.save(); c.clip(outline);
  for (let row = 0; row < rows; row++) {
    const vertical = row / rows, next = (row + 1) / rows;
    const offset = row % 2 ? .52 : .03;
    for (let i = -1; i < columns; i++) {
      const l = (i + offset) / columns, r = l + 1 / columns;
      const variation = .18 + .12 * Math.sin(row * 5.7 + i * 2.1);
      const top = at(l, vertical), right = at(r - .048 / columns, vertical), bottom = at(r - .014 / columns, next - .062 / rows);
      const left = at(l + .014 / columns, next - .05 / rows);
      const stone = mix(palette[0], palette[1], variation + vertical * .44);
      part(c, poly([top, right, bottom, left], .76), shade(c, top, bottom, [stone, mix(stone, palette[1], .54), palette[1]]),
        {line: palette[2], width: .46, shade: false});
      stroke(c, [at(l + .11 / columns, vertical + .10 / rows), at(r - .19 / columns, vertical + .110 / rows)],
        mix(stone, '#fff0c2', .31), .42, .73);
    }
  }
  c.restore();
}

function woodBoards(c, x, y, w, h, edge = 7) {
  for (let i = 0, offset = edge; offset <= w - edge / 2; i++, offset += edge) {
    stroke(c, [[x + offset, y + 1], [x + offset + .24 * (i % 3 - 1), y + h - 1]], '#50392e', .79, .8);
    stroke(c, [[x + offset + .78, y + 2], [x + offset + .83, y + h - 2]], '#dfae78', .64, .57);
  }
}

function cottageDoor(c) {
  const surround = svg('M51 114V86Q52 76 64 76Q76 76 77 86V114Z');
  fill(c, surround, shade(c, [52, 81], [75, 114], STONE));
  const opening = svg('M55 112V86Q57 80 64 80Q72 81 73 86V112Z');
  fill(c, opening, shade(c, [55, 85], [73, 111], CEDAR));
  c.save(); c.clip(opening); woodBoards(c, 54, 81, 21, 31, 5.4); c.restore();
  stroke(c, [[56, 108], [72, 108]], '#764d38', 1.1);
  rivet(c, 68.5, 99.4, 1.23);
}

const COTTAGE_WINDOWS = [29, 85];
function cottageWindow(c, x, lit) {
  const light = rect(x + 1.8, 80.4, 11.9, 15.7, .9);
  if (!lit) {
    block(c, x - 1, 78, 17, 20, shade(c, [x, 79], [x + 16, 99], CEDAR), 1.4);
    fill(c, light, shade(c, [x + 1, 80], [x + 11, 96], ['#7f9a9d', '#50676e', '#33454e']), .64);
    stroke(c, [[x + 2.6, 81.7], [x + 7.6, 81.7]], '#d1d9be', .72, .81);
  } else {
    part(c, light, radial(c, x + 6.4, 88.1, 12, [[0, '#fff0a8'], [.64, '#efbd5d'], [1, '#98644a']]),
      {shade: false, line: false, alpha: .95});
  }
  stroke(c, [[x + 7.7, 81], [x + 7.7, 95.6]], '#795739', .99);
  stroke(c, [[x + 2.1, 88.6], [x + 13.1, 88.6]], '#795739', .99);
}

function cottage(c) {
  shadow(c, 65, 115.5, 52, 7.3, .24);
  shadow(c, 61, 115, 43, 3.1, .22);
  stonework(c, [[94, 57], [111, 52], [111, 106], [97, 112]], 6, 2,
    ['#b39b7d', '#998466', '#756451']);
  stonework(c, [[21, 59], [98, 59], [98, 112], [21, 112]], 6, 5);
  c.fillStyle = linear(c, 0, 61, 0, 76, [[0, '#6544399a'], [1, '#71534200']]);
  c.fillRect(21.5, 60, 76, 16);
  face(c, [[19, 105], [92, 105], [101, 111], [96, 115], [19, 115], [16, 112]],
    shade(c, [19, 103], [95, 117], ['#cbb492', '#b09472', '#776350']));
  face(c, [[98, 107], [111, 103], [113, 108], [100, 115], [94, 114]], '#9c845f');
  cottageDoor(c);
  face(c, [[51, 111], [72, 111], [78, 115], [74, 118], [49, 118], [46, 116]],
    shade(c, [52, 111], [72, 119], ['#ddc7a2', '#b8a080', '#8a745e']));
  COTTAGE_WINDOWS.forEach(x => {
    cottageWindow(c, x, false);
    block(c, x - 3, 97, 21, 4.4, shade(c, [x, 95], [x, 102], CEDAR), .9);
    for (const [dx, dy] of [[0, 0], [3.2, -1.5], [7.2, 0], [11.8, -1], [15.6, .4]]) {
      part(c, ellipse(x + dx, 102 + dy, 2.65, 1.3, -.3), '#62834b', {line: '#52633d', width: .44, depth: .72});
    }
  });
  roofTiles(c, [[93, 25], [100, 25], [118, 56], [102, 61]], 3, 6,
    ['#547299', '#324a6b', '#202c43']);
  roofTiles(c, [[28, 25], [94, 25], [103, 59], [9, 58]], 8, 6);
  face(c, [[86, 14], [92, 15], [92, 39], [86, 39]], '#ad9272');
  face(c, [[92, 15], [99, 12], [100, 36], [92, 39]], '#8b735e');
  face(c, [[85, 13], [89, 10.8], [99, 11], [101, 14], [98, 17], [84, 16]], '#cbbb9b');
  stroke(c, [[87, 25], [92, 26], [98, 24]], '#76634f', .82);
  eaves(c, [9, 58.2], [103, 59]); eaves(c, [103, 59], [118, 56], 3.9);
}

function cottageGlow(c) {
  COTTAGE_WINDOWS.forEach(x => cottageWindow(c, x, true));
}

function cottageInterior(c) {
  shadow(c, 65, 113, 51, 6.1, .23);
  const floor = poly([[18, 34], [110, 34], [112, 111], [103, 115], [18, 115]], 2.3);
  fill(c, floor, shade(c, [19, 38], [112, 116], ['#c0915d', '#9d6f48', '#74513a']), 1.15);
  c.save(); c.clip(floor);
  for (let i = 0; i < 10; i++) {
    const y = 39 + 7.8 * i;
    stroke(c, [[19, y], [111, y + .42]], '#6a4730', .99, .92);
    stroke(c, [[20, y + .98], [111, y + 1.24]], '#e4af74', .63, .68);
    for (let x = 23 + (i % 3) * 7.2; x < 105; x += 24)
      stroke(c, [[x, y + 1.1], [x + .25, y + 7.35]], '#754b34', .7, .8);
  }
  c.fillStyle = linear(c, 0, 34, 0, 58, [[0, '#5e4838a1'], [1, '#603f3000']]);
  c.fillRect(17, 34, 95, 25); c.restore();
  face(c, [[17, 34], [103, 33], [111, 30], [113, 38], [106, 41], [19, 41]], '#d6bd91');
  face(c, [[17, 34], [24, 38], [24, 107], [19, 114], [17, 111]], '#aa906f');
  face(c, [[103, 41], [112, 37], [113, 108], [109, 113], [104, 109]], '#b19777');
  block(c, 103, 46, 8.8, 19, '#526c6a', 1.3);
  stroke(c, [[105, 47.8], [105.5, 60.8]], '#d6cca2', .82);
  shadow(c, 40, 86, 14.7, 3.3, .33);
  block(c, 29, 49, 23, 37, shade(c, [30, 50], [51, 89], CEDAR), 2.7);
  block(c, 31, 53, 19, 30, '#e0c5a0', 2.35);
  block(c, 33, 55, 14.7, 8.7, '#ffedc9', 2.1);
  face(c, [[32, 63], [48, 62], [50, 80], [47, 83], [31, 80]],
    shade(c, [32, 62], [49, 82], ['#7092ac', '#566a80', '#394e66']));
  stroke(c, [[34, 64], [47, 64]], '#e1c78e', 1.2);
  shadow(c, 97, 89, 15, 3.7, .28);
  face(c, [[84, 74], [105, 69], [111, 73], [109, 84], [86, 89], [84, 84]], '#8e593c');
  face(c, [[83, 72], [104, 67], [111, 70], [109, 78], [88, 83], [83, 80]],
    shade(c, [83, 72], [110, 83], CEDAR));
  face(c, [[87, 74], [96, 71], [101, 72], [101, 76], [88, 79]], '#efdbad', .56);
  stroke(c, [[91, 75], [97, 74]], '#95805f', .55);
  block(c, 103, 71, 3, 4, '#4c6862', .6);
  face(c, [[22, 110], [46, 111], [47, 115], [20, 115]], '#b49b78');
  face(c, [[80, 111], [104, 108], [111, 113], [81, 115]], '#a48b6d');
}

function boathouse(c) {
  shadow(c, 47, 88, 40, 5.7, .25);
  face(c, [[13, 41], [72, 40], [83, 36], [83, 83], [72, 88], [13, 88]],
    shade(c, [13, 43], [84, 88], JADE));
  face(c, [[72, 45], [83, 41], [83, 82], [72, 88]], '#536352');
  woodBoards(c, 14, 43, 57, 42, 7.7);
  timber(c, [14, 44], [14, 84], 4.5); timber(c, [73, 44], [72, 85], 4.6);
  face(c, [[13, 84], [74, 85], [83, 81], [85, 86], [74, 90], [12, 90], [10, 87]], '#b29a79');
  block(c, 23, 54, 48, 34, shade(c, [24, 55], [72, 86], CEDAR), 2.5);
  block(c, 27, 58, 39, 27, shade(c, [27, 58], [66, 86], JADE), 1.55);
  woodBoards(c, 28, 59, 37, 25, 6.6);
  stroke(c, [[47, 58], [47, 84]], '#3b3e36', 1.7);
  timber(c, [29, 60], [44.5, 82], 2.65); timber(c, [64, 60], [49.5, 82], 2.65);
  rivet(c, 43.2, 72.7, .9); rivet(c, 50.5, 72.7, .9);
  roofTiles(c, [[66, 18], [72, 18], [88, 42], [75, 44]], 2, 5, ['#526b85', '#374859', '#283543']);
  roofTiles(c, [[25, 18], [68, 18], [76, 43], [8, 43]], 6, 5);
  eaves(c, [8, 43], [76, 43]); eaves(c, [76, 43], [88, 41.5], 3.2);
  block(c, 38.5, 29.8, 15, 7.3, shade(c, [39, 29], [53, 38], CEDAR), 1.2);
  stroke(c, [[40.3, 33.5], [51.2, 33.5]], '#4a4337', 1.1);
}

function lighthouse(c) {
  shadow(c, 48, 193, 35, 7.5, .27);
  stonework(c, [[31, 68], [54, 67], [58, 189], [27, 190]], 15, 3);
  stonework(c, [[54, 67], [65, 64], [71, 187], [58, 189]], 15, 2,
    ['#b9a689', '#a18e77', '#786854']);
  const band = poly([[28.7, 124], [57, 123.5], [68.1, 121], [69.1, 142], [57.9, 146], [28.1, 146.4]], 1);
  fill(c, band, shade(c, [29, 125], [68, 146], ['#c28b5d', '#a2664f', '#745245']));
  c.save(); c.clip(band);
  stroke(c, [[29, 132.2], [56.3, 131.8], [69, 128.9]], '#854e3e', .78, .85);
  stroke(c, [[29, 140], [57, 139.3], [69, 137]], '#e2ac70', .67, .74);
  c.restore();
  const doorway = svg('M39 191L40 171Q41 165 48 165Q56 165 57 171V191Z');
  fill(c, doorway, shade(c, [39, 168], [56, 191], STONE), 1.05);
  const door = svg('M42 190L42.5 172Q43.5 169 48.1 169Q53.5 169 54 172L54 190Z');
  fill(c, door, shade(c, [42, 169], [54, 188], CEDAR), .7);
  c.save(); c.clip(door); woodBoards(c, 42, 169, 13, 21, 3.7); c.restore();
  rivet(c, 51.7, 182.7, .89);
  block(c, 42, 94, 10.5, 16, shade(c, [41, 94], [52, 112], CEDAR), 1.7);
  block(c, 44, 96.2, 6, 10.6, shade(c, [44, 96], [50, 107], ['#7ea3a2', '#587078', '#344553']), .8);
  stroke(c, [[45, 98], [45, 105]], '#d2d9b8', .6, .78);
  face(c, [[20, 191], [60, 190], [73, 187], [76, 192], [72, 196], [21, 196], [18, 194]],
    shade(c, [22, 190], [74, 196], ['#dfc6a1', '#b39979', '#826c58']));
  stroke(c, [[26, 191], [59, 191], [70, 189]], '#f3dcaa', .78);
  face(c, [[26, 43], [59, 44], [70, 40], [70, 63], [62, 69], [26, 68]],
    shade(c, [26, 43], [70, 68], CEDAR));
  face(c, [[29, 45], [60, 45], [66, 43], [66, 62], [60, 65], [29, 64]],
    radial(c, 48, 54.24, 27, [[0, '#f0bd65'], [.21, '#bca473'], [.53, '#7e8972'], [1, '#49666d']]));
  for (const x of [36.5, 48, 59.5]) {
    stroke(c, [[x, 45.4], [x, 64.3]], '#604c3c', 1.35);
    stroke(c, [[x - .44, 46], [x - .44, 63]], '#e0bc80', .57, .8);
  }
  part(c, ellipse(48, 54.24, 3.5, 4.2), '#f4cd82', {line: '#806244', width: .58, depth: 1.2,
    gloss: ellipse(47.6, 53.6, 1.05, 1.7)});
  stroke(c, [[28.5, 59.4], [60.9, 60.3], [67.9, 58.2]], '#f3ca85', .9);
  face(c, [[23, 66], [60, 67], [71, 63], [72, 68], [61, 73], [24, 72]],
    shade(c, [22, 65], [69, 74], CEDAR));
  const roof = poly([[23, 42], [44, 26], [51, 25.6], [70, 38], [73, 41], [64, 45], [23, 45]], 1.4);
  fill(c, roof, shade(c, [27, 32], [70, 44], SLATE), 1.04);
  c.save(); c.clip(roof);
  for (const [i, x] of [27, 34, 42, 49, 56, 63, 70].entries()) {
    stroke(c, [[48, 26], [x, 41.8 + .1 * (i % 2)]], '#293955', .82, .88);
    stroke(c, [[48, 27.5], [x - .82, 40.7]], '#b0bbbd', .45, .82);
  }
  c.restore();
  eaves(c, [23, 41.5], [65, 42], 2.5);
  stroke(c, [[48, 25.5], [48, 10]], '#6c4b32', 1.82);
  rivet(c, 48, 25.8, 1.4); rivet(c, 48, 9.7, .85);
  face(c, [[49, 10], [56, 11], [63, 14], [55, 17], [49, 17.8]],
    shade(c, [49, 10], [62, 17], ['#d4ae6e', '#b98055', '#8b5941']), .6);
}

function jetty(c) {
  for (const x of [10, 35]) {
    block(c, x, 2, 4, 104, shade(c, [x, 2], [x + 4, 7], CEDAR), 1);
  }
  for (let index = 0, y = 4; y < 104; index++, y += 7) {
    const settle = .24 * Math.sin(index * 1.74);
    face(c, [[8 + settle, y], [39.8, y - .2], [40.2, y + 4.8], [8.2 + settle, y + 5.55]],
      shade(c, [8, y], [40, y + 5.5], [index % 2 ? '#d9b17f' : '#e4be89', '#ba8e5f', '#805b43']), .77);
    stroke(c, [[10.5, y + 1.1], [37.4, y + .75]], '#eed0a6', .67, .7);
    stroke(c, [[13.5, y + 3.5], [22.2, y + 3.24], [27.1, y + 3.48]], '#8d6447', .55, .67);
  }
  for (const [x, y] of [[6,12], [38,36], [6,65], [38,95]]) {
    block(c, x, y + 1.4, 4.9, 10, shade(c, [x, y], [x + 4.9, y + 1], CEDAR), 1.05);
    part(c, ellipse(x + 2.44, y + 1.5, 2.4, 1.42), '#d5aa74', {line: EDGE, width: .57, depth: .6});
    for (const dy of [3.9, 5.2]) stroke(c, [[x + .05, y + dy], [x + 4.8, y + dy + .33]], '#e7cca0', .66);
  }
}

const drawings = {lighthouse, cottage, 'cottage-interior': cottageInterior, 'cottage-glow': cottageGlow, boathouse, jetty};
export const lighthouseArtworkIds = Object.keys(drawings);
export const lighthouseArtworkId = id => Object.hasOwn(drawings, id) ? `lighthouse-scene-${id}` : id;
export const lighthouseFrames = () => Object.fromEntries(lighthouseArtworkIds.map(id => {
  const {width, height, size} = pixelById[id];
  return [lighthouseArtworkId(id), [width, height, Math.round(size[2] * height), drawings[id], {outline: 0}]];
}));
