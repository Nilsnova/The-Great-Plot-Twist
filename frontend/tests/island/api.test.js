// The island API client against the in-memory fake: accepted answers, every refusal, the nested error
// shape and the click id that is sent again after an unknown outcome.
import {describe, expect, it, vi} from 'vitest';
import {createIslandApi, readFailure, PATHS} from '../../src/island/api.js';
import {createFakeIslandTransport, createFakeIslandApi, FAKE_FRIEND_CODE} from './fake.js';

function setup(options = {}) {
  let n = 0;
  const transport = createFakeIslandTransport(options);
  const sent = [];
  const spy = {get: path => transport.get(path), post: (path, body) => { sent.push({path, body}); return transport.post(path, body); }};
  const api = createIslandApi({transport: spy, makeUid: () => `click${String(++n).padStart(6, '0')}`});
  return {api, transport, sent};
}
const expectRefusal = (answer, status, code) => {
  expect(answer.ok).toBe(false);
  expect(answer.status).toBe(status);
  expect(answer.code).toBe(code);
  expect(typeof answer.message).toBe('string');
  expect(answer.message.length).toBeGreaterThan(5);
};

describe('island api: accepted answers', () => {
  it('reads the island with its 16 spots in the server order and 100 starting coins', async () => {
    const {api} = setup();
    const answer = await api.getIsland();
    expect(answer.ok).toBe(true);
    expect(answer.data.code).toBe('ISLE-K7Q2M');
    expect(answer.data.coins).toBe(100);
    expect(answer.data.spots.map(spot => spot.id)).toEqual(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6',
      'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2']);
    expect(answer.data.spots.find(spot => spot.id === 'cannon_1')).toEqual({id: 'cannon_1', kind: 'cannon', kinds: ['cannon', 'mortar'], built: false, level: 0, cost: 30,
      upgradeCost: null});
    expect(answer.data.prices).toMatchObject({kinds: {wall: [10, 20, 40], mortar: [60, 120, 240]}, crew: {gunner: {price: 40, max: 2}}, captain: [0, 20, 40, 80, 160]});
    expect(answer.data.crew).toEqual({gunner: 0, carpenter: 0, lookout: 0});
    expect(answer.data.captain).toEqual({level: 1, nextPrice: 20});
    expect(answer.data.unlocks).toMatchObject({wave: 0, unlocked: ['wall:1', 'cannon:1', 'captain:1'], locked: {'mortar:1': 3, 'crew:gunner': 5, 'captain:2': 1}});
  });
  it('builds a cannon for 30 coins and answers the new island', async () => {
    const {api, sent} = setup();
    const answer = await api.build({spot: 'cannon_1', kind: 'cannon'});
    expect(answer.ok).toBe(true);
    expect(answer.data.coins).toBe(70);
    expect(answer.data.spots.find(spot => spot.id === 'cannon_1').built).toBe(true);
    expect(sent[0]).toEqual({path: '/api/island/build', body: {spot: 'cannon_1', kind: 'cannon', actionUid: 'click000001'}});
  });
  it('visits a friend by code in any spelling', async () => {
    const {api} = setup();
    for (const code of ['ISLE-FR3ND', 'isle-fr3nd', 'fr3nd', ' ISLE FR3ND ']) {
      const answer = await api.visit(code);
      expect(answer.ok).toBe(true);
      expect(answer.data).toMatchObject({code: `ISLE-${FAKE_FRIEND_CODE}`, ownerName: 'Captain Gull', waveBest: 2});
    }
  });
  it('starts, finds, joins and finishes a wave', async () => {
    vi.useFakeTimers({now: Date.parse('2026-11-11T10:00:00Z')});
    try {
      const {api} = setup();
      const wave = await api.startWave({where: 'own'});
      expect(wave.ok).toBe(true);
      expect(wave.data).toMatchObject({wave: 1, startsAt: '2026-11-11T10:00:10Z', flagship: false, weather: {kind: 'calm', ships: 1, fog: 0}});
      expect((await api.currentWave({where: 'own'})).data.waveId).toBe(wave.data.waveId);
      expect((await api.joinWave({waveId: wave.data.waveId})).data.waveId).toBe(wave.data.waveId); // joining twice is fine
      vi.setSystemTime(Date.parse('2026-11-11T10:00:30Z'));
      const finish = await api.finishWave({waveId: wave.data.waveId, survived: true, shipsSunk: 4});
      expect(finish).toEqual({ok: true, status: 200, data: {loot: 15, coins: 115, waveBest: 1, flags: 1}});
      const repeat = await api.finishWave({waveId: wave.data.waveId, survived: true, shipsSunk: 4});
      expect(repeat.data).toEqual({loot: 15, coins: 115, waveBest: 1, flags: 1});
      expect((await api.currentWave({where: 'own'})).data).toBe(null);
      expect((await api.startWave({where: 'own'})).data.wave).toBe(2);
    } finally { vi.useRealTimers(); }
  });
  it('pays 5 more loot per house', async () => {
    vi.useFakeTimers({now: Date.parse('2026-11-11T10:00:00Z')});
    try {
      const {api, transport} = setup({coins: 200});
      transport.dev.setWaveBest(2); // houses unlock after wave 2 (TOWER-DEFENSE.md §9); this is wave 3
      expect((await api.build({spot: 'house_1', kind: 'house'})).ok).toBe(true);
      const wave = await api.startWave();
      vi.setSystemTime(Date.parse('2026-11-11T10:00:40Z'));
      expect((await api.finishWave({waveId: wave.data.waveId, survived: true})).data).toMatchObject({loot: 30, coins: 180});
    } finally { vi.useRealTimers(); }
  });
});

