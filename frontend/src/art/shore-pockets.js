// Paint flat sandstone shelves inside the original dry top contour, between the four beach mouths.
import {ellipse, linear, mix, poly, stroke} from './paint.js';
import {materialRect} from './village/terrain-materials.js';

// Indices follow the sampled coast clockwise. The north approach has the widest clear opening.
// The southwestern shoulders also leave the timber ramp and its bollard clear.
const SHELVES = [
  [6.38, 17.8, .151, 1.71], [26.8, 38.55, .142, 4.28],
  [51.45, 57.0, .122, 6.66], [70.9, 83.58, .147, 8.17],
  [96.42, 111.7, .143, 12.7], [113.2, 125.07, .147, 15.56],
  [144.92, 158.5, .137, 18.2], [160.8, 173.6, .151, 22.07],
];
const STONE = [
  ['#d7c5a2', '#ae9879', '#827563'],
  ['#cfb694', '#a89171', '#7d6f5c'],
  ['#d0c6ad', '#b2a58c', '#857e6c'],
  ['#d6bd9b', '#ae9579', '#856f57'],
  ['#c6b69b', '#a4967b', '#807466'],
];
const BEACH_MOUTHS = [[0, 12.35], [45, 12.35], [90, 12.35], [135, 19.38]];
const CUT = [[0, .27], [.12, .08], [.72, 0], [.93, .12], [1, .58], [.88, .87], [.66, 1], [.16, .95], [.035, .70]];
// The seaward feet of the two southern terraces. The dock sits between the west shoulder and cove.
const TERRACE_FEET = [[24.8, 31.5, .127, 5.38], [60.8, 68.1, .135, 11.7]];

function coastalPoint(rim, sample, scale) {
  const count = rim.length - 1;
  const wrapped = (sample + count) % count;
  const index = Math.floor(wrapped), delta = wrapped - index;
  const a = rim[index], b = rim[index + 1];
  return [scale * (a.x + (b.x - a.x) * delta), scale * (a.y + (b.y - a.y) * delta)];
}

function rockyShoulders(rim) {
  const mask = new Path2D();
  mask.rect(-64, -48, 128, 96);
  for (const [bearing, width] of BEACH_MOUTHS) {
    mask.moveTo(0, 0);
    for (let step = 0; step <= 6; step++) {
      const sample = bearing + (step / 6 - .5) * width;
      mask.lineTo(...coastalPoint(rim, sample, 1.27));
    }
    mask.closePath();
  }
  return mask;
}

