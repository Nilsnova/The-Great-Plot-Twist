// The in-memory island and wave API (BUILD-PLAN 3.4): prices, refusals, loot and timing.
import { describe, expect, it } from 'vitest';
import { createFakeIslandApi, createFakeWorld, islandRoom, lootFor, readIslandCode, wantsFakeIslands } from '../../src/pirates/fake-api.js';

const clock = (start = Date.UTC(2026, 10, 11, 12, 0, 0, 400)) => {
  let now = start;
  return { now: () => now, advance: seconds => { now += seconds * 1000; } };
};
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

describe('fake island API', () => {
  it('opens an island with 100 coins and eleven spots in the contract order', async () => {
    const api = createFakeIslandApi();
    const island = await api.island();
    expect(island.coins).toBe(100);
    expect(island.code).toMatch(/^ISLE-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(island.spots.map(spot => `${spot.id}:${spot.kind}:${spot.cost}:${spot.built}`)).toEqual([
      'wall_1:wall:10:false', 'wall_2:wall:10:false', 'wall_3:wall:10:false', 'wall_4:wall:10:false',
      'cannon_1:cannon:30:false', 'cannon_2:cannon:30:false', 'cannon_3:cannon:30:false', 'cannon_4:cannon:30:false',
      'tower_1:watchtower:40:false', 'house_1:house:50:false', 'house_2:house:50:false']);
    expect((await api.island()).code).toBe(island.code);
  });

  it('builds for coins, never charges a repeated actionUid twice and refuses like the server', async () => {
    const api = createFakeIslandApi();
    expect((await api.build({ spot: 'cannon_1', kind: 'cannon', actionUid: 'a1' })).coins).toBe(70);
    expect((await api.build({ spot: 'cannon_1', kind: 'cannon', actionUid: 'a1' })).coins).toBe(70);
    const cases = [
      [{ spot: 'cannon_1', kind: 'cannon', actionUid: 'a2' }, 409, 'spot_taken'],
      [{ spot: 'cabin', kind: 'house', actionUid: 'a3' }, 409, 'spot_taken'],
      [{ spot: 'wall_9', kind: 'wall', actionUid: 'a4' }, 404, 'no_such_spot'],
      [{ spot: 'wall_1', kind: 'cannon', actionUid: 'a5' }, 422, 'wrong_kind'],
      [{ spot: 'wall_1', kind: 'wall' }, 422, 'validation_error'],
      [{ spot: 7, kind: 'wall', actionUid: 'a6' }, 422, 'validation_error'],
    ];
    for (const [body, status, code] of cases) {
      const error = await refusal(api.build(body));
      expect([error.status, error.code]).toEqual([status, code]);
      expect(error.body).toEqual({ error: { code, message: error.message } });
      expect(error.message).toMatch(/^[A-Z].*\.$/);
    }
    await api.build({ spot: 'house_1', kind: 'house', actionUid: 'a7' });
    const poor = await refusal(api.build({ spot: 'tower_1', kind: 'watchtower', actionUid: 'a8' }));
    expect([poor.status, poor.code, poor.message]).toEqual([409, 'insufficient_funds', 'A watchtower costs 40 coins. You need more coins.']);
    expect((await api.island()).coins).toBe(20);
  });

  it('visits an island by code in any spelling and refuses unknown codes', async () => {
    const api = createFakeIslandApi();
    for (const code of ['ISLE-K7Q2M', 'isle k7q2m', 'k7q-2m', 'K7Q2M']) {
      expect(await api.visit(code)).toMatchObject({ code: 'ISLE-K7Q2M', ownerName: 'Captain Wren', waveBest: 2 });
    }
    for (const code of ['ISLE-00000', '', null, 'x'.repeat(40), 'ISLE-ZZZZZ']) {
      expect((await refusal(api.visit(code))).code).toBe('no_such_island');
    }
    expect(readIslandCode('ISLE-K7Q2M')).toBe('K7Q2M');
    expect(islandRoom('ISLE-K7Q2M')).toBe('live:place:isle_k7q2m:1');
    expect(wantsFakeIslands('?islands=fake')).toBe(true); expect(wantsFakeIslands('?islands=real')).toBe(false);
  });

  it('runs a wave: countdown, one wave per island, finish no earlier than 15 s, loot once', async () => {
    const time = clock(), api = createFakeIslandApi({ now: time.now, weather: 'storm' });
    await api.build({ spot: 'house_1', kind: 'house', actionUid: 'h1' }); // 50 coins left
    const wave = await api.startWave({ where: 'own', actionUid: 's1' });
    expect(wave).toMatchObject({ wave: 1, startsAt: '2026-11-11T12:00:10Z', flagship: false,
      weather: { kind: 'storm', label: 'Storm: 50% more pirate ships', ships: 1.5, fog: 0 } });
    expect(Number.isInteger(wave.seed) && wave.seed >= 0 && wave.seed < 2 ** 31).toBe(true);
    expect(await api.startWave({ where: 'own', actionUid: 's1' })).toEqual(wave);
    expect((await refusal(api.startWave({ where: 'own', actionUid: 's2' }))).code).toBe('wave_running');
    expect(await api.currentWave('own')).toEqual(wave);
    time.advance(24); // 14 s after startsAt
    const early = await refusal(api.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 3 }));
    expect([early.status, early.code, early.retryAfter]).toEqual([409, 'wave_too_early', 1]);
    time.advance(1);
    const done = await api.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 3 });
    expect(done).toEqual({ loot: lootFor(1, 1), coins: 70, waveBest: 1, flags: 1 });
    expect(done.loot).toBe(20); // 10 + 5 × 1 + 5 × 1 house
    expect(await api.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 3 })).toEqual(done);
    expect(await api.currentWave('own')).toBeNull();
    const next = await api.startWave({ where: 'own', actionUid: 's3' });
    expect(next.wave).toBe(2);
    time.advance(30);
    expect(await api.finishWave({ waveId: next.waveId, survived: false, shipsSunk: 1 })).toEqual({ loot: 0, coins: 70, waveBest: 1, flags: 1 });
  });

  it('lets a friend join, refuses outsiders and finished waves, and pays Pirate Point', async () => {
    const time = clock(), world = createFakeWorld();
    const owner = createFakeIslandApi({ world, now: time.now }), friend = createFakeIslandApi({ world, playerId: 'p2', now: time.now });
    const outsider = createFakeIslandApi({ world, playerId: 'p3', now: time.now });
    const code = (await owner.island()).code;
    const wave = await owner.startWave({ where: 'own', actionUid: 'x' });
    expect(await friend.currentWave(code.toLowerCase())).toEqual(wave);
    expect(await friend.joinWave({ waveId: wave.waveId })).toEqual(wave);
    expect(await friend.joinWave({ waveId: wave.waveId })).toEqual(wave);
    expect((await refusal(friend.joinWave({ waveId: 'nope' }))).code).toBe('no_such_wave');
    time.advance(30);
    expect((await refusal(outsider.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 0 }))).status).toBe(403);
    expect((await owner.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 3 })).loot).toBe(15);
    expect((await refusal(outsider.joinWave({ waveId: wave.waveId }))).code).toBe('wave_over');
    expect(await friend.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 2 })).toMatchObject({ loot: 15, coins: 115, waveBest: 1, flags: 1 });
    const point = await friend.startWave({ where: 'pirate_point', actionUid: 'pp' });
    expect(point).toMatchObject({ wave: 1, flagship: true });
    time.advance(30);
    expect((await friend.finishWave({ waveId: point.waveId, survived: true, shipsSunk: 9 })).loot).toBe(25);
    expect((await refusal(owner.finishWave({ waveId: wave.waveId, survived: 'yes', shipsSunk: 3 }))).code).toBe('validation_error');
    expect((await refusal(owner.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 1001 }))).code).toBe('validation_error');
  });

  it('pays nothing after 900 s and closes the wave for joins', async () => {
    const time = clock(), api = createFakeIslandApi({ now: time.now });
    const wave = await api.startWave({ where: 'own', actionUid: 'late' });
    time.advance(911);
    expect((await api.finishWave({ waveId: wave.waveId, survived: true, shipsSunk: 3 })).loot).toBe(0);
    expect((await api.island()).waveBest).toBe(0);
  });

  it('answers fetch() with the real JSON and error shape', async () => {
    const time = clock(), api = createFakeIslandApi({ now: time.now });
    const island = await (await api.fetch('/api/island')).json();
    expect(island.coins).toBe(100);
    const taken = await api.fetch('/api/island/build', { method: 'POST', body: JSON.stringify({ spot: 'cabin', kind: 'house', actionUid: 'z' }) });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: { code: 'spot_taken', message: 'Your cabin already stands there.' } });
    expect((await api.fetch('/api/island/build', { method: 'POST', body: '{oops' })).status).toBe(422);
    expect(await (await api.fetch('/api/waves/current?where=own')).json()).toBeNull();
    const wave = await (await api.fetch('/api/waves/start', { method: 'POST', body: JSON.stringify({ where: 'own', actionUid: 'b' }) })).json();
    const early = await api.fetch('/api/waves/finish', { method: 'POST', body: JSON.stringify({ waveId: wave.waveId, survived: true, shipsSunk: 1 }) });
    expect(early.status).toBe(409); expect(early.headers.get('retry-after')).toBe('25');
    expect((await api.fetch('/api/island/visit/ISLE-K7Q2M')).status).toBe(200);
    expect((await api.fetch('/api/island/visit/ISLE-22222')).status).toBe(404);
    expect((await api.fetch('/api/nowhere')).status).toBe(404);
  });
});
