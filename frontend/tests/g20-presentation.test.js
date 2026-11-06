// Preference boundaries and UI helpers that protect accessible presentation.
import { describe, expect, it } from 'vitest';
import { defaults, normalizePreferences, loadPreferences, savePreferences, PREFERENCES_KEY } from '../src/settings/logic.js';
import { createTypewriter, choiceKey, formatCoins, chartPoints, progressRatio } from '../src/ui/kit/logic.js';

describe('G20 preference boundaries', () => {
  it.each([0, 24, 36, 60])('round trips text speed %s and explicit falsy preferences', textSpeed => {
    const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    const values = { ...defaults, master: 0, music: 1, reducedMotion: false, colourblind: false, textSpeed };
    expect(savePreferences(storage, values)).toBe(true); expect(loadPreferences(storage)).toEqual(values);
    expect([...data.keys()]).toEqual([PREFERENCES_KEY]);
    expect(JSON.parse(data.get(PREFERENCES_KEY))).toEqual({ version: 1, preferences: values });
  });
  it('normalizes without mutating input or returning shared defaults', () => {
    const values = Object.freeze({ master: -1, music: 2, effects: Infinity, reducedMotion: null, extra: 'discard' });
    const normalized = normalizePreferences(values);
    expect(normalized).toEqual({ ...defaults, master: 0, music: 1 });
    normalized.quality = 'low'; expect(normalizePreferences(null).quality).toBe('high');
    expect(Object.keys(normalized).sort()).toEqual(Object.keys(defaults).sort());
  });
  it.each([true, '1', 2, null])('ignores unsupported persisted version %s', version => {
    expect(loadPreferences({ getItem: () => JSON.stringify({ version, preferences: { quality: 'low' } }) })).toEqual(defaults);
  });
});

describe('G20 UI kit boundaries', () => {
  it('never splits a surrogate pair and ignores invalid/negative frame deltas', () => {
    const writer = createTypewriter('A🌊B', { rate: 2 });
    writer.tick(1); expect(writer.text).toBe('A🌊');
    for (const dt of [-1, NaN, Infinity]) { writer.tick(dt); expect(writer.text).toBe('A🌊'); }
    writer.tick(.5); expect(writer.text).toBe('A🌊B'); expect(writer.done).toBe(true);
  });
  it('keeps already revealed text when changing speed and after skipping', () => {
    const writer = createTypewriter('abcdef', { rate: 2 }); writer.tick(1);
    writer.setRate(4); expect(writer.text).toBe('ab'); writer.tick(.25); expect(writer.text).toBe('abc');
    writer.skip(); writer.setRate(1); writer.tick(0); expect(writer.text).toBe('abcdef');
  });
  it.each([['Home', 2, 0, false], ['End', 0, 2, false], [' ', 1, 1, true], ['ArrowRight', 2, 0, false], ['ArrowLeft', 0, 2, false]])('maps %s without inventing a selection', (key, current, index, activate) => {
    expect(choiceKey(key, current, 3)).toEqual({ index, activate });
    expect(choiceKey(key, current, 0)).toBeNull();
  });
  it('rejects unsafe balances and non-finite progress and handles descending charts', () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, '100', NaN, undefined]) expect(formatCoins(value)).toBe('?');
    expect(chartPoints([30, 20, 10], 100, 40, 4)).toEqual([[4, 4], [50, 20], [96, 36]]);
    for (const pair of [[NaN, 10], [1, Infinity], [2, -1]]) expect(progressRatio(...pair)).toBe(0);
  });
});
