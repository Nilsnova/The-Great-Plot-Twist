// Durable reward recovery is background work bound to the signed-in service owner, never the current island.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {registerPanelServices} from '../src/online/panel-services.js';
import {createWaveRewardRecovery} from '../src/online/wave-reward-recovery.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const reply = (extra = {}) => ({ok: true, status: 200, data: {coins: 120, wonWaveBest: 5, recovered: [], hasMore: false, ...extra}});
const waveId = '12345678-1234-4234-8234-123456789abc';
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const fixtures = [];
function setup({signedIn = true, ready = true, hidden = false, answers = [], ...options} = {}) {
  const session = createSession(); if (signedIn) session.setToken('fixture-token');
  const window = new EventTarget(), document = new EventTarget(); document.hidden = hidden;
  const state = {ready, coins: 120};
  const api = {post: vi.fn(async () => answers.length ? await answers.shift() : reply()), get: vi.fn()};
  const freshWallet = vi.fn(async () => ({coins: state.coins, current: () => true}));
  const lease = registerPanelServices(session, {api, isReady: () => state.ready, getFlags: () => ({islands: false}),
    getWallet: freshWallet});
  const emit = vi.fn(), onWallet = vi.fn(), onReset = vi.fn();
  const recovery = createWaveRewardRecovery({session, window, document, emit, onWallet, onReset, ...options});
  const fixture = {session, window, document, state, api, freshWallet, lease, emit, onWallet, onReset, recovery};
  fixtures.push(fixture); return fixture;
}
afterEach(() => { for (const f of fixtures.splice(0)) { f.recovery.dispose(); f.lease.dispose(); } vi.useRealTimers(); });

