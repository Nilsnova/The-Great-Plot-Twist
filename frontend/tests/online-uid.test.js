// Action UIDs identify one player action; they carry no account or authentication material.
import {describe, expect, it} from 'vitest';
import {createUidFactory} from '../src/online/case-adapter/uid.js';

describe('action UID factory', () => {
  it('makes distinct valid UIDs even with a fixed clock and fixed random source', () => {
    const uid = createUidFactory({now: () => 0, random: () => 0});
    const values = Array.from({length: 2000}, () => uid());
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('accepts numeric randomness at both endpoints and irregular clock values', () => {
    for (const random of [0, 0.5, 1, NaN, Infinity, -1]) {
      const uid = createUidFactory({now: () => -100, random: () => random});
      expect(uid()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });

  it.each([NaN, Infinity, Number.MAX_VALUE])('bounds unusual timestamps %s', clock => {
    expect(createUidFactory({now: () => clock})()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('is deterministic with injected sources', () => {
    const options = {now: () => 1234, random: () => 0.25};
    expect(createUidFactory(options)()).toBe(createUidFactory(options)());
  });
});
