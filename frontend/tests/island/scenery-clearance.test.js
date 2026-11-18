import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import * as placement from '../../src/island/placement.js';
import {edgeTrees, layouts} from '../../src/world/places/layouts.js';

// VIS62 on the current (legacy, 12-wall) rules; the perimeter-wall cases stay with the WALL stack.
const server = JSON.parse(readFileSync(new URL('../../../backend/content/island_layout.json', import.meta.url)));

describe('wall scenery clearance', () => {
  it('matches server geometry and the actual unchanged scenery anchors', () => {
    expect(placement.WALL_OBSTACLES).toEqual(server.wallObstacles);
    expect(server.wallObstacles.filter(row => row.radius).map(({x, z}) => [x, z])).toEqual(edgeTrees.home_islet);
    for (const prop of layouts.home_islet) expect(server.wallObstacles).toContainEqual(expect.objectContaining({id: prop.asset, x: prop.x, z: prop.z}));
    expect(placement.KEEP_OUT).toEqual(server.keepOut);
  });
  it('also guards explicit legacy wall moves while retaining the pirate-lane rule', () => {
    const old = placement.positionsOf([{id: 'wall_1', x: -16, z: 0}]);
    expect(old.wall_1).toEqual({x: -16, z: 0});
    expect(placement.checkMove('wall_1', -16, 0, old)).toMatchObject({code: 'place_taken'});
    expect(placement.checkMove('wall_1', -13, -10.5, old)).toMatchObject({code: 'off_path'});
  });
});
