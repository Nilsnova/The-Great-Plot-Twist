import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {addedWallRow, MAX_WALL_ROWS, wallRowCounts} from '../../src/island/wall-rows.js';
import {checkMove, HEART, positionsOf} from '../../src/island/placement.js';
import {SPOTS} from '../../src/island/spots.js';
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const shared = JSON.parse(readFileSync(new URL('../../../backend/server/tests/fixtures/wall-rows.json', import.meta.url), 'utf8'));
const heart = {x: shared.heart[0], z: shared.heart[1]};
const points = rows => rows.map(([x, z]) => ({x, z}));

describe('three rows per existing attack approach', () => {
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
  it('validates only the moved wall and preserves a shared third row', () => {
    const placed = {...positionsOf(), wall_6: {x: -12, z: -1}};
    expect(checkMove('wall_11', -7.5, -1, placed)).toMatchObject({ok: false, code: 'wall_rows'});
    expect(checkMove('wall_11', -12, 1, placed)).toEqual({ok: true});
    expect(checkMove('cannon_1', -10, -10, placed)).toEqual({ok: true});
  });
  it('the actual fake Move route refuses a fourth row without changing coordinates or coins', async () => {
    const api = createIslandApi({transport: createFakeIslandTransport({version: 2})});
    expect((await api.move({spot: 'wall_6', x: -12, z: -1})).ok).toBe(true);
    const before = (await api.getIsland()).data;
    const refused = await api.move({spot: 'wall_11', x: -7.5, z: -1});
    expect(refused).toMatchObject({ok: false, status: 409, code: 'wall_rows'});
    expect((await api.getIsland()).data).toEqual(before);
    const sharedRow = await api.move({spot: 'wall_11', x: -12, z: 1});
    expect(sharedRow.ok).toBe(true);
    expect(sharedRow.data.coins).toBe(before.coins);
  });
});
