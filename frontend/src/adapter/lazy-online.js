// Keep the account transport out of the first title paint; intents can start it sooner.
import {createUnavailableCaseAdapter} from './unavailable.js';
import {bindCaseMethods} from './contract.js';

export function createLazyOnlineAdapter({load = () => import('../online/case-adapter/index.js'), deps} = {}) {
  const empty = createUnavailableCaseAdapter();
  const view = {...empty.read(), mode: 'online', notice: null};
  view.account.canSignIn = false;
  empty.dispose();
  const listeners = new Set();
  let adapter, pending, stop, closed = false, frame;
  let authAdopted = false, authReleased = false;
  function releaseAuth() {
    if (authAdopted || authReleased) return;
    authReleased = true;
    deps?.auth?.dispose?.();
  }
  function publish(event) {
    for (const listener of listeners) {
      try { listener({...event, view: structuredClone(event.view)}); } catch { /* Isolate observers. */ }
    }
  }
  async function start() {
    if (closed) return null;
    if (adapter) return adapter;
    if (pending) return pending;
    pending = load().then(({createRealCaseAdapter}) => {
      const loaded = createRealCaseAdapter(deps);
      authAdopted = true;
      if (closed) { loaded.dispose(); return null; }
      adapter = loaded;
      stop = adapter.subscribe(publish);
      publish({type: 'case_updated', view: adapter.read()});
      return adapter;
    }).catch(() => {
      releaseAuth();
      if (closed) return null;
      adapter = createUnavailableCaseAdapter({message:
        'The account service could not load. You can still play Act 1.'});
      stop = adapter.subscribe(publish);
      publish({type: 'case_updated', view: adapter.read()});
      return adapter;
    });
    return pending;
  }
  if (typeof requestAnimationFrame === 'function') {
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => void start()); });
  }
  const read = () => adapter ? adapter.read() : structuredClone(view);
  return bindCaseMethods({
    read, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    tick(dt) { adapter?.tick(dt); },
    dispose() {
      closed = true;
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      stop?.(); adapter?.dispose(); listeners.clear();
      releaseAuth();
    },
  }, async (name, args) => {
    const ready = await start();
    return ready ? ready[name](...args)
      : {accepted: false, reason: 'disposed', message: 'This client has closed.', view: read()};
  });
}
