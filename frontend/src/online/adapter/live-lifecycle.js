// A4 cosmetics: live presence (positions and emotes). No extra transport or poller is installed.
import {createOnlinePresence} from './presence.js';

export function createLiveLifecycle(ctx, deps = {}) {
  const {store, state, document} = ctx;
  let disposed = false, hidden = Boolean(document?.hidden);
  const presence = createOnlinePresence(ctx, {loadRealtime: deps.loadRealtime, emit: deps.emit,
    supabaseUrl: deps.supabaseUrl, publishableKey: deps.publishableKey});

  function synchronize() {
    hidden = Boolean(document?.hidden);
    presence.setHidden(hidden);
  }
  function refresh() {
    if (disposed || store.isClosed()) return;
    try {
      synchronize();
      Promise.resolve(presence.refresh()).catch(() => {});
    } catch { /* Cosmetics cannot change an account outcome. */ }
  }
  const visibility = () => refresh();
  document?.addEventListener?.('visibilitychange', visibility);
  if (hidden) presence.setHidden(true);
  void state;

  return {presence, refresh,
    reset() { if (!disposed) presence.stop(); },
    tick() { if (!disposed) presence.tick(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      document?.removeEventListener?.('visibilitychange', visibility);
      presence.dispose();
    },
  };
}
