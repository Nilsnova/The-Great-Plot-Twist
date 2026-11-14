// Boarder routes over the island's real wall layout (T34/T35 wiring, specs/T34-T35-targeting-pathing.md,
// decision D040, proposed). Used by sim.js only when the wave carries the rule "pathing" (the server's
// flag, the same on every client of the wave). Without it sim.js keeps today's fixed routes (D040
// "option A"): the shore wall at the landing, the ring wall the boarder heads for, the heart.
//
// Every wall stands on its T36 footprint (a 2 x 2 square around its x, z: island/placement.js), so walls
// placed edge to edge form lines and closed rings, and a boarder takes a gap when walking round is
// quicker than hacking, else breaks through the cheapest wall (pathing.js). Pure and deterministic.
//
//   isOnLand(x, z, coast)                       inside the coastline of surfaces.js (the sim's coastPoint)
//   footprintPoints(wall)                       the world points that mark a wall's cells on the 1-unit grid
//   createBoarderPaths({coast, heart, walls, pace})
//     .refresh()        once a tick: the layout from the walls' hp now (the field is rebuilt only on a change)
//     .next(boarder)    {kind: 'wall', wallId} | {kind: 'step', x, z} | {kind: 'heart'} | {kind: 'none'}
//     .canReach(a, b)   a straight walk from a to b crosses no water and no standing wall
import { buildLayout, cellOf, centreOf, createGrid } from './path-grid.js';
import { createFieldCache, lineIsClear, nextStep } from './pathing.js';

export const WALL_FOOTPRINT = 2; // units: T36's wall square (FOOTPRINTS.wall in src/island/placement.js)
const INSET = .25;               // points this far inside the square's edges, so only cells it covers count
const MARGIN = 1.15;             // the grid reaches this many coast radii out, past every beach

/** True when x, z lies inside the coast (radius 1 of coastPoint in sim.js, the same edge formula). */
export function isOnLand(x, z, coast) {
  const u = x / coast.rx, v = z / coast.rz, a = Math.atan2(v, u);
  const edge = 1 + .055 * Math.sin(a * 5 + coast.seed) + .035 * Math.cos(a * 7);
  return Math.sqrt(u * u + v * v) <= edge;
}

/** A wall's cells as world points: a 4 x 4 lattice inside its footprint square (whole cells it covers). */
export function footprintPoints(wall) {
  const half = WALL_FOOTPRINT / 2 - INSET, points = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    points.push({ x: wall.x - half + i * half * 2 / 3, z: wall.z - half + j * half * 2 / 3 });
  }
  return points;
}

/**
 * The routes of one wave. walls: the sim's wall objects (their hp changes in the wave; read on refresh).
 * pace: {hackPerSecond, speed} of a boarder this wave, for the breach cost.
 */
export function createBoarderPaths({ coast, heart, walls, pace }) {
  const reach = Math.ceil(Math.max(coast.rx, coast.rz) * MARGIN);
  const grid = createGrid({ minX: -reach, minZ: -reach, maxX: reach, maxZ: reach, isWalkable: (x, z) => isOnLand(x, z, coast) });
  const cache = createFieldCache(grid), shapes = walls.map(wall => ({ wall, cells: footprintPoints(wall) }));
  let layout = buildLayout(grid, [], pace), field = cache.fieldFor(layout, heart);

  function refresh() {
    layout = buildLayout(grid, shapes.map(({ wall, cells }) => ({ id: wall.id, hp: wall.hp, maxHp: wall.maxHp, cells })), pace);
    field = cache.fieldFor(layout, heart);
  }
  // A boarder off the walking grid (pushed into the surf): back to the cheapest land cell next to it.
  function backToLand(index) {
    const col = index % grid.cols, row = Math.floor(index / grid.cols);
    let best = -1;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = col + dc, r = row + dr, i = r * grid.cols + c;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows || field.cost[i] === Infinity) continue;
      if (best < 0 || field.cost[i] < field.cost[best]) best = i;
    }
    return best;
  }
  function next(boarder) {
    const index = cellOf(grid, boarder.x, boarder.z);
    if (index >= 0 && index === field.goalIndex) return { kind: 'heart' };
    if (index < 0 || field.cost[index] === Infinity) {
      const land = index >= 0 ? backToLand(index) : -1;
      return land >= 0 ? { kind: 'step', ...centreOf(grid, land) } : { kind: 'none' };
    }
    const step = nextStep(grid, layout, field, index);
    if (!step) return { kind: 'none' };
    if (step.wallId) return { kind: 'wall', wallId: step.wallId };
    return { kind: 'step', ...centreOf(grid, step.index) };
  }
  return {
    refresh, next,
    canReach: (a, b) => lineIsClear(grid, layout, a, b),
    get builds() { return cache.builds; },
    get grid() { return grid; },
    get layout() { return layout; },
  };
}
