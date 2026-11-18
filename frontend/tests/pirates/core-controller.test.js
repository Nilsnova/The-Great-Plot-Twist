import {describe, expect, it, vi} from 'vitest';
import {createWaveController} from '../../src/pirates/controller.js';
import {createCorePublisher} from '../../src/pirates/core-display.js';
import {createCoreState} from '../../src/island/core-state.js';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {WAVE_STARTED} from '../../src/island/wave-hooks.js';

const START = Date.UTC(2026, 10, 17, 12);
const INFO = {waveId: 'core-wave', wave: 2, seed: 77, startsAt: new Date(START).toISOString(),
  weather: {kind: 'calm', ships: 1, fog: 0}, flagship: false};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(options = {}) {
  let now = START;
  const timers = new Map(), events = [];
  const controller = createWaveController({listen: false, world: {scene: {}, container: {}},
    bus: {emit: event => events.push(event)}, now: () => now, getDefenses: () => [],
    createRenderer: () => ({events() {}, update() {}, setVisible() {}, dispose() {}}),
    createHud: () => ({countdown() {}, bar() {}, prompt() {}, banner() {}, setVisible() {}, dispose() {}}),
    playCutscene: async () => {}, loadAuto: () => false, saveAuto() {},
    setTimer: run => { const id = Symbol('stored timer'); timers.set(id, run); return id; },
    clearTimer: id => timers.delete(id), ...options});
  return {controller, events, timers, step(ms = 250) { now += ms; controller.update(ms / 1000); }};
}

