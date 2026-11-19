import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {placeArt} from '../art.js';
import {projectGround, projectedCoastBounds} from '../projection.js';
import {surfaces} from './surfaces.js';

const START = 200, STEP = 4;
// Both shoulders sweep toward the inlet. The full 248–292° Smugglers approach stays open.
const HEIGHTS = [
  0, .14, .62, 1.22, 1.80, 1.80, 2.42, 2.69, 2.69, 2.54, 2.54, 1.56, 0, // West, 200–248°
  ...Array(10).fill(0),
  0, 1.44, 2.14, 2.54, 2.65, 2.79, 2.79, 2.44, 2.30, 1.63, 1.09, .55, .16, 0, // East, 292–344°
];
const STONE_TOP = ['#e5bf8d', '#dbb283', '#e1b986', '#e7c197'];
const STONE_FACE = ['#c29a6d', '#b9966b', '#bc8f65', '#c8a178'];
const STONE_FOOT = '#85634b';
const GRASS = ['#a4c855', '#a5c458', '#a1c354', '#9cb54d'];
const GRASS_LIP = '#90ab4b', GRASS_EDGE = '#748a37';
const TERRACE_PLANTS = [
  {section: 4, along: .58, depth: .23, asset: 'birch', size: .62},
  {section: 6, along: .68, depth: .79, asset: 'rock', size: .7},
  {section: 8, along: .45, depth: .35, asset: 'shrub', size: .62},
  {section: 10, along: .33, depth: .42, asset: 'rock', size: .54},
  {section: 25, along: .61, depth: .40, asset: 'rock', size: .53},
  {section: 27, along: .63, depth: .62, asset: 'oak', size: .60},
  {section: 29, along: .79, depth: .41, asset: 'flowers', size: .61},
  {section: 32, along: .55, depth: .39, asset: 'shrub', size: .71},
];
// The small sea rocks sit between the three beach approaches, beyond the playable coast.
const SEA_ROCKS = [
  {bearing: 48, distance: 2.9, width: 1.05, height: 1.45},
  {bearing: 56, distance: 3.95, width: .72, height: .82},
  {bearing: 128, distance: 3.7, width: 1.09, height: 1.57},
  {bearing: 146, distance: 3.65, width: .76, height: .85},
];
const mixPoint = (a, b, share) => a.map((value, index) => value + (b[index] - value) * share);

// Three shelves sit behind the existing shore. Their caps have real display height,
// while the analytic coast remains the only walkable surface.
function crossSections(coast) {
  const bounds = projectedCoastBounds(coast);
  return HEIGHTS.map((lift, index) => {
    const bearing = START + index * STEP;
    const {x, z} = coast[bearing / 2], length = Math.hypot(x, z);
    const slope = projectGround(x / length, z / length).x;
    const edge = slope < 0 ? bounds.minX + .21 : bounds.maxX - .21;
    const room = (edge - projectGround(x, z).x) / slope - .09;
    const width = THREE.MathUtils.clamp(room, .18, .34 + Math.sqrt(lift) * 3.6);
    const point = (share, elevation) => {
      const out = .09 + width * share;
      return [x + x / length * out, elevation, z + z / length * out];
    };
    const lower = lift * (.32 + Math.sin(index * .71) * .032);
    const middle = lift * (.63 + Math.cos(index * .73) * .036);
    const midEdge = .31 + Math.sin(index * .78) * .033;
    const upperEdge = .63 + Math.cos(index * .83) * .043;
    return {
      lift,
      front: point(0, 0),
      frontBatter: point(.036, lower * .22),
      frontStone: point(.053, lower * .91),
      frontLip: point(.081, lower),
      frontCap: point(.123, lower),
      middleFoot: point(midEdge, lower),
      middleBatter: point(midEdge + .027, lower + (middle - lower) * .17),
      middleStone: point(midEdge + .045, middle - (middle - lower) * .08),
      middleLip: point(midEdge + .059, middle),
      middleCap: point(midEdge + .108, middle),
      upperFoot: point(upperEdge, middle),
      upperBatter: point(upperEdge + .021, middle + (lift - middle) * .16),
      upperStone: point(upperEdge + .035, lift - (lift - middle) * .085),
      upperLip: point(upperEdge + .063, lift),
      upperCap: point(upperEdge + .091, lift),
      crest: point(.95, lift),
      back: point(.993, lift * .69),
      heel: point(1, 0),
    };
  });
}

