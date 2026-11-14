// The walking grid for boarders (T35, specs/T34-T35-targeting-pathing.md): square cells over the island,
// which cells can be walked on, and which cells a wall stands on. Pure and deterministic, no DOM or
// Three.js. Used by pathing.js (the routes) and its tests; sim.js will use it after the wiring step.
//
// Walls come as a generic list, not fixed spot ids, so a later grid placement (T36) fits in: a wall may
// list its own `cells` (world points), give a straight `from`/`to` segment, or be a single point x,z.
// Costs are whole numbers (one cell step = STEP), so every browser adds them up to exactly the same total.

export const STEP = 10;          // the cost of one straight step to the next cell
export const DIAGONAL = 14;      // the cost of one diagonal step (about 10 × √2)
export const HP_BANDS = 4;       // a wall's breach cost changes only when its hp passes a quarter mark
const SAMPLES_PER_CELL = 4;      // how finely a wall segment is traced into cells

/** A grid of square cells from minX,minZ to maxX,maxZ. isWalkable(x, z) says if a cell centre is land. */
export function createGrid({ minX, minZ, maxX, maxZ, cell = 1, isWalkable = () => true }) {
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const grid = { minX, minZ, cell, cols, rows, walkable: new Uint8Array(cols * rows) };
  for (let index = 0; index < cols * rows; index++) {
    const centre = centreOf(grid, index);
    grid.walkable[index] = isWalkable(centre.x, centre.z) ? 1 : 0;
  }
  return grid;
}

/** The index of the cell that holds the point x,z, or -1 when the point is off the grid. */
export function cellOf(grid, x, z) {
  const col = Math.floor((x - grid.minX) / grid.cell), row = Math.floor((z - grid.minZ) / grid.cell);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

/** The world point in the middle of a cell. */
export function centreOf(grid, index) {
  const col = index % grid.cols, row = Math.floor(index / grid.cols);
  return { x: grid.minX + (col + .5) * grid.cell, z: grid.minZ + (row + .5) * grid.cell };
}

// Every cell a straight line from a to b passes through, in order, without repeats.
export function cellsOnLine(grid, a, b) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const samples = Math.max(1, Math.ceil(length / grid.cell * SAMPLES_PER_CELL));
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const index = cellOf(grid, a.x + (b.x - a.x) * i / samples, a.z + (b.z - a.z) * i / samples);
    if (index >= 0 && !out.includes(index)) out.push(index);
  }
  return out;
}

/** The cells one wall stands on, sorted: its own `cells`, else its `from`/`to` segment, else its x,z. */
export function wallCells(grid, wall) {
  let cells;
  if (Array.isArray(wall.cells)) cells = wall.cells.map(point => cellOf(grid, point.x, point.z));
  else if (wall.from && wall.to) cells = cellsOnLine(grid, wall.from, wall.to);
  else cells = [cellOf(grid, wall.x, wall.z)];
  return [...new Set(cells.filter(index => index >= 0))].sort((a, b) => a - b);
}

/**
 * How many cost points breaking through a standing wall is worth: the seconds of hacking it takes
 * (its hp, rounded up to the next quarter of its maximum, divided by the hack damage per second),
 * turned into the distance a boarder walks in that time. So a boarder simply picks the quicker way.
 */
export function breachCost(wall, grid, { hackPerSecond, speed }) {
  const maxHp = wall.maxHp > 0 ? wall.maxHp : wall.hp;
  const bandHp = Math.ceil(wall.hp / maxHp * HP_BANDS) / HP_BANDS * maxHp;
  const seconds = bandHp / hackPerSecond;
  return Math.max(1, Math.round(seconds * speed / grid.cell * STEP));
}

// The text that changes exactly when the walls change in a way that matters for a route: a wall
// added, removed or moved (its cells), broken or rebuilt, or its hp passing a quarter mark.
function layoutKey(walls) {
  const band = wall => (wall.standing ? Math.ceil(wall.hp / wall.maxHp * HP_BANDS) : 0);
  return walls.map(wall => `${wall.id}:${band(wall)}:${wall.cells.join(',')}`).join('|');
}

/**
 * The wall layout on the grid: for every cell the wall standing on it (or -1), and each wall's breach
 * cost. Walls are read in id order; where two overlap, the lower id owns the cell. A wall with hp 0 is
 * rubble: it owns its cells but costs nothing to cross. `pace` is {hackPerSecond, speed} of a boarder.
 */
export function buildLayout(grid, walls, pace) {
  const sorted = [...walls].filter(wall => wall && typeof wall.id === 'string')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const owner = new Int32Array(grid.cols * grid.rows).fill(-1);
  const list = sorted.map(wall => {
    const standing = wall.hp > 0, maxHp = wall.maxHp > 0 ? wall.maxHp : Math.max(1, wall.hp);
    return { id: wall.id, hp: wall.hp, maxHp, standing, cost: standing ? breachCost({ hp: wall.hp, maxHp }, grid, pace) : 0,
      cells: wallCells(grid, wall) };
  });
  list.forEach((wall, i) => { for (const index of wall.cells) if (owner[index] === -1) owner[index] = i; });
  return { owner, walls: list, key: layoutKey(list) };
}

/** The standing wall on a cell, or null (no wall there, or only rubble). */
export function standingWallAt(layout, index) {
  const i = layout.owner[index];
  return i >= 0 && layout.walls[i].standing ? layout.walls[i] : null;
}

/**
 * A fixed wall spot of today (one point, in sim.js and island/spots.js) as a short straight wall: `span`
 * units long, across the line from the heart to the spot, so it can stand in a boarder's way. T36's
 * flexible placement replaces this with walls that list their own cells.
 */
export function spotAsSegment(wall, heart, span) {
  const dx = wall.x - heart.x, dz = wall.z - heart.z, length = Math.hypot(dx, dz) || 1;
  const across = { x: -dz / length * span / 2, z: dx / length * span / 2 };
  return { ...wall, from: { x: wall.x - across.x, z: wall.z - across.z }, to: { x: wall.x + across.x, z: wall.z + across.z } };
}