describe('core display through the actual wave controller', () => {
  it('retains actual controller HP authority after an older flow lookup returns', async () => {
    const h = harness(), model = createCoreState(), context = {key: 'home:legacy:0', epoch: null};
    model.reset(context.key);
    let resolveRead;
    const flow = createWaveFlow({now: () => START, hasRenderer: () => true,
      api: {currentWave: () => new Promise(resolve => { resolveRead = resolve; }), startWave: async () => ({ok: true, data: INFO})},
      emit: event => { if (event.type === WAVE_STARTED) h.controller.start(event); }});
    try {
      const old = flow.look(); await flow.ring(); await flush();
      resolveRead({ok: true, data: {...INFO, waveId: 'stale-wave'}}); await old;
      for (let i = 0; i < 600 && h.controller.state.islandHp === h.controller.state.maxIslandHp; i++) h.step();
      createCorePublisher({controller: () => h.controller, context: () => context,
        publish: snapshot => model.accept(snapshot, {waveId: flow.current?.wave.waveId,
          contextKey: context.key, epoch: context.epoch})})();
      expect(flow.current.wave.waveId).toBe(h.controller.wave.info.waveId);
      expect(model.current).toMatchObject({hp: h.controller.state.islandHp, waveId: INFO.waveId});
      expect(model.current.hp).toBeLessThan(h.controller.state.maxIslandHp);
    } finally { flow.dispose(); h.controller.dispose(); }
  });

  it('resumes actual HP after an authorized same-wave return and still rejects another island', async () => {
    let place = 'home_islet';
    const h = harness({place: 'home_islet', world: {scene: {}, container: {}, place: () => place}});
    const model = createCoreState();
    let context = {key: 'home:epoch-a:travel-0', epoch: 'epoch-a', islandIdentity: 'home:epoch-a:reset-0'};
    let expected = {waveId: INFO.waveId, contextKey: context.key, epoch: context.epoch};
    model.reset(context.key);
    const send = createCorePublisher({controller: () => h.controller, context: () => context,
      publish: snapshot => model.accept(snapshot, expected)});
    const wave = h.controller.start(INFO); await flush(); send();
    place = 'saltreach_harbor';
    context = {...context, key: 'home:epoch-a:travel-1'};
    model.reset(context.key); expected = {...expected, contextKey: context.key};
    for (let i = 0; i < 600 && h.controller.state.islandHp === h.controller.state.maxIslandHp; i++) h.step();
    expect(h.controller.state.islandHp).toBeGreaterThan(0);
    expect(h.controller.state.islandHp).toBeLessThan(h.controller.state.maxIslandHp);
    expect(wave.shown).toBe(false); send(); expect(model.current).toBeNull();
    place = 'home_islet';
    expect(h.controller.start(INFO)).toBe(wave);
    context = {...context, rejoin: {contextKey: context.key, waveId: INFO.waveId}};
    send();
    expect(model.current).toMatchObject({hp: h.controller.state.islandHp, tick: wave.ticks});
    context = {...context, key: 'friend:epoch-a:travel-2', islandIdentity: 'friend:epoch-a:reset-0',
      rejoin: {contextKey: 'friend:epoch-a:travel-2', waveId: INFO.waveId}};
    expected = {...expected, contextKey: context.key}; model.reset(context.key); send();
    expect(model.current).toBeNull();
    h.controller.dispose(); expect(h.timers.size).toBe(0);
  });

  it('publishes real final zero from onEvents before finishWave and keeps rubble after a late finish response', async () => {
    const model = createCoreState(), context = {key: 'home:legacy:0', epoch: null};
    const expected = {waveId: INFO.waveId, contextKey: context.key, epoch: null};
    model.reset(context.key);
    let publishCore = () => {}, resolveFinish, atFinish;
    const finishReply = new Promise(resolve => { resolveFinish = resolve; });
    const finishWave = vi.fn(() => {
      atFinish = {view: model.current, actualHp: h.controller.state.islandHp, done: h.controller.wave.done};
      return finishReply;
    });
    const h = harness({finishWave, onEvents: () => publishCore()});
    const observed = [];
    publishCore = createCorePublisher({controller: () => h.controller, context: () => context,
      publish: snapshot => {
        observed.push({snapshot, actualHp: h.controller.state.islandHp, actualMax: h.controller.state.maxIslandHp,
          done: h.controller.wave.done});
        return model.accept(snapshot, expected);
      }});
    h.controller.start(INFO); publishCore(); await flush();
    for (let i = 0; i < 800 && !finishWave.mock.calls.length; i++) { h.step(); await Promise.resolve(); }
    expect(finishWave).toHaveBeenCalledOnce();
    expect(finishWave).toHaveBeenCalledWith(expect.objectContaining({waveId: INFO.waveId, survived: false}));
    expect(atFinish).toMatchObject({view: {hp: 0, frame: 'island_core_broken'}, actualHp: 0, done: true});
    expect(observed.some(row => row.snapshot.hp > 0 && row.snapshot.hp < row.snapshot.max)).toBe(true);
    for (const row of observed) {
      expect(row.snapshot.hp).toBe(row.actualHp); expect(row.snapshot.max).toBe(row.actualMax);
      expect(row.done).toBe(false);
    }
    expect(observed.at(-1).snapshot.hp).toBe(0);
    expect(h.events.filter(event => event.type === 'heart_changed')).toHaveLength(1);
    expect(new Set(observed.map(row => row.snapshot.hp)).size).toBeGreaterThan(3);
    const broken = model.current; publishCore(); resolveFinish({loot: 0}); await flush(); publishCore();
    expect(model.current).toBe(broken);
    h.controller.dispose(); publishCore(); expect(model.current).toBe(broken);
    expect(h.timers.size).toBe(0);
  });

  it('forwards management state to previews while retaining useful live guide updates', async () => {
    let managing = true;
    const guide = {update: vi.fn(), setVisible: vi.fn(), dispose: vi.fn()};
    const createGuide = vi.fn(async () => guide);
    const h = harness({guide: true, createGuide, getManaging: () => managing});
    h.controller.update(0); await flush(); h.controller.update(0);
    expect(createGuide).toHaveBeenCalledOnce();
    expect(guide.update).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'preview', managing: true}));
    managing = false; h.controller.update(0);
    expect(guide.update).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'preview', managing: false}));
    h.controller.start(INFO); await flush();
    for (const value of [true, false]) {
      managing = value; h.step(50);
      const view = guide.update.mock.calls.at(-1)[0];
      expect(view).toMatchObject({mode: 'wave', wave: INFO.wave, defenses: [], heart: h.controller.state.heart});
      expect(view.managing).not.toBe(true);
      expect(guide.setVisible).toHaveBeenLastCalledWith(true);
    }
    h.controller.dispose(); expect(guide.dispose).toHaveBeenCalledOnce(); expect(h.timers.size).toBe(0);
  });
});
