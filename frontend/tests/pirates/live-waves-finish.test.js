// The live co-op path (legacy waves, structure_recovery off): a wave's finish that hits a brief server or
// network failure is sent again, and a bell never stays "Under way" after the wave on screen is over.
import { describe, expect, it, vi } from 'vitest';
import { createWaveController, finishRetryWait } from '../../src/pirates/controller.js';
import { createWaveFlow } from '../../src/island/wave-flow.js';
import { bellModel } from '../../src/island/card-model.js';
import { WAVE_STARTED } from '../../src/island/wave-hooks.js';

const START = Date.UTC(2026, 10, 18, 12, 0, 0);
const info = (id, wave = 1) => ({ waveId: id, wave, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false });
const refusal = (status, code) => Object.assign(new Error('No connection to the server.'), { status, code, retryAfter: null });

function controllerHarness(options = {}) {
  const clock = { now: START }, timers = [], huds = [];
  const waves = createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, now: () => clock.now, world: { scene: {}, container: {} },
    getDefenses: () => [{ id: 'cannon_1', kind: 'cannon', level: 3, x: -12.5, z: -14.5 }, { id: 'cannon_2', kind: 'cannon', level: 3, x: 12.5, z: -14.5 }],
    createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
    createHud: () => { const hud = { countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}, boss() {}, loot() {}, pause(value) { hud.paused = value; }, banner() {} }; huds.push(hud); return hud; },
    playCutscene: async () => {}, setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); }, loadAuto: () => false, saveAuto() {}, ...options });
  async function advance(ms, step = 100) {
    for (let t = 0; t < ms; t += step) {
      clock.now += step; waves.update(step / 1000);
      for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
      await Promise.resolve(); await Promise.resolve();
    }
  }
  return { clock, waves, huds, advance };
}

describe('a legacy wave finish with an unknown outcome', () => {
  it('is sent again (same body) after a dropped connection and a 503, and the break gets its loot', async () => {
    let calls = 0;
    const finishWave = vi.fn(async () => { calls++; if (calls === 1) throw refusal(0, 'network_error'); if (calls === 2) throw refusal(503, 'database_unavailable'); return { loot: 15 }; });
    const h = controllerHarness({ finishWave, startNextWave: async () => ({ ok: true }) });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    expect(h.waves.inBreak).toBe(true);
    await h.advance(8000);
    expect(finishWave).toHaveBeenCalledTimes(3);
    expect(finishWave.mock.calls[2][0]).toEqual(finishWave.mock.calls[0][0]);
    expect(h.waves.runLoot).toBe(15);
  });
  it('is not sent again after a clear refusal, and gives up after a few unknown outcomes', async () => {
    expect(finishRetryWait(refusal(403, 'not_in_wave'), 0)).toBe(null);
    expect(finishRetryWait(refusal(404, 'no_such_wave'), 0)).toBe(null);
    expect(finishRetryWait(refusal(0, 'not_ready'), 0)).toBe(null);
    expect(finishRetryWait(refusal(502, 'database_error'), 0)).toBe(2);
    expect(finishRetryWait(refusal(429, 'too_many_requests'), 1)).toBe(5);
    expect(finishRetryWait(refusal(0, 'network_error'), 4)).toBe(null);
    const finishWave = vi.fn(async () => { throw refusal(404, 'no_such_wave'); });
    const h = controllerHarness({ finishWave, startNextWave: async () => ({ ok: true }) });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    await h.advance(30000);
    expect(finishWave).toHaveBeenCalledTimes(1);
  });
});

describe('the bell after a wave whose finish never got through', () => {
  function stubApi() {
    const wave = { waveId: 'w-1', wave: 3, seed: 7, startsAt: new Date(Date.now() + 10000).toISOString(), weather: {}, flagship: false };
    const api = { running: wave,
      startWave: vi.fn(async () => (api.running && api.running !== wave ? { ok: false, status: 409, code: 'wave_running', message: 'A wave is already under way on this island.' } : { ok: true, status: 200, data: wave })),
      joinWave: vi.fn(async () => (api.running ? { ok: true, status: 200, data: api.running } : { ok: false, status: 409, code: 'wave_over', message: 'This wave is over.' })),
      currentWave: vi.fn(async () => ({ ok: true, status: 200, data: api.running })),
      finishWave: vi.fn(async () => ({ ok: false, status: 0, code: 'network_error', message: 'No connection to the server.' })) };
    return api;
  }
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  it('does not stay "Under way": once the server closed the wave the bell rings again', async () => {
    const api = stubApi(), events = [];
    const flow = createWaveFlow({ api, emit: event => events.push(event), notify() {}, setTimer: () => 0, clearTimer() {} });
    await flow.ring('own');
    expect(events.filter(event => event.type === WAVE_STARTED)).toHaveLength(1);
    await flow.finish({ waveId: 'w-1', survived: true, shipsSunk: 3 }, { retry: false });
    expect(bellModel({ wave: flow.current.wave, joined: flow.current.joined }).action).toBe('none'); // "Under way", disabled
    api.running = null; // a teammate's finish closed it (or its 900 s ran out)
    expect(flow.release('w-1')).toBe(true);
    await settle();
    expect(flow.current).toBe(null);
    expect(bellModel({ wave: null }).action).toBe('ring');
    flow.dispose();
  });
  it('offers to join the still open wave again instead (its replay finishes once more)', async () => {
    const api = stubApi();
    const flow = createWaveFlow({ api, emit() {}, notify() {}, setTimer: () => 0, clearTimer() {} });
    await flow.ring('own');
    expect(flow.release('other-wave')).toBe(false);
    expect(flow.release('w-1')).toBe(true);
    await settle();
    expect(flow.current).toMatchObject({ joined: false, wave: { waveId: 'w-1' } });
    expect(bellModel({ wave: flow.current.wave, joined: false }).action).toBe('join');
    flow.dispose();
  });
});
