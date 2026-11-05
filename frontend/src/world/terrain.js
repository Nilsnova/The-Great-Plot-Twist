// Shared logical land heights and a flat illustrated coastline. Art ignores elevation.
import * as THREE from 'three';
import { layout, colors } from '../config.js';
import { lerp, smoothstep, seededRandom } from '../core/math.js';
import { polygon, paintedBlob, brushLines } from './primitives.js';
import { projectPoint } from './art.js';

function naturalHeight(x, z) {
  const angle = Math.atan2(z / 23, x / 26);
  const edge = 1 + Math.sin(angle * 3) * 0.055 + Math.cos(angle * 7) * 0.025;
  const radius = Math.hypot(x / 26, z / 23) / edge;
  const land = Math.max(0, 1 - radius * radius);
  const hill = 4 * Math.exp(-((x - 9) ** 2 / 85 + (z + 8) ** 2 / 100));
  return -1.5 + 5.7 * land ** 1.25 + hill * land;
}
export function terrainHeight(x, z) {
  let height = naturalHeight(x, z);
  const pads = [[layout.cottage, 4.9, 3.7], [layout.lighthouse, 3.6, 3.6], [layout.boathouse, 2.9, 2.5]];
  for (const [point, width, depth] of pads) {
    const distance = Math.max(Math.abs(x - point.x) / width, Math.abs(z - point.z) / depth);
    height = lerp(naturalHeight(point.x, point.z), height, smoothstep(0.8, 1.3, distance));
  }
  return height;
}
export function coastline(height) {
  const points = [];
  for (let i = 0; i < 160; i++) {
    const angle = i / 160 * Math.PI * 2;
    let low = 0, high = 1.35;
    for (let step = 0; step < 15; step++) {
      const radius = (low + high) / 2;
      if (terrainHeight(Math.cos(angle) * 26 * radius, Math.sin(angle) * 23 * radius) > height) low = radius;
      else high = radius;
    }
    const point = projectPoint(Math.cos(angle) * 26 * low, Math.sin(angle) * 23 * low);
    points.push([point.x, point.y]);
  }
  return points;
}
export function createTerrain() {
  const group = new THREE.Group();
  polygon(group, coastline(-0.12), '#abc1ac', 1);
  polygon(group, coastline(0.03), '#dbc799', 2);
  polygon(group, coastline(0.5), colors.sand, 3);
  polygon(group, coastline(1.0), colors.grass, 4);
  for (const [x, z, w, h] of [[-13, -5, 7, 4], [-4, -13, 7, 2.8], [15, 1, 5, 4], [-14, 8, 4, 3]]) {
    const point = projectPoint(x, z);
    paintedBlob(group, point.x, point.y, w, h, '#a8bf89', 5, 0.4);
  }
  const random = seededRandom(121), marks = [];
  for (let i = 0; i < 160; i++) {
    const x = random() * 43 - 21.5, z = random() * 35 - 17.5;
    if (terrainHeight(x, z) < 1.3) continue;
    const point = projectPoint(x, z), length = 0.1 + random() * 0.25;
    marks.push([[point.x, point.y], [point.x + length, point.y + 0.035]]);
  }
  brushLines(group, marks, '#839e70', 6, 0.35);
  return group;
}
