// Deferred market presentation belongs to one explicit session and the current private service lease.
import {watchPanelServices} from './panel-services.js';
import {createMarketPolicy} from './market-policy.js';

const safely = (read, fallback = null) => { try { return read(); } catch { return fallback; } };
const unavailable = () => Promise.resolve({ok: false, status: 503, code: 'not_ready', message: ''});
const localPolicy = () => ({request: unavailable, publicGet: unavailable, getToken: () => null,
  getIdentity: () => null, onSessionChange: () => () => {}, dispose() {}});
const same = (a, b) => a?.lease === b?.lease && Object.is(a?.lifetime, b?.lifetime)
  && Object.is(a?.identity, b?.identity) && a?.ready === b?.ready && a?.market === b?.market;

export function createMarketHost({session, container, resetInput, focusGame, openShareholderRegister,
  onSignIn, notify, search = globalThis.location?.search ?? '', dev = import.meta.env.DEV,
  load = () => import('../screens/market/index.js'), watchServices = watchPanelServices}) {
  const query = new URLSearchParams(search), local = dev === true && query.get('market') === 'local';
  const demo = query.get('demo') === '1';
  let stopped = false, lease = null, snapshot = null, policy = null, entry = null;
  let stopWatch = null, stopLease = null, sampling = false, generation = 0, openEpoch = 0;
  let pending = null, loading = null, module = null, reopenWanted = false;

  function state() {
    const provider = lease;
    if (local) return {lease: null, ready: true, market: false, identity: null, lifetime: null};
    if (!provider) return {lease: null, ready: false, market: false, identity: null, lifetime: null};
    const ready = safely(() => provider.isReady(), false) === true;
    const result = {lease: provider, ready: ready && !demo,
      market: safely(() => provider.getFlags()?.market, false) === true,
      identity: safely(() => provider.getIdentity()), lifetime: safely(() => provider.getLifetime())};
    return provider === lease ? result : null;
  }
  function retire() {
    generation += 1; openEpoch += 1; pending = null;
    const oldEntry = entry, oldPolicy = policy; entry = policy = null;
    safely(() => oldEntry?.dispose()); safely(() => oldPolicy?.dispose());
  }
  function sync() {
    if (stopped || sampling) return;
    sampling = true; const next = state(); sampling = false;
    if (stopped || !next || same(snapshot, next)) return;
    const lostAccount = snapshot?.identity != null && next.identity === null
      && safely(() => session.isSignedIn(), false) !== true;
    if (lostAccount) reopenWanted = false; // Account expiry owns attention; prices need a fresh public intent.
    else reopenWanted ||= pending === null && safely(() => entry?.active, false) === true;
    retire();
    if (stopped || next.lease !== lease) return;
    snapshot = next;
    policy = local ? localPolicy() : next.lease ? createMarketPolicy(next.lease) : null;
    if (reopenWanted && next.ready) void open();
  }
  function useProvider(next) {
    if (stopped || local || next === lease) return;
    safely(() => stopLease?.()); stopLease = null; lease = next;
    const unsubscribe = safely(() => next?.subscribe(sync));
    stopLease = typeof unsubscribe === 'function' ? unsubscribe : null;
    if (stopped || next !== lease) { safely(() => stopLease?.()); stopLease = null; return; }
    sync();
  }
  const current = (owner, request, held, ticket) => !stopped && generation === owner
    && openEpoch === request && policy === held && snapshot?.ready === true
    && (local || safely(() => lease.current(ticket), false) === true);
  function getModule() {
    if (module) return Promise.resolve(module);
    if (!loading) {
      const task = Promise.resolve().then(load).then(value => { if (!stopped) module = value; return value; });
      loading = task;
      task.then(() => { if (loading === task) loading = null; }, () => { if (loading === task) loading = null; });
    }
    return loading;
  }
  async function open() {
    if (stopped) return false;
    sync();
    if (!snapshot?.ready || !policy) {
      safely(() => notify?.('The Island Exchange is not ready yet. You can keep exploring.'));
      return false;
    }
    const held = policy, owner = generation, request = ++openEpoch;
    const ticket = local ? null : safely(() => lease.capture('market', {allowFlagOff: true, privateRead: false}));
    if (!current(owner, request, held, ticket)) return false;
    const task = {request, promise: null};
    task.promise = (async () => {
      try {
        if (!entry) {
          const loaded = await getModule();
          if (!current(owner, request, held, ticket)) return false;
          const created = loaded.createMarketEntry({container, resetInput, focusGame, openShareholderRegister,
            onSignIn, request: held.request, publicGet: held.publicGet, getToken: held.getToken,
            getIdentity: held.getIdentity, onSessionChange: held.onSessionChange});
          if (!current(owner, request, held, ticket)) { safely(() => created?.dispose()); return false; }
          entry = created;
        }
        const opened = entry;
        await opened.open();
        const accepted = current(owner, request, held, ticket) && entry === opened && opened.active === true;
        if (accepted) reopenWanted = false;
        return accepted;
      } catch {
        if (current(owner, request, held, ticket)) safely(() => notify?.('The Island Exchange could not open. Try again.'));
        return false;
      } finally { if (pending === task) pending = null; }
    })();
    pending = task;
    return task.promise;
  }
  function close() {
    const active = pending !== null || safely(() => entry?.active, false) === true;
    openEpoch += 1; pending = null; reopenWanted = false; safely(() => entry?.close());
    return active;
  }
  function dispose() {
    if (stopped) return;
    stopped = true; safely(() => stopWatch?.()); safely(() => stopLease?.());
    stopWatch = stopLease = null; retire(); lease = snapshot = module = null; reopenWanted = false;
  }
  if (local) sync();
  else {
    const unsubscribe = safely(() => watchServices(session, useProvider));
    stopWatch = typeof unsubscribe === 'function' ? unsubscribe : null;
    if (stopped) safely(() => stopWatch?.());
  }
  return {open, close, dispose,
    get active() { return pending !== null || safely(() => entry?.active, false) === true; },
    get pending() { return pending !== null; }};
}
