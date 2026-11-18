// A known stale old-wave finish refreshes its own journal in the background. Used by PR #485 review.
import {describe, expect, it, vi} from 'vitest';
import {createWaveController} from '../../src/pirates/controller.js';

const START = Date.UTC(2026, 10, 18, 12);
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const refused = (status, code) => ({ok: false, status, code});
const canonical = body => ({ok: true, data: {survived: true, loot: 10, coins: 110, waveBest: 1, flags: 1,
  recovery: {waveId: body.waveId, islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(START).toISOString(),
    closedHp: body.checkpoint.hpUnits, checkpointUid: body.checkpoint.checkpointUid,
    throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
    lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq}}});

function setup({finishWave, readRefresh} = {}) {
  let now = START, refreshed = false, repair = null, frontier = null;
  const events = [], timers = [];
  const onEvents = vi.fn(), sound = {cue: vi.fn()};
  const hud = {banner: vi.fn(), countdown() {}, bar() {}, prompt() {}, dispose() {}, setVisible() {}};
  const transport = {
    sendInputs: vi.fn(async () => ({accepted: []})), checkpoint: vi.fn(), finishWave,
    readEvents: vi.fn(async ({waveId, after}) => {
      if (waveId === 'wave-old' && refreshed) {
        const page = {headSeq: 1, sealedThroughTick: frontier, closed: true, events: after === 0 ? [repair] : []};
        return readRefresh ? readRefresh(page) : page;
      }
      return {headSeq: 0, sealedThroughTick: Math.max(-1, Math.floor((now - START - 1000) / 50) - 1), events: []};
    }),
  };
  const controller = createWaveController({listen: false, bus: {emit: event => events.push(event)}, world: {container: {}},
    recoveryTransport: transport, recoveryPlayoutMs: 0, now: () => now, onEvents, sound,
    createHud: () => hud, createRenderer: () => null, playCutscene: async () => {},
    setTimer: (fn, ms) => { const timer = {fn, at: now + ms}; timers.push(timer); return timer; },
    clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); }});
  function begin(waveId) {
    const startsAt = new Date(START + 1000).toISOString(), weather = {kind: 'calm', ships: 1, fog: 0};
    const snapshot = {recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId, islandEpoch: 'epoch-r', seed: 77,
      startsAt, weather, rules: ['structure_recovery'], participants: [{participantToken: TOKEN, captain: {level: 1, skills: [], weapon: 'musket'}}],
      createWave: {seed: 77, wave: 1, weather, defenses: [{id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1}]},
      structures: [{spot: 'wall_1', instanceId: 'wall-instance', kind: 'wall', level: 1, x: 0, z: 1, hpUnits: 1_000_000, maxHP: 60, repairSeq: 0}]};
    controller.start({waveId, wave: 1, seed: 77, startsAt, weather, rules: snapshot.rules, recoveryVersion: 1,
      waveProtocol: 2, initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 0});
  }
  const tick = async ms => { now += ms; controller.update(.05); await flush(); };
  const wait = async ms => {
    now += ms;
    for (const timer of timers.filter(value => value.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.fn(); }
    await flush();
  };
  const newerJournal = old => {
    refreshed = true;
    frontier = old.recoveryReplay.sealedThroughTick + 4200;
    repair = {serverSeq: 1, effectiveTick: old.recoveryReplay.sealedThroughTick + 1, type: 'structure_repaired', participantToken: null,
      payload: {spot: 'wall_1', instanceId: 'wall-instance', hpUnits: 1_000_000, maxHP: 60, repairSeq: 1, chargedPrice: 20}};
  };
  return {controller, begin, tick, wait, newerJournal, transport, events, timers, onEvents, sound, hud, frontier: () => frontier};
}

