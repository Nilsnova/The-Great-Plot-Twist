import {ellipse, linear, part, poly, radial, rect, shadow, stroke} from './paint.js';

export function seededPaint(seed) {
  let value = seed % 2147483647 || 1;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

export function paintMeadow(c, shape, {left, top, width, height, unit, seed}) {
  const right = left + width, bottom = top + height, rand = seededPaint(seed);
  const turf = linear(c, left + width * .28, top, right - width * .2, bottom,
    [[0, '#d1e97c'], [.27, '#a2cd57'], [.58, '#77a743'], [1, '#426d3e']]);
  part(c, shape, turf, {line: false, shade: false});
  c.save(); c.clip(shape);
  for (let i = 0; i < 34; i++) {
    const x = left + rand() * width, y = top + rand() * height, radius = (10 + 37 * rand()) * unit;
    const highlight = rand() > .38;
    c.save(); c.translate(x, y); c.rotate(-.13); c.scale(1, .40 + rand() * .29); c.translate(-x, -y);
    c.fillStyle = radial(c, x, y, radius, highlight
      ? [[0, '#e2ef884c'], [.52, '#d2e88029'], [1, '#d2e88000']]
      : [[0, '#31563552'], [.55, '#3b623232'], [1, '#3b623200']]);
    c.fill(ellipse(x, y, radius)); c.restore();
  }
  for (let i = 0; i < 240; i++) {
    const x = left + rand() * width, y = top + rand() * height, size = (.6 + rand() * 2.4) * unit;
    stroke(c, [[x - size, y + .1 * size], [x - .12 * size, y - .72 * size], [x + .42 * size, y - .37 * size]],
      i % 5 < 2 ? '#def5a4' : '#537f39', unit * .55, .35);
  }
  c.restore();
}

export function paintBluff(c, shape, {left, top, width, height, unit, seed, cool = false}) {
  const right = left + width, bottom = top + height, rand = seededPaint(seed);
  const tones = cool ? ['#cbbea6', '#9a9292', '#686f79', '#4c5866'] : ['#f0c998', '#ad8b69', '#876a57', '#545450'];
  part(c, shape, linear(c, left + width * .27, top, right, bottom,
    [[0, tones[0]], [.31, tones[1]], [.69, tones[2]], [1, tones[3]]]), {line: false, shade: false});
  c.save(); c.clip(shape);
  for (let row = 0, y = top - 9 * unit; y < bottom; row++) {
    const course = (14 + rand() * 20) * unit;
    for (let x = left - (row % 2 + 1) * unit * 14; x < right;) {
      const span = (19 + rand() * 33) * unit, lip = (2 + rand() * 4) * unit;
      const drift = (rand() - .5) * unit * 5;
      const near = y + drift, far = y + course + drift * .4;
      const tile = poly([[x + lip, near + unit], [x + span - lip, near], [x + span, near + lip],
        [x + span - unit * 2, far - lip], [x + span - lip * 1.5, far], [x + lip * .3, far - unit]], unit * 1.55);
      const lit = rand() * .32 + .18;
      part(c, tile, linear(c, x + lip, near, x + span - unit * 2, far,
        [[0, `rgba(255,231,186,${lit})`], [.26, `rgba(234,196,155,${lit * .45})`],
          [.83, '#4c454a15'], [1, '#383b4156']]), {line: '#55473e57', width: unit * 1.15, shade: false});
      stroke(c, [[x + lip + unit * 2, near + unit * 1.65], [x + span * .56, near + unit * 1.2],
        [x + span - lip * 1.3, near + unit * 1.6]], '#fff4d7', unit * .85, lit + .04);
      if (rand() < .35) stroke(c, [[x + span * .46, near + 2 * unit], [x + span * .54, near + course * .39],
        [x + span * .48, near + course * .62]], '#514f4b', unit * .86, .43);
      x += span - unit;
    }
    y += course - 2 * unit;
  }
  for (let i = 0; i < 165; i++) {
    const x = left + rand() * width, y = top + rand() * height;
    c.fillStyle = i % 3 ? '#e6cfac39' : '#554f4944';
    c.fill(ellipse(x, y, (.3 + rand() * 1.3) * unit, unit * .46));
  }
  const seaBounce = linear(c, 0, top + height * .28, 0, bottom,
    [[0, '#2b9b9c00'], [.72, '#0b828821'], [1, '#116d754d']]);
  c.fillStyle = seaBounce; c.fillRect(left, top, width, height);
  c.restore();
  stroke(c, shape, '#4a473c', unit * 1.75, .75);
}

export function paintBeach(c, cx, y, width, height, unit, seed) {
  const shore = ellipse(cx, y, width, height), rand = seededPaint(seed);
  part(c, shore, linear(c, cx - width * .6, y - height, cx + width * .42, y + height,
    [[0, '#f8e8b4'], [.4, '#ead298'], [.71, '#c69d72'], [1, '#9f8f64']]),
  {line: '#726249', width: 1.55 * unit, shade: false});
  c.save(); c.clip(shore);
  for (let i = 0; i < 80; i++) {
    const x = cx + (rand() * 2 - 1) * width, py = y + (rand() * 2 - 1) * height;
    c.fillStyle = i % 3 ? '#fff1cb4c' : '#91613d51';
    c.fill(ellipse(x, py, (.32 + rand() * 2.5) * unit, (.35 + rand() * .45) * unit, -.08));
  }
  const edge = new Path2D(); edge.ellipse(cx, y + height * .14, width * .92, height * .82, 0, Math.PI * .14, Math.PI * .86);
  stroke(c, edge, '#eec492', unit * 1.5, .55);
  c.restore();
}

export function paintShallows(c, cx, y, width, height, unit, seed) {
  const rand = seededPaint(seed);
  c.save(); c.translate(cx, y); c.scale(1, height / width);
  c.fillStyle = radial(c, 0, 0, width, [[0, '#42c4b9a8'], [.63, '#44bdba82'], [.82, '#46b7b150'], [1, '#46b7b100']]);
  c.fill(ellipse(0, 0, width)); c.restore();
  for (let i = 0; i < 31; i++) {
    const at = (rand() * 2 - 1) * width * .89;
    const py = y + Math.sqrt(1 - (at / width) ** 2) * height * (.35 + rand() * .5), length = (4 + rand() * 21) * unit;
    const crest = new Path2D(); crest.moveTo(cx + at - length, py + unit * .25);
    crest.bezierCurveTo(cx + at - length * .47, py - unit * .74, cx + at + length * .31, py + unit * .59,
      cx + at + length * .86, py - unit * .32);
    stroke(c, crest, i % 4 ? '#a1e2d2' : '#dcfff2', (.48 + rand() * 1.14) * unit, .22 + rand() * .29);
  }
}

export function paintTerrace(c, [left, curve, right], rise, unit, seed) {
  const top = new Path2D(); top.moveTo(...left); top.quadraticCurveTo(...curve, ...right);
  const tread = new Path2D(top);
  tread.lineTo(right[0] - unit * 1.7, right[1] + rise * .68);
  tread.quadraticCurveTo(curve[0] + unit * 2, curve[1] + rise, left[0], left[1] + rise * .53);
  tread.closePath();
  const foot = new Path2D(); foot.moveTo(left[0], left[1] + rise * .53);
  foot.quadraticCurveTo(curve[0] + unit * 2, curve[1] + rise, right[0] - unit * 1.7, right[1] + rise * .68);
  stroke(c, foot, '#365c3d', unit * 4.4, .43);
  const upper = Math.min(left[1], curve[1], right[1]);
  paintBluff(c, tread, {left: left[0] - unit, top: upper, width: right[0] - left[0] + unit * 2,
    height: Math.max(left[1], curve[1], right[1]) - upper + rise, unit: unit * .69, seed});
  stroke(c, top, '#70a044', unit * 4.9, .94);
  stroke(c, top, '#d0dd79', unit * 1.52, .85);
}

export function paintTurfTufts(c, points, unit) {
  for (const [x, y, size] of points) {
    const u = unit * size;
    c.fillStyle = '#45602d6a'; c.fill(ellipse(x + 3 * u, y, 9 * u, 2.5 * u));
    const grass = new Path2D();
    for (const [at, lean, height] of [[-6,-5,8],[-3,-1,11],[1,1,10],[5,4,7]]) {
      grass.moveTo(x + (at - 1.8) * u, y);
      grass.quadraticCurveTo(x + (at + lean * .35) * u, y - height * .63 * u, x + (at + lean) * u, y - height * u);
      grass.quadraticCurveTo(x + (at + 2.4) * u, y - height * .49 * u, x + (at + 1.8) * u, y);
    }
    part(c, grass, linear(c, x - 5 * u, y - 11 * u, x + 6 * u, y,
      [[0, '#d7e481'], [.28, '#a1ba51'], [.7, '#6c8f43'], [1, '#4c6d40']]), {line: false});
  }
}

export function paintWalk(c, points, width) {
  stroke(c, points, '#6b7948', width, .52);
  stroke(c, points, '#c3a475', width * .85, .91);
  stroke(c, points.map(([x, y]) => [x - width * .09, y - width * .10]), '#e7c992', width * .34, .61);
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1], [endX, endY] = points[i], dx = endX - x, dy = endY - y;
    const extent = Math.hypot(dx, dy), nx = -dy / extent, ny = dx / extent;
    for (let step = width * .8; step < extent - width * .3; step += width * .65) {
      const atX = x + step / extent * dx, atY = y + step / extent * dy, half = width * .36;
      stroke(c, [[atX - nx * half, atY - ny * half], [atX + nx * half, atY + ny * half]], '#8a744f', width * .10, .68);
    }
  }
}

