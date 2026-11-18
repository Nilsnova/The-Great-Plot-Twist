// Recovery closes and a changed island must retain the stale-response fences integrated from VIS-41.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWaveFlow} from '../../src/island/wave-flow.js';

const wave = id => ({waveId: id, wave: 2, seed: 77, startsAt: '2026-11-18T12:00:10Z',
  weather: {kind: 'calm'}, flagship: false});
const ok = data => ({ok: true, data});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const flows = [];
afterEach(() => { for (const flow of flows.splice(0)) flow.dispose(); });
function harness(api) {
  const emit = vi.fn(), flow = createWaveFlow({api, emit, hasRenderer: () => true});
  flows.push(flow); return {flow, emit};
}

describe('VIS-41 integration with current recovery and island switches', () => {
  it('a recovery close invalidates a pending read of that wave', async () => {
    const read = deferred(), h = harness({startWave: async () => ok(wave('old-wave')), currentWave: () => read.promise});
    await h.flow.ring();
    const pending = h.flow.look();
    h.flow.ended('old-wave', {survived: true, loot: 20, coins: 120});
    read.resolve(ok(wave('old-wave'))); await pending;
    expect(h.flow.current).toBeNull();
  });

  it('the new island can ring while the old request waits, and its busy state belongs to its own request', async () => {
    const old = deferred(), fresh = deferred();
    const startWave = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise);
    const h = harness({startWave}), oldRing = h.flow.ring('ISLE-AAAAA');
    h.flow.reset();
    const freshRing = h.flow.ring('ISLE-BBBBB');
    expect(startWave).toHaveBeenCalledTimes(2);
    old.resolve(ok(wave('old-wave'))); await oldRing;
    expect(h.flow.busy).toBe(true);
    fresh.resolve(ok(wave('fresh-wave'))); await freshRing;
    expect(h.flow.busy).toBe(false);
    expect(h.flow.current).toMatchObject({where: 'ISLE-BBBBB', wave: {waveId: 'fresh-wave'}});
    expect(h.emit).toHaveBeenCalledTimes(1);
  });
});
