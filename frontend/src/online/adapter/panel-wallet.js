// Observe panel activity; only the authoritative account read (GET /api/me) changes the shared coins.

const nothingDone = {
  market: new Set(['market_unavailable', 'database_not_configured']),
  predictions: new Set(['predictions_unavailable', 'source_unavailable', 'database_not_configured']),
};
function writeKind(path) {
  if (path === '/api/market/open' || path === '/api/market/close') return 'market';
  if (path === '/api/predictions/stake') return 'predictions';
  if (path === '/api/duels' || /^\/api\/duels\/[^/?#]+\/(move|cancel)$/.test(path)) return 'arena';
  return null;
}
function walletRead(path) {
  return ['/api/market/portfolio', '/api/predictions/mine', '/api/duels'].includes(path)
    || /^\/api\/duels\/[^/?#]+$/.test(path);
}
function mayHaveChanged(kind, result) {
  const status = result?.status;
  if (status === 401 || status === 429) return false;
  if (result?.ok === true || (status >= 200 && status < 300)) return true;
  if (status === 409 && result?.code === 'already_applied') return true;
  if (status === 503 && nothingDone[kind]?.has(result?.code)) return false;
  return !Number.isInteger(status) || status === 0 || (status >= 500 && status <= 599);
}
const coins = value => Number.isSafeInteger(value) && value >= 0;

export function createPanelWallet(ctx) {
  let closed = false, owner = null;
  const identity = () => ctx.session.getScope?.() ?? null;
  const current = record => !closed && record === owner && ctx.store.isCurrent(record.scope)
    && ctx.session.isSignedIn() && Object.is(record.identity, identity());
  function capture() {
    if (closed || ctx.store.isClosed() || !ctx.session.isSignedIn()) return null;
    const scope = ctx.store.scope(), account = identity();
    if (!owner || owner.scope !== scope || !Object.is(owner.identity, account)) {
      owner = {scope, identity: account, dirty: 0, covered: 0, task: null,
        basis: ctx.state.me, hint: null};
    }
    return owner;
  }
  async function reconcile(record) {
    try { await ctx.waitForSetup?.(); } catch { /* Existing account recovery owns a failed startup. */ }
    if (!current(record)) return;
    // Cover every completion before this read starts; later completions need a later fresh GET.
    const group = record.dirty;
    let result;
    try { result = await ctx.transport.read('me', {fresh: true}); } catch { /* The read monitor owns retry. */ }
    if (!current(record)) return;
    if (result?.mapped?.accepted && !result.stale) {
      try { await ctx.onMeRefreshed?.(); } catch { /* Preserve the fresh authoritative ME. */ }
      if (!current(record)) return;
    }
    // Our own accepted ME must not re-arm an identical old hint after a failed/unchanged correction.
    record.basis = ctx.state.me;
    record.covered = group;
  }
  function run(record) {
    if (record.task || !current(record)) return;
    const task = Promise.resolve().then(async () => {
      while (current(record) && record.covered < record.dirty) await reconcile(record);
    }).catch(() => { record.covered = record.dirty; /* Unexpected observer faults never own retries. */ })
      .finally(() => {
        if (record.task !== task) return;
        record.task = null;
        // A completion can arrive after the loop exits but before this final microtask.
        if (current(record) && record.covered < record.dirty) run(record);
      });
    record.task = task;
  }
  function nudge(record) {
    if (!current(record)) return;
    record.dirty += 1; run(record);
  }
  function observe(record, method, path, result) {
    if (!record || !current(record)) return;
    if (method === 'post') {
      const kind = writeKind(path);
      if (kind && mayHaveChanged(kind, result)) { record.hint = null; nudge(record); }
      return;
    }
    if (!walletRead(path) || result?.ok !== true || !coins(result?.data?.coins)) return;
    if (record.basis !== ctx.state.me) { record.basis = ctx.state.me; record.hint = null; }
    const hint = result.data.coins;
    if (hint === record.hint) return;
    record.hint = hint;
    if (hint !== ctx.state.me?.coins) nudge(record);
  }
  function invoke(method, path, args) {
    let record;
    try { record = capture(); } catch { /* A broken observer must not change request semantics. */ }
    // Synchronous A2 path/body errors and asynchronous error identities are both preserved.
    const pending = ctx.api[method](path, ...args);
    return Promise.resolve(pending).then(result => {
      try { observe(record, method, path, result); } catch { /* Keep the exact A2 result. */ }
      return result;
    }, error => {
      if (method === 'post') {
        try { observe(record, method, path, null); } catch { /* Keep the exact A2 rejection. */ }
      }
      throw error;
    });
  }
  return {
    api: {get: (path, ...args) => invoke('get', path, args),
      post: (path, ...args) => invoke('post', path, args)},
    async waitIdle() {
      while (owner?.task) await owner.task;
    },
    dispose() { closed = true; owner = null; },
  };
}
