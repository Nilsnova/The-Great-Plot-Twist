import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {Group} from 'three';
import * as placement from '../../src/island/placement.js';
import {EXTRA_SPOTS} from '../../src/island/spots.js';
import {edgeTrees, layouts} from '../../src/world/places/layouts.js';
import {projectGround} from '../../src/world/projection.js';
import {decorateProgress} from '../../src/island/decorations.js';
import {createFakeIslandTransport, readIslandCode} from '../../src/pirates/fake-api.js';

const server = JSON.parse(readFileSync(new URL('../../../backend/content/island_layout.json', import.meta.url)));
const options = {wallRuleVersion: 1, wallCapacity: 128};
const positions = placement.positionsOf(EXTRA_SPOTS);
const check = (x, z, where = positions) => placement.checkMove('wall_13', x, z, where, options);
const trunks = edgeTrees.home_islet.filter(([x, z]) => x !== -15 || z !== 6);
const props = [...layouts.home_islet.map(({asset, x, z}) => [asset, x, z]), ['record', -3.5, 2.5], ['statue', 4, 5.5]];

describe('prospective wall clearance', () => {
  it.each(trunks)('refuses a paid wall through the tree at %s,%s', (x, z) => {
    expect(check(x, z)).toMatchObject({ok: false, code: 'place_taken'});
  });
  it.each(props)('keeps the %s ground reserve free at %s,%s', (_, x, z) => {
    expect(check(x, z)).toMatchObject({ok: false, code: 'place_taken'});
  });
  it('matches server geometry and the actual unchanged scenery anchors', () => {
    expect(placement.WALL_OBSTACLES).toEqual(server.wallObstacles);
    expect(server.wallObstacles.filter(row => row.radius).map(({x, z}) => [x, z])).toEqual(edgeTrees.home_islet);
    for (const prop of layouts.home_islet) expect(server.wallObstacles).toContainEqual(expect.objectContaining({id: prop.asset, x: prop.x, z: prop.z}));
    const place = {group: new Group()}, progress = decorateProgress(place);
    try {
      for (const [id, name] of [['record', 'island-best-wave'], ['statue', 'island-wave-25']]) {
        const data = server.wallObstacles.find(row => row.id === id), point = projectGround(data.x, data.z);
        const mesh = place.group.getObjectByName(name);
        expect([mesh.position.x, mesh.position.y]).toEqual([point.x, point.y]);
      }
    } finally { progress.dispose(); }
    expect(placement.KEEP_OUT).toEqual(server.keepOut);
  });
  it('leaves half-grid clearance beside a trunk and full-side wall contact valid', () => {
    expect(check(-13, -10.5)).toEqual({ok: true});
    expect(check(-13, -11)).toMatchObject({code: 'place_taken'});
    expect(check(-13, -10.5, {...positions, wall_14: {x: -11, z: -10.5}})).toEqual({ok: true});
  });
  it('preserves saved conflicting coordinates and permits moving out without changing the route', () => {
    const old = placement.positionsOf([...EXTRA_SPOTS, {id: 'wall_13', kind: 'wall', built: true, x: -13, z: -12}]);
    expect(old.wall_13).toEqual({x: -13, z: -12});
    expect(check(-13, -10.5, old)).toEqual({ok: true});
    expect(placement.routeOpen(old)).toBe(placement.routeOpen(positions));
    expect(placement.checkMove('wall_11', -7.5, -1, positions)).toEqual({ok: true});
  });
  it('also guards explicit legacy wall moves while retaining the pirate-lane rule', () => {
    const old = placement.positionsOf([{id: 'wall_1', x: -16, z: 0}]);
    expect(old.wall_1).toEqual({x: -16, z: 0});
    expect(placement.checkMove('wall_1', -16, 0, old)).toMatchObject({code: 'place_taken'});
    expect(placement.checkMove('wall_1', -13, -10.5, old)).toMatchObject({code: 'off_path'});
  });
});

async function fake() {
  const game = createFakeIslandTransport({coins: 5000, version: 2, flags: {wall_recovery: true, perimeter_walls: true}});
  await game.dev.setWaveBest(50);
  expect((await game.post('/api/island/walls/enable', {})).ok).toBe(true);
  return game;
}
const body = q => ({placements: q.placements, quotedTotal: q.totalCost, islandEpoch: q.islandEpoch, actionUid: 'scenery-paid-01'});
it('refuses an obstructed fake quote/build before any coin, wall or receipt mutation', async () => {
  const game = await fake(), before = await game.api.island();
  expect(await game.post('/api/island/walls/quote', {cells: [{x: -13, z: -12}]})).toMatchObject({ok: false, code: 'place_taken'});
  const island = game.world.islands.get(readIslandCode(before.code));
  const intent = body({placements: [{spot: 'wall_1', x: -13, z: -12}], totalCost: 10, islandEpoch: island.wallEpoch});
  expect(await game.post('/api/island/walls/build', intent)).toMatchObject({ok: false, code: 'place_taken'});
  expect((await game.api.island()).coins).toBe(5000);
  expect(island.built.size).toBe(0);
  expect(game.world.players.get('me').actions.has('wall-run:scenery-paid-01')).toBe(false);
});
it('replays a historical paid receipt before applying today\'s scenery validation', async () => {
  const game = await fake();
  // Emulate the old validator only for this historical purchase, then restore real validation.
  const old = vi.spyOn(placement, 'checkMove').mockReturnValue({ok: true});
  let intent;
  try {
    const quoted = await game.post('/api/island/walls/quote', {cells: [{x: -13, z: -12}]});
    intent = body(quoted.data);
    expect((await game.post('/api/island/walls/build', intent)).ok).toBe(true);
  } finally { old.mockRestore(); }
  const replay = await game.post('/api/island/walls/build', intent);
  expect(replay.data.receipt.repeat).toBe(true);
  expect(replay.data.island.coins).toBe(4990);
  expect(replay.data.island.spots.find(row => row.id === 'wall_1')).toMatchObject({built: true, x: -13, z: -12});
});
