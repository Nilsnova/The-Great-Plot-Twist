// Exercise the actual native comparison boundary without importing its Chrome-starting entry point.
import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {compareSyncSamples} from '../scripts/multiplayer-sync-samples.js';

const source = readFileSync(new URL('../scripts/check-multiplayer.js', import.meta.url), 'utf8');
const begin = source.indexOf('async function compare('), end = source.indexOf('\n// The musket', begin);
if (begin < 0 || end < 0) throw new Error('The native comparison boundary could not be found.');
// Compile only this trusted repository function; importing the entry module would launch Chrome.
const createCompare = new Function('compareSyncSamples', 'syncReceipts', 'saveSyncReceipts', 'log',
  `${source.slice(begin, end)}; return compare;`);
const row = (ticks, extra = {}) => ({waveId: 'wanted', ticks, ships: 'ship_a', boarders: '', heart: 100,
  militia: 'militia_1@0,0:60:idle', landed: 2, ...extra});
const captain = (playerId, history) => ({playerId, page: {async evaluate(fn, waveId) {
  const previous = globalThis.window;
  globalThis.window = {__mp: {samples: history}};
  try { return structuredClone(fn(waveId)); }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}}});
function setup(writeError = null) {
  const receipts = [], written = [], logs = [];
  const save = vi.fn(async () => { if (writeError) throw writeError; written.push(structuredClone(receipts)); });
  return {compare: createCompare(compareSyncSamples, receipts, save, (...args) => logs.push(args)), receipts, written, logs, save};
}

describe('actual native sample filtering and diagnostic handover', () => {
  it('filters unrelated waves before validation and preserves the exact collected inputs once', async () => {
    const h = setup(), wanted = [row(101), row(102), row(103)];
    const unrelated = row('bad', {waveId: 'earlier', ships: null, boarders: null});
    const result = await h.compare(captain('owner', [unrelated, ...wanted]), captain('late', [...wanted, unrelated]), 'wanted');
    expect(result).toMatchObject({checked: 3, same: 3, worst: 0, landed: 2, heartChecked: 3, sameHeart: 3});
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.written[0][0]).toMatchObject({waveId: 'wanted', leftPlayer: 'owner', rightPlayer: 'late',
      left: wanted, right: wanted, pairs: [{left: 101, right: 101}, {left: 102, right: 102}, {left: 103, right: 103}], metrics: result});
  });

  it('retains the exact-tick heart and militia mismatch metrics', async () => {
    const h = setup(), left = [row(1), row(2), row(3, {militia: 'militia_1@0,0:60:fighting'})];
    const right = [row(1), row(2, {heart: 99}), row(3)];
    const result = await h.compare(captain('owner', left), captain('friend', right), 'wanted');
    expect(result).toMatchObject({checked: 3, same: 3, heartChecked: 3, sameHeart: 2,
      militiaChecked: 3, sameMilitia: 2, fighting: 1});
  });

  it('writes insufficient-coverage metrics before the existing caller assertion can fail', async () => {
    const h = setup(), result = await h.compare(captain('owner', [row(10)]), captain('late', [row(10)]), 'wanted');
    expect(result.checked >= 3 && result.worst <= 1 && result.worstBoarders <= 1).toBe(false);
    expect(h.written[0][0].metrics).toEqual(result);
    expect(h.written[0][0].pairs).toEqual([{left: 10, right: 10}]);
  });

  it('archives malformed input and preserves its validation failure', async () => {
    const h = setup(), bad = [row(10), row(10, {ships: 'ship_b'})];
    await expect(h.compare(captain('owner', bad), captain('late', [row(10)]), 'wanted')).rejects.toThrow(/duplicate tick 10/);
    expect(h.written[0][0]).toMatchObject({left: bad, error: {name: 'TypeError', message: 'left has conflicting duplicate tick 10.'}});
    expect(h.written[0][0]).not.toHaveProperty('metrics');
  });

  it('does not mask a validation failure if writing its diagnostic also fails', async () => {
    const h = setup(new Error('disk full'));
    await expect(h.compare(captain('owner', [row(10), row(10, {ships: 'ship_b'})]), captain('late', [row(10)]), 'wanted')).rejects.toThrow(/duplicate tick 10/);
    expect(h.logs).toEqual([['sync receipt write failed:', 'disk full']]);
  });

  it('propagates a receipt-write failure on an otherwise valid comparison', async () => {
    const error = new Error('disk full'), h = setup(error);
    await expect(h.compare(captain('owner', [row(10)]), captain('late', [row(10)]), 'wanted')).rejects.toBe(error);
  });
});