function drawShelf(c, rim, from, to, reach, seed, rockSheet, materials, openingAtStart) {
  const length = to - from;
  const close = u => .994 - .004 * (.5 + .5 * Math.sin(u * 18 + seed));
  const inward = (u, v) => {
    const mouth = openingAtStart ? u : 1 - u;
    const rise = Math.min(1, mouth / .20);
    const taper = rise * rise * (3 - 2 * rise) * (1 - .48 * mouth * mouth);
    const erosion = .93 + .10 * Math.sin(seed + u * 13.5) + .06 * Math.cos(seed + u * 23.7);
    return close(u) - (1 - v) * (reach * taper * erosion + .014);
  };
  const point = (u, v) => coastalPoint(rim, from + u * length, inward(u, v));
  const bank = Math.ceil(length * 2);
  const line = Array.from({length: bank + 1}, (_, i) => point(i / bank, 1));
  const shelf = poly([...line, ...Array.from({length:bank + 1}, (_, i) => point(1 - i / bank, .03))], .068);
  const center = point(.5, .36);
  c.fillStyle = linear(c, center[0] - 1.45, center[1] - .9, center[0] + 1.5, center[1] + 1.02,
    [[0, '#ae997bdf'], [.51, '#8c795fd0'], [1, '#796957ee']]);
  c.fill(shelf);

  c.save();
  c.clip(shelf);
  let u = 0;
  for (let index = 0; u < .999; index++) {
    const drift = Math.sin(seed + index * 2.47);
    const width = (1.40 + 1.23 * (.5 + .5 * drift) + .32 * Math.cos(seed + index * 4.19)) / length;
    const end = Math.min(1, u + width);
    const at = (x, y) => point(u + (end - u) * x, y);
    const pigment = STONE[(index + Math.floor(seed)) % STONE.length];
    const corners = CUT.map(([x, y], corner) => [
      Math.max(0, Math.min(1, x + .035 * Math.sin(corner * 2.9 + index + seed))),
      Math.max(0, Math.min(1, y + .08 * Math.cos(corner * 3.1 + index + seed))),
    ]);
    const boundary = poly(corners.map(([x, y]) => at(.027 + .94 * x, y)), .09);
    const facePoints = corners.map(([x, y]) => at(.078 + .85 * x, .086 + .81 * y));
    const face = poly(facePoints, .076);
    const [top, middle, shade] = pigment;
    const [cx, cy] = at(.54, .45);
    c.fillStyle = linear(c, cx - .35, cy - .31, cx + .35, cy + .33, [[0, middle], [.63, shade], [1, '#6f6759']]);
    c.fill(boundary);
    const faceCenter = mix(top, middle, .43 + .08 * drift);
    c.fillStyle = linear(c, cx - .48, cy - .39, cx + .39, cy + .46, [[0, top], [.44, faceCenter], [1, middle]]);
    c.fill(face);

    c.save();
    c.clip(face);
    if (rockSheet) {
      const [sx, sy, sw, sh] = rockSheet;
      const xs = facePoints.map(([x]) => x), ys = facePoints.map(([, y]) => y);
      const left = Math.min(...xs), top = Math.min(...ys);
      c.globalAlpha = .41;
      c.globalCompositeOperation = 'luminosity';
      c.drawImage(materials, sx + sw * (.26 + .13 * drift), sy + sh * (.17 + .10 * Math.cos(seed + index)),
        sw * .30, sh * .27, left, top, Math.max(...xs) - left, Math.max(...ys) - top);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-atop';
    }
    const split = .45 + drift * .21;
    c.fillStyle = '#665e4f39';
    c.fill(poly([at(split, .19), at(.97, .34), at(.93, .91), at(split + .05, .78)], .075));
    c.fillStyle = '#f4dfb75e';
    c.fill(poly([at(.12, .42), at(.23, .21), at(.65, .16), at(.88, .29), at(split + .08, .39)], .06));
    stroke(c, [at(.08, .41), at(.29, .28), at(split, .23), at(.73, .27)], '#f5e4be89', .069);
    stroke(c, [at(.34, .65), at(.48, .55), at(.81, .67)], '#75675078', .057);
    c.restore();
    u = end;
  }
  c.restore();

  // A few low broken chips soften the inner transition from stone into the bright sand.
  for (let chip = 0; chip < 7; chip++) {
    const atMouth = .046 + chip * .083;
    const u = openingAtStart ? atMouth : 1 - atMouth;
    const swirl = Math.sin(seed + chip * 2.4);
    const [x, y] = point(u, -.04 - .34 * (.5 + .5 * swirl));
    const size = .10 + .27 * (.5 + .5 * Math.cos(seed + chip * 3.19));
    const tilt = Math.atan2(y, x) + Math.PI / 2;
    c.fillStyle = '#80756491';
    c.fill(ellipse(x + .04, y + .052, size, size * .51, tilt));
    c.fillStyle = linear(c, x - .11, y - .13, x + .08, y + .12, [[0, '#cbbda0'], [1, '#988670']]);
    c.fill(poly([[x - size, y], [x - size * .28, y - size * .51], [x + size * .76, y - size * .23],
      [x + size * .94, y + size * .29], [x, y + size * .51]], .052));
  }
}

/** The caller clips to the existing beach. RGB changes retain the exact original alpha mask. */
export function paintShorePockets(c, rim, materials) {
  const rockSheet = materials && materialRect(materials, 'rock');
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = 1;
  c.clip(rockyShoulders(rim), 'evenodd');
  for (const [index, [from, to, reach, seed]] of SHELVES.entries()) {
    drawShelf(c, rim, from, to, reach, seed, rockSheet, materials, index % 2 === 0);
  }
  c.restore();
}

/** Expose the same fractured rock through the turf at the seaward feet of the southern terraces. */
export function paintTerraceFeet(c, beach, rim, materials) {
  const rockSheet = materials && materialRect(materials, 'rock');
  c.save();
  c.clip(beach);
  c.globalCompositeOperation = 'source-atop';
  for (const [index, [from, to, reach, seed]] of TERRACE_FEET.entries()) {
    drawShelf(c, rim, from, to, reach, seed, rockSheet, materials, index === 1);
  }
  c.restore();
}
