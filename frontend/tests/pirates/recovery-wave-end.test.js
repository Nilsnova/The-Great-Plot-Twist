// Regression checks for the recovery bug hunt (integ/recovery-fixes): the finish names its own prefix and
// follows one refusal policy (F1, F8), refused inputs never block the end (F2), a counter conflict
// renumbers (F7), "me" is the participant token (F6), an unfinished wave hands its finish off when the next
// starts (F9), a terminal journal refusal ends the wave (no silent retry), and the bell is freed (F3).
import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { recoveryRefusal, refusalDelayMs, refusalKind, createRecoveryTransport } from '../../src/pirates/recovery-transport.js';
import { createWaveFlow } from '../../src/island/wave-flow.js';
import { wireWaves } from '../../src/pirates/game-wiring.js';

const START = Date.UTC(2026, 10, 18, 12, 0, 0);
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function snapshot(waveId = 'wave-r') {
  const startsAt = new Date(START + 1000).toISOString();
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId, islandEpoch: 'epoch-r', seed: 77,
    startsAt, weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
    participants: [{ participantToken: TOKEN, captain: { level: 1, skills: [], weapon: 'musket' } }],
    createWave: { seed: 77, wave: 1, weather: { kind: 'calm', ships: 1, fog: 0 }, defenses: [
      { id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 },
    ] },
    structures: [{ spot: 'wall_1', instanceId: 'wall-instance', kind: 'wall', level: 1, x: 0, z: 1,
      hpUnits: 1_000_000, maxHP: 60, repairSeq: 0 }] };
}

function makeBus() {
  const listeners = new Map(), events = [];
  return { events,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { events.push(event); for (const fn of listeners.get(event.type) ?? []) fn(event); } };
}

