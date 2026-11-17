import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';

const START = Date.UTC(2026, 10, 14, 12, 0, 0);
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';

function makeSnapshot() {
  const startsAt = new Date(START + 1000).toISOString();
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-r', islandEpoch: 'epoch-r', seed: 77,
    startsAt, weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
    participants: [{ participantToken: TOKEN, captain: { level: 1, skills: [], weapon: 'musket' } }],
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
    const readEvents = vi.fn(async ({ after = 0 } = {}) => ({ headSeq: 1, sealedThroughTick: 0,
      events: after === 0 ? [repair] : [] }));
    const sendInputs = vi.fn(async () => ({ accepted: [] }));
    const checkpoint = vi.fn(async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick,
      inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits }));
    let now = START;
    const controller = createWaveController({ bus, now: () => now, recoveryTransport: { readEvents, sendInputs, checkpoint, finishWave: vi.fn() },
      world: {}, getDefenses: () => [{ id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 }],
      createRenderer: () => null, createHud: () => null, setTimer: () => ({}), clearTimer: () => {} });
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77,
      startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
      recoveryVersion: 1, waveProtocol: 2, initialSnapshot: makeSnapshot(), participantToken: TOKEN, lastActorCounter: 0 });
    expect(controller.wave).toBeTruthy();
    expect(controller.recoveryCombatState).toBeNull(); // During prep, the island's server snapshot remains the source.

    now = START + 1050;
    controller.update(.05);
    await Promise.resolve(); await Promise.resolve();
    expect(readEvents).toHaveBeenCalledTimes(1);
    expect(controller.state.walls[0]).toMatchObject({ hp: 0, broken: true });
    controller.update(.05);
    expect(controller.state.walls[0].hp).toBeGreaterThan(0);
    expect(controller.state.walls[0].broken).toBe(false);
    expect(controller.recoveryCombatState).toEqual({ waveId: 'wave-r', islandEpoch: 'epoch-r', structures: [
      { spot: 'wall_1', instanceId: 'wall-instance', hpUnits: 1_000_000, maxHP: 60, repairSeq: 1 },
    ] });
    now += 1050; controller.update(.05); await new Promise(resolve => setTimeout(resolve, 0));
    now += 1; controller.update(.05); await new Promise(resolve => setTimeout(resolve, 0));
    now += 1050; controller.update(.05); await new Promise(resolve => setTimeout(resolve, 0));
    now += 1; controller.update(.05); await new Promise(resolve => setTimeout(resolve, 0));
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({ waveId: 'wave-r', checkpoint: expect.objectContaining({
      hpUnits: { 'wall-instance': 1_000_000 }, basisRepairSeq: { 'wall-instance': 1 }, lastRepairSeq: 1,
    }) })); // Changed health is coalesced to a periodic durable checkpoint.
    expect(sendInputs).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('posts a complete damaged HP checkpoint before a repair request can proceed', async () => {
    const listeners = new Map(), bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    let now = START + 1050, paidEvent = null;
    const readEvents = vi.fn(async () => ({ headSeq: paidEvent ? 1 : 0, sealedThroughTick: paidEvent ? 1 : 0,
      events: paidEvent ? [paidEvent] : [] }));
    const checkpoint = vi.fn(async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick,
      inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits }));
    const controller = createWaveController({ bus, now: () => now,
      recoveryTransport: { readEvents, sendInputs: vi.fn(async () => ({ accepted: [] })), checkpoint, finishWave: vi.fn() },
      world: {}, getDefenses: () => [], createRenderer: () => null, createHud: () => null,
      setTimer: () => ({}), clearTimer: () => {} });
    const snapshot = makeSnapshot();
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77, startsAt: snapshot.startsAt,
      weather: snapshot.weather, rules: snapshot.rules, recoveryVersion: 1, waveProtocol: 2,
      initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 0 });
    controller.update(.05);
    const gate = await controller.checkpointBeforeRepair();
    expect(gate).toEqual({ ok: true });
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(checkpoint.mock.calls[0][0].checkpoint).toMatchObject({ throughTick: 0, inputHeadSeq: 0,
      hpUnits: { 'wall-instance': 0 }, basisRepairSeq: { 'wall-instance': 0 } });
    expect(controller.state.walls[0]).toMatchObject({ hp: 0, broken: true }); // HTTP acceptance itself never heals locally.

    paidEvent = { serverSeq: 1, effectiveTick: 1, type: 'structure_repaired', participantToken: null,
      payload: { spot: 'wall_1', instanceId: 'wall-instance', hpUnits: 1_000_000, maxHP: 60, repairSeq: 1, chargedPrice: 20 } };
    now += 300;
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(controller.state.walls[0].hp).toBeGreaterThan(0);
    controller.dispose();
  });

  it('keeps one HP unit positive through the public controller state and display vector', () => {
    const listeners = new Map(), bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    let now = START;
    const controller = createWaveController({ bus, now: () => now, recoveryTransport: {
      readEvents: async () => ({ headSeq: 0, sealedThroughTick: -1, events: [] }),
      sendInputs: async () => ({ accepted: [] }), checkpoint: async () => null, finishWave: vi.fn(),
    }, world: {}, getDefenses: () => [], createRenderer: () => null, createHud: () => null,
    setTimer: () => ({}), clearTimer: () => {} });
    const snapshot = makeSnapshot();
    snapshot.createWave.defenses.push({ id: 'cannon_1', kind: 'cannon', level: 1, x: 2, z: 1 });
    snapshot.structures = [
      { spot: 'wall_1', instanceId: 'wall-tiny', kind: 'wall', level: 1, x: 0, z: 1, hpUnits: 1, maxHP: 60, repairSeq: 0 },
      { spot: 'cannon_1', instanceId: 'tower-tiny', kind: 'cannon', level: 1, x: 2, z: 1, hpUnits: 1, maxHP: 80, repairSeq: 0 },
    ];
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77, startsAt: snapshot.startsAt,
      weather: snapshot.weather, rules: snapshot.rules, recoveryVersion: 1, waveProtocol: 2,
      initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 0 });
    expect(controller.state.walls[0].hp).toBeGreaterThan(0);
    expect(controller.state.walls[0].broken).toBe(false);
    expect(controller.state.towers.find(row => row.id === 'cannon_1').hp).toBeGreaterThan(0);
    expect(controller.state.towers.find(row => row.id === 'cannon_1').broken).toBe(false);
    now = START + 1050;
    controller.update(.05);
    expect(controller.recoveryCombatState.structures.map(row => row.hpUnits)).toEqual([1, 1]);
    controller.dispose();
  });

  it('retries an uncertain intent with the same UID and counter and never echoes it to the room', async () => {
    const listeners = new Map(), roomMessages = [], bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    let now = START, attempt = 0;
    const sendInputs = vi.fn(async (_request) => ++attempt === 1 ? null : ({ accepted: _request.inputs.map(item => ({
      serverSeq: 1, effectiveTick: item.tick, type: 'captain_input', participantToken: TOKEN,
      payload: { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: TOKEN, command: item.command,
        captain: { level: 1, skills: [], weapon: 'musket' } },
    })) }));
    const transport = { sendInputs, readEvents: async () => ({ headSeq: 0, sealedThroughTick: 0, events: [] }),
      checkpoint: async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick,
        inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits }), finishWave: vi.fn() };
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
    expect(controller.fire('cannon_1', 'ship_1')).toBe(true);
    now += 200;
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    now += 250;
    controller.update(.05);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sendInputs).toHaveBeenCalledTimes(2);
    expect(sendInputs.mock.calls[0][0].inputs).toEqual(sendInputs.mock.calls[1][0].inputs);
    expect(sendInputs.mock.calls[0][0].inputs[0]).toMatchObject({ actorCounter: 5, command: { type: 'fire', cannonId: 'cannon_1', targetId: 'ship_1' } });
    expect(roomMessages).toEqual([]);
    controller.dispose();
  });

  it('waits for a paid terminal repair catch-up, preserves outcome, and never calls legacy finish', async () => {
    const listeners = new Map(), bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    };
    let now = START, paidEvent = null, controller;
    const readEvents = vi.fn(async ({ after = 0 } = {}) => ({ headSeq: paidEvent ? 1 : 0,
      sealedThroughTick: Math.max(-1, Math.floor((now - (START + 1000)) / 50)), events: paidEvent && after === 0 ? [paidEvent] : [] }));
    const legacyFinish = vi.fn(async () => ({ loot: 999 })), finishCalls = [];
    const finishWave = vi.fn(async body => {
      finishCalls.push(body);
      if (finishCalls.length === 1) {
        expect(controller.state.walls.find(item => item.id === 'wall_1').hp).toBe(0);
        paidEvent = { serverSeq: 1, effectiveTick: body.checkpoint.throughTick + 1, type: 'structure_repaired', participantToken: null,
          payload: { spot: 'wall_1', instanceId: 'wall-instance', hpUnits: 1_000_000, maxHP: 60, repairSeq: 6, chargedPrice: 50 } };
        return { ok: false, status: 409, code: 'health_sync_required' };
      }
      if (body.checkpoint.throughTick < paidEvent.effectiveTick) return { ok: false, status: 409, code: 'health_sync_required' };
      return { ok: true, data: { loot: 10, recovery: { waveId: body.waveId, islandEpoch: body.checkpoint.islandEpoch,
        closedAt: new Date(now).toISOString(), closedHp: body.checkpoint.hpUnits, checkpointUid: 'canonical-close-uid1',
        throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
        lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } };
    });
    controller = createWaveController({ bus, now: () => now, recoveryTransport: { readEvents, sendInputs: async () => ({ accepted: [] }),
      checkpoint: async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick,
        inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits }), finishWave },
      finishWave: legacyFinish, world: {}, getDefenses: () => [], createRenderer: () => null, createHud: () => null,
      setTimer: () => ({}), clearTimer: () => {}, accept: () => true });
    const snapshot = makeSnapshot();
    snapshot.structures[0].repairSeq = 5; // Per-instance sequence predates this wave's global repair counter.
    bus.emit({ type: 'wave_started_server', waveId: 'wave-r', wave: 1, seed: 77, startsAt: snapshot.startsAt,
      weather: snapshot.weather, flagship: false, rules: snapshot.rules, recoveryVersion: 1, waveProtocol: 2,
      initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 0 });

    for (let i = 0; i < 12 && !controller.wave?.recoveryFinishAnswered; i++) {
      now += 30_000;
      controller.update(.05);
      await new Promise(resolve => setTimeout(resolve, 0));
      controller.update(.05);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(finishCalls.length).toBeGreaterThanOrEqual(3);
    expect(controller.state.walls.find(item => item.id === 'wall_1').hp).toBe(60);
    expect(controller.recoveryCombatState).toBeNull(); // After canonical close, the server's between-wave HP is authoritative.
    expect(finishCalls[0].survived).toBe(finishCalls[1].survived);
    expect(finishCalls[0].shipsSunk).toBe(finishCalls[1].shipsSunk);
    const terminal = finishCalls.at(-1).checkpoint;
    expect(terminal.hpUnits['wall-instance']).toBe(1_000_000);
    expect(terminal.basisRepairSeq['wall-instance']).toBe(6);
    expect(terminal.lastRepairSeq).toBe(1);
    expect(terminal.throughTick).toBeGreaterThan(paidEvent.effectiveTick);
    expect(legacyFinish).not.toHaveBeenCalled();
    expect(controller.wave.recoveryFinishAnswered).toBe(true); // Canonical first-close UID can differ from this finisher's UID.
    controller.dispose();
  });
});
