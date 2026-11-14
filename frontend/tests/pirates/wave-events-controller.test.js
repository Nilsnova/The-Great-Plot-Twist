// The wave controller with v3 waves (GAME-V3.md §4.2, §4.3): the event's banner under the wave bar, its drawing
// and narrator moment; a boss finisher's scene, this player's samples sent to the room in windows that respect
// the room's gap, no shots while the battle stands still, and the won finisher's bonus in the finish body.
import { describe, expect, it, vi } from 'vitest';
import { EVENT_BANNER_SECONDS, createWaveController } from '../../src/pirates/controller.js';
import { readMessage } from '../../src/pirates/sync.js';
import { eventFor, EVENT_TEXT } from '../../src/pirates/wave-events.js';
import { zoneAt } from '../../src/pirates/finisher/rules.js';
import { ISLANDS } from './balance-fixture.js';

const START = Date.parse('2026-11-12T12:00:00Z');
const INFO = { waveId: 'w-5', wave: 5, seed: 7, startsAt: new Date(START).toISOString(), weather: {}, boss: true };

function harness({ play = true, info = INFO } = {}) {
  const clock = { now: START }, sent = [], bus = [], events = [], scenes = [], arts = [];
  const room = { send: (type, payload) => { sent.push({ type, payload, at: clock.now }); return true; }, on: () => () => {} };
  const hud = { countdown() {}, bar() {}, banner() {}, setVisible() {}, dispose() {}, musket() {}, loot() {}, boss() {}, prompt() {}, health() {},
    down() {}, marks() {}, event: info => events.push(info) };
  const finishWave = vi.fn(async () => ({ loot: 10 }));
  const controller = createWaveController({ bus: { on: () => () => {}, emit: event => bus.push(event) }, room, playerId: 'p-me', now: () => clock.now,
    world: { scene: {}, container: {}, player: { position: { x: 0, z: -12 } }, project: (x, z) => ({ x: x * 10, y: z * 10 }), camera: { userData: {}, position: { x: 0, y: 0 } } },
    getDefenses: () => ISLANDS.full.defenses, getCrew: () => ISLANDS.full.crew, finishWave,
    createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }), createHud: () => hud, setTimer: () => 0, clearTimer() {},
    createEventArt: options => { const art = { options, updates: 0, events() {}, update() { art.updates++; }, setVisible() {}, dispose: vi.fn() }; arts.push(art); return art; },
    // A scene that plays the haul perfectly through the recorder (like a player keeping the needle in the zone).
    createFinisherScene: options => {
      options.onReady(); // This fixture skips practice; readiness is still sent through the real controller.
      const scene = { options, updates: 0, element: {}, dispose: vi.fn(), update({ finisher: f }) {
        scene.updates++;
        const task = f.tasks[f.task];
        if (play && f.phase === 'task' && task) options.recorder.fill(f.sample, Math.round(zoneAt(Math.max(0, f.sample - 1 - task.from), f.salt)));
      } };
      scenes.push(scene); return scene;
    } });
  const advance = async ms => { for (let t = 0; t < ms; t += 50) { clock.now += 50; controller.update(.05); await Promise.resolve(); } };
  return { clock, sent, bus, events, scenes, arts, controller, advance, finishWave };
}

describe('the wave event in the controller', () => {
  it('feeds the sim the event of the wave seed, shows the banner then the chip, draws it and tells the narrator', async () => {
    const id = eventFor(5, 7);
    expect(id).toBe('storm');
    const h = harness();
    h.controller.start(INFO);
    await h.advance(2000);
    expect(h.controller.state.event.id).toBe(id);
    expect(h.events.at(-1)).toMatchObject({ id, title: EVENT_TEXT[id].title, line: EVENT_TEXT[id].line, open: true });
    expect(h.bus.filter(event => event.type === 'wave_event_announced')).toEqual([{ type: 'wave_event_announced', event: id, wave: 5 }]);
    expect(h.arts).toHaveLength(1);
    expect(h.arts[0].updates).toBeGreaterThan(10);
    await h.advance(EVENT_BANNER_SECONDS * 1000);
    expect(h.events.at(-1)).toMatchObject({ id, open: false });
  });
  it('a wave without an event (waves 1-2) has no banner and no drawing', async () => {
    const h = harness({ info: { ...INFO, waveId: 'w-2', wave: 2, boss: false } });
    h.controller.start({ ...INFO, waveId: 'w-2', wave: 2, boss: false });
    await h.advance(1000);
    expect(h.controller.state.event).toBeNull();
    expect(h.events.every(item => item === null)).toBe(true);
    expect(h.arts).toHaveLength(0);
  });
});

describe('a boss finisher in the controller', () => {
  it('opens the scene, sends this player\'s samples in windows, blocks the gun, wins and asks for the bonus', async () => {
    const h = harness();
    h.controller.start(INFO);
    for (let i = 0; i < 120 && !h.controller.state?.finisher; i++) await h.advance(1000);
    const started = h.controller.state.finisher;
    expect(started).toMatchObject({ active: true, kind: 'haul', players: ['p-me'] });
    expect(h.bus.filter(event => event.type === 'finisher_moment')).toEqual([{ type: 'finisher_moment', kind: 'haul', phase: 'start' }]);
    expect(h.controller.shoot()).toBe(false); // the battle stands still
    for (let i = 0; i < 40 && h.controller.state?.finisher?.active; i++) await h.advance(500);
    expect(h.scenes).toHaveLength(1);
    expect(h.scenes[0].updates).toBeGreaterThan(100);
    expect(h.scenes[0].dispose).toHaveBeenCalled();
    expect(h.sent.some(item => item.type === 'finisher_ready')).toBe(true);
    const inputs = h.sent.filter(item => item.type === 'finisher_input');
    expect(inputs.length).toBeGreaterThan(5);
    for (const item of inputs) {
      // Every window passes the room's checks and holds at most 24 samples.
      expect(readMessage('finisher_input', item.payload, INFO.waveId)?.input.by).toBe('p-me');
      expect(item.payload.marks.length).toBeLessThanOrEqual(24);
    }
    for (let i = 1; i < inputs.length - 1; i++) expect(inputs[i].at - inputs[i - 1].at).toBeGreaterThanOrEqual(500);
    // No positions while the battle stood still.
    const moves = h.sent.filter(item => item.type === 'captain_move' && item.at > inputs[0].at && item.at < inputs.at(-1).at);
    expect(moves).toEqual([]);
    expect(h.bus.filter(event => event.type === 'finisher_moment').map(event => event.phase)).toEqual(['start', 'won']);
    for (let i = 0; i < 200 && !h.finishWave.mock.calls.length; i++) await h.advance(1000);
    expect(h.finishWave.mock.calls[0][0]).toMatchObject({ waveId: INFO.waveId, survived: true, bonuses: ['finisher'] });
  });

  it('a player who does nothing loses it: the boss breaks free and no bonus is asked for', async () => {
    const h = harness({ play: false });
    h.controller.start(INFO);
    for (let i = 0; i < 120 && !h.controller.state?.finisher; i++) await h.advance(1000);
    for (let i = 0; i < 40 && h.controller.state?.finisher?.active; i++) await h.advance(500);
    expect(h.bus.filter(event => event.type === 'finisher_moment').map(event => event.phase)).toEqual(['start', 'failed']);
    for (let i = 0; i < 200 && !h.finishWave.mock.calls.length; i++) await h.advance(1000);
    expect(h.finishWave.mock.calls[0][0].bonuses).toBeUndefined();
  });
});
