import {expect, it, vi} from 'vitest';
import * as placement from '../../src/island/placement.js';
import {createFakeIslandApi, createFakeIslandTransport, readIslandCode} from '../../src/pirates/fake-api.js';

async function setup(policy, friend = false) {
  const host = createFakeIslandTransport({coins: 5000, version: 2, flags: {perimeter_walls: true, wall_recovery: true}});
  await host.dev.setWaveBest(50);
  if (policy === 1) expect((await host.post('/api/island/walls/enable', {})).ok).toBe(true);
  const answer = await host.api.island(), island = host.world.islands.get(readIslandCode(answer.code));
  island.positions ??= new Map();
  let api = host.api, code;
  if (friend) {
    api = createFakeIslandApi({world: host.world, playerId: 'friend', flags: {perimeter_walls: true, wall_recovery: true}});
    await api.island(); await api.joinGame({code: answer.code, actionUid: 'join-clearance-01'});
    host.world.players.get('friend').coins = 5000; code = answer.code;
  }
  const player = host.world.players.get(friend ? 'friend' : 'me');
  return {host, api, island, player, code};
}

it.each([0, 1].flatMap(policy => [false, true].flatMap(friend => [[-16, 0], [-2, 12]].map(([x, z]) => ({policy, friend, x, z})))))
('fresh normal wall purchase refuses scenery: $policy / friend=$friend / $x,$z', async ({policy, friend, x, z}) => {
  const t = await setup(policy, friend);
  // Both sites lie on legacy pirate lanes, so this reproduces the missing scenery check.
  t.island.positions = new Map([['wall_1', {x, z}]]);
  await expect(t.api.build({spot: 'wall_1', kind: 'wall', actionUid: 'normal-scenery-01', code: t.code}))
    .rejects.toMatchObject({code: 'place_taken'});
  expect(t.player.coins).toBe(5000); expect(t.island.built.has('wall_1')).toBe(false);
  expect(t.player.actions.has('build:normal-scenery-01')).toBe(false);
});

it.each([0, 1].flatMap(policy => [false, true].map(friend => ({policy, friend}))))
('safe ordinary wall purchase and old UID replay survive: $policy / friend=$friend', async ({policy, friend}) => {
  const t = await setup(policy, friend);
  await t.api.build({spot: 'wall_1', kind: 'wall', actionUid: 'normal-safe-01', code: t.code});
  expect(t.player.coins).toBe(4990); expect(t.island.built.has('wall_1')).toBe(true);
  // Existing paid state can later overlap scenery; a replay neither revalidates nor charges it.
  t.island.positions.set('wall_1', {x: -16, z: 0});
  await t.api.build({spot: 'wall_1', kind: 'wall', actionUid: 'normal-safe-01', code: t.code});
  expect(t.player.coins).toBe(4990);
  t.island.built.delete('wall_1');
  await t.api.build({spot: 'wall_1', kind: 'wall', actionUid: 'normal-safe-01', code: t.code});
  expect(t.player.coins).toBe(4990); expect(t.island.built.has('wall_1')).toBe(false);
});

it.each([0, 1])('retains wrong-kind refusal and reads of old paid overlap on policy %s', async policy => {
  const t = await setup(policy); t.island.positions = new Map([['wall_1', {x: -16, z: 0}]]);
  await expect(t.api.build({spot: 'wall_1', kind: 'cannon', actionUid: 'normal-wrong-01'})).rejects.toMatchObject({code: 'wrong_kind'});
  const old = vi.spyOn(placement, 'checkMove').mockReturnValue({ok: true});
  try { await t.api.build({spot: 'wall_1', kind: 'wall', actionUid: 'historical-normal-01'}); }
  finally { old.mockRestore(); }
  expect((await t.api.island()).spots.find(row => row.id === 'wall_1')).toMatchObject({built: true, x: -16, z: 0});
});
