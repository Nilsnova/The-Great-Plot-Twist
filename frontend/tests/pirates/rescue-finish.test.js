// T38: how a won last-chance rescue reaches the server. The island API client sends rescued: true only for a
// won rescue (never false, never another value), and the fake server (?islands=fake) repeats the server rule of
// backend/server/island/rescue.py: a rescued loss from wave 4 falls back to the best wave minus 1, not minus 2, and
// only while the flag rescue is on (routes/waves.py); its wave answers then carry rules: ['rescue'] (wave_rules.py).
import { describe, expect, it } from 'vitest';
import { createIslandApi } from '../../src/island/api.js';
import { createFakeIslandTransport } from '../../src/pirates/fake-api.js';

const clock = () => { let now = Date.UTC(2026, 10, 14, 12); return { now: () => now, advance: s => { now += s * 1000; } }; };

describe('the finish with a rescue', () => {
  it('sends rescued: true only for a won rescue, and nothing extra otherwise', async () => {
    const sent = [], transport = { get: async () => ({}), post: async (path, body) => { sent.push(body); return {}; } };
    const api = createIslandApi({ transport, makeUid: () => 'click000001' });
    for (const rescued of [true, false, undefined, 'yes', 1]) await api.finishWave({ waveId: 'w1', survived: false, shipsSunk: 0, rescued });
    expect(sent.map(body => body.rescued)).toEqual([true, undefined, undefined, undefined, undefined]);
    expect(Object.keys(sent[1]).sort()).toEqual(['shipsSunk', 'survived', 'waveId']);
  });
  it('the fake server falls back one wave less after a rescued loss, and keeps the best wave', async () => {
    for (const [rescued, next] of [[true, 9], [false, 8]]) {
      const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2, coins: 2000, flags: { rescue: true } }), api = transport.api;
      transport.dev.setWaveBest(10);
      const wave = await api.startWave({ where: 'own', actionUid: `start${rescued}x` });
      time.advance(40);
      const done = await api.finishWave({ waveId: wave.waveId, survived: false, shipsSunk: 0, rescued });
      expect(done.loot).toBe(0);
      const island = await api.island();
      expect(island.nextWave, `rescued ${rescued}`).toBe(next);
      expect(island.waveBest).toBe(10);
    }
  });
  it('the fake server ignores a rescue with the flag off, as the server does', async () => {
    const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2, coins: 2000 }), api = transport.api;
    transport.dev.setWaveBest(10);
    const wave = await api.startWave({ where: 'own', actionUid: 'startoff01' });
    expect(wave.rules).toBeUndefined();
    time.advance(40);
    await api.finishWave({ waveId: wave.waveId, survived: false, shipsSunk: 0, rescued: true });
    expect((await api.island()).nextWave).toBe(8);
  });
  it('the fake wave answers carry the rules of the flags on, kept by the wave\'s first answer', async () => {
    const time = clock(), world = createFakeIslandTransport({ now: time.now, version: 2, flags: { rescue: true } });
    const wave = await world.api.startWave({ where: 'own', actionUid: 'startrules1' });
    expect(wave.rules).toEqual(['rescue']);
    expect((await world.api.currentWave('own')).rules).toEqual(['rescue']);
  });
  it('the fake keeps a wave\'s first rule set even when it is empty, whatever the flags say later', async () => {
    const flags = {}, time = clock(), world = createFakeIslandTransport({ now: time.now, version: 2, flags });
    const wave = await world.api.startWave({ where: 'own', actionUid: 'startempty1' });
    expect(wave.rules).toBeUndefined();
    flags.tower_health = true; // switched on mid-wave: the starter plays none, so must every later answer
    expect((await world.api.currentWave('own')).rules).toBeUndefined();
    const onFlags = { rescue: true }, other = createFakeIslandTransport({ now: time.now, version: 2, flags: onFlags });
    await other.api.startWave({ where: 'own', actionUid: 'startkept01' });
    delete onFlags.rescue; // every rule flag off mid-wave: the wave keeps the starter's rules
    expect((await other.api.currentWave('own')).rules).toEqual(['rescue']);
  });
  it('the fake server ignores a rescue below wave 4 (both rules ring wave 1 there)', async () => {
    const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2, flags: { rescue: true } }), api = transport.api;
    const wave = await api.startWave({ where: 'own', actionUid: 'startearly1' });
    time.advance(40);
    await api.finishWave({ waveId: wave.waveId, survived: false, shipsSunk: 0, rescued: true });
    expect((await api.island()).nextWave).toBe(1);
  });
});
