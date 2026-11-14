// T38: how a won last-chance rescue reaches the server. The island API client sends rescued: true only for a
// won rescue (never false, never another value), and the fake server (?islands=fake) repeats the server rule of
// backend/server/island/rescue.py: a rescued loss from wave 4 falls back to the best wave minus 1, not minus 2.
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
      const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2, coins: 2000 }), api = transport.api;
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
  it('the fake server ignores a rescue below wave 4 (both rules ring wave 1 there)', async () => {
    const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2 }), api = transport.api;
    const wave = await api.startWave({ where: 'own', actionUid: 'startearly1' });
    time.advance(40);
    await api.finishWave({ waveId: wave.waveId, survived: false, shipsSunk: 0, rescued: true });
    expect((await api.island()).nextWave).toBe(1);
  });
});
