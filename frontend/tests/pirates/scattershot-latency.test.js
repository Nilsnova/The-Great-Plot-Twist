// CW1: delayed blunderbuss commands use bounded observed positions for hit selection.
// Exercises the real simulation and journal replay without a room or network service.
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { commandForJournal, simulationInputFromJournal } from '../../src/pirates/recovery-transport.js';
import { createReplayDriver, createWaveReplay } from '../../src/pirates/wave-replay.js';

const BY = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const options = { seed: 11, wave: 6, defenses: [], island: { hp: 1e9 },
  recoveryVersion: 1, waveProtocol: 2, recoveryStructures: [] };
const wait = (sim, ticks) => { for (let i = 0; i < ticks; i++) sim.step(.05); };
const fired = events => events.find(event => event.type === 'captain_fired');
const ids = event => event.targets.map(target => target.id);

function delayed(kind = 'ships', { delay = 20, angle = false, legacy = false } = {}) {
  const sim = createWave({ ...options, ...(legacy ? { recoveryVersion: 0, waveProtocol: 1 } : {}) });
  let before;
  for (let i = 0; i < 6000 && !before; i++) {
    sim.step(.05);
    before = sim.state()[kind].find(item => item.state === (kind === 'ships' ? 'sailing' : 'walking'));
  }
  expect(before).toBeDefined();
  sim.step(.05);
  const target = sim.state()[kind].find(item => item.id === before.id);
  const distance = Math.hypot(target.x - before.x, target.z - before.z);
  const vx = (target.x - before.x) / distance, vz = (target.z - before.z) / distance;
  const from = angle ? { x: target.x - vz * 4, z: target.z + vx * 4 }
    : { x: target.x - vx * 8.7, z: target.z - vz * 8.7 };
  const heading = Math.atan2(target.z - from.z, target.x - from.x) - 24 * Math.PI / 180;
  const aim = angle ? { x: from.x + Math.cos(heading) * 4, z: from.z + Math.sin(heading) * 4 } : target;
  const seen = Math.round(sim.state().time / .05);
  const input = { type: 'captain_shot', by: BY, level: 1, skills: [], weapon: 'blunderbuss', targetId: target.id,
    x: from.x, z: from.z, ax: aim.x, az: aim.z, seen };
  wait(sim, delay);
  return { sim, input, target, current: sim.state()[kind].find(item => item.id === target.id), tick: seen + delay };
}

describe('blunderbuss observed positions', () => {
  it.each(['ships', 'boarders'])('hits moving %s that have left range, with projectiles aimed at their current positions', kind => {
    const { sim, input, target, current } = delayed(kind);
    expect(Math.hypot(target.x - input.x, target.z - input.z)).toBeCloseTo(8.7);
    expect(Math.hypot(current.x - input.x, current.z - input.z)).toBeGreaterThan(9);
    const event = fired(sim.step(.05, [input]));
    expect(event.targets.find(item => item.id === target.id)).toMatchObject({ toX: current.x, toZ: current.z });
  });

  it.each(['ships', 'boarders'])('hits moving %s that have crossed the cone edge while remaining within range', kind => {
    const { sim, input, target, current } = delayed(kind, { angle: true });
    const heading = Math.atan2(input.az - input.z, input.ax - input.x);
    const turn = item => Math.abs(Math.atan2(item.z - input.z, item.x - input.x) - heading) * 180 / Math.PI;
    expect(turn(target)).toBeCloseTo(24);
    expect(turn(current)).toBeGreaterThan(25);
    expect(Math.hypot(current.x - input.x, current.z - input.z)).toBeLessThan(9);
    expect(ids(fired(sim.step(.05, [input])))).toContain(target.id);
  });

  it.each([40, 41])('bounds rewind at exactly 40 ticks (delay %i)', delay => {
    const { sim, input, target } = delayed('ships', { delay });
    expect(ids(fired(sim.step(.05, [input]))).includes(target.id)).toBe(delay === 40);
  });

  it.each([
    ['missing', () => undefined], ['negative', () => -1], ['fractional', () => 1.5],
    ['future', seen => seen + 100], ['stale', seen => seen - 100],
    ['before the target spawned', seen => seen - 11],
  ])('uses current positions for %s observed history', (_name, seen) => {
    const { sim, input, target } = delayed();
    input.seen = seen(input.seen);
    expect(ids(fired(sim.step(.05, [input])))).not.toContain(target.id);
  });

  it('preserves current-position checks in legacy waves', () => {
    const { sim, input, target } = delayed('ships', { legacy: true });
    expect(ids(fired(sim.step(.05, [input])))).not.toContain(target.id);
  });

  it('chooses at most three targets in their observed nearest order after faster ships overtake', () => {
    const sim = createWave({ ...options, wave: 15, lanes: [{ id: 'east', bearing: 0 }] });
    wait(sim, 121);
    const input = { type: 'captain_shot', by: BY, level: 5, skills: [], weapon: 'blunderbuss', targetId: null,
      x: 24, z: 2, ax: 25, az: 2 };
    const [observed, current] = sim.step(.05, [{ ...input, seen: 101 }, { ...input, by: 'current' }])
      .filter(event => event.type === 'captain_fired');
    expect(ids(observed)).toEqual(['ship_2', 'ship_5', 'ship_6']);
    expect(ids(current)).toEqual(['ship_6', 'ship_2', 'ship_5']);
  });

  it('replays the same delayed shot identically across page order, retries and advance batches', () => {
    const { input, target, tick } = delayed();
    const entry = (serverSeq, effectiveTick, command) => ({ serverSeq, effectiveTick, type: 'captain_input', participantToken: BY,
      payload: { inputUid: `shot-${serverSeq}`, actorCounter: serverSeq, participantToken: BY, command: commandForJournal(command),
        captain: { level: 1, skills: [], weapon: 'blunderbuss' } } });
    const journal = [entry(1, 0, { type: 'captain_move', x: input.x, z: input.z }), entry(2, tick, input)];
    const replay = (reverse, batches) => {
      const sim = createWave(options), log = [], replay = createWaveReplay();
      const first = journal[reverse ? 1 : 0], second = journal[reverse ? 0 : 1];
      expect(replay.addPage({ headSeq: 2, sealedThroughTick: tick + 15, events: [first] })).toBe(true);
      expect(replay.addPage({ through: 2, events: [second, first] })).toBe(true);
      const driver = createReplayDriver(replay);
      for (const end of batches) driver.advanceThrough(end, (_tick, events) => {
        log.push(...sim.step(.05, events.map(simulationInputFromJournal).filter(Boolean)));
      });
      return { log, state: sim.state() };
    };
    const one = replay(false, [tick + 15]);
    expect(replay(true, [10, tick, tick + 15])).toEqual(one);
    expect(ids(fired(one.log))).toContain(target.id);
    expect(one.log.filter(event => event.type === 'ship_hit' && event.by === `captain:${BY}`))
      .toMatchObject([{ shipId: target.id, damage: 4.8 }]);
  });
});