function surfaceGrain() {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const shade = 235 + ((Math.imul(i + 97, 2654435761) >>> 23) % 21);
    pixels.set([shade, shade, shade, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** One Home painter layer between ocean and backdrop, owned by the settlement's lifetime. */
export function createHomeRearRim(group, art) {
  const shore = cliffProfile(surfaces.home_islet);
  const positions = [], colors = [], uvs = [], sections = crossSections(shore);
  const tint = new THREE.Color();
  function triangle(a, b, c, first, second = first, third = first, opacity = [1, 1, 1]) {
    for (const [[x, elevation, z], style, alpha] of [[a, first, opacity[0]], [b, second, opacity[1]], [c, third, opacity[2]]]) {
      const ground = projectGround(x, z);
      positions.push(ground.x, ground.y + elevation, .1 * z);
      tint.set(style);
      colors.push(tint.r, tint.g, tint.b, alpha);
      uvs.push(ground.x * .38, (ground.y + elevation) * .38);
    }
  }
  function panel(a, b, c, d, upper, lower) {
    triangle(a, b, c, upper, upper, lower);
    triangle(a, c, d, upper, lower, lower);
  }
  function facing(a, b, top, base, tint, joint = null) {
    panel(a[top], b[top], b[base], a[base], '#a28b6a', STONE_FOOT);
    const keys = joint === null ? [0, 1] : [0, joint, 1];
    const at = (x, down) => mixPoint(mixPoint(a[top], b[top], x), mixPoint(a[base], b[base], x), down);
    for (let j = 1; j < keys.length; j++) {
      const left = keys[j - 1] + .019, right = keys[j] - .024, bevel = .082;
      const p = at(left, .17), q = at(left + bevel, .041), r = at(right - bevel, .061), s = at(right, .236);
      const t = at(right, .78), u = at(right - bevel, .93), v = at(left + bevel, .945), w = at(left, .81);
      const light = STONE_TOP[(tint + j - 1) % STONE_TOP.length], face = STONE_FACE[tint];
      panel(q, r, s, p, light, face);
      panel(p, s, t, w, face, '#a38360');
      panel(w, t, u, v, '#a38360', '#91714f');
    }
  }

  function grassTuft([x, elevation, z], size) {
    const base = [x, elevation, z];
    const tip = (dx, height, dz) => [x + dx * size, elevation + height * size, z + dz * size];
    triangle(tip(-.24, 0, .06), base, tip(-.19, .24, -.03), '#648432', '#709238', '#8caa42');
    triangle(tip(-.13, 0, .07), tip(.13, 0, .03), tip(.05, .31, -.02), '#6b8e34', '#74973c', '#b3c953');
    triangle(base, tip(.22, 0, .05), tip(.27, .19, -.03), '#779b3b', '#658433', '#a1be4c');
  }

  function rockChip([x, elevation, z], size) {
    const pt = (dx, height, dz) => [x + dx * size, elevation + height * size, z + dz * size];
    const left = pt(-.42, 0, .09), front = pt(-.08, 0, .32), right = pt(.44, 0, .12);
    const crown = pt(-.09, .31, -.06), back = pt(.12, .15, -.31);
    triangle(left, front, crown, '#aba083', '#948975', '#d6c4a2');
    triangle(front, right, crown, '#948975', '#8a7d68', '#ccb896');
    triangle(left, crown, back, '#b9ac8b', '#e1cfaa', '#c4b390');
    triangle(right, back, crown, '#8d806d', '#b6a585', '#ccb896');
  }
  function addSeaRock({bearing, distance, width, height}, shore) {
    const {x, z} = shore[bearing / 2], length = Math.hypot(x, z);
    const originX = x + distance * x / length, originZ = z + distance * z / length;
    const sides = 7;
    const ring = (scale, elevation, skew) => Array.from({length: sides}, (_, side) => {
      const angle = (side + .18) * Math.PI * 2 / sides;
      const radius = width * scale * (1 + .13 * Math.sin(side * 7.3 + bearing));
      return [originX + Math.cos(angle) * radius - skew, elevation * (1 + .11 * Math.cos(side * 2.7)),
        originZ + Math.sin(angle) * radius * .86];
    });
    const base = ring(1, 0, 0), shoulder = ring(.91, height * .52, .05), crown = ring(.52, height * .94, .17);
    const surfEdge = ring(1.42, 0, 0), surf = '#cbf4e9';
    for (const index of [0, 1, 2, 4, 5, 6]) {
      const next = (index + 1) % sides;
      const opacity = index < 3 ? .78 : .31;
      triangle(base[index], surfEdge[index], surfEdge[next], surf, surf, surf, [opacity, 0, 0]);
      triangle(base[index], surfEdge[next], base[next], surf, surf, surf, [opacity, 0, opacity]);
    }
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      const lit = index < 3 || index > 4;
      panel(base[index], base[next], shoulder[next], shoulder[index], '#746f5f', lit ? '#a49b84' : '#817a69');
      panel(shoulder[index], shoulder[next], crown[next], crown[index], lit ? '#a49b84' : '#817a69', lit ? '#cec0a4' : '#a09582');
      triangle(crown[index], crown[next], [originX - .2, height, originZ], '#c9b89b', '#c2b29b', '#d9c6a6');
    }
  }
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1];
    if (a.lift === 0 && b.lift === 0) continue;
    const tint = (i + Math.floor(i / 3) * 2) % STONE_FACE.length;
    const middleTint = (tint + 1) % STONE_FACE.length;
    const grass = GRASS[Math.floor(i / 3) % GRASS.length];
    const strip = (far, near, high, low) => panel(a[far], b[far], b[near], a[near], high, low);
    strip('heel', 'back', STONE_FOOT, STONE_FACE[tint]);
    strip('back', 'crest', GRASS_EDGE, grass);
    strip('crest', 'upperCap', '#90a947', '#b0ca63');
    strip('upperCap', 'upperLip', grass, GRASS_LIP);
    strip('upperLip', 'upperStone', GRASS_LIP, STONE_TOP[tint]);
    facing(a, b, 'upperStone', 'upperBatter', tint, i % 5 === 3 ? .46 : null);
    strip('upperBatter', 'upperFoot', STONE_FACE[tint], STONE_FOOT);
    strip('upperFoot', 'middleCap', '#8ca549', grass);
    strip('middleCap', 'middleLip', grass, GRASS_LIP);
    strip('middleLip', 'middleStone', GRASS_LIP, STONE_TOP[middleTint]);
    facing(a, b, 'middleStone', 'middleBatter', middleTint, i % 5 === 2 ? .44 : null);
    strip('middleBatter', 'middleFoot', STONE_FACE[middleTint], STONE_FOOT);
    strip('middleFoot', 'frontCap', '#7e963e', grass);
    strip('frontCap', 'frontLip', grass, GRASS_LIP);
    strip('frontLip', 'frontStone', GRASS_LIP, STONE_TOP[tint]);
    facing(a, b, 'frontStone', 'frontBatter', tint, i % 5 === 1 ? .62 : null);
    strip('frontBatter', 'front', STONE_FACE[tint], STONE_FOOT);

    const cap = (near, far, along, depth) => mixPoint(mixPoint(a[near], b[near], along), mixPoint(a[far], b[far], along), depth);
    if ([4, 6, 9, 25, 28, 31].includes(i)) grassTuft(cap('frontCap', 'middleFoot', .57, .57), 1.15);
    if ([5, 7, 26, 29, 32].includes(i)) {
      grassTuft(cap('upperCap', 'crest', .64, .64), 1.08);
      rockChip(cap('upperCap', 'crest', .41, .43), .85 + .12 * (i % 3));
    }
  }
  for (const rock of SEA_ROCKS) addSeaRock(rock, shore);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const material = new THREE.MeshBasicMaterial({map: surfaceGrain(), vertexColors: true, transparent: true,
    side: THREE.DoubleSide, forceSinglePass: true, depthTest: false, depthWrite: false, toneMapped: false});
  const rim = new THREE.Mesh(geometry, material);
  rim.name = 'home-rear-rim';
  rim.renderOrder = 3;
  rim.raycast = () => {};
  group.add(rim);
  if (art) {
    const planting = new THREE.Group();
    planting.name = 'home-terrace-planting';
    group.add(planting);
    for (const {section, along, depth, asset, size} of TERRACE_PLANTS) {
      const a = sections[section], b = sections[section + 1];
      const [x, y, z] = mixPoint(mixPoint(a.upperCap, b.upperCap, along), mixPoint(a.crest, b.crest, along), depth);
      const plant = placeArt(planting, art, asset, x, z, size);
      plant.position.y += y;
      plant.renderOrder = 4;
      plant.raycast = () => {};
    }
  }
  return rim;
}
