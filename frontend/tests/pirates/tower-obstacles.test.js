// T35 tower footprint and route-shape helpers, sourced from T36 placement geometry.
import {describe, expect, it} from 'vitest';
import {FOOTPRINTS} from '../../src/island/placement.js';
import {TOWER_FOOTPRINT, towerApproachPoint, towerEdgeDistance, towerObstacles} from '../../src/pirates/tower-obstacles.js';

describe('tower obstacles (T35)', () => {
  it('takes its square size from the T36 tower slot', () => {
    expect(TOWER_FOOTPRINT).toBe(FOOTPRINTS.tower);
  });

  it('measures from the footprint edge and approaches the nearest boundary', () => {
    const tower = {id: 'cannon_1', kind: 'cannon', x: 5, z: 4, hp: 10, maxHp: 20};
    expect(towerEdgeDistance({x: 7, z: 4}, tower)).toBe(1);
    expect(towerApproachPoint({x: 9, z: 4}, tower, .3)).toEqual({x: 6.3, z: 4});
  });

  it('only returns standing damageable combat towers in stable id order', () => {
    const out = towerObstacles([
      {id: 'c', kind: 'culverin', x: 0, z: 0, hp: 1, maxHp: 2},
      {id: 'watch', kind: 'watchtower', x: 0, z: 0, hp: 1, maxHp: 2},
      {id: 'broken', kind: 'cannon', x: 0, z: 0, hp: 0, maxHp: 2},
      {id: 'a', kind: 'harpoon', x: 0, z: 0, hp: 1, maxHp: 2},
    ]);
    expect(out.map(item => item.id)).toEqual(['a', 'broken', 'c']);
    expect(out[0].cells).toHaveLength(16);
  });
});
