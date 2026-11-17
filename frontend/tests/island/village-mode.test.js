import {describe, expect, it, vi} from 'vitest';
import {createVillageMode} from '../../src/island/village-mode.js';
import {createWaveFlow} from '../../src/island/wave-flow.js';

function setup(change = {}) {
  let value = {ready: true, own: true, code: 'ISLE-OWN', reserved: false, ...change};
  const render = vi.fn(), onLeave = vi.fn();
  const mode = createVillageMode({context: () => value, render, onLeave});
  return {mode, render, onLeave, set: next => { value = {...value, ...next}; }};
}

describe('own-island village mode', () => {
  it.each([{ready: false}, {own: false}, {reserved: true}, {code: null}])('does not enter an unavailable context: %o', change => {
    const {mode, render} = setup(change);
    expect(mode.available).toBe(false);
    expect(mode.enter()).toBe(false); expect(mode.active).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });
  it('enters explicitly and leaves once, releasing the existing input/placement owner', () => {
    const {mode, render, onLeave} = setup();
    expect(mode.active).toBe(false); expect(mode.enter()).toBe(true);
    expect(render).toHaveBeenLastCalledWith(true);
    expect(mode.leave()).toBe(true); expect(mode.leave()).toBe(false);
    expect(onLeave).toHaveBeenCalledTimes(1); expect(render).toHaveBeenLastCalledWith(false);
  });
  it.each([{ready: false}, {own: false}, {reserved: true}, {code: 'ISLE-OTHER'}])('exits when its canonical context changes: %o', change => {
    const {mode, set, onLeave} = setup(); mode.enter(); set(change);
    expect(mode.active).toBe(false); mode.refresh();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
  it('keeps the mode for a normal refresh of the same own island', () => {
    const {mode, set, onLeave} = setup(); mode.enter(); set({code: 'ISLE-OWN'});
    expect(mode.active).toBe(true); expect(onLeave).not.toHaveBeenCalled();
  });
  it('cannot reenter after disposal', () => {
    const {mode, onLeave} = setup(); mode.enter(); mode.dispose();
    expect(mode.active).toBe(false); expect(mode.enter()).toBe(false);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(mode.available).toBe(false);
  });
  it('queries current menu eligibility without entering or rendering a mode', () => {
    const {mode, set, render} = setup();
    expect(mode.available).toBe(true); expect(mode.active).toBe(false);
    set({reserved: true}); expect(mode.available).toBe(false);
    set({reserved: false}); expect(mode.available).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });
  it('leaves before a pending start resolves and stays in Explore after refusal', async () => {
    let resolveStart, flow;
    const refused = {ok: false, status: 503, code: 'unavailable', message: 'Try again.'};
    const startWave = vi.fn(() => new Promise(resolve => { resolveStart = resolve; }));
    const onLeave = vi.fn(), mode = createVillageMode({onLeave,
      context: () => ({ready: true, own: true, code: 'ISLE-OWN', reserved: flow.busy || !!flow.current})});
    flow = createWaveFlow({api: {startWave}, emit: vi.fn(), onChange: () => mode.refresh()});
    try {
      mode.enter();
      const pending = flow.ring();
      expect(mode.active).toBe(false); expect(mode.enter()).toBe(false);
      resolveStart(refused);
      expect(await pending).toEqual(refused);
      expect(mode.active).toBe(false); expect(onLeave).toHaveBeenCalledTimes(1);
      expect(mode.enter()).toBe(true); // an explicit choice is needed after the failed request
      expect(startWave).toHaveBeenCalledTimes(1);
    } finally { flow.dispose(); mode.dispose(); }
  });
  it('does not reenter while joining a known reservation or automatically after a refused join', async () => {
    let resolveJoin, flow, current = {waveId: 'held-wave', wave: 1};
    const mode = createVillageMode({context: () => ({ready: true, own: true, code: 'ISLE-OWN', reserved: flow.busy || !!flow.current})});
    flow = createWaveFlow({api: {currentWave: async () => ({ok: true, data: current}),
      joinWave: () => new Promise(resolve => { resolveJoin = resolve; })}, emit: vi.fn(), onChange: () => mode.refresh()});
    try {
      mode.enter(); await flow.look();
      const pending = flow.join();
      expect(flow.busy).toBe(true); expect(mode.enter()).toBe(false);
      resolveJoin({ok: false, status: 503, code: 'unavailable'}); await pending;
      expect(mode.active).toBe(false); expect(mode.enter()).toBe(false);
      current = null; await flow.look();
      expect(mode.active).toBe(false); expect(mode.enter()).toBe(true);
    } finally { flow.dispose(); mode.dispose(); }
  });
});
