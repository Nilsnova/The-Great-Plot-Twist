import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const START = 212, STEP = 4;
const HEIGHTS = [0, .20, .61, .80, .81, .67, .60, 1.07, 1.12, 1.10,
  .94, .77, 1.31, 1.39, 1.42, 1.38, 1.22, .70, .92, 1.43,
  1.48, 1.46, 1.18, .72, .62, .97, 1.01, .83, .54, .24, 0];
const STONE_TOP = ['#c8a581', '#bd9a75', '#c4a07a', '#d0ae88'];
const STONE_FACE = ['#ab8867', '#a48361', '#b18e69', '#b5916d'];
const STONE_FOOT = '#8b6c53';
const GRASS = ['#91b046', '#96b447', '#99b647', '#91af45'];
const GRASS_LIP = '#80a13d', GRASS_EDGE = '#6e8733';
// The small sea rocks sit between the three beach approaches, beyond the playable coast.
const SEA_ROCKS = [
  {bearing: 48, distance: 2.9, width: 1.05, height: 1.45},
  {bearing: 56, distance: 3.95, width: .72, height: .82},
  {bearing: 128, distance: 3.7, width: 1.09, height: 1.57},
  {bearing: 146, distance: 3.65, width: .76, height: .85},
];
const mixPoint = (a, b, share) => a.map((value, index) => value + (b[index] - value) * share);

// Both shelves sit behind the existing shore. Their caps have real display height,
// while the analytic coast remains the only walkable surface.
function crossSections(coast) {
  return HEIGHTS.map((lift, index) => {
    const bearing = START + index * STEP;
    const {x, z} = coast[bearing / 2], length = Math.hypot(x, z);
    const width = .24 + Math.sqrt(lift) * 2.82;
    const point = (share, elevation) => {
      const out = .085 + width * share;
      return [x + x / length * out, elevation, z + z / length * out];
    };
    const lower = lift * .49;
    return {
      front: point(0, 0),
      frontBatter: point(.04, lower * .24),
      frontStone: point(.07, lower * .92),
      frontLip: point(.11, lower),
      frontCap: point(.15, lower),
      upperFoot: point(.58, lower),
      upperBatter: point(.61, lower + lift * .10),
      upperStone: point(.64, lift * .96),
      upperLip: point(.67, lift),
      upperCap: point(.71, lift),
      crest: point(.95, lift),
      back: point(.99, lift * .70),
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
export function createHomeRearRim(group) {
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
  function fissure(top, bend, bottom) {
    const edge = (point, offset) => [point[0] + offset, point[1], point[2]];
    panel(edge(top, -.011), edge(top, .011), edge(bend, .024), edge(bend, -.024), '#a08063', '#82664d');
    triangle(edge(bend, -.024), edge(bend, .024), bottom, '#82664d', '#82664d', '#967557');
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
    const tint = (i * 13 + Math.floor(i / 3) * 2) % 4;
    const grass = GRASS[Math.floor(i / 3) % GRASS.length];
    const strip = (far, near, high, low) => panel(a[far], b[far], b[near], a[near], high, low);
    strip('heel', 'back', STONE_FOOT, STONE_FACE[tint]);
    strip('back', 'crest', GRASS_EDGE, grass);
    strip('crest', 'upperCap', '#82a13c', grass);
    strip('upperCap', 'upperLip', grass, GRASS_LIP);
    strip('upperLip', 'upperStone', GRASS_LIP, STONE_TOP[tint]);
    strip('upperStone', 'upperBatter', STONE_TOP[tint], STONE_FACE[tint]);
    strip('upperBatter', 'upperFoot', STONE_FACE[tint], STONE_FOOT);
    strip('upperFoot', 'frontCap', '#799237', grass);
    strip('frontCap', 'frontLip', grass, GRASS_LIP);
    strip('frontLip', 'frontStone', GRASS_LIP, STONE_TOP[tint]);
    strip('frontStone', 'frontBatter', STONE_TOP[tint], STONE_FACE[tint]);
    strip('frontBatter', 'front', STONE_FACE[tint], STONE_FOOT);

    // Stagger the joints between the two retaining courses so the shelf reads as blocks.
    if (i > 1 && i < sections.length - 3) {
      for (const [top, bottom, offset] of [['frontStone', 'frontBatter', .30], ['upperStone', 'upperBatter', .69]]) {
        const start = mixPoint(a[top], b[top], offset);
        const end = mixPoint(a[bottom], b[bottom], offset + .08);
        fissure(start, mixPoint(start, end, .68), end);
      }
    }
    // Small patches of lime and moss break the wide grass without adding a new object or layer.
    if (i > 3 && i < sections.length - 4 && i % 3 !== 0) {
      const near = mixPoint(a.frontCap, b.frontCap, .16);
      const far = mixPoint(a.upperFoot, b.upperFoot, .73);
      const patch = mixPoint(near, far, .67);
      const left = mixPoint(near, patch, .61), right = mixPoint(mixPoint(a.frontCap, b.frontCap, .68), far, .49);
      triangle(left, right, patch, '#97b747', '#93b346', grass, [.56, .44, 0]);
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
  return rim;
}