describe('durable reward recovery host', () => {
  it('waits for restored authentication and readiness, then runs even with islands disabled', async () => {
    const f = setup({signedIn: false, ready: false}); await flush(); expect(f.api.post).not.toHaveBeenCalled();
    f.session.setToken('restored-token'); await flush(); expect(f.api.post).not.toHaveBeenCalled();
    f.state.ready = true; f.lease.refresh(); await flush();
    expect(f.api.post).toHaveBeenCalledExactlyOnceWith('/api/waves/recover', {});
    expect(f.emit).toHaveBeenCalledExactlyOnceWith({type: 'wave_rewards_recovered', wonWaveBest: 5, recovered: []});
    expect(f.onWallet).toHaveBeenCalledExactlyOnceWith(120);
  });

  it('paces bounded batches and stops polling once empty, retaining the authoritative best on an empty reply', async () => {
    vi.useFakeTimers();
    const recovered = [{waveId, wave: 5, survived: true, loot: 20}];
    const f = setup({answers: [reply({recovered, hasMore: true}), reply()]}); await flush();
    expect(f.api.post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(f.api.post).toHaveBeenCalledTimes(2);
    expect(f.emit).toHaveBeenLastCalledWith({type: 'wave_rewards_recovered', wonWaveBest: 5, recovered: []});
    await vi.advanceTimersByTimeAsync(60000); expect(f.api.post).toHaveBeenCalledTimes(2);
    expect(f.emit.mock.calls.every(([event]) => !('coins' in event) && event.type !== 'wave_finished')).toBe(true);
  });

  it('coalesces online/visible wakes while one request is in flight', async () => {
    const held = deferred(), f = setup({answers: [held.promise]}); await flush();
    f.window.dispatchEvent(new Event('online')); f.document.dispatchEvent(new Event('visibilitychange')); await flush();
    expect(f.api.post).toHaveBeenCalledTimes(1);
    held.resolve(reply()); await flush();
    expect(f.api.post).toHaveBeenCalledTimes(1); expect(f.emit).toHaveBeenCalledTimes(1);
  });

  it('ignores old account replies and reconciliations, then recovers for the new account', async () => {
    const old = deferred(), f = setup({answers: [old.promise, reply({wonWaveBest: 2})]}); await flush();
    f.session.clearToken(); f.session.setToken('other-account'); await flush();
    expect(f.api.post).toHaveBeenCalledTimes(1);
    old.resolve(reply({wonWaveBest: 99})); await flush();
    expect(f.emit.mock.calls.map(([event]) => event.wonWaveBest)).toEqual([2]);
    expect(f.onWallet).toHaveBeenCalledOnce(); expect(f.onReset).toHaveBeenCalled();
  });

  it('checks the account again after a fresh wallet read', async () => {
    const held = deferred(), f = setup(); f.freshWallet.mockReturnValueOnce(held.promise); await flush();
    f.session.clearToken(); held.resolve({coins: 999, current: () => true}); await flush();
    expect(f.onWallet).not.toHaveBeenCalled();
  });

  it('never applies a wallet snapshot invalidated by a newer purchase', async () => {
    const f = setup(); f.freshWallet.mockResolvedValue({coins: 999, current: () => false}); await flush();
    expect(f.onWallet).not.toHaveBeenCalled();
  });

  it('backs off temporary failures, obeys Retry-After across wake events and pauses while hidden', async () => {
    vi.useFakeTimers();
    const f = setup({answers: [{ok: false, status: 503}, {ok: false, status: 429, retryAfterSeconds: 20}, reply()]}); await flush();
    await vi.advanceTimersByTimeAsync(4999); expect(f.api.post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.api.post).toHaveBeenCalledTimes(2);
    f.window.dispatchEvent(new Event('online')); await flush(); expect(f.api.post).toHaveBeenCalledTimes(2);
    f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(25000); expect(f.api.post).toHaveBeenCalledTimes(2);
    f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange')); await flush();
    expect(f.api.post).toHaveBeenCalledTimes(3); expect(f.emit).toHaveBeenCalledOnce();
  });

  it('continues pending recovery through a longer outage with the retry delay capped at thirty seconds', async () => {
    vi.useFakeTimers();
    const f = setup({answers: [...Array.from({length: 5}, () => ({ok: false, status: 503})), reply()]}); await flush();
    await vi.advanceTimersByTimeAsync(109999); expect(f.api.post).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1); expect(f.api.post).toHaveBeenCalledTimes(6); expect(f.emit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(120000); expect(f.api.post).toHaveBeenCalledTimes(6);
  });

  it('does not publish malformed or oversized reward batches', async () => {
    const recovered = Array.from({length: 21}, () => ({waveId, wave: 5, survived: true, loot: 20}));
    const f = setup({answers: [reply({recovered})]}); await flush();
    expect(f.emit).not.toHaveBeenCalled(); expect(f.onWallet).not.toHaveBeenCalled();
  });

  it('rejects a nonprogressing hasMore answer instead of starting a successful empty-batch loop', async () => {
    const f = setup({answers: [reply({hasMore: true})]}); await flush();
    expect(f.api.post).toHaveBeenCalledOnce(); expect(f.emit).not.toHaveBeenCalled(); expect(f.onWallet).not.toHaveBeenCalled();
  });

  it('waits while hidden or offline and only starts when both allow a background request', async () => {
    const f = setup({hidden: true}); await flush(); expect(f.api.post).not.toHaveBeenCalled();
    f.window.dispatchEvent(new Event('offline'));
    f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange')); await flush();
    expect(f.api.post).not.toHaveBeenCalled();
    f.window.dispatchEvent(new Event('online')); await flush(); expect(f.api.post).toHaveBeenCalledOnce();
  });

  it('cancels observers and timers and ignores a late reply after disposal', async () => {
    vi.useFakeTimers(); const held = deferred(), f = setup({answers: [held.promise]}); await flush();
    f.recovery.dispose(); held.resolve(reply()); await flush();
    f.window.dispatchEvent(new Event('online')); f.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.api.post).toHaveBeenCalledTimes(1); expect(f.emit).not.toHaveBeenCalled(); expect(f.onWallet).not.toHaveBeenCalled();
  });
});