describe('island api: every refusal keeps the server code and plain message', () => {
  it('build refusals', async () => {
    const {api, transport} = setup();
    expectRefusal(await api.build({spot: 'moat_1', kind: 'wall'}), 404, 'no_such_spot');
    expectRefusal(await api.build({spot: 'cabin', kind: 'house'}), 409, 'spot_taken');
    expectRefusal(await api.build({spot: 'cannon_1', kind: 'wall'}), 422, 'wrong_kind');
    await api.build({spot: 'wall_1', kind: 'wall'});
    const taken = await api.build({spot: 'wall_1', kind: 'wall'});
    expectRefusal(taken, 409, 'spot_taken');
    expect(taken.message).toBe('Wall already stands on this spot.');
    transport.dev.setCoins(20);
    const poor = await api.build({spot: 'cannon_2', kind: 'cannon'});
    expectRefusal(poor, 409, 'insufficient_funds');
    expect(poor.message).toBe('A cannon costs 30 coins. You need more coins.');
    expectRefusal(await transport.post(PATHS.build, {spot: 'wall_2', kind: 'wall', actionUid: 'abcdefgh', extra: 1}), 422, 'validation_error');
  });
  it('visit and wave refusals', async () => {
    vi.useFakeTimers({now: Date.parse('2026-11-11T10:00:00Z')});
    try {
      const {api, transport} = setup();
      expectRefusal(await api.visit('ISLE-ZZZZZ'), 404, 'no_such_island');
      expectRefusal(await api.visit('ISLE-0000'), 422, 'validation_error');
      expectRefusal(await api.startWave({where: 'ISLE-ZZZZZ'}), 404, 'no_such_island');
      const wave = await api.startWave();
      expectRefusal(await api.startWave(), 409, 'wave_running');
      const early = await api.finishWave({waveId: wave.data.waveId, survived: true});
      expectRefusal(early, 409, 'wave_too_early');
      expect(early.retryAfterSeconds).toBe(25); // 10 s countdown + 15 s minimum
      expectRefusal(await api.finishWave({waveId: 'nope', survived: true}), 404, 'no_such_wave');
      expectRefusal(await api.joinWave({waveId: 'nope'}), 404, 'no_such_wave');
      const friend = await transport.dev.startWaveAt('ISLE-FR3ND');
      expectRefusal(await api.finishWave({waveId: friend.waveId, survived: true}), 403, 'not_in_wave');
    } finally { vi.useRealTimers(); }
  });
  it('a finished wave refuses new captains with wave_over', async () => {
    vi.useFakeTimers({now: Date.parse('2026-11-11T10:00:00Z')});
    try {
      const owner = setup();
      const friendWave = await owner.transport.dev.startWaveAt('ISLE-FR3ND');
      expect((await owner.api.currentWave({where: 'ISLE-FR3ND'})).data.waveId).toBe(friendWave.waveId);
      // The wave is closed by a finish; a captain who never joined is refused.
      vi.setSystemTime(Date.parse('2026-11-11T10:16:00Z')); // more than 900 s after startsAt
      expectRefusal(await owner.api.joinWave({waveId: friendWave.waveId}), 409, 'wave_over');
    } finally { vi.useRealTimers(); }
  });
  it('reads the nested error shape of a raw answer and other flags', async () => {
    const raw = {get: async () => ({ok: false, status: 404, data: {error: {code: 'feature_off', message: 'Islands are not open yet.'}}}),
      post: async () => ({ok: false, status: 429, code: 'too_many_requests', message: 'Too many tries. Wait 5 seconds, then try again.', retryAfterSeconds: 5})};
    const api = createIslandApi({transport: raw});
    expect(await api.getIsland()).toEqual({ok: false, status: 404, code: 'feature_off', message: 'Islands are not open yet.'});
    expect(await api.build({spot: 'wall_1', kind: 'wall'})).toMatchObject({status: 429, code: 'too_many_requests', retryAfterSeconds: 5});
    expect(readFailure({ok: false, status: 0})).toMatchObject({code: 'network_error'});
    expect(readFailure({ok: false, status: 409, error: {code: 'spot_taken', message: 'Wall already stands on this spot.'}}))
      .toEqual({ok: false, status: 409, code: 'spot_taken', message: 'Wall already stands on this spot.'});
  });
  it('a transport that throws counts as no connection; an unreadable answer is refused', async () => {
    const api = createIslandApi({transport: {get: async () => { throw new Error('boom'); }, post: async () => ({ok: true, status: 200, data: {nope: 1}})}});
    expect(await api.getIsland()).toMatchObject({ok: false, status: 0, code: 'network_error'});
    expect(await api.build({spot: 'wall_1', kind: 'wall'})).toMatchObject({ok: false, status: 502, code: 'unreadable'});
  });
});

