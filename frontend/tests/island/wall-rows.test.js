import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {addedWallRow, MAX_WALL_ROWS, wallRowCounts} from '../../src/island/wall-rows.js';
import {freeWallCells, HEART, positionsOf} from '../../src/island/placement.js';
import {SPOTS} from '../../src/island/spots.js';
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const shared = JSON.parse(readFileSync(new URL('../../../backend/server/tests/fixtures/wall-rows.json', import.meta.url), 'utf8'));
const heart = {x: shared.heart[0], z: shared.heart[1]};
const points = rows => rows.map(([x, z]) => ({x, z}));

describe('historical three-row fixtures', () => {
  it.each(shared.counts)('counts $name using the shared Python/browser fixture', ({walls, rows}) => {
    expect(wallRowCounts(points(walls), heart)).toEqual(rows);
  });
  it.each(shared.changes)('handles $name using the shared Python/browser fixture', ({before, after, refused}) => {
    expect(addedWallRow(points(before), points(after), heart)).toBe(refused);
  });
  it('keeps all twelve original reservations at two rows per approach', () => {
    expect(MAX_WALL_ROWS).toBe(3);
    const walls = SPOTS.filter(spot => spot.slot === 'wall');
    expect(walls).toHaveLength(12);
    expect(wallRowCounts(walls, HEART)).toEqual({east: 2, south: 2, west: 2});
  });
});

describe('the single wall perimeter', () => {
  it('refuses an inner-row move through the fake API without changing coordinates or coins', async () => {
    const api = createIslandApi({transport: createFakeIslandTransport({version: 2})});
    const before = (await api.getIsland()).data;
    const refused = await api.move({spot: 'wall_11', x: -7.5, z: -1});
    expect(refused).toMatchObject({ok: false, status: 409, code: 'off_path'});
    expect((await api.getIsland()).data).toEqual(before);
    const placed = positionsOf(before.spots), current = placed.wall_11;
    const edge = freeWallCells('wall_11', placed).find(cell => cell.x !== current.x || cell.z !== current.z);
    const perimeter = await api.move({spot: 'wall_11', ...edge});
    expect(perimeter.ok).toBe(true);
    expect(perimeter.data.spots.find(spot => spot.id === 'wall_11')).toMatchObject(edge);
    expect(perimeter.data.coins).toBe(before.coins);
  });
});
