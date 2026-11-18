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
const writerBegin = source.indexOf('const saveSyncReceipts ='), writerEnd = source.indexOf('\nconst WORLD', writerBegin);
if (writerBegin < 0 || writerEnd < 0) throw new Error('The native receipt writer could not be found.');
const createWriter = new Function('writeFile', 'out', 'qaSource', 'syncReceipts',
  `${source.slice(writerBegin, writerEnd)}; return saveSyncReceipts;`);
const row = (ticks, extra = {}) => ({waveId: 'wanted', ticks, ships: 'ship_a', boarders: '', heart: 100,
  militia: 'militia_1@0,0:60:idle', landed: 2, ...extra});
const captain = (playerId, history) => ({playerId, page: {async evaluate(fn, waveId) {
  const previous = globalThis.window;
  globalThis.window = {__mp: {samples: history}};
  try { return structuredClone(fn(waveId)); }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}}});
function setup() {
  const receipts = [], save = vi.fn(async () => {});
  return {compare: createCompare(compareSyncSamples, receipts, save, () => {}), receipts, save};
}

describe('actual native sample filtering and diagnostic handover', () => {
  it('filters unrelated waves and buffers exact inputs without disk I/O during comparison', async () => {
    const h = setup(), wanted = [row(101), row(102), row(103)];
    const unrelated = row('bad', {waveId: 'earlier', ships: null, boarders: null});
    const result = await h.compare(captain('owner', [unrelated, ...wanted]), captain('late', [...wanted, unrelated]), 'wanted');
    expect(result).toMatchObject({checked: 3, same: 3, worst: 0, landed: 2, heartChecked: 3, sameHeart: 3});
    expect(h.save).not.toHaveBeenCalled();
    expect(h.receipts[0]).toMatchObject({waveId: 'wanted', leftPlayer: 'owner', rightPlayer: 'late',
      left: wanted, right: wanted, pairs: [{left: 101, right: 101}, {left: 102, right: 102}, {left: 103, right: 103}], metrics: result});
  });

  it('retains the exact-tick heart and militia mismatch metrics', async () => {
    const h = setup(), left = [row(1), row(2), row(3, {militia: 'militia_1@0,0:60:fighting'})];
    const right = [row(1), row(2, {heart: 99}), row(3)];
    const result = await h.compare(captain('owner', left), captain('friend', right), 'wanted');
    expect(result).toMatchObject({checked: 3, same: 3, heartChecked: 3, sameHeart: 2,
      militiaChecked: 3, sameMilitia: 2, fighting: 1});
  });

  it('buffers insufficient-coverage metrics before the existing caller assertion can fail', async () => {
    const h = setup(), result = await h.compare(captain('owner', [row(10)]), captain('late', [row(10)]), 'wanted');
    expect(result.checked >= 3 && result.worst <= 1 && result.worstBoarders <= 1).toBe(false);
    expect(h.receipts[0].metrics).toEqual(result);
    expect(h.receipts[0].pairs).toEqual([{left: 10, right: 10}]);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('archives malformed input and preserves its validation failure', async () => {
    const h = setup(), bad = [row(10), row(10, {ships: 'ship_b'})];
    await expect(h.compare(captain('owner', bad), captain('late', [row(10)]), 'wanted')).rejects.toThrow(/duplicate tick 10/);
    expect(h.receipts[0]).toMatchObject({left: bad, error: {name: 'TypeError', message: 'left has conflicting duplicate tick 10.'}});
    expect(h.receipts[0]).not.toHaveProperty('metrics');
    expect(h.save).not.toHaveBeenCalled();
  });

  it('writes the buffered success or failure contents at the explicit terminal boundary', async () => {
    const h = setup();
    await h.compare(captain('owner', [row(10)]), captain('late', [row(10)]), 'wanted');
    h.receipts.push({waveId: 'bad', error: {name: 'TypeError', message: 'bad sample'}});
    const write = vi.fn(async () => {}), save = createWriter(write, '/review', 'source-sha', h.receipts);
    await save();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('/review/sync-samples.json');
    expect(JSON.parse(write.mock.calls[0][1])).toMatchObject({source: 'source-sha', comparisons: h.receipts});
  });

  it('leaves write errors observable and invokes saving only in success/failure handlers', async () => {
    const error = new Error('disk full'), save = createWriter(async () => { throw error; }, '/review', 'source-sha', []);
    await expect(save()).rejects.toBe(error);
    expect(source.slice(begin, end)).not.toContain('saveSyncReceipts');
    expect(source.match(/await saveSyncReceipts\(\)/g)).toHaveLength(2);
    expect(source).toContain("assert.deepEqual(errors, [], 'no browser errors');\n  await saveSyncReceipts();\n  log('\\nRESULTS')");
    expect(source).toContain("} catch (error) {\n  await saveSyncReceipts().catch(writeError => log('sync receipt write failed:', writeError.message));");
    expect(source).toContain('  throw error;\n} finally { await env.close(); }');
  });
});
