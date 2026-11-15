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
//     .refresh()        once a tick: the layout from the walls' hp now (skipped while no hp changed; the
//                       distance field is rebuilt only when the layout's key changes)
//     .next(boarder)    {kind: 'wall', wallId} | {kind: 'step', x, z} | {kind: 'heart'} | {kind: 'none'}
//     .canReach(a, b)   a straight walk from a to b crosses no water and no standing wall
import { buildLayout, cellOf, centreOf, createGrid } from './path-grid.js';
import { createFieldCache, lineIsClear, nextStep } from './pathing.js';

export const WALL_FOOTPRINT = 2; // units: T36's wall square (FOOTPRINTS.wall in src/island/placement.js)
const INSET = .25;               // points this far inside the square's edges, so only cells it covers count
const MARGIN = 1.15;             // the grid reaches this many coast radii out, past every beach
// Balance retune (specs/T33-T35-balance.md): a boarder that comes this close (units, to the edge of the
// footprint) to a standing wall across its straight way to the heart (so not a neighbour of the gap it walks
// through) stops and hacks it, as the fixed routes do, instead of walking round. Without it today's lone wall spots are walked round and the walls lose their
// value (the T35 finding). 0 switches it off (pure detour/breach).
export const WALL_ENGAGE = 3;
export const WALL_LANE = .25;    // ... and a wall counts as across the way when the straight line passes this close to its footprint

// Battle clarity (15 Nov, owner: "only once a wall breaks can pirates go forward"): a boarder's body keeps this far
// (units) off a standing wall's footprint; a step that would come closer stops there and the boarder hacks that wall.
export const BODY = .3;

/** How far a point is from a wall's 2 x 2 footprint (0 on or inside it). Plain sums: the same bits everywhere. */
export function edgeDistance(point, wall) {
  const half = WALL_FOOTPRINT / 2;
  const dx = Math.max(Math.abs(point.x - wall.x) - half, 0), dz = Math.max(Math.abs(point.z - wall.z) - half, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * The first standing wall a straight step from `from` to `to` runs into: {wall, t} (t: the share of the step walked
 * before it, 0..1), or null. A wall counts from BODY off its footprint; a boarder already that close to one (it stands
 * hacking next to it) is stopped by the footprint itself, and one already inside a footprint (a wall rebuilt round
 * it) may walk out. `walls` in id order: equal t goes to the lower id. Pure and deterministic.
 */
export function wallInWay(from, to, walls, body = BODY) {
  const half = WALL_FOOTPRINT / 2, dx = to.x - from.x, dz = to.z - from.z;
  let best = null, bestT = Infinity;
  for (const wall of walls) {
    if (!(wall.hp > 0)) continue;
    const inside = (h) => Math.abs(from.x - wall.x) < h - 1e-9 && Math.abs(from.z - wall.z) < h - 1e-9;
    if (inside(half)) continue;
    const h = inside(half + body) ? half : half + body;
    let t0 = 0, t1 = 1, hit = true;
    for (const [p, d, c] of [[from.x, dx, wall.x], [from.z, dz, wall.z]]) {
      if (Math.abs(d) < 1e-12) { if (p <= c - h || p >= c + h) hit = false; continue; }
      const ta = (c - h - p) / d, tb = (c + h - p) / d;
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (hit && t0 < t1 - 1e-12 && t0 < bestT - 1e-12) { best = wall; bestT = t0; }
  }
  return best ? { wall: best, t: bestT } : null;
}

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
  let layout = buildLayout(grid, [], pace), field = cache.fieldFor(layout, heart), seen = null;

  function refresh() {
    // Most ticks no wall's hp changed: then the layout of the last tick still holds.
    const hps = walls.map(wall => `${wall.hp}/${wall.maxHp}`).join(',');
    if (hps === seen) return;
    seen = hps;
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
  // The standing wall in the boarder's way within WALL_ENGAGE of it (nearest edge; ties: the lower id).
  const toHeart = point => { const dx = point.x - heart.x, dz = point.z - heart.z; return Math.sqrt(dx * dx + dz * dz); }; // plain sums: the same bits in every browser
  const sorted = [...walls].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  function engaged(boarder) {
    if (!(WALL_ENGAGE > 0)) return null;
    const half = WALL_FOOTPRINT / 2, own = toHeart(boarder);
    if (!(own > 1e-9)) return null;
    const ux = (heart.x - boarder.x) / own, uz = (heart.z - boarder.z) / own;
    let best = null, near = WALL_ENGAGE + 1e-9;
    for (const wall of sorted) {
      if (!(wall.hp > 0)) continue;
      // Only a wall ahead, across the straight way to the heart (not a neighbour of the gap it walks through).
      const wx = wall.x - boarder.x, wz = wall.z - boarder.z, along = wx * ux + wz * uz, side = Math.abs(wx * uz - wz * ux);
      if (!(along > 1e-9) || along > own + 1e-9 || side > half + WALL_LANE + 1e-9) continue;
      const dx = Math.max(Math.abs(boarder.x - wall.x) - half, 0), dz = Math.max(Math.abs(boarder.z - wall.z) - half, 0);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < near - 1e-9) { best = wall; near = d; }
    }
    return best;
  }
  function next(boarder) {
    const index = cellOf(grid, boarder.x, boarder.z);
    if (index >= 0 && index === field.goalIndex) return { kind: 'heart' };
    const wall = engaged(boarder);
    if (wall) return { kind: 'wall', wallId: wall.id };
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
