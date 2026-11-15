// The build grid of your island (T36, flexible placement, docs/DECISIONS.md D041), as plain rules for
// the Move preview. The server decides (backend/server/island/layout.py, the same rules); this file
// only says early whether a cell will be refused, and why. No DOM, no Three.js.
//   GRID, FOOTPRINTS, KEEP_OUT, HEART   the numbers of backend/content/island_layout.json
//   snap(x, z)                          the nearest grid cell
//   positionsOf(spots)                  where each spot stands: the answer's x/z, else its fixed spot
//   checkMove(spotId, x, z, positions)  {ok: true} or {ok: false, code, message} (the server's codes)
//   routeOpen(positions)                a way from the heart to the beach (towers, houses block)
//   onWallLane(x, z)                    a wall centred here stands on a pirate path (D056, wall-lanes.js)
import {SPOTS, spotById, ISLAND_PLACE} from './spots.js';
import {surfaceClass} from '../world/places/surfaces.js';
import {WALL_LANE_ROWS} from './wall-lanes.js';

export const GRID = 0.5;
export const MAX_UNITS = 30;
export const HEART = Object.freeze({x: 0, z: 2});
export const FOOTPRINTS = Object.freeze({wall: 2, tower: 2, watchtower: 3, house: 3});
// What stands for good and covers w by d units around (x, z): the heart, the cabin, the bell, the campaign buildings, the arsenal.
export const KEEP_OUT = Object.freeze([
  {id: 'heart', name: "the island's heart", x: 0, z: 2, w: 4, d: 4},
  {id: 'island_cabin', name: 'your cabin', x: -8, z: 4.2, w: 4.8, d: 3.6},
  {id: 'island_bell', name: 'the harbor bell', x: 8.5, z: 12, w: 2, d: 2},
  {id: 'island_harbor', name: 'the Harbor', x: 13, z: 7.5, w: 4.4, d: 3},
  {id: 'island_techhub', name: 'the Tech hub', x: 8.5, z: -12.5, w: 4.4, d: 3},
  {id: 'island_wreck', name: 'the wreck', x: -16.5, z: 5, w: 5.2, d: 3},
  // The arsenal (T41, D042): its ground stays free even while the flag "arsenal" is off.
  {id: 'island_arsenal', name: 'the arsenal', x: -5.5, z: -11.5, w: 5, d: 3},
].map(item => Object.freeze(item)));
const SEA = 0, BEACH = 1;

export const onGrid = value => Number.isFinite(value) && Math.abs(value) <= MAX_UNITS && Number.isInteger(value / GRID);
export const snap = (x, z) => ({x: Math.round(x / GRID) * GRID + 0, z: Math.round(z / GRID) * GRID + 0});
export const footprintOf = spotId => FOOTPRINTS[spotById(spotId)?.slot] ?? 0;
const land = (x, z) => surfaceClass(ISLAND_PLACE, x, z);

// {spotId: {x, z}} for the 22 spots: a finite x/z of the answer wins (a moved spot), else the fixed spot.
export function positionsOf(spots = []) {
  const placed = {};
  for (const spot of SPOTS) {
    const sent = Array.isArray(spots) ? spots.find(item => item?.id === spot.id) : null;
    placed[spot.id] = Number.isFinite(sent?.x) && Number.isFinite(sent?.z) ? {x: sent.x, z: sent.z} : {x: spot.x, z: spot.z};
  }
  return placed;
}
const boxOf = (spotId, where) => ({x: where.x, z: where.z, w: footprintOf(spotId), d: footprintOf(spotId)});
// Touching edges do not count, so walls can stand side by side in a line.
export const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
const refuse = (code, message) => ({ok: false, code, message});

// D056: a wall stands only where it stops boarders on their way to the heart (the rows of wall-lanes.js).
const LANES = new Map(WALL_LANE_ROWS.map(([z, ...runs]) => [z, runs]));
export function onWallLane(x, z) {
  const runs = LANES.get(z + 0);
  if (!runs) return false;
  for (let i = 0; i < runs.length; i += 2) if (x >= runs[i] && x <= runs[i + 1]) return true;
  return false;
}
export const OFF_PATH = 'Walls go on a pirate path.';

export function checkMove(spotId, x, z, positions = positionsOf()) {
  if (!spotById(spotId)) return refuse('no_such_spot', 'There is no such build spot.');
  if (!onGrid(x) || !onGrid(z)) return refuse('off_grid', 'Pick a square of the build grid.');
  if (land(x, z) === SEA) return refuse('not_on_land', 'Buildings stand on land, not in the sea.');
  if (spotById(spotId).slot === 'wall' && !onWallLane(x, z)) return refuse('off_path', OFF_PATH);
  const moved = boxOf(spotId, {x, z});
  const fixed = KEEP_OUT.find(item => overlaps(moved, item));
  if (fixed) return refuse('place_taken', `That is too close to ${fixed.name}.`);
  const other = Object.entries(positions).find(([id, where]) => id !== spotId && overlaps(moved, boxOf(id, where)));
  if (other) return refuse('place_taken', 'Another building stands there.');
  if (!routeOpen({...positions, [spotId]: {x, z}})) return refuse('blocks_route', 'That would wall the heart in. Leave the pirates a way through.');
  return {ok: true};
}

// --- the route from the heart to the beach (layout.py's route_open) ---
const span = (middle, size) => [Math.ceil((middle - size / 2) / GRID), Math.floor((middle + size / 2) / GRID)];
function blockedCells(positions) {
  const blocked = new Set();
  const cover = box => {
    const [x0, x1] = span(box.x, box.w), [z0, z1] = span(box.z, box.d);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) blocked.add(`${cx},${cz}`);
  };
  KEEP_OUT.filter(item => item.id !== 'heart').forEach(cover);
  // Walls never block: the boarders hack through them (src/pirates/sim.js).
  for (const spot of SPOTS) if (spot.slot !== 'wall') cover(boxOf(spot.id, positions[spot.id] ?? spot));
  return blocked;
}
export function routeOpen(positions = positionsOf()) {
  const blocked = blockedCells(positions);
  const start = [Math.round(HEART.x / GRID), Math.round(HEART.z / GRID)];
  const seen = new Set([start.join()]), queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cz] = queue[head];
    if (land(cx * GRID, cz * GRID) === BEACH) return true;
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      const key = `${nx},${nz}`;
      if (seen.has(key) || blocked.has(key) || land(nx * GRID, nz * GRID) === SEA) continue;
      seen.add(key); queue.push([nx, nz]);
    }
  }
  return false;
}
