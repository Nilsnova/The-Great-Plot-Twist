// Real account readers with injected answers; no SDK, service, storage or browser is involved.
import {randomUUID} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createReadMonitor} from '../src/online/case-adapter/read-monitor.js';
import {refreshAccountRewards} from '../src/online/case-adapter/rewards.js';
import {createPanelWallet} from '../src/online/case-adapter/panel-wallet.js';

const good = data => ({ok: true, status: 200, data});
const failed = (status, code = 'database_unavailable') => ({ok: false, status, code});
const me = coins => ({id: randomUUID(), captainName: 'Recorded captain', coins,
  kit: 'witness', place: 'saltreach_harbor', crews: []});
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}
const fixtures = [];
function setup() {
  const session = createSession(); session.setToken(`fixture-${randomUUID()}`);
  const store = createAdapterStore({session}), timers = new Map();
  let serverMe = me(1000), now = 0, nextTimer = 0;
  const reads = [], gets = [], posts = [], requests = [], transportTasks = [];
  store.commit({me: structuredClone(serverMe), config: {flags: {market: true, predictions: true, arena: true}}});
  const api = {
    get: vi.fn(path => {
      requests.push({method: 'GET', path});
      const next = (path === '/api/me' ? reads : gets).shift();
      return next ? next(path) : Promise.resolve(path === '/api/me' ? good(structuredClone(serverMe)) : good({coins: 1000}));
    }),
    post: vi.fn((path, body, ...options) => {
      requests.push({method: 'POST', path, body, options});
      const next = posts.shift(); return next ? next(path, body) : Promise.resolve(good({}));
    }),
  };
  const ctx = {session, store, state: store.state, api, publicApi: api, now: () => now,
    accept: (message = '') => ({accepted: true, reason: null, message}),
    refuse: reason => ({accepted: false, reason, message: `Refused: ${reason}`}),
    waitForSave: vi.fn(async () => {}), onMeRefreshed: vi.fn(async () => ({ledgerHandled: false})),
    auth: {readOwnLedger: vi.fn(async () => ({ok: true, rows: []}))}};
  ctx.readMonitor = createReadMonitor(ctx, {
    setTimer(callback, delay) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  ctx.transport = createAdapterTransport(ctx);
  const read = ctx.transport.read;
  ctx.transport.read = (...args) => { const task = read(...args); transportTasks.push(task); return task; };
  const wallet = createPanelWallet(ctx);
  const fixture = {ctx, session, store, wallet, api, reads, gets, posts, requests, timers, transportTasks,
    meReads: () => requests.filter(item => item.method === 'GET' && item.path === '/api/me'),
    setMe(value) { serverMe = value; },
    setTime(value) { now = value; },
    replaceIdentity(coins = 77) {
      session.clearToken(); store.invalidate(); ctx.readMonitor.reset(); ctx.transport.clearPending();
      serverMe = me(coins); store.commit({me: structuredClone(serverMe), rewardsRows: []});
      session.setToken(`fixture-${randomUUID()}`); store.invalidate();
    },
    dispose() { store.dispose(); wallet.dispose(); ctx.readMonitor.dispose(); },
  };
  fixtures.push(fixture); return fixture;
}
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.dispose(); });

