import {describe, expect, it, vi} from 'vitest';
import {createCorePublisher} from '../../src/pirates/core-display.js';
import {createCoreState} from '../../src/island/core-state.js';

function harness() {
  const wave = {info: {waveId: 'wave-a'}, ticks: 0};
  let target = {key: 'home:epoch-a:0', epoch: 'epoch-a'};
  const source = {wave, state: {islandHp: 100, maxIslandHp: 100}};
  const publish = vi.fn();
  const send = createCorePublisher({controller: () => source, context: () => target, publish});
  return {wave, source, publish, send, setTarget(value) { target = value; }};
}

describe('the readonly core health publisher', () => {
  it('forwards actual state on demand without needing a threshold narrator event', () => {
    const h = harness();
    h.send();
    expect(h.publish).toHaveBeenLastCalledWith({waveId: 'wave-a', contextKey: 'home:epoch-a:0',
      epoch: 'epoch-a', tick: 0, hp: 100, max: 100});
    h.source.state = {islandHp: 64, maxIslandHp: 160}; h.wave.ticks = 8;
    h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({tick: 8, hp: 64, max: 160}));
  });

  it('delivers final zero immediately before finish and does not replace rubble afterward', () => {
    const h = harness(), model = createCoreState();
    const expected = {waveId: 'wave-a', contextKey: 'home:epoch-a:0', epoch: 'epoch-a'};
    model.reset(expected.contextKey);
    h.publish.mockImplementation(snapshot => model.accept(snapshot, expected));
    h.send();
    // The controller refreshes state, publishes its event batch, then finishes the wave.
    h.source.state.islandHp = 0; h.wave.ticks = 10; h.send();
    h.wave.done = true; h.send();
    h.wave.finished = true; h.source.state = null; h.send();
    h.source.wave = null; h.send();
    expect(h.publish).toHaveBeenCalledTimes(2);
    expect(model.current).toMatchObject({hp: 0, tick: 10, frame: 'island_core_broken'});
  });

  it('retains the original captured target through travel even if its source context object changes', () => {
    const h = harness(); h.send();
    h.setTarget({key: 'friend:epoch-b:1', epoch: 'epoch-b'});
    h.source.state.islandHp = 30; h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({contextKey: 'home:epoch-a:0', epoch: 'epoch-a', hp: 30}));
    h.source.wave = null; h.send(); h.source.wave = h.wave; h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({contextKey: 'home:epoch-a:0', epoch: 'epoch-a'}));
  });

  it('captures the new target for a new wave object, even when its ID is reused in a test or local reset', () => {
    const h = harness(); h.send();
    h.setTarget({key: 'friend:epoch-b:1', epoch: 'epoch-b'});
    h.source.wave = {...h.wave, info: {...h.wave.info}}; h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({contextKey: 'friend:epoch-b:1', epoch: 'epoch-b'}));
  });

  it('uses the wave snapshot epoch when available, allowing the model to reject a mismatched island', () => {
    const h = harness();
    h.wave.info.initialSnapshot = {islandEpoch: 'actual-wave-epoch'}; h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({epoch: 'actual-wave-epoch'}));
    const legacy = harness(); legacy.setTarget({key: 'home:legacy:0'}); legacy.send();
    expect(legacy.publish).toHaveBeenLastCalledWith(expect.objectContaining({epoch: null}));
  });

  it('waits for context once, captures before state arrives, and never borrows a later target', () => {
    const h = harness(); h.setTarget(null); h.send();
    expect(h.publish).not.toHaveBeenCalled();
    h.setTarget({key: 'home:epoch-a:0', epoch: 'epoch-a'}); h.source.state = null; h.send();
    h.setTarget({key: 'friend:epoch-b:1', epoch: 'epoch-b'});
    h.source.state = {islandHp: 12, maxIslandHp: 100}; h.send();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({contextKey: 'home:epoch-a:0', epoch: 'epoch-a'}));
  });

  it('ignores missing wave identity, missing context, and structurally unavailable health', () => {
    const h = harness();
    for (const state of [null, {}, {islandHp: 0}, {maxIslandHp: 100}, {islandHp: '0', maxIslandHp: 100}]) {
      h.source.state = state; h.send();
    }
    h.source.state = {islandHp: 10, maxIslandHp: 100};
    for (const wave of [null, {}, {info: {}}, {info: {waveId: ''}}]) { h.source.wave = wave; h.send(); }
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('does not mutate frozen sim state, wave data or captured context, and leaves numeric policy to the model', () => {
    const target = Object.freeze({key: 'home:epoch-a:0', epoch: 'epoch-a'});
    const state = Object.freeze({islandHp: NaN, maxIslandHp: -1});
    const wave = Object.freeze({info: Object.freeze({waveId: 'wave-a'}), ticks: -1});
    const source = Object.freeze({wave, state}), publish = vi.fn();
    createCorePublisher({controller: () => source, context: () => target, publish})();
    expect(publish).toHaveBeenCalledWith({waveId: 'wave-a', contextKey: target.key, epoch: target.epoch,
      tick: -1, hp: NaN, max: -1});
    expect(source.state).toBe(state); expect(source.wave).toBe(wave);
  });
});
