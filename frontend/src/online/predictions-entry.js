// The explicit session owns one lazy desk. Ordinary close keeps its same-account attempt owner.
import {watchPanelServices} from './panel-services.js';
const safely = (read, fallback = null) => { try { return read(); } catch { return fallback; } };
const observe = callback => { const result = safely(callback); safely(() => result?.catch?.(() => {})); };
const CLOSED = 'The prediction desk is closed for now.', UNAVAILABLE = 'Something went wrong. Try again.';
const keys = ['lease', 'lifetime', 'identity', 'ready', 'predictions', 'capable', 'practice'];
const same = (left, right) => !!left && !!right && keys.every(key => Object.is(left[key], right[key]));
const deny = async () => ({ok: false, status: 503, code: 'not_ready', message: CLOSED});
const deniedRequests = Object.freeze({get: deny, post: deny, publicGet: deny});

export function createPredictionsEntry({session, container, resetInput, focus, onSignIn, notify,
  search = globalThis.location?.search ?? '', dev = import.meta.env.DEV, document = globalThis.document,
  load = () => import('../screens/predictions/desk.js'), watchServices = watchPanelServices} = {}) {
  const selectedSearch = typeof search === 'function' ? safely(search, '') : search;
  const params = new URLSearchParams(selectedSearch), practice = dev === true && params.get('desk') === 'local';
  const demo = params.get('demo') === '1';
  let disposed = false, epoch = 0, providerVersion = 0, lease = null, policy = null, context = null;
  let stopLease = null, stopWatch = null, module = null, desk = null, pending = null, deskOwner = null;
  function readPolicy() {
    if (practice) return {practice: true};
    const provider = lease;
    return safely(() => ({lease: provider, lifetime: provider?.getLifetime(), identity: provider?.getIdentity(),
      ready: provider?.isReady() === true, predictions: provider?.getFlags()?.predictions === true, practice: false,
      capable: ['get', 'post', 'publicGet'].every(key => typeof provider?.request?.[key] === 'function')
        && ['getFlags', 'getIdentity', 'onIdentityChange', 'capture', 'current', 'subscribe']
          .every(key => typeof provider?.[key] === 'function')}), {lease: provider, practice: false});
  }
  const enabled = value => value?.practice || !demo && value?.ready && value.predictions && value.capable && value.lifetime != null;
  function invalidate() {
    epoch += 1; pending = null; context = null;
    const previous = desk; desk = null; deskOwner = null;
    observe(() => previous?.dispose());
  }
  function changed() {
    if (disposed) return;
    const next = readPolicy();
    if (next.lease !== lease && !practice) return;
    if (!same(policy, next)) { policy = next; invalidate(); }
  }
  function adopt(next) {
    if (disposed || next === lease) return;
    const version = ++providerVersion, previous = stopLease;
    stopLease = null; lease = next; policy = null; invalidate(); observe(() => previous?.());
    if (disposed || lease !== next || version !== providerVersion) return;
    policy = readPolicy();
    const stop = safely(() => next?.subscribe(changed));
    if (disposed || lease !== next || version !== providerVersion) observe(() => stop?.());
    else stopLease = typeof stop === 'function' ? stop : null;
  }
  function getContext() {
    if (!context) context = {container, resetInput, focus, document, search: selectedSearch,
      onSignIn: practice ? () => {} : onSignIn,
      request: practice ? deniedRequests : lease.request,
      getFlags: practice ? () => ({predictions: false}) : lease.getFlags,
      getIdentity: practice ? () => null : lease.getIdentity,
      onIdentityChange: practice ? () => () => {} : lease.onIdentityChange};
    return context;
  }
  function current(task) {
    if (disposed || pending !== task || epoch !== task.epoch) return false;
    changed();
    if (disposed || pending !== task || epoch !== task.epoch) return false;
    const next = readPolicy(), valid = enabled(next) && same(task.policy, next) && (practice
      || lease === task.lease && safely(() => task.lease.current(task.ticket), false) === true);
    return !!valid && !disposed && pending === task && epoch === task.epoch;
  }
  function closeStale(task) {
    if (desk === task.desk && deskOwner === task.epoch) observe(() => task.desk?.close());
  }
  async function run(task) {
    try {
      if (!current(task)) return false;
      const loaded = module ?? await Promise.resolve().then(() => current(task) ? load() : null);
      if (!current(task)) return false;
      if (typeof loaded?.createDesk !== 'function') throw new TypeError();
      module = loaded;
      let active = desk;
      if (!active) {
        active = loaded.createDesk(task.context);
        if (!current(task)) { observe(() => active?.dispose()); return false; }
        desk = active;
      }
      task.desk = active; deskOwner = task.epoch;
      if (!current(task)) { closeStale(task); return false; }
      await active.open();
      if (!current(task)) { closeStale(task); return false; }
      return true;
    } catch {
      closeStale(task);
      if (!disposed && pending === task && epoch === task.epoch) observe(() => notify?.(UNAVAILABLE));
      return false;
    } finally { if (pending === task) pending = null; }
  }
  function open() {
    if (disposed) return Promise.resolve(false);
    changed();
    if (pending && current(pending)) return pending.promise;
    const selected = readPolicy();
    if (!enabled(selected)) { observe(() => notify?.(CLOSED)); return Promise.resolve(false); }
    const owner = ++epoch, provider = lease;
    const ticket = practice ? null : safely(() => provider.capture('predictions'));
    changed();
    if ((!practice && !ticket) || disposed || epoch !== owner || provider !== lease || !same(selected, readPolicy()))
      return Promise.resolve(false);
    const task = {epoch: owner, lease: provider, policy: selected, ticket, context: getContext(), desk: null, promise: null};
    pending = task; task.promise = Promise.resolve().then(() => run(task)); return task.promise;
  }
  function close() {
    const active = !!pending || safely(() => desk?.active === true, false);
    epoch += 1; pending = null; observe(() => desk?.close()); return active;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; providerVersion += 1; invalidate();
    const oldLease = stopLease, oldWatch = stopWatch; stopLease = stopWatch = null; lease = null;
    observe(() => oldLease?.()); observe(() => oldWatch?.());
  }
  if (!practice && !demo) {
    const stop = safely(() => watchServices(session, adopt));
    if (disposed) observe(() => stop?.()); else stopWatch = typeof stop === 'function' ? stop : null;
  }
  return {open, close, dispose,
    get pending() { return !disposed && !!pending; },
    get active() { return !disposed && (!!pending || safely(() => desk?.active === true, false)); }};
}
