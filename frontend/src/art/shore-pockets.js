// Paint flat sandstone shelves inside the original dry top contour, between the four beach mouths.
import {ellipse, linear, mix, poly, radial, stroke} from './paint.js';
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
  ['#dcc6a0', '#af9370', '#897052'],
  ['#d7b68c', '#ad8d68', '#816a50'],
  ['#d8c6a5', '#b5a17f', '#8b7960'],
  ['#debd92', '#b39570', '#876b51'],
  ['#cbb397', '#a89474', '#81715c'],
];
const BEACH_MOUTHS = [[0, 12.35], [45, 12.35], [90, 12.35], [135, 19.38]];
const CUT = [[0, .27], [.12, .08], [.72, 0], [.93, .12], [1, .58], [.88, .87], [.66, 1], [.16, .95], [.035, .70]];
// Embedded chips settle into the two southern terrace feet above the dry beach.
const TERRACE_FEET = [[25.7, 31.3, 5.38], [61.3, 67.35, 11.7]];
const SAND = '#ddbb84';
const WET_BED = '#5b6556';
const ROOT_SOIL = '#786345';
const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Landing mouths retain bright sand. Away from them, the little strips of
// sand at the foot of a terrace read as deposits between rocks.
export function beachExposure(sample, count) {
  return Math.max(...BEACH_MOUTHS.map(([centre, span]) => {
    const distance = Math.abs(sample - centre);
    const arc = Math.min(distance, count - distance);
    return smooth((span * .5 + 4.5 - arc) / 5.5);
  }));
}

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
  // The first ledges in the mouth are low and covered in sand. Fractured blocks get deeper
  // towards the shoulder and finish in a thinner, irregular edge on the other side.
  const exposure = u => {
    const mouth = openingAtStart ? u : 1 - u;
    return smooth(mouth / .27) * smooth((1 - mouth) / .18);
  };
  const close = u => .997 - .004 * (.5 + .5 * Math.sin(u * 18 + seed));
  const inward = (u, v) => {
    const mouth = openingAtStart ? u : 1 - u;
    const taper = exposure(u) * (1 - .41 * mouth * mouth);
    const erosion = .93 + .10 * Math.sin(seed + u * 13.5) + .06 * Math.cos(seed + u * 23.7);
    return close(u) - (1 - v) * (reach * taper * erosion + .006);
  };
  const point = (u, v) => coastalPoint(rim, from + u * length, inward(u, v));
  const bank = Math.ceil(length * 2);
  const line = Array.from({length: bank + 1}, (_, i) => point(i / bank, 1));
  const shelf = poly([...line, ...Array.from({length:bank + 1}, (_, i) => point(1 - i / bank, .03))], .068);
  // Short shadows at exposed joints tuck the pale sand beneath the stone faces.
  // They soften towards the open beach and never extend the painted shore.
  for (let i = 1; i < bank; i++) {
    const u = i / bank, amount = exposure(u);
    if (amount < .04) continue;
    const [x, y] = point(u, .13);
    const angle = Math.atan2(y, x) + Math.PI / 2;
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(.54 + amount * .54, .23 + amount * .36);
    c.globalAlpha *= amount;
    c.fillStyle = radial(c, 0, 0, 1, [[0, '#4c4631b6'], [.35, '#7158378a'], [.67, '#a0815544'], [1, '#ae8c6200']]);
    c.fill(ellipse(0, 0, 1));
    c.restore();
  }

  c.save();
  c.clip(shelf);
  let u = 0;
  for (let index = 0; u < .999; index++) {
    const drift = Math.sin(seed + index * 2.47);
    const width = (1.15 + 1.41 * (.5 + .5 * drift) + .34 * Math.cos(seed + index * 4.19)) / length;
    const end = Math.min(1, u + width);
    const at = (x, y) => point(u + (end - u) * x, y);
    const pigment = STONE[(index + Math.floor(seed)) % STONE.length];
    const exposed = exposure((u + end) * .5);
    const corners = CUT.map(([x, y], corner) => [
      Math.max(0, Math.min(1, x + .035 * Math.sin(corner * 2.9 + index + seed))),
      Math.max(0, Math.min(1, y + .08 * Math.cos(corner * 3.1 + index + seed))),
    ]);
    const boundary = poly(corners.map(([x, y]) => at(.027 + .94 * x, y)), .09);
    const facePoints = corners.map(([x, y]) => at(.078 + .85 * x, .086 + .81 * y));
    const face = poly(facePoints, .076);
    const [top, middle, shade] = pigment.map(colour => mix(colour, SAND, .10 + .50 * (1 - exposed)));
    const [footX, footY] = at(.5, .03), [edgeX, edgeY] = at(.5, 1);
    const damp = mix(shade, WET_BED, .43 + exposed * .19);
    c.save();
    c.globalAlpha *= .34 + .66 * exposed;
    c.fillStyle = linear(c, footX, footY, edgeX, edgeY,
      [[0, `${SAND}00`], [.29, `${middle}a4`], [.53, mix(shade, ROOT_SOIL, .37)], [.84, damp], [1, damp]]);
    c.fill(boundary);
    const faceCenter = mix(top, middle, .28 + .17 * drift);
    c.fillStyle = linear(c, footX, footY, edgeX, edgeY,
      [[0, `${SAND}00`], [.27, `${top}bf`], [.51, top], [.69, faceCenter], [.89, middle], [1, mix(middle, damp, .36)]]);
    c.fill(face);

    c.save();
    c.clip(face);
    if (rockSheet) {
      const [sx, sy, sw, sh] = rockSheet;
      const xs = facePoints.map(([x]) => x), ys = facePoints.map(([, y]) => y);
      const left = Math.min(...xs), top = Math.min(...ys);
      c.save(); c.globalAlpha *= .29;
      c.globalCompositeOperation = 'luminosity';
      c.drawImage(materials, sx + sw * (.26 + .13 * drift), sy + sh * (.17 + .10 * Math.cos(seed + index)),
        sw * .30, sh * .27, left, top, Math.max(...xs) - left, Math.max(...ys) - top);
      c.restore();
    }
    const split = .45 + drift * .21;
    c.fillStyle = '#514b3a80';
    c.fill(poly([at(split, .19), at(.97, .34), at(.93, .91), at(split + .05, .78)], .051));
    c.fillStyle = '#f7e2b972';
    c.fill(poly([at(.12, .42), at(.23, .21), at(.65, .16), at(.88, .29), at(split + .08, .39)], .049));
    // Seaward faces pick up a cool wet edge, broken by the ends of the stone.
    const wetLine = .78 + .07 * drift;
    c.fillStyle = '#565e4d58';
    c.fill(poly([at(.13, wetLine), at(.48, wetLine - .12), at(.89, wetLine + .02),
      at(.83, .96), at(.23, .91)], .057));
    stroke(c, [at(.08, .41), at(.29, .28), at(split, .23), at(.73, .27)], '#f9e5bc84', .067, exposed);
    if (drift < .35) stroke(c, [at(.34, .65), at(.48, .55), at(.81, .67)], '#75675055', .054, exposed);
    c.restore();
    c.restore();
    u = end;
  }
  c.restore();

  // The larger pieces lie against the rock. Finer chips lead into the dry sand,
  // with space between clusters so the approach still reads as a beach.
  for (let chip = 0; chip < 11; chip++) {
    const drift = Math.sin(seed + chip * 1.69);
    const atMouth = .085 + chip * .069 + drift * .036;
    const u = openingAtStart ? atMouth : 1 - atMouth;
    const scatter = .5 + .5 * Math.sin(seed + chip * 2.4);
    const [x, y] = point(u, -.05 - .38 * scatter);
    const size = .06 + (.17 + atMouth * .22) * (.5 + .5 * Math.cos(seed + chip * 3.19)) * (1 - .44 * scatter);
    const tilt = Math.atan2(y, x) + Math.PI / 2;
    c.fillStyle = '#755d4679';
    c.fill(ellipse(x + .06, y + .07, size * 1.16, size * .62, tilt));
    c.fillStyle = linear(c, x - size * .55, y - size * .48, x + size * .38, y + size * .57,
      [[0, '#e2cea4'], [.44, '#c7ac85'], [1, '#927455']]);
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

/** Paint loose fragments at the foot. The actual terrace mesh supplies the large stone faces. */
export function paintTerraceFeet(c, beach, rim) {
  c.save();
  c.clip(beach);
  c.globalCompositeOperation = 'source-atop';
  for (const [from, to, seed] of TERRACE_FEET) {
    for (let i = 0; i < 9; i++) {
      const drift = Math.sin(seed + i * 2.41), variety = Math.cos(seed + i * 3.28);
      const sample = from + (to - from) * (.06 + i * .106 + drift * .035);
      const [x, y] = coastalPoint(rim, sample, .925 + .024 * variety);
      const [tx, ty] = coastalPoint(rim, sample + .2, 1);
      const [px, py] = coastalPoint(rim, sample - .2, 1);
      const width = .12 + .18 * (.5 + .5 * variety);
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(ty - py, tx - px) + .48 * drift);
      c.scale(width, width * (.52 + .14 * drift));
      c.fillStyle = '#78644845';
      c.fill(ellipse(.14, .18, 1.16, .78));
      c.fillStyle = linear(c, -.36, -.56, .43, .45,
        [[0, '#d5ca9c83'], [.39, '#bca88091'], [1, '#8c785b6b']]);
      c.fill(poly([[-1, .08], [-.58, -.53], [.14, -.63], [.81, -.34], [1, .18], [.43, .56], [-.43, .58]], .05));
      c.restore();
    }
  }
  c.restore();
}
