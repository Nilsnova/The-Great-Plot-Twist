import {describe, expect, it} from 'vitest';
import {createCoreState} from '../../src/island/core-state.js';

const expected = {waveId: 'wave-a', contextKey: 'home:epoch-a:0', epoch: 'epoch-a'};
const snapshot = (values = {}) => ({...expected, tick: 1, hp: 100, max: 100, ...values});
function ready(contextKey = expected.contextKey) {
  const model = createCoreState(); model.reset(contextKey); return model;
}

describe('the existing core landmark health state', () => {
  it('keeps unknown health unknown until the current island and wave supply a valid snapshot', () => {
    const model = createCoreState();
    expect(model.current).toBeNull();
    expect(model.accept(snapshot(), expected)).toBe(false);
    model.reset(expected.contextKey);
    expect(model.accept(snapshot(), expected)).toBe(true);
    expect(model.current).toEqual({...snapshot(), frame: 'island_core'});
  });

  it('uses real partial HP, preserves tiny positive HP, and distinguishes zero from damage', () => {
    const model = ready();
    for (const [hp, frame] of [[100, 'island_core'], [50, 'island_core'],
      [49.9, 'island_core_damaged'], [Number.MIN_VALUE, 'island_core_damaged'], [0, 'island_core_broken']]) {
      expect(model.accept(snapshot({hp}), expected)).toBe(true);
      expect(model.current).toMatchObject({hp, max: 100, frame});
    }
  });

  it('uses the actual maximum from each accepted state rather than a cached full-health value', () => {
    const model = ready();
    model.accept(snapshot({hp: 30}), expected);
    expect(model.current.frame).toBe('island_core_damaged');
    model.accept(snapshot({hp: 30, max: 50, tick: 2}), expected);
    expect(model.current).toMatchObject({hp: 30, max: 50, frame: 'island_core'});
  });

  it('rejects old ticks and other waves, island contexts or epochs without replacing the last truth', () => {
    const model = ready();
    model.accept(snapshot({tick: 8, hp: 40}), expected);
    const accepted = model.current;
    for (const update of [{tick: 7}, {waveId: 'wave-old'}, {contextKey: 'friend:epoch-a:0'}, {epoch: 'epoch-old'}]) {
      expect(model.accept(snapshot(update), expected)).toBe(false);
      expect(model.current).toBe(accepted);
    }
    expect(model.accept(snapshot(), {...expected, contextKey: 'friend:epoch-a:0'})).toBe(false);
    expect(model.accept(snapshot(), {...expected, epoch: 'epoch-old'})).toBe(false);
  });

  it('keeps a destroyed core as rubble through late healing, then accepts a genuinely new wave', () => {
    const model = ready();
    model.accept(snapshot({hp: 0, tick: 10}), expected);
    const broken = model.current;
    expect(model.accept(snapshot({hp: 100, tick: 11}), expected)).toBe(false);
    expect(model.current).toBe(broken);
    const next = {...expected, waveId: 'wave-b'};
    expect(model.accept(snapshot({...next, tick: 0}), next)).toBe(true);
    expect(model.current).toMatchObject({waveId: 'wave-b', hp: 100, frame: 'island_core'});
    expect(model.accept(snapshot({hp: 0, tick: 99}), next)).toBe(false);
  });

  it('clears accepted damage on actual reset/travel and refuses late state from the previous target', () => {
    const model = ready();
    model.accept(snapshot({hp: 0}), expected);
    const away = {waveId: 'wave-away', contextKey: 'friend:epoch-b:1', epoch: 'epoch-b'};
    model.reset(away.contextKey);
    expect(model.current).toBeNull();
    expect(model.accept(snapshot(), expected)).toBe(false);
    expect(model.accept(snapshot({...away}), away)).toBe(true);
    model.reset(away.contextKey);
    expect(model.current).toBeNull();
  });

  it('allows a captured legacy context with no server epoch but never invents an epoch match', () => {
    const model = ready();
    const legacy = {...expected, epoch: null};
    expect(model.accept(snapshot({epoch: null}), legacy)).toBe(true);
    expect(model.accept(snapshot(), legacy)).toBe(false);
    expect(model.accept(snapshot({epoch: null}), expected)).toBe(false);
  });

  it('rejects malformed health and ordering data, retaining the last accepted state', () => {
    const model = ready(); model.accept(snapshot(), expected);
    const accepted = model.current;
    for (const bad of [null, {}, {hp: -1}, {hp: 101}, {hp: NaN}, {hp: Infinity}, {hp: '10'},
      {max: 0}, {max: -1}, {max: Infinity}, {max: '100'}, {tick: -1}, {tick: .5},
      {tick: Number.MAX_SAFE_INTEGER + 1}, {epoch: undefined}]) {
      expect(model.accept(bad === null || Object.keys(bad).length === 0 ? bad : snapshot(bad), expected)).toBe(false);
      expect(model.current).toBe(accepted);
    }
    expect(model.accept(snapshot(), null)).toBe(false);
  });

  it('copies the readonly snapshot so later caller mutations cannot change the accepted view', () => {
    const model = ready(), input = snapshot();
    model.accept(input, expected); input.hp = 0; input.waveId = 'other';
    expect(model.current).toMatchObject({hp: 100, waveId: expected.waveId});
    expect(Object.isFrozen(model.current)).toBe(true);
  });
});
