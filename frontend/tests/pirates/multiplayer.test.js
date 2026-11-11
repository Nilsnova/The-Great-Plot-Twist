// Up to four players on one island (TOWER-DEFENSE.md §6, §11), the parts a single-player test never
// reaches: the owner's room once the island answered, two friends pressing "Next wave" at once, a friend
// landing mid-wave, co-op builds reaching every defender, and a break that never keeps the input blocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { wireWaves } from '../../src/pirates/game-wiring.js';
import { createWaveFlow } from '../../src/island/wave-flow.js';
import { WAVE_STARTED } from '../../src/island/wave-hooks.js';
import { createFakeIslandApi } from '../island/fake.js';

const START = Date.UTC(2026, 10, 11, 12, 0, 0);
const info = (id, wave = 1) => ({ waveId: id, wave, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false });

function controllerHarness(options = {}) {
  const clock = { now: START }, timers = [], huds = [];
  const waves = createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, now: () => clock.now, world: { scene: {}, container: {} },
    getDefenses: () => [{ id: 'cannon_1', kind: 'cannon', level: 3, x: -12.5, z: -14.5 }, { id: 'cannon_2', kind: 'cannon', level: 3, x: 12.5, z: -14.5 }],
    finishWave: vi.fn(async () => ({ loot: 15 })), createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
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

describe('the break with several captains', () => {
  it('Auto next with a refused start ends the break instead of keeping it (and the input) forever', async () => {
    const startNextWave = vi.fn(async () => ({ ok: false, code: 'network_error', message: 'No connection to the server.' }));
    const h = controllerHarness({ startNextWave, loadAuto: () => true });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    expect(h.waves.inBreak).toBe(true);
    h.waves.next(); await h.advance(300);
    expect(h.huds[0].paused.line).toBe('No connection to the server.');
    await h.advance(17000);
    expect(h.waves.wave).toBe(null);
  });
  it('a friend\'s next wave arriving before ours ended here plays ours out and finishes it first', async () => {
    const finishWave = vi.fn(async () => ({ loot: 15 }));
    const h = controllerHarness({ finishWave, startNextWave: async () => ({ ok: true }) });
    h.waves.start(info('w-1'));
    await h.advance(14000); // the wave runs, nothing is sunk yet
    expect(h.waves.wave.done).toBe(false);
    h.waves.start({ ...info('w-2', 2), startsAt: new Date(h.clock.now + 10000).toISOString() });
    await h.advance(200);
    expect(h.waves.wave.info.waveId).toBe('w-2');
    expect(h.waves.wave.done).toBe(false);
    expect(finishWave).toHaveBeenCalledTimes(1);
    expect(finishWave.mock.calls[0][0]).toMatchObject({ waveId: 'w-1' });
    expect(h.waves.runLoot).toBe(15); // the run (and its loot) carries on into the friend's wave
  });
});

describe('the bell when two captains ring at once', () => {
  beforeEach(() => { vi.useFakeTimers({ now: Date.parse('2026-11-11T10:00:00Z') }); });
  afterEach(() => { vi.useRealTimers(); });
  it('"Next wave" that finds the other captain\'s wave running joins it', async () => {
    const api = createFakeIslandApi(), events = [];
    const flow = createWaveFlow({ api, emit: event => events.push(event) });
    const friend = await api.dev.startWaveAt('ISLE-FR3ND');
    const answer = await flow.ring('ISLE-FR3ND', { joinRunning: true });
    expect(answer.ok).toBe(true);
    expect(events.filter(event => event.type === WAVE_STARTED).at(-1)).toMatchObject({ waveId: friend.waveId, where: 'ISLE-FR3ND' });
    expect(flow.current.joined).toBe(true);
    flow.dispose();
  });
  it('reads the island once more before a wave starts, so a friend\'s new wall is in it', async () => {
    const api = createFakeIslandApi(), order = [];
    let wall = false;
    const flow = createWaveFlow({ api, emit: event => { if (event.type === WAVE_STARTED) order.push(['started', event.defenses.length]); },
      prepare: async () => { order.push(['prepare']); wall = true; }, defensesOf: () => (wall ? [{ id: 'wall_1' }] : []) });
    await flow.ring('own');
    expect(order).toEqual([['prepare'], ['started', 1]]);
    flow.dispose();
  });
});

function wiringHarness({ visiting = null } = {}) {
  const handlers = new Map(), rooms = [], ticks = [], laters = [];
  const on = (type, handler) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); return () => handlers.get(type).delete(handler); };
  const emit = event => { for (const handler of [...(handlers.get(event.type) ?? [])]) handler(event); };
  const openRoom = topic => {
    const listeners = new Map(), room = { topic, sent: [], closed: false,
      send(type, payload) { room.sent.push([type, payload]); return true; },
      on(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); return () => listeners.get(type).delete(handler); },
      hear(type, payload) { for (const handler of [...(listeners.get(type) ?? [])]) handler(payload); },
      close() { room.closed = true; } };
    rooms.push(room); return room;
  };
  const state = { own: null, visiting };
  const island = {
    api: {}, get island() { return state.own; }, get visiting() { return state.visiting; },
    defenses: () => [], roomPlace: () => (state.visiting ? `isle_${state.visiting.code.toLowerCase()}` : state.own ? 'isle_k7q2m' : null),
    joinRunningWave: vi.fn(async () => null), refreshDefended: vi.fn(async () => {}), loadPoint: vi.fn(async () => {}),
    ringBell: vi.fn(async () => ({ ok: true })), setBattle() {}, setPointBattle() {}, point: null,
  };
  const world = { current: { id: 'home_islet' } };
  const waves = wireWaves({ island, on, emit, world, openRoom, loop: false, every: run => { ticks.push(run); return () => {}; },
    later: (run, ms) => { const item = { run, ms }; laters.push(item); return () => { laters.splice(laters.indexOf(item), 1); }; } });
  const tick = () => ticks.forEach(run => run());
  const flush = async () => { while (laters.length) { const item = laters.shift(); item.run(); await Promise.resolve(); } await Promise.resolve(); };
  return { waves, island, state, rooms, emit, tick, flush, world };
}

