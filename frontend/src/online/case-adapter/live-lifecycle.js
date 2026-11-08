// A4 cosmetics reuse the existing authoritative crew lifecycle; no extra transport or poller is installed.
import {createOnlinePresence} from './presence.js';

export function createLiveLifecycle(ctx, deps = {}) {
  const {store, state, session, document} = ctx;
  let disposed = false, generation = 0, hidden = Boolean(document?.hidden);
  let enabled = state.config?.flags?.live_presence === true;
  const previous = {onCrewRead: ctx.onCrewRead, onCrewChanged: ctx.onCrewChanged,
    onCrewUpdated: ctx.onCrewUpdated, onCaseHint: ctx.onCaseHint};
  const presence = createOnlinePresence(ctx, {loadRealtime: deps.loadRealtime, emit: deps.emit,
    supabaseUrl: deps.supabaseUrl, publishableKey: deps.publishableKey});
  const current = (scope, token = generation) => !disposed && store.isCurrent(scope)
    && token === generation && session.isSignedIn();
  const permitted = () => !disposed && !store.isClosed() && session.isSignedIn() && !document?.hidden;
  const livePermitted = () => permitted() && state.config?.flags?.live_presence === true;

  function synchronize() {
    const nextHidden = Boolean(document?.hidden), nextEnabled = state.config?.flags?.live_presence === true;
    if ((!hidden && nextHidden) || (enabled && !nextEnabled)) generation += 1;
    hidden = nextHidden; enabled = nextEnabled;
    presence.setHidden(hidden);
  }
  function refresh() {
    if (disposed || store.isClosed()) return;
    try {
      synchronize();
      Promise.resolve(presence.refresh()).catch(() => {});
    } catch { /* Cosmetics cannot change an account, save or crew outcome. */ }
  }
  async function refreshCase(version, scope, token) {
    if (!current(scope, token) || !livePermitted() || !state.crew?.id || typeof ctx.refreshCase !== 'function') return;
    try { await ctx.refreshCase(version === undefined ? {} : {version}); }
    catch { /* A future case read keeps its own failure and recovery owner. */ }
  }
  const onCrewRead = async entry => {
    if (!entry?.result?.mapped?.accepted || !current(entry.scope)) return;
    refresh();
    try { await previous.onCrewRead?.(entry); }
    catch { /* Preserve the authoritative crew read if a cosmetic observer fails. */ }
  };
  const onCrewChanged = async (...args) => {
    if (!permitted()) return;
    const scope = store.scope(), token = generation;
    let result;
    try { result = await previous.onCrewChanged?.(...args); }
    catch { /* Existing crew/case recovery remains with that lifecycle. */ }
    if (current(scope, token)) refresh();
    return result;
  };
  const onCrewUpdated = async event => {
    if (event?.kind !== 'crew_changed' || !livePermitted()) return;
    const scope = store.scope(), token = generation;
    let result;
    try { result = await ctx.crewLife?.nudge({force: true}); }
    catch { return; }
    if (!current(scope, token) || !livePermitted() || !result?.mapped?.accepted || result.stale) return;
    await refreshCase(undefined, scope, token);
    if (current(scope, token) && livePermitted()) {
      store.commit({notice: {reason: null, message: 'Your crew changed.'}});
    }
  };
  const onCaseHint = version => {
    if (!Number.isInteger(version) || version <= (state.case?.writeRevision ?? -1) || !livePermitted()) return;
    return refreshCase(version, store.scope(), generation);
  };
  ctx.onCrewRead = onCrewRead;
  ctx.onCrewChanged = onCrewChanged;
  ctx.onCrewUpdated = onCrewUpdated;
  ctx.onCaseHint = onCaseHint;
  const visibility = () => refresh();
  document?.addEventListener?.('visibilitychange', visibility);
  if (hidden) presence.setHidden(true);

  return {presence, refresh,
    reset() {
      if (disposed) return;
      generation += 1;
      presence.stop();
    },
    tick() { if (!disposed) presence.tick(); },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1;
      document?.removeEventListener?.('visibilitychange', visibility);
      if (ctx.onCrewRead === onCrewRead) ctx.onCrewRead = previous.onCrewRead;
      if (ctx.onCrewChanged === onCrewChanged) ctx.onCrewChanged = previous.onCrewChanged;
      if (ctx.onCrewUpdated === onCrewUpdated) ctx.onCrewUpdated = previous.onCrewUpdated;
      if (ctx.onCaseHint === onCaseHint) ctx.onCaseHint = previous.onCaseHint;
      presence.dispose();
    },
  };
}
