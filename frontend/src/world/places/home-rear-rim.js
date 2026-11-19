import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const START = 232, STEP = 4;
const HEIGHTS = [0, .12, .25, .59, 1.34, 2.17, 2.01, 1.31, .47, .34,
  1.17, 1.91, 1.55, .62, .37, 1.31, 1.96, 1.48, .44, 0];
const STONE_LIGHT = ['#c5ad88', '#c3ad8c', '#b8a181'];
const STONE = ['#aa9476', '#b09a7d', '#a79275'];
const STONE_DARK = ['#81705a', '#8c785f', '#8d7b65'];
const GRASS = ['#718f3e', '#85a54a', '#8fa84b'];
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
      lip: point(.43, lift * .89),
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
    const shade = 221 + ((Math.imul(i + 97, 2654435761) >>> 23) % 35);
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
  function triangle(a, b, c, style) {
    tint.set(style);
    for (const [x, elevation, z] of [a, b, c]) {
      const ground = projectGround(x, z);
      positions.push(ground.x, ground.y + elevation, .1 * z);
      colors.push(tint.r, tint.g, tint.b);
      uvs.push(ground.x * .38, (ground.y + elevation) * .38);
    }
  }
  function panel(a, b, c, d, light, dark, flip = false) {
    if (flip) {
      triangle(a, b, d, light);
      triangle(b, c, d, dark);
    } else {
      triangle(a, b, c, light);
      triangle(a, c, d, dark);
    }
  }
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1], shade = i % 3, flip = i % 2 === 0;
    panel(a.heel, b.heel, b.back, a.back, STONE_DARK[shade], STONE[shade], flip);
    panel(a.back, b.back, b.crown, a.crown, GRASS[shade], '#5b7435', flip);
    panel(a.crown, b.crown, b.lip, a.lip, GRASS[(i + 1) % 3], GRASS[shade], flip);
    panel(a.lip, b.lip, b.shoulder, a.shoulder, STONE_LIGHT[shade], STONE[shade], flip);
    panel(a.shoulder, b.shoulder, b.ledge, a.ledge, STONE[shade], STONE_DARK[(i + 1) % 3], flip);
    panel(a.ledge, b.ledge, b.toe, a.toe, STONE_DARK[shade], '#635747', flip);
    if (i > 2 && i < sections.length - 4 && i % 3 !== 1) {
      const left = mixPoint(a.crown, b.crown, .22), right = mixPoint(a.crown, b.crown, .74);
      const sprig = mixPoint(left, right, .38);
      sprig[1] += .19 + .12 * Math.sin(i * 3.7);
      triangle(left, right, sprig, '#9eb052');
      triangle(left, right, mixPoint(a.lip, b.lip, .54), GRASS[(i + 2) % 3]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