function cabin(c, {w, h}) {
  const x = w / 2, g = h - 12;
  shadow(c, x, g, 40, 7, .31);
  const base = rect(x - 34, g - 30, 68, 30, 2), roof = poly([[x - 42, g - 28], [x - 18, g - 62],
    [x + 18, g - 62], [x + 42, g - 28]], [3, 4, 4, 3]);
  part(c, base, linear(c, x - 32, g - 28, x + 33, g,
    [[0, '#edd393'], [.48, '#c18b4e'], [.79, '#ae7846'], [1, '#795739']]), {line: '#574332', shade: false, width: 1.4});
  for (let y = g - 25; y < g - 2; y += 5) {
    stroke(c, [[x - 32, y], [x + 32, y]], '#8b5c3b', 1, .74);
    stroke(c, [[x - 31, y + 1.1], [x + 22, y + 1.1]], '#f2cb89', .7, .68);
  }
  const door = rect(x - 7, g - 21, 14, 21, 6);
  part(c, door, linear(c, x - 7, g - 20, x + 7, g,
    [[0, '#a46e42'], [.4, '#804e30'], [1, '#503a2c']]), {line: '#654827', width: 1.6});
  stroke(c, [[x - 3, g - 16], [x - 3, g - 1.4]], '#ddb174', .7, .65);
  part(c, ellipse(x + 3.6, g - 10, 1.15), '#eac371', {line: '#765336', width: .45});
  for (const wx of [x - 27, x + 13]) {
    part(c, rect(wx, g - 23, 13, 11, 2), linear(c, wx, g - 23, wx + 13, g - 12,
      [[0, '#fff3bc'], [.48, '#f2bf72'], [1, '#bb753c']]), {line: '#725233', width: 1.2});
    stroke(c, [[wx + 6.5, g - 22], [wx + 6.5, g - 12.3]], '#8c633f', .9);
    stroke(c, [[wx + .4, g - 17.5], [wx + 12.7, g - 17.5]], '#8c633f', .9);
    part(c, rect(wx - 1.5, g - 12, 16, 2.6, 1), '#b28250', {line: '#634834', width: .84});
  }
  part(c, rect(x + 16, g - 66, 9, 22, 1.4), '#b1a089', {shade: '#817060', line: '#63584d', width: 1.16});
  part(c, rect(x + 15, g - 68, 11, 4, 1), '#d2bd9e', {line: '#63584d', width: .9});
  part(c, roof, linear(c, x - 24, g - 60, x + 33, g - 29,
    [[0, '#5c9cae'], [.3, '#427286'], [.72, '#2e5373'], [1, '#1d3a52']]), {line: '#294051', width: 1.75, shade: false});
  c.save(); c.clip(roof);
  for (let row = 0, y = g - 57; y < g - 29; row++, y += 6.2) {
    stroke(c, [[x - 42, y], [x + 42, y]], '#1b394e', .84, .85);
    stroke(c, [[x - 42, y - 1], [x + 42, y - 1]], '#98bfca', .61, .62);
    for (let tx = x - 45 + row % 2 * 5; tx < x + 44; tx += 11) stroke(c, [[tx, y], [tx + 2.4, y + 5.7]], '#214058', .81, .92);
  }
  c.restore();
  part(c, ellipse(x, g - 46, 6, 6), '#d2ac6c', {shade: '#98723e', line: '#423d33', width: 1.25});
  part(c, ellipse(x, g - 46, 3.6), '#77a8a9', {line: '#3c5158', width: .75, shade: false});
  stroke(c, [[x - 39, g - 28.6], [x + 39, g - 28.6]], '#d9aa6a', 1.5, .89);
}