describe('island api: one click id per build and per bell', () => {
  it('sends the same actionUid again after an unknown outcome and charges once', async () => {
    const {api, transport, sent} = setup();
    transport.dev.failNext('timeout'); // the server builds, the answer is lost
    const lost = await api.build({spot: 'cannon_1', kind: 'cannon'});
    expect(lost).toMatchObject({ok: false, status: 0, code: 'timeout'});
    expect(api.heldActionUid('build:cannon_1')).toBe('click000001');
    const retry = await api.build({spot: 'cannon_1', kind: 'cannon'});
    expect(retry.ok).toBe(true);
    expect(retry.data.coins).toBe(70); // charged once
    expect(sent.map(item => item.body.actionUid)).toEqual(['click000001', 'click000001']);
    expect(api.heldActionUid('build:cannon_1')).toBe(null);
  });
  it('keeps the id after a 503 and drops it after a clear refusal', async () => {
    const {api, transport, sent} = setup();
    transport.dev.failNext('server');
    expect((await api.build({spot: 'wall_1', kind: 'wall'})).status).toBe(503);
    transport.dev.setCoins(0);
    expect((await api.build({spot: 'wall_1', kind: 'wall'})).code).toBe('insufficient_funds');
    expect(api.heldActionUid('build:wall_1')).toBe(null);
    transport.dev.setCoins(100);
    await api.build({spot: 'wall_1', kind: 'wall'});
    expect(sent.map(item => item.body.actionUid)).toEqual(['click000001', 'click000001', 'click000002']);
  });
  it('a repeated bell after a lost answer gives the same wave', async () => {
    const {api, transport} = setup();
    transport.dev.failNext('timeout');
    expect((await api.startWave()).ok).toBe(false);
    const again = await api.startWave();
    expect(again.ok).toBe(true);
    expect(transport.dev.read().waves).toBe(1);
  });
  it("builds and upgrades on a friend's island with your own coins (code in the body)", async () => {
    const {api, transport, sent} = setup();
    const built = await api.build({spot: 'wall_3', kind: 'wall', code: 'isle-fr3nd'});
    expect(built.ok).toBe(true);
    expect(sent.at(-1)).toEqual({path: '/api/island/build', body: {spot: 'wall_3', kind: 'wall', actionUid: 'click000001', code: 'ISLE-FR3ND'}});
    expect(built.data.spots.find(spot => spot.id === 'wall_3')).toMatchObject({built: true, level: 1});
    expect(transport.dev.read().coins).toBe(90);
    expect((await api.getIsland()).data.spots.find(spot => spot.id === 'wall_3').built).toBe(false);
    expect((await api.upgrade({spot: 'cannon_1', code: 'ISLE-FR3ND'}))).toMatchObject({ok: false, code: 'locked', message: 'Unlocks after wave 2.'});
    expect(await api.build({spot: 'wall_3', kind: 'wall', code: 'nope'})).toMatchObject({ok: false, code: 'validation_error'});
    const point = await api.piratePoint();
    expect(point.data).toMatchObject({waveBest: 0, coins: 90});
  });
  it('the function-level fake has the same names', () => {
    const api = createFakeIslandApi();
    expect(Object.keys(api).sort()).toEqual(['build', 'createGame', 'currentWave', 'dev', 'finishWave', 'games', 'getIsland', 'heldActionUid', 'hire',
      'joinGame', 'joinInvite', 'joinWave', 'leaveGame', 'lobby', 'piratePoint', 'pointBuild', 'pointUpgrade', 'startWave', 'upgrade', 'upgradeCaptain', 'visit']);
  });
});