describe('panel observations reconcile the shared authoritative wallet', () => {
  it('preserves exact A2 objects and bodies, never repeats a POST, and refreshes ledger even at the same balance', async () => {
    const f = setup(), response = good({recorded: true}), body = {amount: 7, stakeId: randomUUID()};
    f.posts.push(() => Promise.resolve(response));
    f.ctx.auth.readOwnLedger.mockResolvedValue({ok: true, rows: [
      {amount: -7, reason: 'prediction_stake', reference_id: randomUUID()},
      {amount: 7, reason: 'recorded_refund', reference_id: randomUUID()},
    ]});
    expect(await f.wallet.api.post('/api/predictions/stake', body)).toBe(response);
    await f.wallet.waitIdle();
    expect(f.api.post).toHaveBeenCalledExactlyOnceWith('/api/predictions/stake', body);
    expect(f.api.post.mock.calls[0][1]).toBe(body);
    expect(f.meReads()).toHaveLength(1);
    expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    const view = f.store.read();
    expect(view.captain.coins).toBe(1000); expect(view.rewards.balance).toBe(1000);
    expect(view.rewards.ledger.map(row => row.amount)).toEqual([-7, 7]);
    expect(f.store.state.rewardsRows.every(row => !('reference_id' in row))).toBe(true);
  });

  it.each(['/api/market/open', '/api/market/close', '/api/predictions/stake', '/api/duels',
    `/api/duels/${randomUUID()}/move`, `/api/duels/${randomUUID()}/cancel`])
  ('reconciles the published wallet write %s without adopting its coin fields', async path => {
    const f = setup(), response = good({coins: 123456}); f.posts.push(() => Promise.resolve(response));
    f.setMe(me(930)); expect(await f.wallet.api.post(path, {actionUid: randomUUID()})).toBe(response);
    await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(1); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(930); expect(f.api.post).toHaveBeenCalledOnce();
  });

  it.each([
    ['malformed successful answer', good(null)], ['malformed 2xx envelope', {ok: false, status: 204}],
    ['already applied', failed(409, 'already_applied')], ['lost answer', failed(0)],
    ['500', failed(500)], ['502', failed(502)], ['uncertain 503', failed(503)],
  ])('reads rather than resending after %s', async (_label, response) => {
    const f = setup(); f.posts.push(() => Promise.resolve(response));
    expect(await f.wallet.api.post('/api/predictions/stake', {stakeId: randomUUID()})).toBe(response);
    await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(1); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.api.post).toHaveBeenCalledOnce();
  });

  it.each([
    ['/api/market/open', failed(503, 'market_unavailable')],
    ['/api/market/close', failed(503, 'database_not_configured')],
    ['/api/predictions/stake', failed(503, 'predictions_unavailable')],
    ['/api/predictions/stake', failed(503, 'source_unavailable')],
    ['/api/predictions/stake', failed(503, 'database_not_configured')],
    ['/api/duels', failed(401, 'unauthorized')], ['/api/duels', failed(429, 'too_many_requests')],
    ['/api/duels', failed(409, 'duel_taken')], ['/api/unrelated', good({})],
  ])('does not add account reads for a definite refusal or unrelated route %s %j', async (path, response) => {
    const f = setup(); f.posts.push(() => Promise.resolve(response));
    expect(await f.wallet.api.post(path, {actionUid: randomUUID()})).toBe(response);
    await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(0); expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(f.api.post).toHaveBeenCalledOnce();
  });

  it('keeps A7 503 uncertain even when another panel declares that code nothing-done', async () => {
    const f = setup(); f.posts.push(() => Promise.resolve(failed(503, 'database_not_configured')));
    await f.wallet.api.post('/api/duels', {actionUid: randomUUID()}); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(1); expect(f.api.post).toHaveBeenCalledOnce();
  });

  it('preserves synchronous preparation errors and asynchronous rejection identity', async () => {
    const f = setup(), error = new TypeError('Recorded invalid request');
    f.posts.push(() => { throw error; });
    expect(() => f.wallet.api.post('/api/predictions/stake', {})).toThrow(error);
    await f.wallet.waitIdle(); expect(f.meReads()).toHaveLength(0);
    const rejection = new Error('Recorded connection lost');
    f.posts.push(() => Promise.reject(rejection));
    await expect(f.wallet.api.post('/api/predictions/stake', {stakeId: randomUUID()})).rejects.toBe(rejection);
    await f.wallet.waitIdle(); expect(f.meReads()).toHaveLength(1); expect(f.api.post).toHaveBeenCalledTimes(2);
  });

  it('requires a second fresh ME when another completed write arrives behind a held ME', async () => {
    const f = setup(), held = deferred(), started = deferred();
    f.reads.push(() => { started.resolve(); return held.promise; });
    await f.wallet.api.post('/api/market/open', {actionUid: randomUUID()}); await started.promise;
    await f.wallet.api.post('/api/predictions/stake', {stakeId: randomUUID()});
    f.setMe(me(800)); held.resolve(good(me(900))); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(2); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledTimes(2);
    expect(f.store.read().captain.coins).toBe(800); expect(f.api.post).toHaveBeenCalledTimes(2);
  });

  it.each(['/api/market/portfolio', '/api/predictions/mine', '/api/duels', `/api/duels/${randomUUID()}`])
  ('refreshes a passive authoritative payout hint on %s while leaving its answer untouched', async path => {
    const f = setup(), response = good({coins: 1100}); f.gets.push(() => Promise.resolve(response));
    f.setMe(me(1100)); expect(await f.wallet.api.get(path)).toBe(response); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(1); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(1100); expect(f.api.post).not.toHaveBeenCalled();
  });

  it('does not become a retry owner for one failed passive hint; a new hint, basis or write re-arms it', async () => {
    const f = setup(); f.reads.push(() => Promise.resolve(failed(503)));
    const hint = async coins => {
      f.gets.push(() => Promise.resolve(good({coins})));
      await f.wallet.api.get('/api/duels'); await f.wallet.waitIdle();
    };
    await hint(900); expect(f.meReads()).toHaveLength(1);
    const scheduled = [...f.timers.values()].map(timer => timer.delay);
    expect(scheduled).toEqual([5000]); // This is the real read monitor's bounded recovery job.
    await hint(900); expect(f.meReads()).toHaveLength(1); expect([...f.timers.values()].map(timer => timer.delay)).toEqual(scheduled);
    await hint(901); expect(f.meReads()).toHaveLength(2);
    await hint(901); expect(f.meReads()).toHaveLength(2);
    await f.ctx.transport.read('me', {fresh: true}); expect(f.meReads()).toHaveLength(3);
    await hint(901); expect(f.meReads()).toHaveLength(4);
    await f.wallet.api.post('/api/duels', {actionUid: randomUUID()}); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(5); expect(f.api.post).toHaveBeenCalledOnce();
  });

  it('ignores invalid, equal and public/unrelated coin fields', async () => {
    const f = setup();
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '900', null, 1000]) {
      f.gets.push(() => Promise.resolve(good({coins: value}))); await f.wallet.api.get('/api/predictions/mine');
    }
    for (const path of ['/api/predictions', '/api/market', '/api/config']) {
      f.gets.push(() => Promise.resolve(good({coins: 900}))); await f.wallet.api.get(path);
    }
    f.gets.push(() => Promise.resolve({...failed(503), data: {coins: 900}})); await f.wallet.api.get('/api/duels');
    await f.wallet.waitIdle(); expect(f.meReads()).toHaveLength(0); expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
  });

  it('recognizes a returned payout hint after an intervening observed balance matched shared ME', async () => {
    const f = setup(); f.reads.push(() => Promise.resolve(failed(503)));
    const observe = async coins => {
      f.gets.push(() => Promise.resolve(good({coins})));
      await f.wallet.api.get('/api/duels'); await f.wallet.waitIdle();
    };
    await observe(900); await observe(900); expect(f.meReads()).toHaveLength(1);
    await observe(1000); expect(f.meReads()).toHaveLength(1);
    await observe(900); expect(f.meReads()).toHaveLength(2);
    expect(f.api.post).not.toHaveBeenCalled();
  });

  it('waits for hydration, covers all preceding writes once, and leaves already-handled ledger ownership alone', async () => {
    const f = setup(), barrier = deferred(), entered = deferred();
    f.ctx.waitForSave.mockImplementation(() => { entered.resolve(); return barrier.promise; });
    f.ctx.onMeRefreshed.mockImplementation(async () => { await refreshAccountRewards(f.ctx); return {ledgerHandled: true}; });
    await f.wallet.api.post('/api/market/open', {actionUid: randomUUID()}); await entered.promise;
    await f.wallet.api.post('/api/duels', {actionUid: randomUUID()});
    expect(f.meReads()).toHaveLength(0); expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    barrier.resolve(); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(1); expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce(); expect(f.api.post).toHaveBeenCalledTimes(2);
  });

  it('reconciles a sent write across feature-off, but never across identity replacement', async () => {
    const f = setup(), old = deferred(), started = deferred();
    f.reads.push(() => { started.resolve(); return old.promise; });
    await f.wallet.api.post('/api/duels', {actionUid: randomUUID()}); await started.promise;
    f.store.commit({config: {flags: {arena: false}}});
    old.resolve(good(me(950))); await f.wallet.waitIdle();
    expect(f.store.read().captain.coins).toBe(950); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    const late = deferred(), lateStarted = deferred();
    f.reads.push(() => { lateStarted.resolve(); return late.promise; });
    await f.wallet.api.post('/api/predictions/stake', {stakeId: randomUUID()}); await lateStarted.promise;
    f.replaceIdentity(77); late.resolve(good(me(1))); await f.wallet.waitIdle();
    expect(f.store.read().captain.coins).toBe(77); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    f.setMe(me(66)); await f.wallet.api.post('/api/predictions/stake', {stakeId: randomUUID()}); await f.wallet.waitIdle();
    expect(f.store.read().captain.coins).toBe(66); expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledTimes(2);
  });

  it('returns a late old-account POST unchanged without starting reads for the replacement account', async () => {
    const f = setup(), held = deferred(), response = good({coins: 1});
    f.posts.push(() => held.promise);
    const pending = f.wallet.api.post('/api/duels', {actionUid: randomUUID()});
    f.replaceIdentity(77); held.resolve(response);
    expect(await pending).toBe(response); await f.wallet.waitIdle();
    expect(f.meReads()).toHaveLength(0); expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(f.store.read().captain.coins).toBe(77);
  });

  it('preserves renewed-token identity and isolates another session even when hints and UIDs match', async () => {
    const left = setup(), right = setup(), uid = randomUUID();
    const held = deferred(), started = deferred(); left.reads.push(() => { started.resolve(); return held.promise; });
    await left.wallet.api.post('/api/market/open', {actionUid: uid}); await started.promise;
    left.session.setToken(`fixture-renewed-${randomUUID()}`); held.resolve(good(me(950)));
    await left.wallet.waitIdle();
    expect(left.store.read().captain.coins).toBe(950); expect(right.store.read().captain.coins).toBe(1000);
    expect(right.meReads()).toHaveLength(0); expect(right.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    await right.wallet.api.post('/api/market/open', {actionUid: uid}); await right.wallet.waitIdle();
    expect(right.meReads()).toHaveLength(1); expect(left.meReads()).toHaveLength(1);
  });

  it('keeps the factory-disposed view frozen and never begins ledger work after a late ME', async () => {
    const f = setup(), held = deferred(), started = deferred();
    f.reads.push(() => { started.resolve(); return held.promise; });
    await f.wallet.api.post('/api/duels', {actionUid: randomUUID()}); await started.promise;
    const before = f.store.read(); f.dispose(); held.resolve(good(me(1)));
    await Promise.all(f.transportTasks); await f.wallet.waitIdle();
    expect(f.store.read()).toEqual(before); expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(f.ctx.onMeRefreshed).not.toHaveBeenCalled(); expect(f.timers.size).toBe(0);
  });
});
