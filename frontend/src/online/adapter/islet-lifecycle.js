// One factory-owned L2 engine serves the islet panel (screens/islet) through panel services.
export function createIsletLifecycle(ctx, deps = {}) {
  const loadIslet = deps.loadIslet ?? (() => import('../../screens/islet/adapter.js'));
  const isDemo = deps.isDemo ?? (() => false);
  const {store, session} = ctx;
  let closed = false, generation = 0, boundScope = store.scope();
  let record = null, loading = null, walletTask = null, attemptedWalletCoins = null;
  const permitted = () => !closed && !store.isClosed() && session.isSignedIn() && !isDemo();
  const capture = () => ({scope: boundScope, generation});
  const current = owner => permitted() && owner.generation === generation
    && owner.scope === boundScope && store.isCurrent(owner.scope);
  const refusal = () => ctx.refuse(closed || store.isClosed() ? 'disposed'
    : session.isSignedIn() ? 'session_expired' : 'sign_in_required');
  const expiredRaw = () => ({accepted: false, code: refusal().reason, message: refusal().message});

  function refreshWallet(owner, request) {
    if (!current(owner)) return Promise.resolve();
    const key = `coins:${request.coins}`;
    if (walletTask) return walletTask.key === key ? walletTask.promise
      : walletTask.promise.then(() => refreshWallet(owner, request));
    if (attemptedWalletCoins === request.coins) return Promise.resolve();
    attemptedWalletCoins = request.coins;
    const task = {key, promise: null};
    task.promise = Promise.resolve().then(async () => {
      if (!current(owner)) return;
      try { await ctx.waitForSetup?.(); } catch { /* A failed initial hydration may recover through the fresh read below. */ }
      if (!current(owner)) return;
      if (ctx.state.me?.coins === request.coins) return;
      let refreshed;
      try { refreshed = await ctx.transport.read('me', {fresh: true}); } catch { /* The read monitor owns recovery. */ }
      if (!current(owner)) return;
      if (refreshed?.mapped?.accepted && !refreshed.stale && typeof ctx.onMeRefreshed === 'function') {
        try { await ctx.onMeRefreshed(); } catch { /* Keep the fresh me read; the owner retains hydration recovery. */ }
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
      store.commit({isletSnapshot: snapshot});
      if (current(owner) && Number.isSafeInteger(snapshot.coins) && snapshot.coins >= 0
        && snapshot.coins !== ctx.state.me?.coins) {
        refreshWallet(owner, {coins: snapshot.coins}).catch(() => {});
      }
    });
  }
  function reset() {
    if (closed) return;
    generation += 1; boundScope = store.scope(); loading = null;
    walletTask = null; attemptedWalletCoins = null;
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
  function dispose() {
    if (closed) return;
    closed = true; generation += 1; loading = null; walletTask = null; attemptedWalletCoins = null;
    record?.stop?.(); record?.adapter.dispose(); record = null;
    if (!store.isClosed()) store.commit({isletSnapshot: null});
  }
  return {getAdapter, refresh, reset, dispose};
}
