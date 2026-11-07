// Defer auth until needed; sign-out and teardown invalidate delayed imports and private results.
import {createAuthStorage} from './auth-storage.js';

export function createLazyAuth({loadAuth = () => import('./auth.js'), ...options} = {}) {
  const configured = Boolean(options.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL)
    && Boolean(options.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const storage = options.storage ?? createAuthStorage();
  const listeners = new Set();
  let state = {state: 'signed_out', message: configured ? '' : 'Sign-in is not set up on this build.', configured};
  let instance = null, pending = null, leaving = null, generation = 0, disposed = false;
  const read = () => ({...state});
  const current = token => !disposed && token === generation;
  function publish(next) {
    if (disposed) return;
    state = {...next};
    for (const listener of listeners) {
      try { listener(read()); } catch { /* Keep auth independent of screen errors. */ }
    }
  }
  function failed(method) {
    if (method === 'getAccessToken') return null;
    if (method === 'readOwnLedger') return {ok: false, rows: []};
    if (method === 'readCrewMemberIds') return {ok: false, ids: []};
    if (method === 'readCrewSeats') return {ok: false, status: 0, seats: []};
    return {ok: false, ...read()};
  }
  function load() {
    if (disposed) return Promise.resolve(null);
    if (instance) return Promise.resolve(instance);
    if (pending) return pending.promise;
    const task = {generation, promise: null};
    task.promise = Promise.resolve().then(loadAuth).then(({createAuth}) => {
      if (!current(task.generation)) return null;
      const record = {auth: null, generation: task.generation};
      record.auth = createAuth({...options, storage, onState: next => {
        if (instance === record && current(record.generation)) publish(next);
      }});
      if (!current(task.generation)) { record.auth.dispose(); return null; }
      instance = record;
      return record;
    }).catch(() => {
      if (current(task.generation)) publish({...state, state: 'error', message: 'Sign-in could not load. Try again.'});
      return null;
    }).finally(() => { if (pending === task) pending = null; });
    pending = task;
    return task.promise;
  }
  async function invoke(method, ...args) {
    if (!configured || disposed) return failed(method);
    const token = generation;
    try {
      if (leaving) await leaving;
      if (!current(token)) return failed(method);
      const record = await load();
      if (!record || !current(token)) return failed(method);
      const result = await record.auth[method](...args);
      return current(token) && instance === record ? result : failed(method);
    } catch {
      if (current(token)) publish({...state, state: 'error', message: 'Sign-in could not complete. Try again.'});
      return failed(method);
    }
  }
  function signOut() {
    if (disposed) return Promise.resolve(failed('signOut'));
    if (leaving) return leaving;
    const token = ++generation;
    pending = null;
    const record = instance;
    if (record) record.generation = token;
    let logout;
    try { logout = record?.auth.signOut(); } catch { /* Clear owned persistence below. */ }
    options.session?.clearToken();
    if (!record) storage.clearSession();
    publish({...state, state: 'signed_out', message: ''});
    const task = Promise.resolve(logout).catch(() => {}).then(() => {
      if (current(token)) storage.clearSession();
      return {ok: current(token), ...read()};
    }).finally(() => { if (leaving === task) leaving = null; });
    leaving = task;
    return task;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; pending = null;
    listeners.clear(); instance?.auth.dispose(); instance = null;
    storage.close({clear: false});
  }
  return {
    read,
    subscribe(listener) {
      if (disposed || typeof listener !== 'function') return () => {};
      listeners.add(listener); return () => listeners.delete(listener);
    },
    signIn: () => invoke('signIn'), restore: () => invoke('restore'), renew: () => invoke('renew'),
    getAccessToken: () => invoke('getAccessToken'),
    readOwnLedger: () => invoke('readOwnLedger'), readCrewMemberIds: id => invoke('readCrewMemberIds', id),
    readCrewSeats: id => invoke('readCrewSeats', id),
    signOut, dispose,
  };
}
