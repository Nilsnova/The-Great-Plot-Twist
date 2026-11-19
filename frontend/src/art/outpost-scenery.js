import {ellipse, linear, part, poly, radial, rect, shadow, stroke, svg} from './paint.js';

const STONE_RIM = '#554d42';
const WOOD_RIM = '#49372d';

function limestone(c, points, light, dark, radius = 1.6) {
  const surface = poly(points, radius);
  const [first, second] = points;
  const left = Math.min(...points.map(([x]) => x)), right = Math.max(...points.map(([x]) => x));
  const highest = Math.min(...points.map(([, y]) => y));
  const lowest = Math.max(...points.map(([, y]) => y));
  part(c, surface, linear(c, first[0], first[1], second[0] + 6, Math.max(first[1] + 4, lowest),
    [[0, light], [.44, light], [1, dark]]), {line: STONE_RIM, width: 1.08, shade: false});
  c.save(); c.clip(surface);
  for (let y = highest + 3; y < lowest; y += 4.7) for (let x = left + 2; x < right; x += 5.9) {
    const n = Math.sin(x * 4.617 + y * 9.81);
    c.fillStyle = n > .18 ? '#fdf1ca24' : '#554b431b';
    c.fill(ellipse(x + n * 2.5, y + n * 1.4, .34 + Math.abs(n) * .78, .31));
  }
  c.restore();
  return surface;
}

function slate(c, left, top, right, bottom, face) {
  c.save(); c.clip(face);
  for (let row = 0, y = top; y < bottom; row++, y += 6.8) {
    const drift = (row % 2) * 4.6;
    stroke(c, [[left, y], [right, y - 2]], '#192e43', 1.05, .82);
    stroke(c, [[left, y - 1.1], [right, y - 3.1]], '#7d9fac', .85, .65);
    for (let x = left + drift; x < right; x += 9.2) {
      stroke(c, [[x, y], [x - 2, y + 6.4]], '#233b52', .78, .77);
    }
  }
  c.restore();
}

function planks(c, left, top, right, bottom, step) {
  for (let i = 0, x = left; x < right; i++, x += step) {
    stroke(c, [[x, top], [x + (i % 3 - 1) * .5, bottom]], '#4c352b', 1.0, .7);
    stroke(c, [[x + 1.2, top + 2], [x + 1.6, bottom - 2]], '#e4b27a', .76, .56);
  }
}

function beam(c, from, to, width) {
  stroke(c, [from, to], WOOD_RIM, width + 1.4);
  stroke(c, [from, to], '#aa784d', width);
  stroke(c, [[from[0] - 1, from[1] - 1.3], [to[0] - 1, to[1] - 1.3]], '#e8b779', width * .25);
}

function stud(c, x, y, radius = 1.4) {
  part(c, ellipse(x, y, radius), '#d4ad65', {line: '#6f5940', width: .65, depth: .6,
    gloss: ellipse(x - .38, y - .4, .4)});
}

function backRoom(c) {
  shadow(c, 49, 87, 42, 5.5, .24);
  limestone(c, [[12, 78], [76, 76], [86, 82], [78, 88], [11, 88], [7, 85]], '#d1b497', '#856f57');
  limestone(c, [[16, 44], [63, 41], [65, 82], [14, 82]], '#d4ad78', '#96704f');
  limestone(c, [[63, 41], [80, 46], [80, 77], [65, 82]], '#a9835d', '#77574c');
  const doorway = svg('M37 82 L37 64 Q37 53 47 52 Q57 52 58 63 L58 81Z');
  part(c, doorway, linear(c, 38, 51, 59, 82, [[0, '#443c35'], [1, '#282e2d']]), {line: '#5b412e', width: 2.4});
  part(c, rect(22, 57, 10, 12, 1.2), '#4b5650', {line: WOOD_RIM, width: 1.8, depth: 1.3});
  stroke(c, [[24, 61], [30, 61]], '#e6b569', 1.1);
  beam(c, [15, 48], [14, 81], 4.4);
  beam(c, [63, 46], [64, 80], 4.5);
  const roof = poly([[8, 48], [26, 22], [63, 20], [79, 44], [62, 48]], 1.4);
  part(c, roof, linear(c, 17, 24, 55, 51, [[0, '#527b95'], [.50, '#385874'], [1, '#293e56']]),
    {line: '#302e39', width: 1.6});
  slate(c, 7, 24, 80, 49, roof);
  part(c, poly([[63, 20], [82, 38], [87, 44], [75, 47]], 1.2), '#31465a', {line: '#303039', width: 1.25});
  beam(c, [9, 48], [62, 46], 3);
  for (const [x, y] of [[13, 48], [60, 46], [65, 23]]) stud(c, x, y);
}

