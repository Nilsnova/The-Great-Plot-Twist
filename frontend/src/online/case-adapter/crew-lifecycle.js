// Private crew read observation keeps polling scoped without changing the adapter's public surface.
import {createCrewPolling} from './crew-polling.js';

export function createCrewLifecycle(ctx, deps = {}) {
  const {store, state, session, document} = ctx;
  let disposed = false;
  const polling = createCrewPolling(ctx, {isVisible: deps.isCrewVisible,
    setTimer: deps.setTimer, clearTimer: deps.clearTimer});
  const current = scope => !disposed && store.isCurrent(scope) && session.isSignedIn();
  const rawRead = ctx.transport.read;
  ctx.transport.read = (kind, options) => {
    if (kind !== 'crew') return rawRead(kind, options);
    const scope = store.scope();
    return rawRead(kind, options).then(result => {
      if (result?.stale) return result;
      polling.refresh({result, scope});
      if (result?.mapped?.accepted && current(scope)) {
        try { Promise.resolve(ctx.onCrewRead?.({result, scope})).catch(() => {}); }
        catch { /* Cosmetic subscribers do not own this authoritative read. */ }
      }
      return result;
    });
  };
  ctx.onCrewChanged = async () => {
    if (disposed || !session.isSignedIn() || document?.hidden || !state.crew?.id) return;
    try { await ctx.refreshCase?.(); }
    catch { /* Case recovery remains with its own read owner. */ }
  };
  return {refresh: polling.refresh, nudge: polling.nudge,
    dispose() {
      if (disposed) return;
      disposed = true;
      polling.dispose();
    },
  };
}
