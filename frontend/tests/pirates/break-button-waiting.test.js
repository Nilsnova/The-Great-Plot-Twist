// Playtest 20 Nov: after a wave the button on the break card kept saying "Counting the loot…" although the
// loot was there. It said that for every reason it could not be pressed. Now it names the real reason.
import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { WAITING } from '../../src/pirates/hud.js';
import { browserHarness } from '../g20-browser.js';

const START = Date.UTC(2026, 10, 20, 12, 0, 0);
const info = id => ({ waveId: id, wave: 1, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false });

function harness(options = {}) {
  const clock = { now: START }, timers = [], huds = [];
  const waves = createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, now: () => clock.now, world: { scene: {}, container: {} },
    getDefenses: () => [{ id: 'cannon_1', kind: 'cannon', level: 3, x: -12.5, z: -14.5 }, { id: 'cannon_2', kind: 'cannon', level: 3, x: 12.5, z: -14.5 }],
    createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
    createHud: () => { const hud = { countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}, boss() {}, loot() {}, pause(value) { hud.paused = value; }, banner() {} }; huds.push(hud); return hud; },
    playCutscene: async () => {}, setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); }, loadAuto: () => false, saveAuto() {}, breakSeconds: 600, ...options });
  async function advance(ms, step = 100) {
    for (let t = 0; t < ms; t += step) {
      clock.now += step; waves.update(step / 1000);
      for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
      await Promise.resolve(); await Promise.resolve();
    }
  }
  return { clock, waves, huds, advance, card: () => huds.at(-1).paused };
}

describe('the break card says what Next wave is waiting for', () => {
  it('counts the loot until the server answers, then offers Next wave, then says it is starting', async () => {
    let answer; const finishWave = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    let started; const startNextWave = vi.fn(() => new Promise(resolve => { started = resolve; }));
    const h = harness({ finishWave, startNextWave });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    expect(h.waves.inBreak).toBe(true);
    await h.advance(300);
    expect(h.card()).toMatchObject({ ready: false, waiting: 'loot' });

    answer({ loot: 15 }); await h.advance(300);
    expect(h.card()).toMatchObject({ ready: true, waiting: null });

    expect(h.waves.next()).toBe(true); await h.advance(300);
    expect(startNextWave).toHaveBeenCalledTimes(1);
    // The button is disabled again, but not because of the loot: the next wave is on its way.
    expect(h.card()).toMatchObject({ ready: false, waiting: 'starting' });
    started({ ok: true });
  });
});

const browser = browserHarness();
describe('the button text on the real card', () => {
  it('names each reason, and keeps "Counting the loot…" when no reason is given (older callers)', async () => {
    const labels = await browser(async () => {
      const { createWaveHud } = await window.g20Import('/src/pirates/hud.js');
      const hud = createWaveHud({ container: document.body });
      const read = info => { hud.pause({ title: 'Wave 3 won!', line: '5 ships sunk', seconds: 0, auto: false, ...info }); const b = document.querySelector('.pirate-break .pirate-next'); return [b.textContent, b.disabled]; };
      const out = { loot: read({ ready: false, waiting: 'loot' }), starting: read({ ready: false, waiting: 'starting' }), host: read({ ready: false, waiting: 'host' }),
        plain: read({ ready: false }), ready: read({ ready: true, waiting: null }), counting: read({ ready: true, seconds: 7 }) };
      hud.dispose(); return out;
    });
    expect(labels).toEqual({ loot: [WAITING.loot, true], starting: [WAITING.starting, true], host: [WAITING.host, true],
      plain: [WAITING.loot, true], ready: ['Next wave', false], counting: ['Next wave · 7', false] });
    expect(WAITING).toEqual({ loot: 'Counting the loot…', starting: 'Starting the next wave…', host: 'Waiting for the host' });
  });
});
