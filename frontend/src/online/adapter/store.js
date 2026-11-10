// Private adapter state and cloned public delivery. Screens receive only the view mapper's fields.
import {composeRealView} from './view.js';

export function createAdapterStore({session} = {}) {
  const state = {
    revision: 0, now: 0, accountState: session.isSignedIn() ? 'signed_in' : 'signed_out',
    me: null, nameReply: null, notice: null, config: null,
  };
  const listeners = new Set();
  let closed = false;
  let epoch = 0;
  let view = composeRealView(state);
  const read = () => structuredClone(view);

  function commit(patch = {}, {advanceRevision = true} = {}) {
    if (closed) return;
    Object.assign(state, patch);
    if (advanceRevision) state.revision += 1;
    view = composeRealView(state);
    for (const listener of listeners) {
      try { listener({type: 'view_updated', view: read()}); } catch { /* Isolate broken listeners. */ }
    }
  }
  function answer(result) {
    const {recovery, ...publicResult} = result;
    if (!closed) commit({notice: {reason: result.reason, message: result.message || ''}});
    return {...publicResult, view: read()};
  }
  return {
    state, read, commit, answer,
    isClosed: () => closed,
    scope: () => epoch,
    isCurrent: token => !closed && token === epoch,
    invalidate() { epoch += 1; },
    subscribe(listener) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() { closed = true; epoch += 1; listeners.clear(); },
  };
}