const seal = now => Math.max(-1, Math.floor((now - (START + 1000)) / 50) - 1);
const closeAnswer = body => ({ ok: true, data: { loot: 10, coins: 110, waveBest: 1, flags: 1, recovery: { waveId: body.waveId,
  islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(START).toISOString(), closedHp: body.checkpoint.hpUnits,
  checkpointUid: body.checkpoint.checkpointUid, throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
  lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } });
const accepted = request => ({ accepted: request.inputs.map((item, index) => ({ serverSeq: 100 + index, effectiveTick: item.tick,
  type: 'captain_input', participantToken: TOKEN, payload: { inputUid: item.inputUid, actorCounter: item.actorCounter,
    participantToken: TOKEN, command: item.command, captain: { level: 1, skills: [], weapon: 'musket' } } })) });

function setup({ readEvents, sendInputs, finishWave, timers = [] } = {}) {
  const bus = makeBus();
  let now = START;
  const transport = {
    readEvents: readEvents ?? vi.fn(async () => ({ headSeq: 0, sealedThroughTick: seal(now), events: [] })),
    sendInputs: sendInputs ?? vi.fn(async request => accepted(request)),
    checkpoint: vi.fn(async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick,
      inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
    finishWave: finishWave ?? vi.fn(async body => closeAnswer(body)),
  };
  const controller = createWaveController({ recoveryPlayoutMs: 0, bus, now: () => now, recoveryTransport: transport,
    playerId: 'account-id', world: {}, getDefenses: () => [], createRenderer: () => null, createHud: () => null,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, accept: () => true });
  const begin = (waveId = 'wave-r') => {
    const snap = snapshot(waveId);
    bus.emit({ type: 'wave_started_server', waveId, wave: 1, seed: 77, startsAt: snap.startsAt, weather: snap.weather,
      rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: TOKEN, lastActorCounter: 0 });
  };
  const step = async ms => { now += ms; controller.update(.05); await tick(); await tick(); };
  return { bus, controller, transport, begin, step, at: () => now, timers };
}

describe('recovery refusal policy (recovery-transport.js)', () => {
  it('sorts every refusal into later, refresh or terminal and keeps Retry-After', () => {
    expect(refusalKind(recoveryRefusal(null))).toBe('later');
    expect(refusalKind({ status: 429, code: 'too_many_requests' })).toBe('later');
    expect(refusalKind({ status: 502, code: 'database_error' })).toBe('later');
    expect(refusalKind({ status: 409, code: 'wave_too_early' })).toBe('later');
    expect(refusalKind({ status: 409, code: 'health_sync_required' })).toBe('refresh');
    expect(refusalKind({ status: 409, code: 'input_counter_conflict' })).toBe('refresh');
    expect(refusalKind({ status: 409, code: 'wave_over' })).toBe('terminal');
    expect(refusalKind({ status: 403, code: 'not_in_wave' })).toBe('terminal');
    expect(recoveryRefusal({ ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 7 }))
      .toEqual({ refused: true, status: 429, code: 'too_many_requests', retryAfterSeconds: 7 });
    expect(refusalDelayMs({ retryAfterSeconds: 3 })).toBe(3000);
    expect([0, 1, 2, 9].map(attempt => refusalDelayMs(null, attempt))).toEqual([250, 500, 1000, 8000]);
  });

  it('answers a server refusal instead of null, so the caller can tell a 403 from a timeout', async () => {
    const transport = createRecoveryTransport({ get: vi.fn(async () => ({ ok: false, status: 403, code: 'not_in_wave' })),
      post: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await transport.readEvents({ waveId: 'wave-a' })).toMatchObject({ refused: true, status: 403, code: 'not_in_wave' });
    expect(await transport.sendInputs({ waveId: 'wave-a', inputs: [{ inputUid: 'uid-1', actorCounter: 1, tick: 0,
      command: { type: 'captain_move', x: 1, z: 2 } }] })).toMatchObject({ refused: true, status: 0, code: 'network_error' });
  });
});

describe('the end of a recovery wave (controller.js)', () => {
  it('F1: finishes with its own prefix, paces health_sync_required and retries a 429 instead of giving up', async () => {
    const answers = [{ ok: false, status: 409, code: 'health_sync_required' },
      { ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 2 }];
    const sent = [];
    let ctl = null;
    const finishWave = vi.fn(async body => {
      sent.push({ at: clock(), ran: ctl.wave.recoveryDriver.nextTick - 1, sealed: ctl.wave.recoveryReplay.sealedThroughTick, body });
      return answers.shift() ?? closeAnswer(body);
    });
    const { controller, begin, step, at: clock } = setup({ finishWave });
    ctl = controller;
    begin();
    await step(1000);
    // Play the wave to its end (lost or timed out: no defenses), 30 s of sealed ticks a frame.
    for (let i = 0; i < 40 && !controller.wave.done; i++) await step(60_000);
    expect(controller.wave.done).toBe(true);
    for (let i = 0; i < 40 && !controller.wave.recoveryFinishAnswered; i++) await step(500);
    expect(controller.wave.recoveryFinishAnswered).toBe(true);
    expect(controller.wave.recoveryFinishFailed).toBe(false);
    expect(sent).toHaveLength(3);
    // The prefix this sim ran, never a seal it has not run to.
    for (const call of sent) {
      expect(call.body.checkpoint.throughTick).toBe(call.ran);
      expect(call.body.checkpoint.throughTick).toBeLessThanOrEqual(call.sealed);
    }
    // Paced: a refresh waits at least 0.25 s (doubling), a 429 its Retry-After (2 s); no back-to-back loop.
    expect(sent[1].at - sent[0].at).toBeGreaterThanOrEqual(250);
    expect(sent[2].at - sent[1].at).toBeGreaterThanOrEqual(2000);
  });

  it('F2: a refused input batch is dropped and queued commands never hold the finish back', async () => {
    const sendInputs = vi.fn(async () => ({ refused: true, status: 409, code: 'wave_over', retryAfterSeconds: null }));
    const { controller, begin, step, transport } = setup({ sendInputs });
    begin();
    await step(1000);
    await step(100);
    controller.wave.recoveryPending.push({ inputUid: 'queued-input-1', actorCounter: 1, tick: 30,
      command: { type: 'captain_move', x: 1, z: 1 } });
    await step(300);
    expect(sendInputs).toHaveBeenCalled();
    expect(controller.wave.recoveryPending).toEqual([]);
    for (let i = 0; i < 40 && !controller.wave.done; i++) await step(60_000);
    for (let i = 0; i < 10 && !controller.wave.recoveryFinishAnswered; i++) await step(500);
    expect(transport.finishWave).toHaveBeenCalled();
    expect(controller.wave.recoveryFinishAnswered).toBe(true);
  });

  it('F7: a counter conflict drops the queue and numbers the next command after the journal', async () => {
    let conflict = true;
    const own = { serverSeq: 1, effectiveTick: 5, type: 'captain_input', participantToken: TOKEN,
      payload: { inputUid: 'old-tab-input', actorCounter: 9, participantToken: TOKEN, command: { type: 'captain_move', x: 1, z: 1 },
        captain: { level: 1, skills: [], weapon: 'musket' } } };
    const sendInputs = vi.fn(async request => {
      if (conflict) { conflict = false; return { refused: true, status: 409, code: 'input_counter_conflict', retryAfterSeconds: null }; }
      return accepted(request);
    });
    let now0 = START;
    const readEvents = vi.fn(async ({ after = 0 } = {}) => ({ headSeq: 1, sealedThroughTick: seal(now0), events: after === 0 ? [own] : [] }));
    const { controller, begin, step, at } = setup({ sendInputs, readEvents });
    begin();
    await step(1000); now0 = at();
    controller.wave.recoveryPending.push({ inputUid: 'stale-number-1', actorCounter: 1, tick: 40, command: { type: 'captain_move', x: 2, z: 2 } });
    await step(300); now0 = at();
    expect(controller.wave.recoveryPending).toEqual([]);
    await step(1100); now0 = at();
    expect(controller.wave.actorCounter).toBe(9);
    controller.wave.recoveryPending.push({ inputUid: 'fresh-number-1', actorCounter: ++controller.wave.actorCounter, tick: 80,
      command: { type: 'captain_move', x: 3, z: 3 } });
    await step(300);
    expect(sendInputs.mock.calls.at(-1)[0].inputs[0].actorCounter).toBe(10);
  });

  it('F6: in a recovery wave "me" is the participant token, in other waves the player id', async () => {
    const { controller, begin, step } = setup();
    expect(controller.playerId).toBe('account-id');
    begin();
    await step(1000);
    expect(controller.playerId).toBe(TOKEN);
  });

  it('F9: an unfinished recovery wave hands its finish off when the next wave starts', async () => {
    const { controller, begin, step, transport } = setup();
    begin('wave-old');
    await step(1500);
    expect(controller.wave.done).toBe(false);
    begin('wave-new');
    await step(10);
    expect(controller.wave.info.waveId).toBe('wave-new');
    expect(transport.finishWave).toHaveBeenCalledWith(expect.objectContaining({ waveId: 'wave-old' }));
  });

  it('a terminal journal refusal ends the wave on screen and stops reading (no silent retry)', async () => {
    const readEvents = vi.fn(async () => ({ refused: true, status: 403, code: 'not_in_wave', retryAfterSeconds: null }));
    const timers = [];
    const { controller, begin, step, bus } = setup({ readEvents, timers });
    begin();
    await step(1000);
    const wave = controller.wave;
    expect(wave.recoveryFinishFailed).toBe(true);
    const reads = readEvents.mock.calls.length;
    await step(5000); await step(5000);
    expect(readEvents.mock.calls.length).toBe(reads);
    for (const timer of timers.splice(0)) timer.fn();
    expect(controller.wave).toBeNull();
    expect(bus.events.find(event => event.type === 'wave_controller_stopped')).toMatchObject({ waveId: 'wave-r', recovery: true });
  });
});

describe('F3: the bell after a recovery wave (wave-flow.js)', () => {
  it('ended() frees the joined wave and tells the island like a finish answer', async () => {
    const events = [], notes = [];
    const api = { startWave: vi.fn(async () => ({ ok: true, data: { waveId: 'wave-r', wave: 3, startsAt: new Date(Date.now() + 5000).toISOString() } })) };
    const flow = createWaveFlow({ api, emit: event => events.push(event), notify: (text, tone) => notes.push(tone),
      hasRenderer: () => true, setTimer: () => 0, clearTimer: () => {}, prepare: async () => {} });
    await flow.ring('own');
    expect(flow.current).toMatchObject({ joined: true });
    expect(flow.ended('other-wave')).toBe(false);
    expect(flow.current).not.toBeNull();
    expect(flow.ended('wave-r', { survived: true, loot: 10, coins: 110, waveBest: 3, flags: 1 })).toBe(true);
    expect(flow.current).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'wave_finished', waveId: 'wave-r', wave: 3, survived: true, coins: 110 });
    expect(notes).toEqual(['success']);
    flow.dispose();
  });
});

describe('F3: the running-game wiring frees the island bell for a recovery wave', () => {
  it('passes a recovery close answer and a recovery stop to island.recoveryWaveEnded, and nothing for legacy waves', () => {
    const handlers = new Map();
    const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
    const emit = event => { for (const fn of [...(handlers.get(event.type) ?? [])]) fn(event); };
    const ended = [];
    const island = { island: { code: 'A' }, api: {}, defenses: () => [], roomPlace: () => null, setBattle() {}, setPointBattle() {},
      refreshDefended() {}, recoveryWaveEnded: (waveId, data) => ended.push([waveId, data ?? null]) };
    const wired = wireWaves({ on, emit, island, loop: false, world: { current: { id: 'home_islet' } },
      every: () => () => {}, later: () => () => {} });
    try {
      emit({ type: 'wave_finish_answered', waveId: 'legacy', loot: 5, runLoot: 5 });
      emit({ type: 'wave_controller_stopped', waveId: 'legacy' });
      expect(ended).toEqual([]);
      emit({ type: 'wave_finish_answered', waveId: 'wave-r', loot: 10, coins: 110, waveBest: 2, flags: 1, survived: true,
        recovery: { waveId: 'wave-r' } });
      emit({ type: 'wave_controller_stopped', waveId: 'wave-r', recovery: true });
      expect(ended).toEqual([['wave-r', { survived: true, loot: 10, coins: 110, waveBest: 2, flags: 1 }], ['wave-r', null]]);
    } finally { wired.dispose(); }
  });
});
