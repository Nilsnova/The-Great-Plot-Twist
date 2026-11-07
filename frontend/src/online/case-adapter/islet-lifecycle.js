// One factory-owned L2 engine serves the islet panel and the finale's existing intent.
import {intentFailure} from '../../adapter/call-failure.js';
import {caseReasons} from '../../adapter/reasons.js';
import {refreshAccountRewards} from './rewards.js';

const STATION = 'islet_signal_station';
const knownReasons = new Set(caseReasons);
const transportReasons = new Set(['offline', 'not_connected', 'session_expired', 'save_conflict',
  'rate_limited', 'feature_off', 'forbidden', 'internal_error']);
const domainReasons = {
  not_enough_timber: 'materials_required', insufficient_funds: 'no_coins',
  plot_occupied: 'already_built', not_buildable_yet: 'light_not_ready',
  no_such_plot: 'unknown_light', no_such_building: 'unknown_light',
  wrong_plot: 'invalid_request', validation_error: 'invalid_request',
  invalid_transaction: 'invalid_request', player_not_set_up: 'not_ready',
  busy: 'not_ready', unreadable: 'internal_error', network_error: 'offline',
};

export function createIsletLifecycle(ctx, deps = {}) {
  const loadIslet = deps.loadIslet ?? (() => import('../../screens/islet/adapter.js'));
  const isDemo = deps.isDemo ?? (() => false);
  const {store, session} = ctx;
  let closed = false, generation = 0, boundScope = store.scope();
  let record = null, loading = null, walletTask = null, attemptedWalletCoins = null, acceptedBuilds = 0;
  const permitted = () => !closed && !store.isClosed() && session.isSignedIn() && !isDemo();
  const capture = () => ({scope: boundScope, generation});
  const current = owner => permitted() && owner.generation === generation
    && owner.scope === boundScope && store.isCurrent(owner.scope);
  const refusal = () => ctx.refuse(closed || store.isClosed() ? 'disposed'
    : session.isSignedIn() ? 'session_expired' : 'sign_in_required');
  const expiredRaw = () => ({accepted: false, code: refusal().reason, message: refusal().message});

  function refreshWallet(owner, request) {
    if (!current(owner)) return Promise.resolve();
    const key = request.build === undefined ? `coins:${request.coins}` : `build:${request.build}`;
    if (walletTask) return walletTask.key === key ? walletTask.promise
      : walletTask.promise.then(() => refreshWallet(owner, request));
    if (request.build === undefined) {
      if (attemptedWalletCoins === request.coins) return Promise.resolve();
      attemptedWalletCoins = request.coins;
    }
    const task = {key, promise: null};
    task.promise = Promise.resolve().then(async () => {
      if (!current(owner)) return;
      try { await ctx.waitForSave?.(); } catch { /* A failed initial hydration may recover through the fresh read below. */ }
      if (!current(owner)) return;
      if (request.build === undefined && ctx.state.me?.coins === request.coins) return;
      let refreshed;
      try { refreshed = await ctx.transport.read('me', {fresh: true}); } catch { /* The read monitor owns recovery. */ }
      if (!current(owner)) return;
      let continuation;
      if (refreshed?.mapped?.accepted && !refreshed.stale && typeof ctx.onMeRefreshed === 'function') {
        try { continuation = await ctx.onMeRefreshed(); } catch { /* Keep the fresh me read; the owner retains hydration recovery. */ }
        if (!current(owner)) return;
      }
      if (continuation?.ledgerHandled !== true) {
        try { await refreshAccountRewards(ctx); } catch { /* The ledger read owns recovery. */ }
      }
    }).finally(() => { if (walletTask === task) walletTask = null; });
    walletTask = task;
    return task.promise;
  }
  function subscribe(entry) {
    entry.stop?.();
    entry.generation = permitted() ? generation : null;
    if (entry.generation === null) return;
    const owner = capture();
    entry.stop = entry.adapter.subscribe(event => {
      if (entry !== record || !current(owner) || event?.type !== 'islet_updated' || event.answered !== true) return;
      const snapshot = structuredClone(event.view);
      if (!current(owner)) return;
      // A newer internal build read must not leave later refreshes sharing an older held GET.
      entry.pending = null; entry.answers += 1;
      const buildConfirmed = snapshot.signalStationBuilt === true || snapshot.busyPlot !== null
        && snapshot.spots.some(spot => spot.plot === snapshot.busyPlot && spot.state === 'built');
      store.commit({isletSnapshot: snapshot, ...(buildConfirmed ? {isletFailure: null} : {})});
      if (current(owner) && Number.isSafeInteger(snapshot.coins) && snapshot.coins >= 0
        && snapshot.coins !== ctx.state.me?.coins) {
        refreshWallet(owner, {coins: snapshot.coins}).catch(() => {});
      }
    });
  }
  function reset() {
    if (closed) return;
    generation += 1; boundScope = store.scope(); loading = null;
    walletTask = null; attemptedWalletCoins = null; acceptedBuilds = 0;
    if (record) {
      record.stop?.(); record.stop = null; record.pending = null; record.answers = 0;
      record.adapter.resetPrivate();
      subscribe(record);
    }
    if (!store.isClosed()) store.commit({isletSnapshot: null});
  }
  function synchronize() {
    if (boundScope !== store.scope()) reset();
  }
  // This also invalidates the L2 epoch if an account boundary precedes the owner's reset hook.
  function fence(owner) {
    if (current(owner)) return true;
    if (!closed && (boundScope !== store.scope() || !session.isSignedIn() || isDemo())) reset();
    return false;
  }
  async function send(method, path, body) {
    const owner = capture();
    if (!fence(owner)) return {ok: false, status: 401, code: 'unauthorized'};
    const result = await ctx.api[method](path, ...(method === 'post' ? [body] : []));
    return fence(owner) ? result : {ok: false, status: 401, code: 'unauthorized'};
  }
  async function getAdapter() {
    synchronize();
    if (!permitted()) return null;
    if (record) {
      if (record.generation !== generation) subscribe(record);
      return record.adapter;
    }
    if (loading) return loading.promise;
    const owner = capture(), task = {promise: null};
    task.promise = Promise.resolve().then(() => current(owner) ? loadIslet() : null).then(module => {
      if (!current(owner) || !module) return null;
      const adapter = module.createIsletAdapter({mode: 'live', now: ctx.now,
        transport: {get: path => send('get', path), post: (path, body) => send('post', path, body)}});
      if (!current(owner)) { adapter.dispose(); return null; }
      const entry = {adapter, refresh: adapter.refresh.bind(adapter), pending: null, stop: null, generation, answers: 0};
      record = entry;
      // Preserve the actual engine and all its methods; only overlapping external reads are shared.
      adapter.refresh = () => {
        synchronize();
        const readOwner = capture();
        if (record !== entry || !current(readOwner)) return Promise.resolve(expiredRaw());
        if (entry.generation !== generation) subscribe(entry);
        if (entry.pending) return entry.pending;
        const pending = Promise.resolve().then(() => current(readOwner) ? entry.refresh() : expiredRaw())
          .then(result => current(readOwner) ? result : expiredRaw())
          .finally(() => { if (entry.pending === pending) entry.pending = null; });
        entry.pending = pending;
        return pending;
      };
      subscribe(entry);
      return adapter;
    }).catch(() => null).finally(() => { if (loading === task) loading = null; });
    loading = task;
    return task.promise;
  }
  async function refresh() {
    synchronize();
    const owner = capture();
    if (!current(owner)) return expiredRaw();
    const adapter = await getAdapter();
    if (!current(owner)) return expiredRaw();
    return adapter ? adapter.refresh() : permitted() ? {accepted: false, code: 'not_connected', message: ctx.refuse('not_connected').message} : expiredRaw();
  }
  function publicResult(result, deadline = null) {
    if (result?.accepted) return ctx.accept(result.message ?? '');
    const failure = result?.failure ?? {};
    const status = Number.isInteger(failure.status) && failure.status >= 0 && failure.status <= 599 ? failure.status : undefined;
    const reason = domainReasons[result?.code] ?? domainReasons[failure.reason] ?? (knownReasons.has(failure.reason) ? failure.reason
      : knownReasons.has(result?.code) ? result.code : result?.code === 'unconfirmed' ? 'not_connected' : undefined);
    const mapped = reason ? {...ctx.refuse(reason), reason} : intentFailure({status, retryAfterSeconds: failure.retryAfterSeconds});
    const seconds = failure.retryAfterSeconds;
    let remaining = Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400 ? Math.ceil(seconds) : undefined;
    if (mapped.reason === 'rate_limited' && deadline !== null) remaining = Math.max(0, Math.ceil((deadline - ctx.now()) / 1000));
    return {...mapped, message: result?.message || failure.message || mapped.message,
      // Business reasons cross the generic intent normalizer without an HTTP reclassification.
      ...(status === undefined || !transportReasons.has(mapped.reason) ? {} : {status}),
      ...(mapped.reason === 'rate_limited' && remaining !== undefined ? {retryAfterSeconds: remaining} : {})};
  }
  async function afterBuild(owner, result, answersBefore) {
    // Panel and finale share one wallet read after the same accepted islet answer.
    const coins = ctx.state.isletSnapshot?.coins;
    const answered = record && record.answers > answersBefore && ctx.state.isletSnapshot?.signalStationBuilt === true
      && Number.isSafeInteger(coins) && coins >= 0;
    await refreshWallet(owner, answered ? {coins} : {build: ++acceptedBuilds});
    if (!current(owner)) return refusal();
    if (typeof ctx.refreshCase === 'function') {
      try { await ctx.refreshCase(); } catch { /* The case reader owns its recovery. */ }
      if (!current(owner)) return refusal();
    }
    return publicResult(result);
  }
  async function buildLight(station) {
    if (station !== STATION) return ctx.refuse('unknown_light');
    synchronize();
    const owner = capture();
    if (!current(owner)) return refusal();
    const adapter = await getAdapter();
    if (!current(owner)) return refusal();
    if (!adapter) return ctx.refuse('not_connected');
    let deadline = null, reported = false;
    const notifyFailure = failure => {
      if (!failure || !current(owner)) return;
      reported = true;
      if (failure.reason === 'rate_limited') {
        const seconds = failure.retryAfterSeconds, retryAt = failure.retryAt;
        if (Number.isFinite(retryAt) && retryAt >= 0 && retryAt <= ctx.now() + 86400000) deadline = retryAt;
        else if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400) deadline = ctx.now() + Math.ceil(seconds) * 1000;
      }
      const safe = publicResult({accepted: false, failure, message: failure.message}, deadline);
      // Exact timing is private; the public case receipt retains only Retry-After seconds.
      const privateFailure = deadline === null ? safe : {...safe, retryAt: deadline};
      try { const pending = ctx.onIsletFailure?.(privateFailure); pending?.catch?.(() => {}); }
      catch { /* Presentation never owns the build. */ }
    };
    const answersBefore = record.answers;
    const view = adapter.read();
    if (view.busyPlot !== null) return ctx.refuse('not_ready');
    let spot = view.spots.find(item => item.plot === STATION);
    if (!spot || spot.retry) {
      const read = await adapter.refresh();
      if (!current(owner)) return refusal();
      if (!read.accepted) { notifyFailure(read.failure); return publicResult(read, deadline); }
      if (read.stale) return ctx.refuse('not_ready');
      spot = adapter.read().spots.find(item => item.plot === STATION);
      if (!spot) return ctx.refuse('unknown_light');
      if (spot.state === 'built') return afterBuild(owner, {accepted: true, message: 'Your signal station stands ready.'}, answersBefore);
    }
    const answersBeforeBuild = record.answers;
    const result = await adapter.build(STATION, {onFailure: notifyFailure});
    if (!current(owner)) return refusal();
    if (!result.accepted && !reported) notifyFailure(result.failure);
    return result.accepted ? afterBuild(owner, result, answersBeforeBuild) : publicResult(result, deadline);
  }
  function dispose() {
    if (closed) return;
    closed = true; generation += 1; loading = null; walletTask = null; attemptedWalletCoins = null;
    record?.stop?.(); record?.adapter.dispose(); record = null;
    if (!store.isClosed()) store.commit({isletSnapshot: null});
  }
  return {getAdapter, refresh, buildLight, reset, dispose};
}