function pine(c, {w, h}) {
  const x = w / 2, g = h - 8;
  shadow(c, x, g, 20, 5, .25);
  part(c, rect(x - 3.5, g - 18, 7, 19, 2), '#91684c', {shade: '#614533', line: '#564537', depth: 1.35});
  for (const [y, span, rise] of [[g - 16, 26, 22], [g - 34, 21, 22], [g - 52, 16, 22], [g - 70, 10, 20]]) {
    const crown = poly([[x - span, y], [x, y - rise - 8], [x + span, y], [x + span * .3, y + 3],
      [x - span * .3, y + 3]], [3, 2, 3, 2, 2]);
    part(c, crown, linear(c, x - span * .7, y - rise, x + span * .90, y,
      [[0, '#d2e178'], [.26, '#7fac53'], [.57, '#467f47'], [1, '#285845']]), {line: '#365441', width: 1.45});
    c.save(); c.clip(crown);
    for (let i = 0; i < 4; i++) {
      const foot = x - span * (.8 - i * .42), at = y - (1 - i % 2) * 2.7;
      stroke(c, [[x, y - rise * .77], [foot, at - 3.2], [foot + span * .13, at]], '#b0c866', 1.0, .62);
      stroke(c, [[foot + 1, at - 3.4], [foot + span * .35, at + 1]], '#28593c', 1.14, .63);
    }
    c.restore();
  }
}

