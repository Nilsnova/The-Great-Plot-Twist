// T36 (flexible placement, docs/DECISIONS.md D041): the browser's copy of the build grid rules
// (src/island/placement.js) equals the server's file backend/content/island_layout.json, an old save
// stands on its fixed spots, the rules refuse what the server refuses, and the wave simulation gets the
// moved positions through spots.js defenses() without any change to src/pirates/sim.js.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {FOOTPRINTS, GRID, HEART, KEEP_OUT, checkMove, freeWallCells, onWallPerimeter, positionsOf, routeOpen, snap} from '../../src/island/placement.js';
import {SPOT_TABLE, defenses, islandZones, placedSpot} from '../../src/island/spots.js';
import {WALL_PERIMETER_CELLS, WALL_PERIMETER_DEFAULTS, WALL_PERIMETER_ROWS} from '../../src/island/wall-perimeter.js';

const server = JSON.parse(readFileSync(new URL('../../../backend/content/island_layout.json', import.meta.url), 'utf8'));

describe('the build grid is the server\'s', () => {
  it('has the grid, footprints, heart and keep-out boxes of island_layout.json', () => {
    expect(GRID).toBe(server.grid);
    expect(FOOTPRINTS).toEqual(server.footprints);
    expect(HEART).toEqual(server.heart);
    expect(KEEP_OUT).toEqual(server.keepOut);
  });
  it('has the fixed spots of island_layout.json, in order', () => {
    expect(SPOT_TABLE.map(([id, slot, x, z]) => [id, slot, x, z])).toEqual(server.spots);
  });
  it('has the same single edge row and defaults as the server', () => {
    expect(WALL_PERIMETER_ROWS).toEqual(server.wallPerimeter.rows);
    expect(WALL_PERIMETER_DEFAULTS).toEqual(Object.fromEntries(server.wallPerimeter.defaults.map(([id, x, z]) => [id, {x, z}])));
    expect(WALL_PERIMETER_ROWS.every(([, ...runs]) => runs.every((x, index) => index % 2 || runs[index + 1] === x))).toBe(true);
  });
});

describe('wall positions', () => {
  it('keeps the original coordinates for old answer rows that already stand', () => {
    const placed = positionsOf([]);
    expect(placed.wall_1).toEqual({x: -18.5, z: -1});
    const rows = [{id: 'wall_7', built: true}, {id: 'wall_8', built: true, x: 0.5, z: 9.5}, {id: 'wall_9', built: false}];
    expect(positionsOf(rows)).toMatchObject({wall_7: {x: 8.5, z: 2}, wall_8: {x: .5, z: 9.5}, wall_9: WALL_PERIMETER_DEFAULTS.wall_9});
  });
  it('places an empty island’s wall plots on valid edge centres', () => {
    const placed = positionsOf();
    for (const [id, where] of Object.entries(placed)) {
      expect(Number.isInteger(where.x / GRID) && Number.isInteger(where.z / GRID)).toBe(true);
      expect(checkMove(id, where.x, where.z, placed), id).toEqual({ok: true});
    }
    expect(routeOpen(placed)).toBe(true);
  });
});

describe('a move', () => {
  const placed = positionsOf();
  const code = (id, x, z, where = placed) => checkMove(id, x, z, where).code;
  it('to a free square on land is allowed', () => expect(checkMove('cannon_1', -10, -10, placed)).toEqual({ok: true}));
  it('is refused with the server\'s codes', () => {
    expect(code('pp_tower_1', -10, -10)).toBe('no_such_spot');
    expect(code('cannon_1', -10.25, -10)).toBe('off_grid');
    expect(code('cannon_1', -21, -10)).toBe('not_on_land');
    expect(code('wall_1', 0, 2)).toBe('off_path');
    expect(code('cannon_1', -14, -6)).toBe('place_taken');
  });
  it('lets two adjacent perimeter walls touch but disallows an overlapping wall', () => {
    const a = WALL_PERIMETER_CELLS.find(cell => WALL_PERIMETER_CELLS.some(other => Math.hypot(cell.x - other.x, cell.z - other.z) === 2));
    const b = WALL_PERIMETER_CELLS.find(cell => Math.hypot(cell.x - a.x, cell.z - a.z) === 2);
    expect(checkMove('wall_11', b.x, b.z, {wall_1: a})).toEqual({ok: true});
    expect(code('wall_11', a.x, a.z, {wall_1: a})).toBe('place_taken');
  });
  it('offers only free edge centres and leaves nearby plots unavailable', () => {
    const cells = freeWallCells('wall_1', placed);
    expect(cells.length).toBeGreaterThan(2);
    expect(cells).toEqual(WALL_PERIMETER_CELLS.filter(({x, z}) => checkMove('wall_1', x, z, placed).ok));
    const unavailable = placed.wall_2;
    expect(cells).not.toContainEqual(unavailable);
    const a = cells[0];
    const inward = [[a.x + GRID, a.z], [a.x - GRID, a.z], [a.x, a.z + GRID], [a.x, a.z - GRID]]
      .filter(([x, z]) => Math.hypot(x, z) < Math.hypot(a.x, a.z));
    for (const [x, z] of inward) {
      expect(onWallPerimeter(x, z)).toBe(false);
      expect(code('wall_1', x, z)).toBe('off_path');
    }
  });
  it('may not wall the heart in with towers and houses, but walls never block', () => {
    const ring = positionsOf([['cannon_1', -3, -1], ['cannon_2', -1, -1], ['cannon_3', 1, -1], ['cannon_4', 3, -1],
      ['cannon_5', -3, 5], ['cannon_6', -1, 5], ['cannon_7', 1, 5], ['house_1', 4.5, 2], ['house_2', -4, 2]].map(([id, x, z]) => ({id, x, z})));
    expect(routeOpen(ring)).toBe(true);
    expect(code('tower_1', 3.5, 5, ring)).toBe('blocks_route');
    const walls = positionsOf([[1, -3, -1], [2, -1, -1], [3, 1, -1], [4, 3, -1], [5, -3, 5], [6, -1, 5], [7, 1, 5], [8, 3, 5],
      [9, -3, 1], [10, -3, 3], [11, 3, 1], [12, 3, 3]].map(([n, x, z]) => ({id: `wall_${n}`, x, z})));
    expect(routeOpen(walls)).toBe(true);
  });
  it('snaps a tap to the nearest square', () => expect(snap(-10.2, 3.74)).toEqual({x: -10, z: 3.5}));
});

describe('the island answer\'s positions', () => {
  const spots = [{id: 'cannon_1', kind: 'cannon', built: true, level: 2, x: -10, z: -10.5}, {id: 'wall_1', kind: 'wall', built: true, level: 1}];
  it('reach the wave simulation through defenses(), the fixed spot without x/z', () => {
    expect(defenses(spots)).toEqual([{id: 'cannon_1', kind: 'cannon', level: 2, x: -10, z: -10.5}, {id: 'wall_1', kind: 'wall', level: 1, x: -18.5, z: -1}]);
  });
  it('move the walk-up zone and the spot with the building', () => {
    expect(placedSpot('cannon_1', spots)).toMatchObject({id: 'cannon_1', x: -10, z: -10.5});
    const zone = islandZones({spots}).find(item => item.id === 'cannon_1');
    expect(Math.hypot(zone.x + 10, zone.z + 10.5)).toBeLessThan(1.5);
  });
});
