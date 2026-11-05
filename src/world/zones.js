// Exact story ids and pure zone tests. Desk takes priority inside the cottage zone.
import { layout } from '../config.js';
import { terrainHeight } from './terrain.js';

export const zones = [
  { id: 'desk', x: -5.35, z: 3.3, radius: 1.35, y: terrainHeight(-7, 3) },
  { id: 'cottage', x: -7, z: 5.8, radius: 2.3, y: terrainHeight(-7, 5.8) },
  { id: 'shore', x: -2, z: 17, radius: 3, y: 1.03 },
  { id: 'tower_door', x: layout.lighthouse.x, z: layout.lighthouse.z + 2.8, radius: 1.8,
    y: terrainHeight(layout.lighthouse.x, layout.lighthouse.z) },
];
export function findZone(position, list = zones) {
  let closest = null, bestDistance = Infinity;
  for (const zone of list) {
    const distance = Math.hypot(position.x - zone.x, position.z - zone.z);
    if (distance <= zone.radius && Math.abs(position.y - zone.y) < 2.5) {
      // Normalising by radius avoids a large zone swallowing a small desk zone.
      const score = distance / zone.radius;
      if (score < bestDistance) { closest = zone.id; bestDistance = score; }
    }
  }
  return closest;
}
