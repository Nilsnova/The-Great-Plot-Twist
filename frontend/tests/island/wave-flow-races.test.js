// Deferred real wave-flow operations must not cross a newer lookup, target, reset or admission.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {WAVE_STARTED} from '../../src/island/wave-hooks.js';

const START = Date.parse('2026-11-17T12:00:00Z');
const wave = id => ({waveId: id, wave: 2, seed: 77, startsAt: new Date(START + 10000).toISOString(),
  weather: {kind: 'calm'}, flagship: false});
const ok = data => ({ok: true, data});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const flows = [];
afterEach(() => { for (const flow of flows.splice(0)) flow.dispose(); });
function harness(options = {}) {
  const reads = [], timers = new Map(), emit = vi.fn(), changed = vi.fn(), banner = vi.fn();
  const api = {currentWave: vi.fn(() => { const read = deferred(); reads.push(read); return read.promise; }),
    startWave: vi.fn(async () => ok(wave('accepted-wave'))), joinWave: vi.fn(async ({waveId}) => ok(wave(waveId))),
    finishWave: vi.fn(async () => ok({loot: 0, coins: 100})), ...options.api};
  const flow = createWaveFlow({api, emit, banner, onChange: changed, hasRenderer: () => true, now: () => START,
    setTimer: run => { const id = Symbol(); timers.set(id, run); return id; }, clearTimer: id => timers.delete(id),
    ...options, api});
  flows.push(flow); return {flow, reads, api, emit, changed, timers, banner};
}