function lowTideCave(c) {
  shadow(c, 56, 86, 49, 6, .29);
  limestone(c, [[7, 82], [15, 58], [27, 45], [34, 29], [52, 18], [63, 15], [77, 23], [92, 27],
    [101, 48], [103, 68], [106, 81], [96, 85], [13, 86]], '#a09b81', '#776e5e', 3.5);
  limestone(c, [[15, 63], [29, 44], [36, 30], [53, 20], [64, 17], [72, 24], [60, 34],
    [44, 38], [32, 55]], '#c2b49a', '#9f9477');
  limestone(c, [[67, 29], [76, 24], [91, 29], [98, 43], [82, 42], [77, 38], [61, 39]], '#a8a28a', '#807b69');
  limestone(c, [[91, 29], [100, 48], [104, 68], [105, 80], [95, 83], [85, 68], [85, 52]], '#827f72', '#565c54');
  const hole = svg('M28 82 Q30 61 44 50 Q48 45 60 42 Q72 41 82 55 Q88 67 90 83 Q62 88 28 82Z');
  part(c, hole, linear(c, 36, 48, 77, 83, [[0, '#4d5b50'], [.40, '#344a43'], [1, '#252f32']]),
    {line: '#656554', width: 1.55});
  const recess = svg('M38 80 Q40 63 52 56 Q65 44 76 56 Q83 64 84 82 Q62 86 38 80Z');
  part(c, recess, radial(c, 61, 67, 27, [[0, '#16232a'], [.74, '#202f34'], [1, '#415047']]), {line: false});
  limestone(c, [[30, 81], [43, 82], [64, 85], [87, 81], [91, 84], [78, 88], [45, 89], [31, 86]], '#8f9781', '#678176');
  limestone(c, [[8, 83], [13, 76], [20, 73], [25, 78], [23, 84], [13, 87]], '#9f9b7d', '#777362');
  limestone(c, [[91, 84], [95, 75], [102, 73], [106, 79], [104, 86], [98, 87]], '#8c907a', '#696c5e');
  stroke(c, svg('M20 61 Q24 52 31 50 M41 28 Q52 21 57 22 M76 32 L87 35 M40 85 Q59 90 79 87'), '#d2c49c', .9, .68);
}

function arenaGate(c) {
  shadow(c, 56, 87, 49, 6, .29);
  limestone(c, [[12, 84], [13, 31], [21, 18], [88, 18], [98, 22], [101, 34], [100, 83], [104, 89],
    [98, 92], [11, 90], [8, 87]], '#b7a282', '#746653', 2.8);
  limestone(c, [[89, 24], [98, 28], [100, 42], [99, 84], [103, 88], [91, 89]], '#948571', '#615e50');
  part(c, rect(24, 32, 61, 53, 4), '#45392e', {line: STONE_RIM, width: 2.1});
  part(c, rect(30, 38, 49, 46, 2), linear(c, 29, 40, 79, 81, [[0, '#c28a56'], [.56, '#9c6e4a'], [1, '#674735']]),
    {line: WOOD_RIM, width: 1.1});
  planks(c, 30, 39, 80, 82, 7.1);
  stroke(c, [[55, 38], [55, 84]], '#412f28', 2.6);
  beam(c, [32, 50], [50, 70], 4.2);
  beam(c, [60, 70], [78, 50], 4.2);
  for (const x of [34, 76]) for (const y of [45, 76]) {
    part(c, rect(x - 4, y, 8, 3.6, 1), '#516268', {line: '#3c433e', width: .6, depth: .5});
    stud(c, x, y + 1.7, 1);
  }
  for (const y of [42, 54, 66, 77]) {
    stroke(c, [[15, y], [23, y - .2]], '#685a4a', 1.1);
    stroke(c, [[16, y + 1], [22, y + .8]], '#d4bf9e', .91);
    stroke(c, [[85, y + 2], [96, y + 1]], '#6f6052', .85);
  }
  limestone(c, [[14, 29], [19, 21], [89, 21], [98, 26], [95, 32], [15, 32]], '#d1be9b', '#9e8a70');
  part(c, poly([[48, 15], [62, 15], [64, 22], [56, 30], [47, 23]], .8), '#ae784d',
    {line: WOOD_RIM, width: 1.4, depth: 1.5});
  stud(c, 56, 21, 2.1);
  limestone(c, [[25, 84], [82, 84], [89, 91], [82, 94], [26, 94], [21, 91]], '#bdad91', '#8c7d67');
}

const ARCH_BLOCKS = [
  [[20, 66], [26, 54], [34, 46], [43, 52], [35, 63], [31, 72]],
  [[33, 46], [43, 39], [54, 36], [55, 47], [46, 51], [42, 54]],
  [[54, 36], [62, 34], [73, 40], [69, 52], [62, 47], [55, 47]],
  [[73, 40], [83, 45], [90, 57], [82, 64], [76, 55], [69, 52]],
  [[90, 57], [94, 69], [94, 78], [86, 79], [84, 70], [82, 64]],
];