function oak(c, {w, h}) {
  const x = w / 2, g = h - 8, rand = seededPaint(347);
  shadow(c, x, g, 23, 6, .27);
  const branch = poly([[x - 4, g + 1], [x - 3, g - 26], [x + 3, g - 26], [x + 5, g + 1]], 2);
  part(c, branch, linear(c, x - 4, g - 22, x + 8, g,
    [[0, '#c69a63'], [.42, '#a7794c'], [1, '#6b4f37']]), {line: '#5e4935', width: 1.21});
  const blobs = [[0,-62,22,19],[-18,-46,15,13],[18,-46,15,13],[-8,-36,15,11],[9,-36,15,11],[-12,-70,12,11],[12,-72,12,11]];
  const canopy = new Path2D();
  for (const [dx, dy, rx, ry] of blobs) canopy.addPath(ellipse(x + dx, g + dy, rx, ry));
  part(c, canopy, linear(c, x - 18, g - 79, x + 22, g - 25,
    [[0, '#c2d566'], [.37, '#88b950'], [.68, '#579547'], [1, '#355f3b']]), {line: false});
  c.save(); c.clip(canopy);
  for (let i = 0; i < 72; i++) {
    const lx = x - 34 + rand() * 69, ly = g - 84 + rand() * 60, r = 3 + rand() * 5.7;
    const gold = 1 - (lx - x + ly - g + 108) / 129;
    c.fillStyle = radial(c, lx - r * .3, ly - r * .4, r * 1.4,
      [[0, `rgba(222,239,135,${Math.max(.15, gold * .68)})`], [.47, '#97c35245'], [1, '#42693930']]);
    c.fill(ellipse(lx, ly, r, r * .75, -.22));
    stroke(c, [[lx - r * .8, ly + 1.1], [lx - r * .4, ly + r * .60], [lx + r * .3, ly + r * .63]], '#305b39', .7, .43);
  }
  c.restore();
  for (const [dx, dy] of [[-14,-44],[16,-58],[-2,-50]]) {
    part(c, ellipse(x + dx, g + dy, 2.2), '#cb6a49', {line: '#8b5341', width: .62,
      depth: .6, gloss: ellipse(x + dx - .65, g + dy - .64, .62)});
  }
}

export const cinematicSprites = {cabin, pine, oak};
