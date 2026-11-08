// The game owns presentation; its exact session's factory owns the private islet adapter.
import {watchPanelServices} from './panel-services.js';

const refused = code => ({accepted: false, code, message: ''});
export function createIsletHost({session, attach, resetWorld, isDemo = () => false,
  watchServices = watchPanelServices, search = globalThis.location?.search ?? '',
  dev = import.meta.env.DEV, ...options}) {
  const local = dev && new URLSearchParams(search).get('islet') === 'local';
  const makeHost = extra => attach({...options, search, dev, transport: null,
    onPrivateReset: resetWorld, ...extra});
  if (local) return makeHost({});
  let stopped = false, lease = null, stopLease = null, stopWatch = null;
  let generation = 0, openRequest = 0, opening = false, pending = null;
  let attachedLease = null, attachedIdentity = null, attachedLifetime = null, liveHost = false;
  let host = makeHost({});
  const signedIdentity = () => !isDemo() && lease?.isReady() === true
    ? lease.getIdentity() : null;
  const current = (owner, provider, identity, lifetime) => {
    const nextIdentity = signedIdentity(), nextLifetime = lease?.getLifetime();
    return !stopped && generation === owner && lease === provider
      && Object.is(nextIdentity, identity) && Object.is(nextLifetime, lifetime);
  };

  function replaceHost(extra, owner) {
    const previous = host; host = null; previous?.();
    if (stopped || generation !== owner) return false;
    resetWorld?.();
    if (stopped || generation !== owner) return false;
    const next = makeHost(extra);
    if (stopped || generation !== owner) { next?.(); return false; }
    host = next; return true;
  }
  function sync(force = false) {
    if (stopped) return;
    const provider = lease, identity = signedIdentity(), lifetime = provider?.getLifetime();
    if (stopped || provider !== lease) return;
    if (!force && attachedLease === provider && Object.is(attachedIdentity, identity)
      && Object.is(attachedLifetime, lifetime)) return;
    const owner = ++generation;
    attachedLease = provider; attachedIdentity = identity; attachedLifetime = lifetime;
    openRequest += 1; opening = false; pending = null; liveHost = false;
    if (!replaceHost({}, owner)) return;
    if (identity === null || identity === undefined) return;
    const task = {promise: null};
    task.promise = (async () => {
      let adapter;
      try { adapter = await provider.getIslet(); } catch { return refused('not_connected'); }
      if (!adapter || !current(owner, provider, identity, lifetime)) return refused('session_expired');
      if (!replaceHost({suppliedAdapter: adapter,
        canAsk: () => current(owner, provider, identity, lifetime),
        onSessionChange: provider.onSessionChange}, owner)) return refused('session_expired');
      liveHost = true;
      const result = await host.refresh();
      return current(owner, provider, identity, lifetime) ? result : refused('session_expired');
    })().catch(() => refused('not_connected')).finally(() => {
      if (pending === task) pending = null;
    });
    pending = task;
  }
  function useProvider(next) {
    if (stopped || next === lease) return;
    stopLease?.(); stopLease = null; lease = next;
    stopLease = lease?.subscribe(() => sync());
    sync();
  }
  stopWatch = watchServices(session, useProvider);

  function close() {
    const active = opening || host?.active === true;
    openRequest += 1; opening = false; host?.close?.();
    return active;
  }
  async function open(plot = 'islet_signal_station') {
    if (stopped) return false;
    if (!liveHost && !pending && signedIdentity() !== null) sync(true);
    const request = ++openRequest; opening = true;
    try {
      if (pending) await pending.promise;
      if (stopped || request !== openRequest) return false;
      return await host.open(plot);
    } finally { if (request === openRequest) opening = false; }
  }
  function refresh() {
    if (stopped) return Promise.resolve(refused('disposed'));
    if (!liveHost && !pending && signedIdentity() !== null) sync(true);
    if (stopped || !host) return Promise.resolve(refused(stopped ? 'disposed' : 'not_connected'));
    return pending?.promise ?? host.refresh();
  }
  function stop() {
    if (stopped) return;
    stopped = true; generation += 1; openRequest += 1; opening = false;
    stopWatch?.(); stopLease?.(); stopWatch = stopLease = null;
    pending = null; host?.(); host = null; lease = null;
  }
  stop.open = open; stop.close = close; stop.refresh = refresh;
  Object.defineProperty(stop, 'active', {get: () => opening || host?.active === true});
  return stop;
}