function raidArch(c) {
  shadow(c, 56, 102, 49, 6, .27);
  limestone(c, [[8, 99], [13, 87], [13, 65], [18, 52], [21, 43], [24, 37], [33, 36], [36, 31],
    [48, 32], [55, 27], [69, 30], [78, 34], [89, 37], [95, 49], [98, 65], [100, 91], [106, 99],
    [100, 102], [10, 103]], '#b0a28b', '#716b5e', 2.7);
  limestone(c, [[84, 42], [93, 51], [98, 67], [100, 90], [104, 98], [96, 100], [87, 93], [86, 64], [80, 49]],
    '#877f74', '#5b615d');
  const arch = svg('M29 100 L29 75 Q30 59 46 49 Q56 42 67 47 Q82 55 87 73 L87 100Z');
  part(c, arch, linear(c, 36, 56, 79, 95, [[0, '#625b51'], [.42, '#55564e'], [1, '#394e48']]),
    {line: '#594e45', width: 1.65});
  const recess = svg('M38 99 L38 76 Q39 64 50 57 Q60 50 68 57 Q79 64 81 76 L81 99Z');
  part(c, recess, radial(c, 61, 72, 28, [[0, '#233039'], [.66, '#293b3e'], [1, '#506156']]), {line: false});
  ARCH_BLOCKS.forEach((block, i) => limestone(c, block, ['#c3b196', '#b9ac95', '#c9bb9f', '#ac9e87', '#9d9484'][i],
    ['#928471', '#938674', '#9a8c76', '#7e776a', '#746f64'][i]));
  for (const y of [76, 85, 94]) {
    stroke(c, [[17, y], [27, y - .5]], '#695e51', 1.2);
    stroke(c, [[18, y + 1.1], [27, y + .5]], '#d1bb98', 1.0);
    stroke(c, [[88, y + 2], [96, y + 1]], '#5f675c', 1.1);
  }
  limestone(c, [[34, 98], [81, 97], [88, 100], [83, 103], [33, 103], [27, 101]], '#afa088', '#766f62', 1.1);
  for (const [x, sign] of [[19, 1], [94, -1]]) {
    const cloth = poly([[x, 53], [x + 10 * sign, 55], [x + 10 * sign, 69],
      [x + 5 * sign, 66], [x, 72]], .65);
    part(c, cloth, linear(c, x, 54, x + 10 * sign, 72, [[0, '#b8865a'], [1, '#735947']]),
      {line: '#624d3f', width: .9});
    stroke(c, [[x + 1.4 * sign, 55], [x + 1.4 * sign, 67]], '#e5bd85', .64);
  }
}

function watchtowerRuin(c) {
  shadow(c, 40, 132, 34, 6, .28);
  const masonry = [[15, 130], [20, 36], [27, 39], [29, 23], [37, 28], [42, 16], [48, 31], [61, 27], [66, 131]];
  limestone(c, masonry, '#bdb49b', '#877e6d', 2.2);
  limestone(c, [[46, 35], [60, 29], [65, 131], [48, 131]], '#928d7e', '#666b61');
  for (const [i, y] of [42, 65, 78, 92, 106, 119].entries()) {
    const x = 20 + (5 - i) * .58, joint = [36, 41, 30][i % 3];
    stroke(c, [[x, y], [46, y - 1.4]], '#786d5d', 1.16);
    stroke(c, [[x + 1.4, y + 1], [44, y - .2]], '#d0c3a6', 1.02);
    stroke(c, [[joint, y + 1], [joint - 1, y + 10]], '#827966', 1.15);
    stroke(c, [[49, y + 1.1], [60 + i * .55, y - .8]], '#64655d', 1.1);
  }
  for (const [y, height] of [[45, 17], [105, 25]]) {
    part(c, rect(31, y, 18, height, 1.4), linear(c, 32, y, 48, y + height,
      [[0, '#7d7b6b'], [.47, '#4d534b'], [1, '#2d3f40']]), {line: STONE_RIM, width: 1.6});
    stroke(c, [[32.5, y + height - 1.1], [48, y + height - 1.1]], '#c0b59d', .9);
  }
  stroke(c, [[37, 72], [33.5, 78], [35, 82], [30, 89]], '#655f51', 1.05);
  for (const [x,y] of [[9,127],[67,130],[18,136]]) {
    limestone(c, [[x - 6, y], [x - 3, y - 7], [x + 4, y - 6], [x + 8, y]], '#afa88e', '#776f61');
  }
}

