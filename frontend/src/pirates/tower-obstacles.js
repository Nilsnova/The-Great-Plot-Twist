// The standing tower shapes boarders must walk around or break (T35, D058 proposed).
// Used by sim.js and battle-guide.js only when a wave carries tower_obstacles.
import {FOOTPRINTS} from '../island/placement.js';

export const TOWER_FOOTPRINT = FOOTPRINTS.tower;
const HALF = TOWER_FOOTPRINT / 2;
const INSET = .25;
const SAMPLE_STEP = (HALF - INSET) * 2 / 3;

/** How far a point is from a tower's T36 square (zero on or inside it). */
export function towerEdgeDistance(point, tower) {
  const dx = Math.max(Math.abs(point.x - tower.x) - HALF, 0);
  const dz = Math.max(Math.abs(point.z - tower.z) - HALF, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/** The nearest point on the outside edge of a tower footprint, in the direction of `from`. */
export function towerApproachPoint(from, tower, margin = 0) {
  const x = Math.max(tower.x - HALF, Math.min(tower.x + HALF, from.x));
  const z = Math.max(tower.z - HALF, Math.min(tower.z + HALF, from.z));
  if (margin <= 0) return {x, z};
  const dx = from.x - x, dz = from.z - z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-9) return {x: x + dx / d * margin, z: z + dz / d * margin};
  return {x: tower.x, z: tower.z - HALF - margin};
}

/** Every standing damageable tower as a generic breakable square for the T35 distance field. */
export function towerObstacles(towers = []) {
  return towers.filter(tower => tower && tower.maxHp > 0
      && ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel'].includes(tower.kind))
    .map(tower => ({...tower, source: tower, cells: towerFootprintPoints(tower), obstacleKind: 'tower'}))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function towerFootprintPoints(tower) {
  const points = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const offset = -HALF + INSET + i * SAMPLE_STEP;
      const across = -HALF + INSET + j * SAMPLE_STEP;
      points.push({x: tower.x + offset, z: tower.z + across});
    }
  }
  return points;
}
