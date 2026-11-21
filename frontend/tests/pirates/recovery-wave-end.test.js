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
const closeAnswer = body => ({ ok: true, data: { survived: body.survived, loot: 10, coins: 110, waveBest: 1, flags: 1, recovery: { waveId: body.waveId,
  islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(START).toISOString(), closedHp: body.checkpoint.hpUnits,
  checkpointUid: body.checkpoint.checkpointUid, throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
  lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } });
const accepted = request => ({ accepted: request.inputs.map((item, index) => ({ serverSeq: 100 + index, effectiveTick: item.tick,
  type: 'captain_input', participantToken: TOKEN, payload: { inputUid: item.inputUid, actorCounter: item.actorCounter,
    participantToken: TOKEN, command: item.command, captain: { level: 1, skills: [], weapon: 'musket' } } })) });

function finishFlow(bus) {
  const flow = createWaveFlow({ api: {}, emit: event => bus.emit(event), setTimer: () => 0, clearTimer() {} });
  bus.on('wave_finish_answered', ({ type, ...data }) => flow.ended(data.waveId, data));
  return flow;
}

function setup({ readEvents, sendInputs, finishWave, timers = [], hud = null, sound, startNextWave, playCutscene, holdBreak } = {}) {
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
    playerId: 'account-id', world: hud ? { container: {} } : {}, sound, startNextWave, playCutscene, holdBreak,
    getDefenses: () => [], createRenderer: () => null, createHud: () => hud,
    setTimer: (fn, ms) => { const timer = { fn, ms, at: now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); }, accept: () => true });
  const begin = (waveId = 'wave-r') => {
    const snap = snapshot(waveId);
    bus.emit({ type: 'wave_started_server', waveId, wave: 1, seed: 77, startsAt: snap.startsAt, weather: snap.weather,
      rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: TOKEN, lastActorCounter: 0 });
  };
  const step = async ms => { now += ms; controller.update(.05); await tick(); await tick(); };
  const flushTimers = async () => {
    for (const timer of timers.filter(item => item.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.fn(); }
    await tick(); await tick();
  };
  return { bus, controller, transport, begin, step, flushTimers, at: () => now, timers };
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

  it('retries an in-flight old finish after the next wave starts, keeping its checkpoint and result once', async () => {
    let resolveOld;
    const finishWave = vi.fn(body => finishWave.mock.calls.length === 1
      ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(closeAnswer(body)));
    const h = setup({ finishWave });
    h.begin('wave-old');
    for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
    const old = h.controller.wave;
    expect(old.recoveryFinishing).toBe(true);
    h.begin('wave-new');
    resolveOld({ ok: false, status: 503, code: 'database_unavailable' });
    await tick();
    await h.step(1000); await h.flushTimers();
    const requests = finishWave.mock.calls.map(([body]) => body).filter(body => body.waveId === 'wave-old');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(old.recoveryFinishAnswered).toBe(true);
    expect(h.bus.events.filter(event => event.type === 'wave_finish_answered' && event.waveId === 'wave-old')).toHaveLength(1);
    expect(h.controller.wave.info.waveId).toBe('wave-new');
    expect(h.controller.wave.roundLoot).toBeUndefined();
    h.controller.dispose();
  });

  it('replaces the confirmation banner with the paused break after a confirmed win', async () => {
    let resolveFinish;
    const finishWave = vi.fn(() => new Promise(resolve => { resolveFinish = resolve; }));
    const hud = { banner: vi.fn(), countdown() {}, bar() {}, prompt() {}, dispose() {}, setVisible() {}, pause: vi.fn() };
    const h = setup({ finishWave, hud, startNextWave: async () => ({ ok: true }),
      holdBreak: () => ({ paused: true, label: 'Resume', line: 'The next wave is paused.' }) });
    try {
      h.begin();
      for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
      expect(hud.banner).toHaveBeenLastCalledWith('Wave over', 'Confirming the result…');
      expect(h.controller.inBreak).toBe(false);

      resolveFinish(closeAnswer(finishWave.mock.calls[0][0]));
      await h.step(1);
      await h.step(1);

      expect(h.controller.inBreak).toBe(true);
      expect(hud.pause).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Wave 1 won!', paused: true }));
      expect(hud.banner).toHaveBeenLastCalledWith('');
    } finally {
      h.controller.dispose();
    }
  });

  it('waits for the saved loss before announcing a local win or completing the wave quest', async () => {
    let resolveFinish;
    const finishWave = vi.fn(() => new Promise(resolve => { resolveFinish = resolve; }));
    const hud = { banner: vi.fn(), countdown() {}, bar() {}, prompt() {}, dispose() {}, setVisible() {}, pause() {} };
    const sound = { cue: vi.fn() };
    const playCutscene = vi.fn(async () => {});
    const h = setup({ finishWave, hud, sound, playCutscene, startNextWave: async () => ({ ok: true }) });
    const flow = finishFlow(h.bus);
    h.begin();
    for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
    expect(finishWave.mock.calls[0][0].survived).toBe(true);
    expect(h.bus.events.filter(event => event.type === 'wave_finished')).toEqual([]);
    expect(sound.cue).not.toHaveBeenCalledWith('pirate-victory');
    const answer = closeAnswer(finishWave.mock.calls[0][0]);
    answer.data.survived = false;
    resolveFinish(answer);
    await tick(); await h.step(1);
    expect(h.controller.wave.result.survived).toBe(false);
    expect(h.controller.inBreak).toBe(false);
    expect(sound.cue).toHaveBeenCalledWith('pirate-defeat');
    expect(sound.cue).not.toHaveBeenCalledWith('pirate-victory');
    expect(h.bus.events.filter(event => event.type === 'wave_finished')).toEqual([
      expect.objectContaining({ waveId: 'wave-r', survived: false }),
    ]);
    await h.step(5000); await h.flushTimers();
    expect(playCutscene).toHaveBeenCalledWith('wave_lost');
    h.controller.dispose(); flow.dispose();
  });

  it('refreshes its request if the next wave starts between a refresh refusal and its finalizer', async () => {
    let resolveOld;
    const finishWave = vi.fn(body => finishWave.mock.calls.length === 1
      ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(closeAnswer(body)));
    const h = setup({ finishWave });
    h.begin('wave-old');
    for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
    const old = h.controller.wave;
    resolveOld({ ok: false, status: 409, code: 'health_sync_required' });
    queueMicrotask(() => queueMicrotask(() => h.begin('wave-new')));
    await tick();
    for (let i = 0; i < 10 && !old.recoveryFinishAnswered; i++) { await h.step(500); await h.flushTimers(); }
    expect(h.controller.wave.info.waveId).toBe('wave-new');
    const requests = finishWave.mock.calls.map(([body]) => body).filter(body => body.waveId === 'wave-old');
    expect(requests).toHaveLength(2);
    expect(requests[1].checkpoint.checkpointUid).not.toBe(requests[0].checkpoint.checkpointUid);
    expect(old.recoveryFinishAnswered).toBe(true);
    h.controller.dispose();
  });

  it('retries a missing canonical outcome without guessing it from loot or the simulation', async () => {
    const finishWave = vi.fn(async body => {
      const answer = closeAnswer(body);
      if (finishWave.mock.calls.length === 1) delete answer.data.survived;
      return answer;
    });
    const h = setup({ finishWave });
    h.begin();
    for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
    expect(h.controller.wave.recoveryFinishAnswered).toBe(false);
    expect(h.bus.events.filter(event => event.type === 'wave_finish_answered')).toEqual([]);
    await h.step(1000);
    expect(h.controller.wave.recoveryFinishAnswered).toBe(true);
    expect(finishWave).toHaveBeenCalledTimes(2);
    h.controller.dispose();
  });

  it('cancels a detached retry timer on disposal', async () => {
    const finishWave = vi.fn(async () => ({ ok: false, status: 503, code: 'database_unavailable' }));
    const h = setup({ finishWave });
    h.begin('wave-old'); await h.step(1500);
    h.begin('wave-new'); await tick();
    expect(h.timers).toHaveLength(1);
    h.controller.dispose();
    await h.step(10_000); await h.flushTimers();
    expect(finishWave).toHaveBeenCalledTimes(1);
    expect(h.timers).toEqual([]);
  });

  it('releases a finished wave after a terminal finish refusal without inventing an outcome', async () => {
    const h = setup({ finishWave: vi.fn(async () => ({ ok: false, status: 403, code: 'not_in_wave' })) });
    h.begin();
    for (let i = 0; i < 40 && !h.controller.wave.done; i++) await h.step(60_000);
    expect(h.controller.wave.recoveryFinishFailed).toBe(true);
    await h.step(2000); await h.flushTimers();
    expect(h.controller.wave).toBeNull();
    expect(h.bus.events.filter(event => event.type === 'wave_finished')).toEqual([]);
    h.controller.dispose();
  });

  it('ignores an in-flight receipt after disposal and cancels pending settlement timers', async () => {
    let resolveFinish;
    const finishWave = vi.fn(() => new Promise(resolve => { resolveFinish = resolve; }));
    const h = setup({ finishWave });
    h.begin('wave-old'); await h.step(1500);
    h.begin('wave-new'); await tick();
    h.controller.dispose();
    resolveFinish(closeAnswer(finishWave.mock.calls[0][0]));
    await tick(); await h.step(1000); await h.flushTimers();
    expect(h.bus.events.filter(event => event.type === 'wave_finish_answered')).toEqual([]);
    expect(h.timers).toEqual([]);
  });

  it('uses the saved outcome of a handoff instead of an unfinished simulation', async () => {
    const finishWave = vi.fn(async body => ({ ...closeAnswer(body), data: { ...closeAnswer(body).data, survived: true } }));
    const h = setup({ finishWave });
    const flow = finishFlow(h.bus);
    h.begin('wave-old'); await h.step(1500);
    expect(h.controller.wave.sim.result().survived).toBe(false);
    h.begin('wave-new'); await tick();
    expect(h.bus.events.filter(event => event.type === 'wave_finished')).toEqual([
      expect.objectContaining({ waveId: 'wave-old', survived: true }),
    ]);
    expect(h.bus.events.find(event => event.type === 'wave_finish_answered')).toMatchObject({ survived: true });
    h.controller.dispose(); flow.dispose();
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
