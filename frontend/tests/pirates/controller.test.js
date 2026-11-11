// The wave controller (lanes P3/P4): bell to loot, finish retries, cleanup and friends kept in sync.
import { describe, expect, it, vi } from 'vitest';
import { coastPoint, createWave } from '../../src/pirates/sim.js';
import { FakeApiError } from '../../src/pirates/fake-api.js';
import { createWaveController, tooEarlyWait } from '../../src/pirates/controller.js';
import { INPUT_LEAD_TICKS, createInputSchedule, readMessage, toMessage } from '../../src/pirates/sync.js';

const at = (id, kind, bearing, radius) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
const DEFENSES = [at('cannon_2', 'cannon', 45, .75), at('wall_1', 'wall', 0, .86), at('wall_2', 'wall', 90, .86)];
const START = Date.UTC(2026, 10, 11, 12, 0, 0);
const INFO = { waveId: 'w-1', wave: 1, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };

function createBus() {
  const listeners = new Map(), log = [];
  return { log, listeners,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { log.push(event); for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event); } };
}
function harness(options = {}) {
  const clock = { now: START }, timers = [], bus = options.bus ?? createBus();
  const disposed = { renderer: 0, hud: 0 }, cutscenes = [];
  const controller = createWaveController({
    bus, getDefenses: () => DEFENSES, now: () => clock.now, world: { scene: {}, container: {} },
    finishWave: options.finishWave ?? vi.fn(async () => ({ loot: 15 })),
    createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose: () => disposed.renderer++ }),
    createHud: () => ({ countdown() {}, bar() {}, prompt() {}, banner() {}, setVisible() {}, dispose: () => disposed.hud++ }),
    playCutscene: async id => { cutscenes.push(id); },
    setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    ...options.controller,
  });
  async function advance(ms, step = 100) {
    for (let t = 0; t < ms; t += step) {
      clock.now += step; controller.update(step / 1000);
      for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
      await Promise.resolve();
    }
  }
  return { clock, timers, bus, controller, disposed, cutscenes, advance };
}
const reference = (inputs = () => []) => {
  const wave = createWave({ seed: INFO.seed, wave: 1, weather: INFO.weather, defenses: DEFENSES, countdown: 0 });
  let tick = 0; while (!wave.done) wave.step(.05, inputs(tick++, wave));
  return wave.result();
};

describe('pirate wave controller', () => {
  it('starts on wave_started_server, waits for startsAt, finishes once with the sim result and cleans up', async () => {
    const h = harness();
    h.bus.emit({ type: 'wave_started_server', ...INFO });
    expect(h.controller.wave).toBeTruthy();
    await h.advance(9000);
    expect(h.controller.state.phase).toBe('countdown');
    expect(h.controller.state.ships).toHaveLength(0);
    h.bus.emit({ type: 'wave_started_server', ...INFO }); // the same wave twice changes nothing
    await h.advance(60000);
    const expected = reference();
    expect(expected.survived).toBe(true);
    expect(h.controller.wave).toBe(null);
    const finishWave = h.bus.log.find(event => event.type === 'wave_finished');
    expect(finishWave).toMatchObject({ survived: true, shipsSunk: expected.shipsSunk, waveId: 'w-1' });
    expect(h.bus.log.filter(event => event.type === 'wave_finished')).toHaveLength(1);
    expect(h.cutscenes).toEqual(['wave_won']);
    expect(h.disposed).toEqual({ renderer: 1, hud: 1 });
    // The sim's own events reach the bus too.
    expect(h.bus.log.some(event => event.type === 'ship_sunk')).toBe(true);
    expect(h.bus.log.findIndex(event => event.type === 'wave_started')).toBeGreaterThan(-1);
  });

  it('calls finishWave once with the result, and again after waitSeconds on wave_too_early', async () => {
    const finishWave = vi.fn()
      .mockRejectedValueOnce(new FakeApiError(409, 'wave_too_early', 'The wave is not over yet. Try again in 4 seconds.', 4))
      .mockResolvedValueOnce({ loot: 15 });
    const h = harness({ finishWave });
    h.controller.start(INFO);
    await h.advance(70000);
    expect(finishWave).toHaveBeenCalledTimes(2);
    const result = reference();
    expect(finishWave.mock.calls[0][0]).toEqual({ waveId: 'w-1', survived: result.survived, shipsSunk: result.shipsSunk });
    expect(finishWave.mock.calls[1][0]).toEqual(finishWave.mock.calls[0][0]);
    expect(tooEarlyWait({ code: 'wave_too_early' })).toBe(5);
    expect(tooEarlyWait({ body: { error: { code: 'wave_too_early', waitSeconds: 3 } } })).toBe(3);
    expect(tooEarlyWait({ code: 'wave_over' })).toBe(null);
  });

  it('plays wave_lost when the island falls, ignores Pirate Point waves on the island and stops listening on dispose', async () => {
    const h = harness({ controller: { getDefenses: () => [] } });
    h.bus.emit({ type: 'wave_started_server', ...INFO, waveId: 'pp', flagship: true });
    expect(h.controller.wave).toBe(null);
    h.bus.emit({ type: 'wave_started_server', ...INFO, waveId: 'w-lost' });
    await h.advance(140000, 250);
    expect(h.bus.log.find(event => event.type === 'wave_finished')).toMatchObject({ survived: false, waveId: 'w-lost' });
    expect(h.cutscenes).toEqual(['wave_lost']);
    h.controller.start({ ...INFO, waveId: 'w-3' });
    expect(h.controller.wave).toBeTruthy();
    h.controller.dispose();
    await Promise.resolve(); await Promise.resolve(); // a renderer still loading is released when it arrives
    expect(h.controller.wave).toBe(null);
    expect(h.disposed.renderer).toBe(2);
    expect([...h.bus.listeners.get('wave_started_server')]).toHaveLength(0);
    h.bus.emit({ type: 'wave_started_server', ...INFO, waveId: 'w-4' });
    expect(h.controller.wave).toBe(null);
  });
});

