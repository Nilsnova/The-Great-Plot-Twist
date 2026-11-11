// Bell -> wave_started_server -> 10 s countdown -> finish -> loot toast, with the fake server.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createWaveFlow, PLACEHOLDER_SECONDS} from '../../src/island/wave-flow.js';
import {createFakeIslandApi} from '../../src/island/fake-api.js';
import {finishWave, registerWaveRenderer, onWaveStarted, WAVE_STARTED, WAVE_FINISHED} from '../../src/island/wave-hooks.js';
import {emit as busEmit} from '../../src/core/events.js';

function setup({placeholder = true, ...options} = {}) {
  const api = createFakeIslandApi(options), events = [], banners = [], toasts = [];
  const emit = event => { events.push(event); busEmit(event); };
  const flow = createWaveFlow({api, emit, placeholder, banner: text => banners.push(text), notify: text => toasts.push(text),
    defensesOf: () => [{id: 'cannon_1', kind: 'cannon', x: -12.5, z: -14.5}]});
  return {api, flow, events, banners, toasts};
}

describe('the bell and the wave', () => {
  let flow;
  beforeEach(() => { vi.useFakeTimers({now: Date.parse('2026-11-11T10:00:00Z')}); });
  afterEach(() => { flow?.dispose(); flow = null; vi.useRealTimers(); });

  it('rings, tells the game, counts down 10 s and finishes with loot (placeholder)', async () => {
    const test = setup(); flow = test.flow;
    const answer = await flow.ring('own');
    expect(answer.ok).toBe(true);
    const started = test.events.find(event => event.type === WAVE_STARTED);
    expect(started).toEqual({type: WAVE_STARTED, waveId: answer.data.waveId, wave: 1, seed: answer.data.seed,
      startsAt: '2026-11-11T10:00:10Z', weather: {kind: 'calm', label: 'Calm sea', ships: 1, fog: 0}, flagship: false,
      where: 'own', defenses: [{id: 'cannon_1', kind: 'cannon', x: -12.5, z: -14.5}]});
    expect(test.banners.at(-1)).toBe('Pirates in 10 s! Wave 1');
    await vi.advanceTimersByTimeAsync(3000);
    expect(test.banners.at(-1)).toBe('Pirates in 7 s! Wave 1');
    expect(flow.secondsLeft()).toBe(7);
    await vi.advanceTimersByTimeAsync(7000);
    expect(test.banners.at(-1)).toBe('Wave 1: the pirates are here!');
    await vi.advanceTimersByTimeAsync(3000);
    expect(test.banners.at(-1)).toBe(null);
    await vi.advanceTimersByTimeAsync(PLACEHOLDER_SECONDS * 1000);
    expect(test.toasts.at(-1)).toBe('🪙 +15 loot · you have 🪙 115');
    expect(test.events.find(event => event.type === WAVE_FINISHED)).toMatchObject({survived: true, loot: 15, coins: 115, waveBest: 1});
    expect(flow.current).toBe(null);
  });
  it('waits for the wave lane when a renderer is registered, and finishes through the hook', async () => {
    const stop = registerWaveRenderer({name: 'test'});
    try {
      const test = setup(); flow = test.flow;
      const seen = [];
      const stopListening = onWaveStarted(event => seen.push(event.waveId));
      const answer = await flow.ring();
      stopListening();
      expect(seen).toEqual([answer.data.waveId]);
      await vi.advanceTimersByTimeAsync(60000);
      expect(test.toasts).toEqual([]); // no placeholder
      const done = await finishWave({waveId: answer.data.waveId, survived: true, shipsSunk: 6});
      expect(done.data).toEqual({loot: 15, coins: 115, waveBest: 1, flags: 1});
      expect(test.toasts.at(-1)).toBe('🪙 +15 loot · you have 🪙 115');
    } finally { stop(); }
  });
  it('retries a finish that came too early after Retry-After', async () => {
    const stop = registerWaveRenderer();
    try {
      const test = setup(); flow = test.flow;
      const answer = await flow.ring();
      const early = await finishWave({waveId: answer.data.waveId, survived: true});
      expect(early).toMatchObject({ok: false, code: 'wave_too_early', retryAfterSeconds: 25});
      await vi.advanceTimersByTimeAsync(25000);
      expect(test.events.some(event => event.type === WAVE_FINISHED)).toBe(true);
    } finally { stop(); }
  });
  it('no placeholder outside the fake or ?wavedebug=1', async () => {
    const test = setup({placeholder: false}); flow = test.flow;
    await flow.ring();
    await vi.advanceTimersByTimeAsync(60000);
    expect(test.toasts).toEqual([]);
  });
  it('a lost wave pays nothing and says so', async () => {
    const stop = registerWaveRenderer();
    try {
      const test = setup(); flow = test.flow;
      const answer = await flow.ring();
      vi.setSystemTime(Date.parse('2026-11-11T10:00:40Z'));
      await finishWave({waveId: answer.data.waveId, survived: false});
      expect(test.toasts.at(-1)).toBe('The pirates broke through. You have 🪙 100.');
      expect(test.events.find(event => event.type === WAVE_FINISHED)).toMatchObject({survived: false, loot: 0});
    } finally { stop(); }
  });
  it('a ring while a wave runs shows that wave; a visitor joins it', async () => {
    const test = setup(); flow = test.flow;
    const friend = test.api.dev.startWaveAt('ISLE-FR3ND');
    const refused = await flow.ring('ISLE-FR3ND');
    expect(refused).toMatchObject({ok: false, code: 'wave_running', message: 'A wave is already under way on this island.'});
    expect(flow.current).toMatchObject({joined: false, wave: {waveId: friend.waveId}});
    const joined = await flow.join('ISLE-FR3ND');
    expect(joined.ok).toBe(true);
    expect(test.events.filter(event => event.type === WAVE_STARTED).at(-1)).toMatchObject({waveId: friend.waveId, where: 'ISLE-FR3ND'});
    expect(flow.current.joined).toBe(true);
  });
  it('a friend sailing in sees the running wave without joining', async () => {
    const test = setup(); flow = test.flow;
    expect((await flow.look('ISLE-FR3ND')).data).toBe(null);
    test.api.dev.startWaveAt('ISLE-FR3ND');
    await flow.look('ISLE-FR3ND');
    expect(flow.current.joined).toBe(false);
    expect(test.events.some(event => event.type === WAVE_STARTED)).toBe(false);
  });
});
