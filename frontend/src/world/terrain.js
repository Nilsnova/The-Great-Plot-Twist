// Canonical logical heights and coast tests; the active visual terrain is pixel art.
import { layout } from '../config.js';
import { lerp, smoothstep } from '../core/math.js';
import { createPixelTerrain } from '../pixel/terrain.js';
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
export const createTerrain = createPixelTerrain;