describe('current-wave lookup and admission ordering', () => {
  it.each([true, false])('only the newest requested target may apply, old reply first=%s', async oldFirst => {
    const h = harness(), old = h.flow.look('own'), fresh = h.flow.look('ISLE-FR3ND');
    if (oldFirst) { h.reads[0].resolve(ok(wave('wave-a'))); await old; expect(h.flow.current).toBeNull(); }
    h.reads[1].resolve(ok(wave('wave-b'))); await fresh;
    if (!oldFirst) { h.reads[0].resolve(ok(wave('wave-a'))); await old; }
    expect(h.flow.current).toMatchObject({where: 'ISLE-FR3ND', joined: false, wave: {waveId: 'wave-b'}});
  });

  it.each([ok(null), {ok: false, code: 'offline'}])('stale empty/failed reads cannot clear a newer target: %j', async answer => {
    const h = harness(), old = h.flow.look('own'), fresh = h.flow.look('ISLE-FR3ND');
    h.reads[1].resolve(ok(wave('wave-b'))); await fresh;
    h.reads[0].resolve(answer); await old;
    expect(h.flow.current.wave.waveId).toBe('wave-b');
  });

  it('a failed newest lookup does not make an older pending answer current again', async () => {
    const h = harness(), known = h.flow.look(); h.reads[0].resolve(ok(wave('known'))); await known;
    const old = h.flow.look(), fresh = h.flow.look();
    h.reads[2].resolve({ok: false, code: 'offline'}); await fresh;
    h.reads[1].resolve(ok(wave('stale'))); await old;
    expect(h.flow.current.wave.waveId).toBe('known');
  });

  it('reset during a read cannot repopulate current or notify after the reset', async () => {
    const h = harness(), pending = h.flow.look(); h.flow.reset(); h.changed.mockClear();
    h.reads[0].resolve(ok(wave('stale'))); await pending;
    expect(h.flow.current).toBeNull(); expect(h.changed).not.toHaveBeenCalled();
  });

  it('an accepted new wave fences a lookup already in flight', async () => {
    const h = harness(), pending = h.flow.look(); await h.flow.ring();
    h.reads[0].resolve(ok(wave('stale'))); await pending;
    expect(h.flow.current).toMatchObject({joined: true, wave: {waveId: 'accepted-wave'}});
  });

  it('wave begin also fences a read started during defense preparation', async () => {
    const preparation = deferred(), h = harness({prepare: () => preparation.promise});
    const ringing = h.flow.ring(); await settle();
    const pending = h.flow.look(); preparation.resolve(); await ringing;
    h.reads[0].resolve(ok(wave('stale'))); await pending;
    expect(h.flow.current).toMatchObject({joined: true, wave: {waveId: 'accepted-wave'}});
  });

  it('a newer confirmed same-target wave during preparation cannot be overwritten by the older accepted start', async () => {
    const preparation = deferred(), h = harness({prepare: () => preparation.promise});
    const ringing = h.flow.ring(); await settle();
    const newer = h.flow.look(); h.reads[0].resolve(ok(wave('newer-wave'))); await newer;
    preparation.resolve(); await ringing;
    expect(h.flow.current).toMatchObject({joined: false, wave: {waveId: 'newer-wave'}});
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('a newer confirmed same-target wave before the start response cannot be overwritten either', async () => {
    const admission = deferred(), h = harness({api: {startWave: () => admission.promise}});
    const ringing = h.flow.ring(), newer = h.flow.look();
    h.reads[0].resolve(ok(wave('newer-wave'))); await newer;
    admission.resolve(ok(wave('accepted-wave'))); await ringing;
    expect(h.flow.current.wave.waveId).toBe('newer-wave'); expect(h.emit).not.toHaveBeenCalled();
  });

  it('starting admission invalidates an older read before it can interfere with preparation', async () => {
    const preparation = deferred(), h = harness({prepare: () => preparation.promise});
    const old = h.flow.look(), ringing = h.flow.ring(); await settle();
    h.reads[0].resolve(ok(wave('stale'))); await old;
    expect(h.flow.current).toBeNull(); preparation.resolve(); await ringing;
    expect(h.flow.current).toMatchObject({joined: true, wave: {waveId: 'accepted-wave'}});
  });

  it.each(['ring', 'join'])('reset cancels a pending %s admission before it begins', async action => {
    const admission = deferred(), h = harness({api: {[action === 'ring' ? 'startWave' : 'joinWave']: () => admission.promise}});
    if (action === 'join') { const shown = h.flow.look(); h.reads[0].resolve(ok(wave('accepted-wave'))); await shown; }
    const pending = h.flow[action](); h.flow.reset(); admission.resolve(ok(wave('accepted-wave'))); await pending;
    expect(h.flow.current).toBeNull(); expect(h.emit).not.toHaveBeenCalledWith(expect.objectContaining({type: WAVE_STARTED}));
  });

  it('reset while preparing an already accepted response still prevents its late begin', async () => {
    const preparation = deferred(), h = harness({prepare: () => preparation.promise});
    const pending = h.flow.ring(); await settle(); h.flow.reset(); preparation.resolve(); await pending;
    expect(h.flow.current).toBeNull(); expect(h.emit).not.toHaveBeenCalled();
  });

  it('a same-target refresh does not cancel a valid pending start admission', async () => {
    const admission = deferred(), h = harness({api: {startWave: () => admission.promise}});
    const ringing = h.flow.ring(), refresh = h.flow.look();
    h.reads[0].resolve(ok(null)); await refresh; admission.resolve(ok(wave('accepted-wave'))); await ringing;
    expect(h.flow.current).toMatchObject({joined: true, wave: {waveId: 'accepted-wave'}});
  });

  it('a late accepted start cannot move back from a newer requested target', async () => {
    const admission = deferred(), h = harness({api: {startWave: () => admission.promise}});
    const ringing = h.flow.ring('own'), newer = h.flow.look('ISLE-FR3ND');
    h.reads[0].resolve(ok(wave('wave-b'))); await newer; admission.resolve(ok(wave('accepted-wave'))); await ringing;
    expect(h.flow.current).toMatchObject({where: 'ISLE-FR3ND', wave: {waveId: 'wave-b'}});
  });

  it('a superseded ring fallback lookup cannot auto-join cached state or cancel a newer same-target read', async () => {
    const h = harness({api: {startWave: async () => ({ok: false, code: 'wave_running'})}});
    const known = h.flow.look(); h.reads[0].resolve(ok(wave('cached-wave'))); await known;
    const ringing = h.flow.ring('own', {joinRunning: true}); await settle();
    const fresh = h.flow.look(); h.reads[1].resolve(ok(wave('stale'))); await ringing;
    expect(h.api.joinWave).not.toHaveBeenCalled();
    h.reads[2].resolve(ok(wave('newer-wave'))); await fresh;
    expect(h.flow.current.wave.waveId).toBe('newer-wave');
  });

  it.each([ok(wave('wave-a')), {ok: false, code: 'wave_over'}])('a late join outcome cannot replace/clear the newer target: %j', async answer => {
    const admission = deferred(), h = harness({api: {joinWave: () => admission.promise}});
    const shown = h.flow.look('own'); h.reads[0].resolve(ok(wave('wave-a'))); await shown;
    const joining = h.flow.join('own'), newer = h.flow.look('ISLE-FR3ND');
    h.reads[1].resolve(ok(wave('wave-b'))); await newer; admission.resolve(answer); await joining;
    expect(h.flow.current).toMatchObject({where: 'ISLE-FR3ND', wave: {waveId: 'wave-b'}});
  });

  it.each([ok(wave('wave-a')), {ok: false, code: 'wave_over'}])('a late join cannot replace/clear a newer wave on the same target: %j', async answer => {
    const admission = deferred(), h = harness({api: {joinWave: () => admission.promise}});
    const shown = h.flow.look(); h.reads[0].resolve(ok(wave('wave-a'))); await shown;
    const joining = h.flow.join(), newer = h.flow.look();
    h.reads[1].resolve(ok(wave('wave-b'))); await newer; admission.resolve(answer); await joining;
    expect(h.flow.current.wave.waveId).toBe('wave-b');
  });

  it('same-target reads preserve a joined wave, and a fresh real next wave can replace it', async () => {
    const h = harness(); await h.flow.ring();
    const refresh = h.flow.look(); h.reads[0].resolve(ok(wave('accepted-wave'))); await refresh;
    expect(h.flow.current.joined).toBe(true);
    const next = h.flow.look(); h.reads[1].resolve(ok(wave('next-wave'))); await next;
    expect(h.flow.current).toMatchObject({joined: false, wave: {waveId: 'next-wave'}});
  });

  it('a confirmed empty different target clears the joined old wave and its countdown timers', async () => {
    const h = harness({hasRenderer: () => false}); await h.flow.ring('own'); expect(h.timers.size).toBeGreaterThan(0);
    expect(h.banner.mock.calls.at(-1)[0]).toContain('Pirates in 10 s!');
    const empty = h.flow.look('ISLE-FR3ND'); h.reads[0].resolve(ok(null)); await empty;
    expect(h.flow.current).toBeNull(); expect(h.timers.size).toBe(0); expect(h.banner).toHaveBeenLastCalledWith(null);
  });

  it('a same-target empty refresh preserves the joined wave and its countdown', async () => {
    const h = harness({hasRenderer: () => false}); await h.flow.ring('own'); const count = h.timers.size;
    const bannerCount = h.banner.mock.calls.length, text = h.banner.mock.calls.at(-1)[0];
    expect(text).toContain('Pirates in 10 s!');
    const empty = h.flow.look('own'); h.reads[0].resolve(ok(null)); await empty;
    expect(h.flow.current).toMatchObject({where: 'own', joined: true, wave: {waveId: 'accepted-wave'}});
    expect(h.timers.size).toBe(count); expect(count).toBeGreaterThan(0);
    expect(h.banner).toHaveBeenCalledTimes(bannerCount); expect(h.banner).toHaveBeenLastCalledWith(text);
  });

  it('finishing/clearing a wave invalidates a lookup that would revive it', async () => {
    const h = harness(), shown = h.flow.look(); h.reads[0].resolve(ok(wave('wave-a'))); await shown;
    const pending = h.flow.look(); await h.flow.finish({waveId: 'wave-a', survived: true});
    h.reads[1].resolve(ok(wave('wave-a'))); await pending;
    expect(h.flow.current).toBeNull();
  });
});
