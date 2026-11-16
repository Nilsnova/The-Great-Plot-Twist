// Where a wall matters (D056, "Every wall stands on a pirate path"): the cells of the build grid where a wall,
// even standing alone, stops boarders on their way from a landing to the heart, so they hack it (D053). Worked out
// once from the sim's own rules (sim.js CONFIG, boarder-paths.js with the wave rule "pathing") and stored as data in
// src/island/wall-lanes.js and backend/content/island_layout.json ("wallLanes"), which the Move preview and the
// server check (island/placement.js, backend/server/island/layout.py). tests/pirates/wall-lanes.test.js proves the
// data equals this derivation, so a change to the sim's routes shows up as a failing test, not as useless walls.
//
// The rule, in plain words: for every sea lane of the home island (east, south, west) and every landing bearing of
// its spread (lane ± CONFIG.laneSpread, one degree apart), a boarder wades from where its ship anchors to the beach
// and walks the grid route to the heart (boarder-paths.js next(), the same step as the sim's), stopping at the first
// standing wall in its way (wallInWay, the sim's stepClear). A cell of the half-unit grid is a wall lane cell when a
// single wall centred there stops at least one of those boarders. Pure and deterministic; no DOM, no Three.js.
//
//   deriveWallLanes(options?)   → rows: [[z, x0, x1, x0, x1, …], …] (the wall centres x0..x1 in half units on row z)
//   laneRoutes(options?)        → the routes with no walls: [{bearing, points}] (for the guide and the tests)
import { CONFIG, coastPoint, curveFor } from './sim.js';
import { createBoarderPaths, isOnLand, wallInWay } from './boarder-paths.js';

const GRID = .5;          // the build grid (island/placement.js GRID)
const EVERY = 1;          // degrees between two landing bearings of one lane
const NEAR = 2.5;         // a cell is tried only this close (units, both axes) to a point of a route with no walls
const LIMIT = 400;        // steps of one walk at most (a route never visits a cell twice)
const STOPS = 3;          // a lane cell stops boarders of at least this many landing bearings (one alone may be a lucky edge)
const EDGE = 1;           // degrees left out at each end of a lane's spread: ships land there only rarely
const round2 = value => Math.round(value * 100) / 100;

function setup({ coast = CONFIG.coast, heart = CONFIG.boarding.heart, lanes = CONFIG.lanes, spread = CONFIG.laneSpread, wave = 1 } = {}) {
  const curve = curveFor(wave), B = CONFIG.boarding;
  const pace = { hackPerSecond: B.hack * curve.damage / B.hackEvery, speed: B.speed * curve.speed };
  const starts = [];
  for (const lane of lanes) for (let d = EDGE - spread; d <= spread - EDGE + 1e-9; d += EVERY) {
    const bearing = lane.bearing + d, a = bearing * Math.PI / 180;
    // sim.js: the ship anchors at stopRadius, the boarder climbs out a quarter of the way to its landing and wades in.
    const stop = coastPoint(a, CONFIG.stopRadius, coast), land = coastPoint(a, B.landRadius, coast);
    starts.push({ bearing, from: { x: stop.x + (land.x - stop.x) * .25, z: stop.z + (land.z - stop.z) * .25 }, landing: { x: round2(land.x), z: round2(land.z) } });
  }
  return { coast, heart, pace, starts };
}

// One boarder's walk over these walls: the points it passes and the id of the first wall that stops it (or null).
function walk(paths, walls, start, heart) {
  const points = [{ ...start.landing }];
  const first = wallInWay(start.from, start.landing, walls);
  if (first) return { points, wallId: first.wall.id };
  const at = { ...start.landing };
  for (let i = 0; i < LIMIT; i++) {
    if (Math.sqrt((at.x - heart.x) ** 2 + (at.z - heart.z) ** 2) <= CONFIG.boarding.heartRadius) break;
    const way = paths.next(at);
    if (way.kind === 'wall') return { points, wallId: way.wallId };
    if (way.kind !== 'step') break;
    const hit = wallInWay(at, way, walls);
    if (hit) return { points, wallId: hit.wall.id };
    at.x = way.x; at.z = way.z; points.push({ x: way.x, z: way.z });
  }
  return { points, wallId: null };
}

/** The routes of every landing bearing with no walls on the island: [{bearing, points}]. */
export function laneRoutes(options) {
  const { coast, heart, pace, starts } = setup(options);
  const paths = createBoarderPaths({ coast, heart, walls: [], pace });
  paths.refresh();
  return starts.map(start => ({ bearing: start.bearing, points: walk(paths, [], start, heart).points }));
}

/** The landing bearings (degrees) whose boarders a single level-1 wall at x, z stops (for the tests). */
export function stoppedBearings(x, z, options) {
  const { coast, heart, pace, starts } = setup(options), hp = CONFIG.levels.wall[0].hp;
  const walls = [{ id: 'wall', x, z, hp, maxHp: hp }], paths = createBoarderPaths({ coast, heart, walls, pace });
  paths.refresh();
  return starts.filter(start => walk(paths, walls, start, heart).wallId).map(start => start.bearing);
}

/** Every wall lane cell, as rows [[z, x0, x1, …]] sorted by z then x (see the top of this file). */
export function deriveWallLanes(options) {
  const { coast, heart, pace, starts } = setup(options);
  const free = createBoarderPaths({ coast, heart, walls: [], pace });
  free.refresh();
  const near = new Set();
  for (const start of starts) for (const p of walk(free, [], start, heart).points) {
    for (let x = Math.ceil((p.x - NEAR) / GRID); x <= Math.floor((p.x + NEAR) / GRID); x++) {
      for (let z = Math.ceil((p.z - NEAR) / GRID); z <= Math.floor((p.z + NEAR) / GRID); z++) near.add(`${x},${z}`);
    }
  }
  const cells = [...near].map(key => key.split(',').map(Number)).filter(([x, z]) => isOnLand(x * GRID, z * GRID, coast))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const hp = CONFIG.levels.wall[0].hp, lane = [];
  for (const [cx, cz] of cells) {
    const walls = [{ id: 'wall', x: cx * GRID, z: cz * GRID, hp, maxHp: hp }];
    const paths = createBoarderPaths({ coast, heart, walls, pace });
    paths.refresh();
    let stopped = 0;
    for (const start of starts) if (walk(paths, walls, start, heart).wallId && ++stopped >= STOPS) break;
    if (stopped >= STOPS) lane.push([cx, cz]);
  }
  return toRows(lane);
}

// Cells [[cx, cz]] in half units, sorted by row then column, as rows of runs in world units. A run shorter than
// MIN_RUN cells is left out: the boarders' grid has 1-unit cells, so at a lane's ragged edge every second half
// cell stops someone; dropping those keeps the lane a solid band (only cells that stop boarders, never more).
const MIN_RUN = 3;
function toRows(cells) {
  const rows = [];
  for (const [cx, cz] of cells) {
    let row = rows[rows.length - 1];
    if (!row || row.cz !== cz) { row = { cz, runs: [] }; rows.push(row); }
    const run = row.runs[row.runs.length - 1];
    if (run && run[1] === cx - 1) run[1] = cx; else row.runs.push([cx, cx]);
  }
  return rows.map(row => ({ cz: row.cz, runs: row.runs.filter(([a, b]) => b - a + 1 >= MIN_RUN) })).filter(row => row.runs.length)
    .map(row => [row.cz * GRID, ...row.runs.flatMap(([a, b]) => [a * GRID, b * GRID])]);
}