describe('pirate wave sync', () => {
  function sharedRoom() {
    const members = [], sent = [];
    return { sent, join(name) {
      const handlers = new Map(), member = { name, handlers, inbox: [] }; members.push(member);
      return { member,
        send(type, payload) { sent.push({ from: name, type, payload }); for (const other of members) if (other !== member) other.inbox.push([type, payload]); },
        on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); } };
    }, deliver() { for (const member of members) for (const [type, payload] of member.inbox.splice(0)) member.handlers.get(type)?.(payload); } };
  }

  it('gives two friends the same wave for the same shots and repairs', async () => {
    const room = sharedRoom(), bus = createBus();
    const a = harness({ bus, controller: { room: room.join('a'), playerId: 'a', listen: false, onEvents: list => logs.a.push(...list) } });
    const b = harness({ bus: createBus(), controller: { room: room.join('b'), playerId: 'b', listen: false, onEvents: list => logs.b.push(...list) } });
    const logs = { a: [], b: [] };
    a.controller.start(INFO); b.controller.start(INFO);
    let shots = 0, repairs = 0;
    for (let step = 0; step < 900 && (a.controller.wave || b.controller.wave); step++) {
      a.clock.now += 100; b.clock.now += 100;
      a.controller.update(.1); b.controller.update(.1);
      const state = a.controller.state;
      if (state?.phase === 'running' && state.ships.length && step % 7 === 0 && shots < 6) { if (a.controller.fire('cannon_2', state.ships[0].id)) shots++; }
      const hurt = b.controller.state?.walls.find(wall => wall.hp < wall.maxHp && !wall.repairing);
      if (hurt && repairs < 3 && b.controller.repair(hurt.id)) repairs++;
      room.deliver(); // within the 200 ms lead: both apply every input on the same tick
      await Promise.resolve();
    }
    expect(shots).toBeGreaterThan(0);
    expect(room.sent.filter(item => item.type === 'cannon_shot')).toHaveLength(shots);
    expect(room.sent[0].payload).toMatchObject({ by: 'a', cannonId: 'cannon_2', waveId: 'w-1' });
    expect(logs.a.length).toBeGreaterThan(20);
    expect(logs.b).toEqual(logs.a);
    expect(logs.a.some(event => event.type === 'cannon_fired' && event.manual)).toBe(true);
    const finished = log => log.find(event => event.type === 'wave_ended');
    expect(finished(logs.b)).toEqual(finished(logs.a));
  });

  it('applies a late message at the next tick and orders inputs of one tick by sender', () => {
    const schedule = createInputSchedule();
    const fire = (by, seq, tick) => ({ by, seq, tick, input: { type: 'fire', cannonId: 'cannon_1', targetId: `ship_${seq}` } });
    expect(schedule.add(fire('b', 1, 10), 5)).toBe(10);
    expect(schedule.add(fire('a', 2, 10), 5)).toBe(10);
    expect(schedule.add(fire('a', 2, 10), 5)).toBe(null); // a repeat
    expect(schedule.add(fire('c', 1, 3), 6)).toBe(6);      // late: runs now, counted
    expect(schedule.late).toBe(1);
    expect(schedule.take(10).map(input => input.targetId)).toEqual(['ship_2', 'ship_1']);
    expect(schedule.take(6)).toHaveLength(1);
    const message = toMessage({ type: 'repair', wallId: 'wall_2' }, { by: 'a', seq: 3, tick: 12 + INPUT_LEAD_TICKS, waveId: 'w' });
    expect(message).toEqual({ type: 'wall_repair', payload: { by: 'a', seq: 3, t: .8, waveId: 'w', wallId: 'wall_2' } });
    expect(readMessage(message.type, message.payload, 'w')).toMatchObject({ tick: 16, input: { type: 'repair', wallId: 'wall_2' } });
    expect(readMessage(message.type, message.payload, 'other')).toBe(null);
    expect(readMessage('cannon_shot', { by: 'a', seq: 1, t: 1, waveId: 'w', cannonId: '<b>', targetId: 'x' }, 'w')).toBe(null);
    expect(readMessage('cannon_shot', { by: 'a', seq: -1, t: 1, waveId: 'w', cannonId: 'c', targetId: 'x' }, 'w')).toBe(null);
  });
});