function reef(c) {
  for (const [x,y,w,h] of [[21,39,17,12],[47,28,20,18],[75,43,15,10]]) {
    shadow(c, x, y + 3, w * .93, 3.6, .19);
    limestone(c, [[x-w,y],[x-w+3,y-h],[x+w-5,y-h-4],[x+w,y],[x+7,y+4]], '#a29c88', '#666e62', 1.6);
    limestone(c, [[x+w-5,y-h-4],[x+w,y],[x+7,y+4],[x+4,y-h+5]], '#7c8475', '#55685e', 1.4);
    stroke(c, [[x-w+6,y-h+1],[x-4,y-h+4],[x-2,y-2]], '#c3bc9f', .91, .79);
  }
}

function salvageYard(c) {
  shadow(c, 72, 99, 65, 7, .24);
  const deck = poly([[8,64],[112,53],[129,65],[136,82],[120,98],[97,101],[29,100],[15,92]], 3.3);
  part(c, deck, linear(c, 31, 58, 88, 102, [[0, '#d0a067'], [.47, '#a97548'], [1, '#72513b']]),
    {line: WOOD_RIM, width: 1.55, shade: false});
  c.save(); c.clip(deck);
  for (let i = 0; i < 7; i++) {
    const y = 66 + i * 5.3;
    stroke(c, [[8, y], [67, y - 3.5], [134, y - 7.2]], '#685041', 1.2);
    stroke(c, [[14, y - 1.55], [73, y - 5.2], [132, y - 8.8]], '#deb37f', .72);
  }
  c.restore();
  part(c, poly([[25,57],[71,50],[92,56],[91,81],[71,86],[26,83]], 1.4), '#674735',
    {line: WOOD_RIM, width: 1.4});
  part(c, poly([[32,61],[71,55],[76,62],[75,79],[32,80]], 1.5), '#3b423b', {line: '#514234', width: 1.6});
  beam(c, [29,58], [28,82], 4.5);
  beam(c, [68,57], [68,82], 4.5);
  beam(c, [29,66], [38,58], 3);
  beam(c, [68,66], [57,59], 3);
  const roof = poly([[19,59],[32,31],[72,26],[93,43],[98,56],[85,62],[25,64]], 1.8);
  part(c, roof, linear(c, 29, 34, 80, 64, [[0, '#607f87'], [.56, '#45666b'], [1, '#314e54']]),
    {line: '#354144', width: 1.42});
  slate(c, 18, 32, 99, 64, roof);
  beam(c, [22,62], [84,59], 3.2);
  beam(c, [106,25], [100,81], 5);
  beam(c, [111,29], [121,86], 3.2);
  beam(c, [89,29], [115,25], 5.8);
  stud(c, 108, 26, 2.9);
  stroke(c, svg('M95 30 Q96 38 95 65 Q96 71 100 67'), '#573f30', 2.4);
  stroke(c, svg('M95 30 Q96 40 95 65 Q96 70 100 67'), '#d9b481', 1.1);
  for (const [x,y] of [[18,84],[80,84],[110,83]]) {
    part(c, rect(x, y, 15, 11, 1), '#ad8258', {line: WOOD_RIM, width: 1, depth: 1.7});
    stroke(c, [[x+2,y+2],[x+13,y+2],[x+13,y+7]], '#e0b583', .7);
    beam(c, [x+2,y+9], [x+12,y+3], 1.5);
  }
}

function outpostFog(c) {
  for (const [x,y,rx,ry] of [[44,50,42,15],[104,39,61,17],[148,62,39,13]]) {
    c.save(); c.translate(x, y); c.scale(1, ry / rx);
    c.fillStyle = radial(c, 0, 0, rx, [[0, '#bbd5cc55'], [.52, '#b0ccbf37'], [1, '#b0ccbf00']]);
    c.fill(ellipse(0, 0, rx)); c.restore();
  }
}

// Every frame keeps its original staged-art dimensions and ground anchor.
const frames = {
  'back-room': [96, 96, 8, backRoom, {outline: 0}],
  'low-tide-cave': [112, 96, 12, lowTideCave, {outline: 0}],
  'arena-gate': [112, 96, 12, arenaGate, {outline: 0}],
  'raid-arch': [112, 112, 12, raidArch, {outline: 0}],
  'watchtower-ruin': [80, 144, 12, watchtowerRuin, {outline: 0}],
  reef: [96, 64, 8, reef, {outline: 0}],
  'salvage-yard': [144, 112, 12, salvageYard, {outline: 0}],
  'fog-bank': [192, 96, 12, outpostFog, {outline: 0}],
};

export const outpostArtwork = id => Object.hasOwn(frames, id) ? `outpost-${id}` : id;
export const outpostSceneryFrames = () => Object.fromEntries(Object.entries(frames)
  .map(([id, frame]) => [outpostArtwork(id), frame]));
