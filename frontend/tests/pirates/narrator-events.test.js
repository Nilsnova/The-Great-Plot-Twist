// The bus events the narrator listens to (GAME-V3.md §6) from the wave controller: boarders_ashore
// {wave, count} the first time boarders land in a wave, and heart_changed {hp, max} when the heart's ♥
// crosses below 30%, each once per wave; and the narrator plays game_started from the lobby once.
import { describe, expect, it, vi } from 'vitest';
import { createWaveController, HEART_WARN } from '../../src/pirates/controller.js';
import { HEART_LOW } from '../../src/narrator/logic.js';
import { createNarrator } from '../../src/narrator/index.js';

const START = Date.UTC(2026, 10, 12, 12, 0, 0);
const INFO = { waveId: 'w-3', wave: 3, seed: 91, startsAt: new Date(START + 10000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };
function createBus() {
  const listeners = new Map(), log = [];
  return { log,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { log.push(event); for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event); } };
}

describe('the narrator events of a wave', () => {
  it('boarders_ashore once when the first boarders land, heart_changed once when the heart drops below 30%', async () => {
    const clock = { now: START }, timers = [], bus = createBus();
    const controller = createWaveController({
      bus, getDefenses: () => [], now: () => clock.now, world: { scene: {}, container: {} },
      finishWave: vi.fn(async () => ({ loot: 0 })),
      createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
      createHud: () => ({ countdown() {}, bar() {}, prompt() {}, banner() {}, setVisible() {}, dispose() {} }),
      playCutscene: async () => {},
      setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
      clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    });
    controller.start(INFO);
    for (let t = 0; t < 240000 && !bus.log.some(event => event.type === 'wave_finished'); t += 100) {
      clock.now += 100; controller.update(.1);
      for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
      await Promise.resolve();
    }
    expect(HEART_WARN).toBe(HEART_LOW);
    const ashore = bus.log.filter(event => event.type === 'boarders_ashore');
    expect(ashore).toHaveLength(1);
    expect(ashore[0]).toMatchObject({ wave: 3 });
    expect(ashore[0].count).toBeGreaterThanOrEqual(1);
    const firstLanding = bus.log.findIndex(event => event.type === 'boarder_landed');
    expect(bus.log.findIndex(event => event.type === 'boarders_ashore')).toBeGreaterThan(firstLanding);
    const heart = bus.log.filter(event => event.type === 'heart_changed');
    expect(heart).toHaveLength(1);
    expect(heart[0].max).toBe(100);
    expect(heart[0].hp / heart[0].max).toBeLessThan(.3);
    // Every damage before it left the heart at 30% or more.
    const at = bus.log.indexOf(heart[0]);
    for (const event of bus.log.slice(0, at)) if (event.type === 'island_damaged') expect(event.hp).toBeGreaterThanOrEqual(heart[0].hp);
    expect(bus.log.filter(event => event.type === 'island_damaged' && event.hp / 100 < .3).length).toBeGreaterThanOrEqual(1);
    controller.dispose();
  });

  it('game_started from the lobby plays the opening once, and first: false is a welcome back', () => {
    const make = () => {
      const bus = createBus(), said = [], storage = new Map();
      const narrator = createNarrator({ container: null, on: bus.on, getGame: () => ({ code: 'K7Q2M', waveBest: 0 }),
        lines: [{ id: 'open', text: 'Ahoy.', trigger: 'game_opening' }, { id: 'back', text: 'Welcome back.', trigger: 'game_welcome_back' }],
        storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        preferences: () => ({ narrator: true, captions: true }), onPreferences: () => () => {}, fetchImpl: null,
        setTimer: () => 0, clearTimer: () => {}, held: () => false,
        createCard: () => ({ show: line => said.push(line?.text ?? line), hide() {}, dispose() {} }) });
      return { bus, said, narrator };
    };
    const first = make();
    first.bus.emit({ type: 'game_started', first: true, code: 'K7Q2M' });
    first.bus.emit({ type: 'game_started', first: true, code: 'K7Q2M' }); // a second room's echo
    expect(first.said).toEqual(['Ahoy.']);
    const again = make();
    again.bus.emit({ type: 'game_started', first: false, code: 'K7Q2M' });
    expect(again.said).toEqual(['Welcome back.']);
    first.narrator.dispose(); again.narrator.dispose();
  });
});
