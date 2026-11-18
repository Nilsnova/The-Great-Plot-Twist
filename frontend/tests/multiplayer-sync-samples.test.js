// Independent QA fixtures: sample coverage must be distinct, valid and replayable without a browser.
import {describe, expect, it} from 'vitest';
import {compareSyncSamples} from '../scripts/multiplayer-sync-samples.js';

const sample = (ticks, ships = 'ship_a', boarders = '') => ({ticks, ships, boarders});
const samples = ticks => ticks.map(tick => sample(tick));
const qualifies = result => result.checked >= 3 && result.worst <= 1 && result.worstBoarders <= 1;

describe('all distinct ship and boarder observations', () => {
  it('uses collected offset-cadence observations discarded by an index stride', () => {
    const left = samples([100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140]);
    const right = samples([104, 108, 112]);
    // The old every-tenth subset contains only100/140, neither close to these actual observations.
    expect(left.filter((_, i) => i % 10 === 0).map(row => row.ticks)).toEqual([100, 140]);
    const result = compareSyncSamples(left, right);
    expect(result).toMatchObject({checked: 3, same: 3, worst: 0, sameBoarders: 3, worstBoarders: 0});
    expect(result.pairs).toEqual([{left: 104, right: 104}, {left: 108, right: 108}, {left: 112, right: 112}]);
    expect(qualifies(result)).toBe(true);
  });

  it('compares only the available late-join overlap without requiring earlier history', () => {
    const result = compareSyncSamples(samples([1, 20, 40, 100, 101, 102, 103]), samples([101, 102, 103]));
    expect(result.pairs).toEqual([{left: 101, right: 101}, {left: 102, right: 102}, {left: 103, right: 103}]);
    expect(result.checked).toBe(3);
  });

  it('reserves exact matches globally before any nearby tick can consume them', () => {
    const result = compareSyncSamples(samples([9, 10, 11]), samples([10, 11, 12]));
    expect(result.pairs).toEqual([{left: 10, right: 10}, {left: 11, right: 11}]);
    expect(qualifies(result)).toBe(false);
  });

  it('retains the existing -1 before +1 preference when no exact match exists', () => {
    expect(compareSyncSamples(samples([10]), samples([9, 11])).pairs).toEqual([{left: 10, right: 9}]);
    expect(compareSyncSamples(samples([10]), samples([11])).pairs).toEqual([{left: 10, right: 11}]);
    expect(compareSyncSamples(samples([10]), samples([12])).pairs).toEqual([]);
  });

  it('counts repeated paused frames once on both sides', () => {
    const result = compareSyncSamples(samples([100, 100, 100]), samples([100, 100, 100]));
    expect(result).toMatchObject({checked: 1, same: 1, worst: 0});
    expect(qualifies(result)).toBe(false);
  });

  it('cannot reuse one right observation as three nearby comparisons', () => {
    const result = compareSyncSamples(samples([9, 10, 11]), samples([10]));
    expect(result.pairs).toEqual([{left: 10, right: 10}]);
    expect(result.checked).toBe(1);
    expect(qualifies(result)).toBe(false);
  });

  it('keeps insufficient and absent observations insufficient', () => {
    for (const [left, right, count] of [[[], [], 0], [samples([1, 3]), [], 0], [samples([1, 3]), samples([1, 3]), 2]]) {
      const result = compareSyncSamples(left, right);
      expect(result.checked).toBe(count); expect(qualifies(result)).toBe(false);
    }
  });

  it('keeps all mismatch metrics and the original count tolerance', () => {
    const left = [sample(1, 'ship_a,ship_b,ship_c', 'boarder_a,boarder_b,boarder_c'), sample(2), sample(3)];
    const right = [sample(1, 'ship_a', 'boarder_a'), sample(2), sample(3)];
    const result = compareSyncSamples(left, right);
    expect(result).toMatchObject({checked: 3, same: 2, worst: 2, sameBoarders: 2, worstBoarders: 2, withBoarders: 1});
    expect(qualifies(result)).toBe(false);
  });

  it('reports equal-count ID mismatches rather than declaring those IDs equal', () => {
    const result = compareSyncSamples([sample(1, 'ship_a', 'boarder_a')], [sample(1, 'ship_b', 'boarder_b')]);
    expect(result).toMatchObject({checked: 1, same: 0, worst: 0, sameBoarders: 0, worstBoarders: 0, withBoarders: 1});
  });

  it('does not mutate inputs and produces stable chronological pairs for reordered histories', () => {
    const left = samples([3, 1, 2]), right = samples([2, 3, 1]), before = JSON.stringify([left, right]);
    const result = compareSyncSamples(left, right);
    expect(result.pairs).toEqual([{left: 1, right: 1}, {left: 2, right: 2}, {left: 3, right: 3}]);
    expect(JSON.stringify([left, right])).toBe(before);
  });

  it.each(['left', 'right'])('rejects conflicting duplicate ticks on the %s', side => {
    const bad = [sample(10), sample(10, 'ship_b')], good = samples([10]);
    expect(() => compareSyncSamples(side === 'left' ? bad : good, side === 'right' ? bad : good)).toThrow(/duplicate/i);
  });

  it.each([null, {}, [null], [sample(-1)], [sample(1.5)], [sample(NaN)], [sample('1')],
    [sample(1, null)], [sample(1, 'ship_a,,ship_b')], [sample(1, 'ship_a,ship_a')],
    [sample(1, 'ship_b,ship_a')], [sample(1, ' ship_a')], [sample(1, 'ship_a', [])]])('rejects malformed left history %j', bad => {
    expect(() => compareSyncSamples(bad, samples([1]))).toThrow();
  });

  it('validates unmatched right records too instead of silently ignoring malformed data', () => {
    expect(() => compareSyncSamples(samples([1]), [sample(500, 'bad,,ids')])).toThrow();
  });
});
