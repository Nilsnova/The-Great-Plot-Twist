// Strictly gated optional public reader. No account client, token, timer or outcome lives here.
const empty = (status = 'off', message = '') => ({status, day:null, lines:[], weather:null,
  exchange:null, chapterTwoHook:null, stale:false, message});
const refusal = reason => ({ok:false, reason});
export function createLazyBulletin(ctx, {load = () => import('./bulletin.js'), ...options} = {}) {
  let reader = null, pending = null, closed = false, generation = 0;
  const enabled = () => !closed && !ctx.store.isClosed() && ctx.state.config?.flags?.bulletin === true;
  const scope = () => ctx.store.scope();
  const current = (epoch, identity) => enabled() && generation === epoch && scope() === identity;
  const unavailable = () => {
    ctx.store.commit({bulletin:empty('unavailable','The harbor bulletin is unavailable right now.'),
      bulletinObservations:[]});
  };
  async function ensure(epoch, identity) {
    if (reader) return reader;
    if (pending && (pending.epoch !== epoch || pending.identity !== identity)) pending = null;
    if (!pending) {
      const task = {epoch, identity, promise:null};
      task.promise = Promise.resolve().then(() => {
        if (!current(epoch, identity) || ctx.document?.hidden) return null;
        return load();
      }).then(module => {
        if (!module || !current(epoch, identity) || ctx.document?.hidden) return null;
        const next = module.createOnlineBulletin(ctx, options);
        if (!current(epoch, identity)) { next.dispose(); return null; }
        reader = next; return reader;
      }).finally(() => { if (pending === task) pending = null; });
      pending = task;
    }
    return pending.promise;
  }
  function stop() {
    generation += 1; pending = null;
    if (reader) reader.stop();
    else if (!closed && !ctx.store.isClosed() && ctx.state.bulletin?.status !== 'off')
      ctx.store.commit({bulletin:empty(), bulletinObservations:[]});
  }
  async function refresh(settings = {}) {
    if (!enabled()) { if (!closed && !ctx.store.isClosed()) stop(); return refusal('feature_off'); }
    if (ctx.document?.hidden) return refusal('not_ready');
    const epoch = generation, identity = scope();
    try {
      const active = await ensure(epoch, identity);
      if (!active || !current(epoch, identity) || ctx.document?.hidden) return refusal('not_ready');
      const result = await active.refresh(settings);
      return current(epoch, identity) ? result : refusal('not_ready');
    } catch {
      if (current(epoch, identity)) unavailable();
      return refusal('not_connected');
    }
  }
  const wake = () => { if (!reader && enabled() && !ctx.document?.hidden) void refresh(); };
  ctx.document?.addEventListener?.('visibilitychange', wake);
  ctx.window?.addEventListener?.('focus', wake);
  return {refresh, stop, read:() => closed || ctx.store.isClosed() ? empty()
      : structuredClone(reader?.read() ?? ctx.state.bulletin ?? empty()),
    dispose() {
      if (closed) return;
      closed = true; generation += 1; pending = null; reader?.dispose(); reader = null;
      ctx.document?.removeEventListener?.('visibilitychange', wake);
      ctx.window?.removeEventListener?.('focus', wake);
    }};
}
