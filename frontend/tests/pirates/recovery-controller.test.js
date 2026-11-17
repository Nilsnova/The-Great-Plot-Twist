import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';

const START = Date.UTC(2026, 10, 14, 12, 0, 0);
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';

function makeSnapshot() {
  const startsAt = new Date(START + 1000).toISOString();
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-r', islandEpoch: 'epoch-r', seed: 77,
    startsAt, weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
    createWave: { seed: 77, wave: 1, weather: { kind: 'calm', ships: 1, fog: 0 }, defenses: [
      { id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 },
    ] },
    structures: [{ spot: 'wall_1', instanceId: 'wall-instance', kind: 'wall', level: 1, x: 0, z: 1,
      hpUnits: 0, maxHP: 60, repairSeq: 0 }] };
}

describe('recovery-v1 controller replay', () => {
  it('only applies a paid repair after its event arrives in a sealed page', async () => {
    const listeners = new Map(), bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    const repair = { serverSeq: 1, effectiveTick: 0, type: 'structure_repaired', participantToken: null,
      payload: { spot: 'wall_1', instanceId: 'wall-instance', hpUnits: 1_000_000, maxHP: 60, repairSeq: 1, chargedPrice: 20 } };
    const readEvents = vi.fn(async () => ({ headSeq: 1, sealedThroughTick: 0, events: [repair] }));
    const sendInputs = vi.fn(async () => ({ accepted: [] }));
    let now = START;
    const controller = createWaveController({ bus, now: () => now, recoveryTransport: { readEvents, sendInputs },
      world: {}, getDefenses: () => [{ id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 }],
      createRenderer: () => null, createHud: () => null, setTimer: () => ({}), clearTimer: () => {} });
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77,
      startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
      recoveryVersion: 1, waveProtocol: 2, initialSnapshot: makeSnapshot(), participantToken: TOKEN, lastActorCounter: 0 });
    expect(controller.wave).toBeTruthy();

    now = START + 1050;
    controller.update(.05);
    await Promise.resolve(); await Promise.resolve();
    expect(readEvents).toHaveBeenCalledTimes(1);
    expect(controller.state.walls[0]).toMatchObject({ hp: 0, broken: true });
    controller.update(.05);
    expect(controller.state.walls[0].hp).toBeGreaterThan(0);
    expect(controller.state.walls[0].broken).toBe(false);
    expect(sendInputs).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('retries an uncertain intent with the same UID and counter and never echoes it to the room', async () => {
    const listeners = new Map(), roomMessages = [], bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    let now = START, attempt = 0;
    const sendInputs = vi.fn(async (_request) => ++attempt === 1 ? null : ({ accepted: [_request.inputs[0].inputUid] }));
    const transport = { sendInputs, readEvents: async () => ({ headSeq: 0, sealedThroughTick: 0, events: [] }) };
    const controller = createWaveController({ bus, now: () => now, room: { send: (...message) => roomMessages.push(message) },
      recoveryTransport: transport, world: {}, getDefenses: () => [], createRenderer: () => null, createHud: () => null,
      accept: () => true, setTimer: () => ({}), clearTimer: () => {} });
    const snapshot = makeSnapshot();
    snapshot.createWave.flagship = true;
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77, startsAt: snapshot.startsAt,
      weather: snapshot.weather, flagship: true, rules: snapshot.rules, recoveryVersion: 1, waveProtocol: 2,
      initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 4 });
    now = START + 1000;
    controller.update(.05);
    await Promise.resolve(); await Promise.resolve();
    now += 50;
    controller.update(.05);
    expect(controller.state.phase).toBe('running');
    expect(controller.wave.info.flagship).toBe(true);
    expect(controller.lampsLit()).toBe(true);
    now += 200;
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    now += 250;
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sendInputs).toHaveBeenCalledTimes(2);
    expect(sendInputs.mock.calls[0][0].inputs).toEqual(sendInputs.mock.calls[1][0].inputs);
    expect(sendInputs.mock.calls[0][0].inputs[0]).toMatchObject({ actorCounter: 5, command: { type: 'lamps_lit' } });
    expect(roomMessages).toEqual([]);
    controller.dispose();
  });
});
