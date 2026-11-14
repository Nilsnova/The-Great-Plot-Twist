// Boarder routes across a wall layout (T35, specs/T34-T35-targeting-pathing.md, decision D040).
// One "distance field" per goal and wall layout: for every cell, the cheapest cost to the goal, where
// walking costs its distance and breaking through a standing wall costs the time spent hacking it.
// A boarder steps to the neighbour cell that is cheapest from here, so it takes a gap when the detour
// is quicker and breaches when hacking is quicker. Every step lowers the cost left, so a boarder can
// never walk in circles while the walls stay the same. Pure and deterministic; used by the tests now
// and by sim.js after the wiring step.
import { DIAGONAL, STEP, cellOf, cellsOnLine, centreOf, standingWallAt } from './path-grid.js';
import { createCellHeap } from './cell-heap.js';

const STRAIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// A cell a boarder may stand next to and walk into, apart from its wall: on the grid and on land.
const isLand = (grid, col, row) => col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.walkable[row * grid.cols + col] === 1;
// A cell that is land with no standing wall on it.
const isOpen = (grid, layout, col, row) => isLand(grid, col, row) && !standingWallAt(layout, row * grid.cols + col);

/**
 * The cells next to `index` with the cost of the step there. Diagonal steps never cut a corner: both
 * cells beside the diagonal must be open, so a diagonal line of wall cells is as closed as a straight one.
 * A diagonal step also needs both of its own cells open: walls are entered and left only straight on,
 * which keeps the steps the same in both directions.
 */
export function neighbours(grid, layout, index) {
  const col = index % grid.cols, row = Math.floor(index / grid.cols), out = [];
  for (const [dc, dr] of STRAIGHT) {
    if (isLand(grid, col + dc, row + dr)) out.push({ index: (row + dr) * grid.cols + col + dc, step: STEP });
  }
  if (!isOpen(grid, layout, col, row)) return out;
  for (const [dc, dr] of DIAGONALS) {
    if (!isOpen(grid, layout, col + dc, row + dr)) continue;
    if (!isOpen(grid, layout, col + dc, row) || !isOpen(grid, layout, col, row + dr)) continue;
    out.push({ index: (row + dr) * grid.cols + col + dc, step: DIAGONAL });
  }
  return out;
}

// What it costs to enter a cell: nothing for open ground, the wall's breach cost for a standing wall.
const enterCost = (layout, index) => standingWallAt(layout, index)?.cost ?? 0;

/**
 * The distance field to `goal` (a world point) on this layout: field.cost[i] is the cheapest total
 * cost from cell i to the goal, Infinity where no way exists (cut off by water or the grid's edge).
 * Walls never make a cell unreachable, because a standing wall can always be hacked down.
 */
export function buildField(grid, layout, goal) {
  const cost = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  const goalIndex = cellOf(grid, goal.x, goal.z);
  const field = { cost, goalIndex, key: layout.key };
  if (goalIndex < 0 || !grid.walkable[goalIndex]) return field;
  const heap = createCellHeap();
  cost[goalIndex] = 0; heap.push(0, goalIndex);
  while (heap.size) {
    const { cost: here, index } = heap.pop();
    if (here > cost[index]) continue; // an older, dearer entry for a cell already settled
    const entry = here + (index === goalIndex ? 0 : enterCost(layout, index));
    for (const next of neighbours(grid, layout, index)) {
      const total = entry + next.step; // walking from `next` into this cell
      if (total < cost[next.index]) { cost[next.index] = total; heap.push(total, next.index); }
    }
  }
  return field;
}

/**
 * The next cell for a boarder on cell `index`: {index, wallId} where wallId names the standing wall it
 * must hack before entering (null for open ground). null at the goal or where no way exists. Ties go to
 * the lower cell index. A boarder standing inside a wall that was rebuilt around it simply steps out.
 */
export function nextStep(grid, layout, field, index) {
  if (index < 0 || index === field.goalIndex || field.cost[index] === Infinity) return null;
  let best = null, bestCost = Infinity;
  for (const next of neighbours(grid, layout, index)) {
    const total = next.step + (next.index === field.goalIndex ? 0 : enterCost(layout, next.index)) + field.cost[next.index];
    if (total < bestCost || (total === bestCost && next.index < best.index)) { best = next; bestCost = total; }
  }
  if (!best || bestCost === Infinity) return null;
  return { index: best.index, wallId: standingWallAt(layout, best.index)?.id ?? null };
}

/**
 * The whole route from a world point, as the walls stand now: the cell centres in order and the walls
 * it breaks through. reachable is false when no way to the goal exists. For tests, drawing and replays.
 */
export function followPath(grid, layout, field, from) {
  const points = [], breaches = [], start = cellOf(grid, from.x, from.z);
  let index = start;
  const limit = grid.cols * grid.rows; // a route never visits a cell twice, so this is a safe bound
  for (let steps = 0; steps < limit; steps++) {
    if (index === field.goalIndex) return { reachable: true, cost: field.cost[start], points, breaches };
    const next = nextStep(grid, layout, field, index);
    if (!next) break;
    if (next.wallId && breaches[breaches.length - 1] !== next.wallId) breaches.push(next.wallId);
    points.push(centreOf(grid, next.index));
    index = next.index;
  }
  return { reachable: false, cost: Infinity, points, breaches };
}

/** True when a straight walk from a to b crosses only open land (no water, no standing wall). */
export function lineIsClear(grid, layout, a, b) {
  const cells = cellsOnLine(grid, a, b);
  return cells.length > 0 && cells.slice(1).every(index => grid.walkable[index] === 1 && !standingWallAt(layout, index));
}

/**
 * Keeps one distance field per goal and rebuilds it only when the layout's key changes (a wall placed,
 * removed, broken, rebuilt or passing a quarter of its hp), not on every tick. Returns the field.
 */
export function createFieldCache(grid) {
  const fields = new Map();
  let builds = 0;
  return {
    fieldFor(layout, goal, goalId = 'heart') {
      const known = fields.get(goalId);
      if (known && known.key === layout.key && known.goalX === goal.x && known.goalZ === goal.z) return known.field;
      const field = buildField(grid, layout, goal);
      builds++;
      fields.set(goalId, { key: layout.key, goalX: goal.x, goalZ: goal.z, field });
      return field;
    },
    get builds() { return builds; },
  };
}
