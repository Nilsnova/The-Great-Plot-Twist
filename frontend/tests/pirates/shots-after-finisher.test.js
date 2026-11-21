// Playtest 21 Nov: after a minigame in a wave (a boss finisher) the cannonballs were sometimes invisible.
// The finisher freezes the sim's clock, and every shot is stamped in that clock. The renderer's clock ran on,
// so it was ahead by the length of the minigame and took each new ball for one that had already landed.
import { describe, expect, it } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { zoneAt } from '../../src/pirates/finisher/rules.js';
import { ISLANDS } from './balance-fixture.js';

const START = Date.UTC(2026, 10, 21, 12, 0, 0);
const INFO = { waveId: 'w-5', wave: 5, seed: 7, startsAt: new Date(START).toISOString(), weather: {}, boss: true };

function harness() {
  const clock = { now: START }, flights = [];
  let simTime = 0;
  const noop = () => {};
  // Every shot with a flight, as the renderer sees it: when it lands and what the drawing clock says on arrival.
  const renderer = { setVisible: noop, dispose: noop, update(frame) { simTime = frame.simTime; },
    events(list) { for (const event of list ?? []) if (Number.isFinite(event.impactAt) && event.impactAt > event.t) flights.push({ type: event.type, t: event.t, impactAt: event.impactAt, seenAt: simTime }); } };
  const controller = createWaveController({ bus: { on: () => noop, emit: noop }, room: { send: () => true, on: () => noop }, playerId: 'p-me', now: () => clock.now,
    world: { scene: {}, container: {}, player: { position: { x: 0, z: -12 } }, project: (x, z) => ({ x: x * 10, y: z * 10 }), camera: { userData: {}, position: { x: 0, y: 0 } } },
    getDefenses: () => ISLANDS.full.defenses, getCrew: () => ISLANDS.full.crew, finishWave: async () => ({ loot: 10 }),
    createRenderer: () => renderer, createHud: () => new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : noop) }), setTimer: () => 0, clearTimer: noop,
    createEventArt: () => ({ events: noop, update: noop, setVisible: noop, dispose: noop }),
    createFinisherScene: options => { options.onReady(); return { element: {}, dispose: noop, update({ finisher: f }) {
      const task = f.tasks[f.task];
      if (f.phase === 'task' && task) options.recorder.fill(f.sample, Math.round(zoneAt(Math.max(0, f.sample - 1 - task.from), f.salt)));
    } }; } });
  const advance = async ms => { for (let t = 0; t < ms; t += 50) { clock.now += 50; controller.update(.05); await Promise.resolve(); } };
  return { controller, advance, flights };
}

describe('shots after a boss finisher', () => {
  it('are still in flight for the renderer when they are fired', async () => {
    const h = harness();
    h.controller.start(INFO);
    for (let i = 0; i < 120 && !h.controller.state?.finisher; i++) await h.advance(1000);
    expect(h.controller.state.finisher).toBeTruthy();
    const before = h.flights.length;
    expect(before).toBeGreaterThan(0);
    expect(h.flights.filter(shot => shot.seenAt >= shot.impactAt)).toEqual([]);   // fine before the minigame, as always
    for (let i = 0; i < 40 && h.controller.state?.finisher?.active; i++) await h.advance(500);
    expect(h.controller.state.finisher?.active).not.toBe(true);
    for (let i = 0; i < 20 && h.controller.state.phase === 'running'; i++) await h.advance(1000);
    const after = h.flights.slice(before);
    expect(after.length).toBeGreaterThan(0);                                       // the battle went on after the minigame
    expect(after.filter(shot => shot.seenAt >= shot.impactAt)).toEqual([]);       // none arrives already "landed"
  }, 120000);
});
