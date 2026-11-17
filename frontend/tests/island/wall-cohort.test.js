import {describe, expect, it} from 'vitest';
import {LEGACY_WALL_CAPACITY, PERIMETER_WALL_CAPACITY, inventoryWall, isInventoryWallId, offeredInventoryWalls} from '../../src/island/wall-cohort.js';
import {SPOTS, ALL_SPOTS, defenses, islandZones, offeredSpots, placedSpot, spotById} from '../../src/island/spots.js';
import {positionsOf} from '../../src/island/placement.js';

const paid = (id = 'wall_128', fields = {}) => ({id, kind: 'wall', built: true, level: 2, x: 2.5, z: -16, ...fields});

describe('bounded inventory-wall identities', () => {
  it('keeps the twelve old walls and 22 fixed spots unchanged without inventing defaults', () => {
    expect([LEGACY_WALL_CAPACITY, PERIMETER_WALL_CAPACITY]).toEqual([12, 128]);
    expect(SPOTS).toHaveLength(22);
    expect(SPOTS.filter(spot => spot.slot === 'wall')).toHaveLength(12);
    expect(ALL_SPOTS).toHaveLength(26);
    expect(offeredSpots([])).toEqual(SPOTS);
    expect(spotById('wall_12')).toMatchObject({x: 8.5, z: 0});
    expect(inventoryWall('wall_13')).toEqual({id: 'wall_13', slot: 'wall', kind: 'wall', edge: 'inventory'});
    expect(Object.hasOwn(inventoryWall('wall_128'), 'x')).toBe(false);
    expect(Object.hasOwn(inventoryWall('wall_128'), 'z')).toBe(false);
  });
  it.each(['wall_13', 'wall_99', 'wall_100', 'wall_128'])('recognizes canonical added identity %s', id => {
    expect(isInventoryWallId(id)).toBe(true);
    expect(spotById(id)).toMatchObject({id, slot: 'wall'});
  });
  it.each(['wall_0', 'wall_01', 'wall_013', 'wall_129', 'wall_999', 'wall_1000', 'wall_١٣', 'wall_13 ', 'wall_13\n', 'wall_-13', 'cannon_13', null])('does not recognize malformed or unsupported identity %s', id => {
    expect(isInventoryWallId(id)).toBe(false);
    expect(spotById(id)).toBeNull();
  });
});

describe('only built and positioned walls enter the world', () => {
  it('uses the actual first/last piece coordinates for spots, zones and combat', () => {
    const rows = [paid('wall_128'), paid('wall_13', {x: 0, z: 18})];
    expect(offeredSpots(rows).slice(22).map(spot => spot.id)).toEqual(['wall_13', 'wall_128']);
    expect(positionsOf(rows).wall_128).toEqual({x: 2.5, z: -16});
    expect(positionsOf(rows).wall_13).toEqual({x: 0, z: 18});
    expect(placedSpot('wall_128', rows)).toMatchObject({x: 2.5, z: -16});
    expect(islandZones({spots: rows}).filter(zone => zone.id === 'wall_128')).toHaveLength(1);
    expect(defenses(rows)).toEqual(rows.map(({id, kind, level, x, z}) => ({id, kind, level, x, z})));
  });
  it.each([{built: false}, {x: undefined}, {z: null}, {x: NaN}, {z: Infinity}, {kind: 'cannon'}])('never substitutes a default for an unusable added row: %j', fields => {
    const rows = [paid('wall_128', fields)];
    expect(offeredInventoryWalls(rows)).toEqual([]);
    expect(placedSpot('wall_128', rows)).toBeNull();
    expect(positionsOf(rows).wall_128).toBeUndefined();
    expect(islandZones({spots: rows}).some(zone => zone.id === 'wall_128')).toBe(false);
    expect(defenses(rows)).toEqual([]);
  });
  it('does not render or simulate duplicate identities from an inconsistent response', () => {
    const rows = [paid(), paid('wall_128', {x: -2.5}), paid('wall_13')];
    expect(offeredInventoryWalls(rows).map(spot => spot.id)).toEqual(['wall_13']);
    expect(placedSpot('wall_128', rows)).toBeNull();
    expect(defenses(rows).map(spot => spot.id)).toEqual(['wall_13']);
  });
  it('remains bounded with every added wall and ignores arbitrary IDs', () => {
    const rows = Array.from({length: 200}, (_, i) => paid(`wall_${i + 13}`));
    expect(offeredInventoryWalls(rows)).toHaveLength(116);
    expect(defenses(rows)).toHaveLength(116);
    expect(offeredInventoryWalls(null)).toEqual([]);
  });
});
