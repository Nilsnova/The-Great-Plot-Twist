// Visible forming crews refresh at five seconds. The read monitor alone schedules failed-read retries.
const EVERY_MS = 5000;
const modalParts = '.case-modal,.account-modal,.case-crew';

export function createCrewPolling(ctx, {isVisible, setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout} = {}) {
  const {store, state, session, document, window} = ctx, now = ctx.now ?? Date.now;
  const visible = isVisible ?? (() => {
    if (!document?.querySelector || document.querySelector('.account-modal[open]')) return false;
    const screen = document.querySelector('.case-modal[open] .case-crew');
    if (!screen || screen.isConnected === false || screen.closest?.('[hidden]')) return false;
    if (!screen.getClientRects?.().length) return false;
    const style = (window ?? document.defaultView)?.getComputedStyle?.(screen);
    return style?.display !== 'none' && !['hidden', 'collapse'].includes(style?.visibility);
  });
  let disposed = false, generation = 0, scope = store.scope(), timer = null;
  let blocked = false, nextAt = now() + EVERY_MS, pending = null;
  const live = () => !disposed && !store.isClosed();
  const privateReady = () => live() && session.isSignedIn() && !document?.hidden;
  const accountReady = () => privateReady() && state.accountState === 'signed_in'
    && state.crew?.status === 'forming';
  const allowed = () => accountReady() && visible() === true;
  const current = task => live() && task.generation === generation && store.isCurrent(task.scope)
    && session.isSignedIn();
  function clear() { if (timer !== null) clearTimer(timer); timer = null; }
  function syncScope() {
    if (scope === store.scope()) return;
    scope = store.scope(); generation += 1; clear(); pending = null;
    blocked = false; nextAt = now() + EVERY_MS;
  }
  function record(result) {
    if (result?.stale) return;
    blocked = result?.mapped?.accepted !== true;
    nextAt = now() + EVERY_MS; clear();
  }
  function startRead(force = false) {
    if (pending) return pending.promise;
    clear();
    const task = {scope, generation, promise: null};
    task.promise = Promise.resolve().then(() => {
      if (!current(task) || !privateReady() || (!force && !allowed())) return;
      return ctx.transport.read('crew', {automatic: true});
    }).then(result => {
      if (result && !result.stale && current(task)) record(result);
      return result;
    }, error => {
      if (current(task)) { blocked = true; clear(); }
      throw error;
    }).finally(() => {
      if (pending === task) { pending = null; refresh(); }
    });
    pending = task;
    return task.promise;
  }
  function arm() {
    if (timer !== null || pending || blocked || !allowed()) return;
    const token = generation;
    timer = setTimer(() => {
      timer = null;
      if (live() && token === generation) void nudge().catch(() => {});
    }, Math.max(0, nextAt - now()));
    timer?.unref?.();
  }
  // External hydration/mutation reads report their captured scope; stale results cannot release a failed read.
  function refresh({result, scope: resultScope} = {}) {
    if (!live()) { clear(); return; }
    syncScope();
    if (result && !result.stale && resultScope === scope && store.isCurrent(resultScope)) {
      if (result.fresh === true && pending) {
        generation += 1; pending = null;
      }
      record(result);
    }
    if (!accountReady()) { clear(); return; }
    if (!allowed()) { clear(); return; }
    arm();
  }
  // Pushes and membership changes may force an authoritative read with the modal closed/non-forming.
  // Initial hydration and read-monitor recovery continue through their existing C1 paths.
  function nudge({force = false} = {}) {
    const forced = force === true;
    if (!live()) return Promise.resolve();
    syncScope();
    if (!privateReady()) { clear(); return Promise.resolve(); }
    if (pending) return pending.promise;
    if (!forced && (!allowed() || blocked)) { clear(); return Promise.resolve(); }
    return startRead(forced);
  }
  const changed = () => refresh();
  const stopSession = session.onChange?.(changed);
  document?.addEventListener?.('visibilitychange', changed);
  window?.addEventListener?.('focus', changed);
  const Observer = window?.MutationObserver ?? document?.defaultView?.MutationObserver;
  const observer = Observer && document?.documentElement ? new Observer(records => {
    if (records.some(record => record.type === 'attributes' ? record.target?.matches?.(modalParts) : [...record.addedNodes ?? [], ...record.removedNodes ?? []]
      .some(node => node.nodeType === 1 && (node.matches?.(modalParts) || node.querySelector?.(modalParts))))) refresh();
  }) : null;
  observer?.observe(document.documentElement, {subtree: true, childList: true,
    attributes: true, attributeFilter: ['open', 'hidden']});
  function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; clear(); pending = null; observer?.disconnect();
    stopSession?.(); document?.removeEventListener?.('visibilitychange', changed);
    window?.removeEventListener?.('focus', changed);
  }
  return {refresh, nudge, dispose};
}
