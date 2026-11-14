// T36 (flexible placement, docs/DECISIONS.md D041): the browser's copy of the build grid rules
// (src/island/placement.js) equals the server's file backend/content/island_layout.json, an old save
// stands on its fixed spots, the rules refuse what the server refuses, and the wave simulation gets the
// moved positions through spots.js defenses() without any change to src/pirates/sim.js.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {FOOTPRINTS, GRID, HEART, KEEP_OUT, checkMove, positionsOf, routeOpen, snap} from '../../src/island/placement.js';
import {SPOT_TABLE, defenses, islandZones, placedSpot} from '../../src/island/spots.js';

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
});

describe('an old save', () => {
  it('stands on its fixed spots, each one a grid cell, and the fixed layout passes every rule', () => {
    const placed = positionsOf([]);
    expect(placed.wall_1).toEqual({x: -18.5, z: -4});
    for (const [id, , x, z] of SPOT_TABLE) {
      expect(Number.isInteger(x / GRID) && Number.isInteger(z / GRID)).toBe(true);
      expect(checkMove(id, x, z, placed)).toEqual({ok: true});
    }
    expect(routeOpen(placed)).toBe(true);
  });
});

describe('a move', () => {
  const placed = positionsOf([]);
  const code = (id, x, z, where = placed) => checkMove(id, x, z, where).code;
  it('to a free square on land is allowed', () => expect(checkMove('cannon_1', -10, -10, placed)).toEqual({ok: true}));
  it('is refused with the server\'s codes', () => {
    expect(code('pp_tower_1', -10, -10)).toBe('no_such_spot');
    expect(code('cannon_1', -10.25, -10)).toBe('off_grid');
    expect(code('cannon_1', -21, -10)).toBe('not_on_land');
    expect(code('wall_1', 0, 2)).toBe('place_taken');
    expect(code('cannon_1', -14, -6)).toBe('place_taken');
  });
  it('lets two walls touch to make a line', () => expect(checkMove('wall_11', -7.5, -1, placed)).toEqual({ok: true}));
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
    expect(defenses(spots)).toEqual([{id: 'cannon_1', kind: 'cannon', level: 2, x: -10, z: -10.5}, {id: 'wall_1', kind: 'wall', level: 1, x: -18.5, z: -4}]);
  });
  it('move the walk-up zone and the spot with the building', () => {
    expect(placedSpot('cannon_1', spots)).toMatchObject({id: 'cannon_1', x: -10, z: -10.5});
    const zone = islandZones({spots}).find(item => item.id === 'cannon_1');
    expect(Math.hypot(zone.x + 10, zone.z + 10.5)).toBeLessThan(1.5);
  });
});