describe('the island room for every defender', () => {
  it('the owner joins the island room as soon as the island answered (it is unknown at the landing)', () => {
    const h = wiringHarness();
    expect(h.rooms).toHaveLength(0);
    h.state.own = { code: 'ISLE-K7Q2M', spots: [] };
    h.tick();
    expect(h.rooms.map(room => room.topic)).toEqual(['live:place:isle_k7q2m:1']);
    h.tick();
    expect(h.rooms).toHaveLength(1);
    h.waves.dispose();
  });
  it('sends wave_start, again a little later, and joins when a friend\'s wave_start arrives', async () => {
    const h = wiringHarness();
    h.state.own = { code: 'ISLE-K7Q2M', spots: [] }; h.tick();
    const room = h.rooms[0];
    h.emit({ type: 'wave_started_server', waveId: 'w-1', seed: 5, startsAt: '2026-11-11T10:00:10Z', flagship: false });
    expect(room.sent.filter(([type]) => type === 'wave_start')).toHaveLength(1);
    room.hear('wave_start', { waveId: 'w-9', seed: 1, startsAt: '2026-11-11T10:00:10Z' });
    await Promise.resolve(); await Promise.resolve();
    expect(h.island.joinRunningWave).toHaveBeenCalled();
    h.waves.dispose();
  });
  it('tries the join again while the bell is busy with our own ring', async () => {
    const h = wiringHarness();
    h.state.own = { code: 'ISLE-K7Q2M', spots: [] }; h.tick(); // the landing's own look for a running wave
    await Promise.resolve(); await Promise.resolve();
    h.island.joinRunningWave.mockClear();
    h.island.joinRunningWave.mockResolvedValueOnce({ ok: false, code: 'busy' });
    h.rooms[0].hear('wave_start', { waveId: 'w-2', seed: 1, startsAt: '2026-11-11T10:00:10Z' });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await h.flush();
    expect(h.island.joinRunningWave).toHaveBeenCalledTimes(2);
    h.waves.dispose();
  });
  it('a friend landing while a wave runs joins it once the island answered', async () => {
    const h = wiringHarness({ visiting: { code: 'FR3ND' } });
    h.emit({ type: 'arrived', place: 'home_islet' });
    h.tick();
    expect(h.island.joinRunningWave).not.toHaveBeenCalled(); // the visit has not answered yet
    h.state.visiting = { code: 'FR3ND', ownerName: 'Captain Gull', spots: [] };
    h.tick(); h.tick();
    await Promise.resolve();
    expect(h.island.joinRunningWave).toHaveBeenCalledTimes(1);
    h.waves.dispose();
  });
  it('co-op builds: ours go to the room as island_changed, a friend\'s make us read the island again', async () => {
    const h = wiringHarness({ visiting: { code: 'FR3ND', ownerName: 'Captain Gull' } });
    h.tick();
    const room = h.rooms[0];
    expect(room.topic).toBe('live:place:isle_fr3nd:1');
    h.emit({ type: 'island_spots_changed', place: 'visit', spot: 'wall_2' });
    expect(room.sent).toContainEqual(['island_changed', { spot: 'wall_2' }]);
    room.hear('island_changed', { spot: 'cannon_3' });
    room.hear('island_changed', { spot: 'cannon_4' });
    await h.flush();
    expect(h.island.refreshDefended).toHaveBeenCalledTimes(1); // two hints close together: one read
    h.waves.dispose();
  });
});
