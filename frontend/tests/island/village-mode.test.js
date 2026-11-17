import {describe, expect, it, vi} from 'vitest';
import {createVillageMode} from '../../src/island/village-mode.js';

function setup(change = {}) {
  let value = {ready: true, own: true, code: 'ISLE-OWN', reserved: false, ...change};
  const render = vi.fn(), onLeave = vi.fn();
  const mode = createVillageMode({context: () => value, render, onLeave});
  return {mode, render, onLeave, set: next => { value = {...value, ...next}; }};
}

describe('own-island village mode', () => {
  it.each([{ready: false}, {own: false}, {reserved: true}, {code: null}])('does not enter an unavailable context: %o', change => {
    const {mode, render} = setup(change);
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
  });
});