describe('a detached finish whose checkpoint is known stale', () => {
  it('refreshes its sealed prefix and paid repair without publishing old gameplay, preserving unknown retries', async () => {
    let h, old;
    const finishWave = vi.fn(async body => {
      if (finishWave.mock.calls.length === 1) return refused(503, 'database_unavailable');
      if (body.checkpoint.inputHeadSeq !== 1 || body.checkpoint.lastRepairSeq !== 1
        || body.checkpoint.throughTick !== h.frontier()) {
        h.newerJournal(old);
        return refused(409, 'checkpoint_stale');
      }
      if (finishWave.mock.calls.length === 3) return refused(503, 'database_unavailable');
      return canonical(body);
    });
    h = setup({finishWave});
    try {
      h.begin('wave-old'); await h.tick(1500);
      old = h.controller.wave;
      expect(old.done).toBe(false);
      h.begin('wave-new'); await flush();
      const current = h.controller.wave, state = JSON.stringify(h.controller.state);
      h.events.length = 0; h.onEvents.mockClear(); h.sound.cue.mockClear(); h.hud.banner.mockClear();
      for (let i = 0; i < 40 && !old.recoveryFinishAnswered; i++) {
        const before = old.recoveryDriver.nextTick;
        await h.wait(250);
        expect(old.recoveryDriver.nextTick - before).toBeLessThanOrEqual(600);
      }
      expect(old.recoveryFinishAnswered).toBe(true);
      expect(finishWave).toHaveBeenCalledTimes(4);
      const requests = finishWave.mock.calls.map(([body]) => body);
      expect(requests[1]).toEqual(requests[0]);
      expect(requests[2].checkpoint.checkpointUid).not.toBe(requests[0].checkpoint.checkpointUid);
      expect(requests[2].checkpoint).toMatchObject({inputHeadSeq: 1, throughTick: h.frontier(), lastRepairSeq: 1,
        basisRepairSeq: {'wall-instance': 1}, hpUnits: {'wall-instance': 1_000_000}});
      expect(requests[3]).toEqual(requests[2]);
      expect(h.transport.readEvents.mock.calls.filter(([body]) => body.waveId === 'wave-old')).toHaveLength(2);
      expect(h.controller.wave).toBe(current);
      expect(JSON.stringify(h.controller.state)).toBe(state);
      expect(h.controller.runLoot).toBe(0);
      expect(h.onEvents).not.toHaveBeenCalled();
      expect(h.sound.cue).not.toHaveBeenCalled();
      expect(h.hud.banner).not.toHaveBeenCalled();
      expect(h.events).toEqual([expect.objectContaining({type: 'wave_finish_answered', waveId: 'wave-old', survived: true})]);
    } finally { h.controller.dispose(); }
  });

  it('ignores a refresh read completed after disposal and schedules no further finish', async () => {
    let resolveRead, h;
    const finishWave = vi.fn(async () => { h.newerJournal(old); return refused(409, 'checkpoint_stale'); });
    h = setup({finishWave, readRefresh: page => new Promise(resolve => { resolveRead = () => resolve(page); })});
    h.begin('wave-old'); await h.tick(1500);
    const old = h.controller.wave;
    h.begin('wave-new'); await flush(); await h.wait(250);
    try {
      expect(resolveRead).toBeTypeOf('function');
      h.events.length = 0; h.onEvents.mockClear();
      const tickBefore = old.recoveryDriver.nextTick;
      h.controller.dispose(); resolveRead(); await flush(); await h.wait(10_000);
      expect(finishWave).toHaveBeenCalledTimes(1);
      expect(old.recoveryDriver.nextTick).toBe(tickBefore);
      expect(h.onEvents).not.toHaveBeenCalled();
      expect(h.events.filter(event => event.type === 'wave_finish_answered')).toEqual([]);
      expect(h.timers).toEqual([]);
    } finally { h.controller.dispose(); }
  });

  it('honors Retry-After on a refused refresh read before finishing with the updated prefix', async () => {
    let h, old;
    const readRefresh = vi.fn(page => readRefresh.mock.calls.length === 1
      ? {refused: true, status: 429, code: 'too_many_requests', retryAfterSeconds: 2} : page);
    const finishWave = vi.fn(async body => {
      if (finishWave.mock.calls.length === 1) { h.newerJournal(old); return refused(409, 'checkpoint_stale'); }
      return canonical(body);
    });
    h = setup({finishWave, readRefresh});
    try {
      h.begin('wave-old'); await h.tick(1500); old = h.controller.wave;
      h.begin('wave-new'); await flush(); await h.wait(250);
      expect(readRefresh).toHaveBeenCalledTimes(1);
      await h.wait(1999);
      expect(readRefresh).toHaveBeenCalledTimes(1);
      await h.wait(1);
      expect(readRefresh).toHaveBeenCalledTimes(2);
      for (let i = 0; i < 25 && !old.recoveryFinishAnswered; i++) await h.wait(250);
      expect(old.recoveryFinishAnswered).toBe(true);
      expect(finishWave).toHaveBeenCalledTimes(2);
    } finally { h.controller.dispose(); }
  });

  it('stops the old settlement on a terminal refresh refusal without stopping the newer wave', async () => {
    let h, old;
    const finishWave = vi.fn(async () => { h.newerJournal(old); return refused(409, 'checkpoint_stale'); });
    h = setup({finishWave, readRefresh: () => ({refused: true, status: 403, code: 'not_in_wave'})});
    try {
      h.begin('wave-old'); await h.tick(1500); old = h.controller.wave;
      h.begin('wave-new'); await flush();
      const current = h.controller.wave;
      await h.wait(250); await h.wait(10_000);
      expect(old.recoveryFinishFailed).toBe(true);
      expect(finishWave).toHaveBeenCalledTimes(1);
      expect(h.controller.wave).toBe(current);
      expect(h.timers).toEqual([]);
    } finally { h.controller.dispose(); }
  });
});
