import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const START = 232, STEP = 4;
const HEIGHTS = [0, .12, .25, .59, 1.34, 2.17, 2.01, 1.31, .47, .34,
  1.17, 1.91, 1.55, .62, .37, 1.31, 1.96, 1.48, .44, 0];
const STONE_LIGHT = '#c5a681', STONE = '#ab8b68', STONE_DARK = '#8b7053';
const MOSS = ['#718f3e', '#7d9844', '#839c49'];
// The small sea rocks sit between the three beach approaches, beyond the playable coast.
const SEA_ROCKS = [
  {bearing: 38, distance: 2.9, width: 1.05, height: 1.45},
  {bearing: 46, distance: 3.95, width: .72, height: .82},
  {bearing: 136, distance: 3.7, width: 1.09, height: 1.57},
  {bearing: 146, distance: 3.65, width: .76, height: .85},
];
const mixPoint = (a, b, share) => a.map((value, index) => value + (b[index] - value) * share);

// The shared silhouette supplies the exact coast. Every row is outboard of it, and the
// narrow crest has no level top or new walking surface. Height only affects the drawing.
function crossSections() {
  const coast = cliffProfile(surfaces.home_islet);
  const sections = [];
  for (const [index, lift] of HEIGHTS.entries()) {
    const bearing = START + index * STEP;
    const {x, z} = coast[bearing / 2], length = Math.hypot(x, z);
    const width = .16 + lift * .85;
    const point = (share, elevation) => {
      const out = .065 + width * share;
      return [x + x / length * out, elevation, z + z / length * out];
    };
    sections.push({
      toe: point(0, 0),
      ledge: point(.14, lift * .25),
      shoulder: point(.31, lift * .72),
      lip: point(.43, lift * .81),
      crown: point(.61, lift),
      back: point(.81, lift * .76),
      heel: point(1, 0),
    });
  }
  return sections;
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
  const positions = [], colors = [], uvs = [], sections = crossSections();
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
    panel(edge(top, -.019), edge(top, .019), edge(bend, .031), edge(bend, -.031), '#9b7d5d', '#876b50');
    triangle(edge(bend, -.031), edge(bend, .031), bottom, '#876b50', '#876b50', '#9c7d5f');
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
    const a = sections[i], b = sections[i + 1], moss = MOSS[i < 8 ? 0 : i < 14 ? 1 : 2];
    panel(a.heel, b.heel, b.back, a.back, STONE_DARK, STONE);
    panel(a.back, b.back, b.crown, a.crown, '#5d7439', moss);
    panel(a.crown, b.crown, b.lip, a.lip, moss, '#586b36');
    panel(a.lip, b.lip, b.shoulder, a.shoulder, '#a8906a', STONE_LIGHT);
    panel(a.shoulder, b.shoulder, b.ledge, a.ledge, STONE_LIGHT, STONE);
    panel(a.ledge, b.ledge, b.toe, a.toe, STONE, STONE_DARK);
    if ([4, 6, 11, 15, 17].includes(i)) {
      const start = mixPoint(a.lip, b.lip, .27);
      const bend = mixPoint(a.shoulder, b.shoulder, .39);
      const end = mixPoint(a.ledge, b.ledge, .32);
      fissure(start, bend, end);
    }
    if ([4, 5, 6, 10, 11, 15, 16].includes(i)) {
      const left = mixPoint(a.shoulder, a.ledge, .38 + .08 * Math.sin(i * 2.1));
      const right = mixPoint(b.shoulder, b.ledge, .42 + .10 * Math.cos(i * 2.3));
      const under = point => [point[0], point[1] - .045, point[2]];
      panel(left, right, under(right), under(left), '#9d7957', '#b59672');
    }
    if (i > 2 && i < sections.length - 4 && i % 3 !== 1) {
      const left = mixPoint(a.crown, b.crown, .22), right = mixPoint(a.crown, b.crown, .74);
      const sprig = mixPoint(left, right, .38);
      sprig[1] += .19 + .12 * Math.sin(i * 3.7);
      triangle(left, right, sprig, moss, moss, '#a1ad56');
    }
  }
  const shore = cliffProfile(surfaces.home_islet);
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
