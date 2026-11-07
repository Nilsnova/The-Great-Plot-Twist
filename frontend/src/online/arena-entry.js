// One explicit-session owner coordinates the lazy module's singleton; it owns no duel state.
import {watchPanelServices} from './panel-services.js';
const moduleOwners = new WeakMap();
let nextRequest = 0;
const CLOSED = 'The ring is closed for now.', UNAVAILABLE = 'Something went wrong. Try again.';
const policyKeys = ['lease', 'practice', 'demo', 'lifetime', 'identity', 'ready', 'arena', 'capable'];
const samePolicy = (left, right) => left && right && policyKeys.every(key => Object.is(left[key], right[key]));
function safely(callback, fallback) { try { return callback(); } catch { return fallback; } }
function observe(callback) {
  try { const result = callback(); result?.catch?.(() => {}); } catch { /* UI cleanup cannot interrupt another owner. */ }
}

export function createArenaEntry({session, container, resetInput, focus, onSignIn, notify,
  search, dev = import.meta.env.DEV, load = () => import('../screens/duels/index.js')} = {}) {
  let disposed = false, epoch = 0, providerVersion = 0, lease = null, policy = null;
  let stopLease = null, stopWatch = null, context = null, module = null, loading = null, pending = null, held = null;
  const selection = () => {
    const value = typeof search === 'function' ? safely(search, '') : search ?? globalThis.location?.search ?? '';
    const params = new URLSearchParams(value);
    return {practice: dev === true && params.get('arena') === 'local', demo: params.get('demo') === '1'};
  };
  function readPolicy() {
    const chosen = selection();
    if (chosen.practice) return {practice: true};
    return safely(() => ({lease, practice: false, demo: chosen.demo, lifetime: lease?.getLifetime(),
      identity: lease?.getIdentity(), ready: lease?.isReady() === true, arena: lease?.getFlags()?.arena === true,
      capable: ['get', 'post', 'publicGet'].every(key => typeof lease?.request?.[key] === 'function')
        && typeof lease?.getIdentity === 'function' && typeof lease?.onIdentityChange === 'function'}), {practice: false});
  }
  const enabled = value => value.practice || !value.demo && value.ready && value.arena && value.capable && value.lifetime != null;
  const owns = owner => !!owner && moduleOwners.get(owner.module) === owner.token;
  const say = message => observe(() => notify?.(message));
  function close() {
    epoch += 1; pending = null;
    if (owns(held)) observe(() => held.module.closeArena());
  }
  function invalidate() {
    epoch += 1; pending = null; context = null;
    const previous = held; held = null;
    if (owns(previous)) {
      moduleOwners.delete(previous.module);
      observe(() => previous.module.disposeArena());
    }
  }
  function changed() {
    if (disposed) return;
    const next = readPolicy();
    if (!samePolicy(policy, next)) { policy = next; invalidate(); }
  }
  function adopt(next) {
    if (disposed || next === lease) return;
    const version = ++providerVersion, previousStop = stopLease;
    lease = next; stopLease = null;
    observe(() => previousStop?.()); invalidate();
    if (disposed || lease !== next || version !== providerVersion) return;
    policy = readPolicy();
    const stop = next?.subscribe(changed);
    if (disposed || lease !== next || version !== providerVersion) observe(() => stop?.());
    else stopLease = stop ?? null;
  }
  function getContext(practice) {
    if (context) return context;
    const ui = {container, resetInput, focus, onSignIn};
    // Practice receives no live capability; a mismatched module/dev selection fails closed.
    context = practice ? {...ui, getIdentity: () => null, onIdentityChange: () => () => {}} : {...ui, request: lease.request, getIdentity: lease.getIdentity,
      onIdentityChange: lease.onIdentityChange, getFlags: lease.getFlags, getToken: lease.getToken};
    return context;
  }
  function current(task) {
    if (disposed || pending !== task || epoch !== task.epoch) return false;
    const next = readPolicy();
    const valid = enabled(next) && samePolicy(task.policy, next) && (task.practice
      || lease === task.lease && task.lease.current(task.ticket));
    return !!valid && !disposed && pending === task && epoch === task.epoch;
  }
  function loadModule() {
    if (module) return Promise.resolve(module);
    if (!loading) {
      const task = Promise.resolve(load()).then(next => {
        if (!next || !['openArena', 'closeArena', 'disposeArena', 'isArenaOpen'].every(key => typeof next[key] === 'function')) throw new TypeError();
        module = next; return next;
      }).finally(() => { if (loading === task) loading = null; });
      loading = task;
    }
    return loading;
  }
  async function run(task) {
    try {
      if (!current(task)) return;
      const next = await loadModule();
      if (!current(task)) {
        if (pending === task && epoch === task.epoch && owns(held)) invalidate();
        return;
      }
      const previous = moduleOwners.get(next);
      if (previous && previous.order > task.token.order) return;
      task.module = next;
      moduleOwners.set(next, task.token); held = task;
      const result = await next.openArena({...task.context, duelId: task.target});
      if (!current(task) || !owns(task)) {
        if (pending === task && epoch === task.epoch && owns(task)) invalidate();
        return;
      }
      return result;
    } catch {
      if (current(task) && (!task.module || owns(task))) {
        if (owns(task)) invalidate();
        say(UNAVAILABLE);
      }
    } finally { if (pending === task) pending = null; }
  }
  function open(duelId) {
    if (disposed) return Promise.resolve();
    const order = ++nextRequest;
    changed();
    const previous = pending, request = ++epoch; pending = null;
    // The actual panel focuses an already-open dialog; close first to honor a newer pending detail target.
    if (owns(held) && (previous || duelId !== undefined && !Object.is(held.target, duelId))) observe(() => held.module.closeArena());
    if (disposed || request !== epoch) return Promise.resolve();
    const selected = readPolicy();
    if (!enabled(selected)) { say(CLOSED); return Promise.resolve(); }
    const provider = lease, ticket = selected.practice ? null : provider.capture('arena');
    if ((!selected.practice && !ticket) || disposed || request !== epoch || provider !== lease) return Promise.resolve();
    const task = {epoch: request, policy: selected, lease: provider, ticket, practice: selected.practice,
      context: getContext(selected.practice), target: duelId, token: {order}, module: null};
    pending = task;
    return run(task);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; providerVersion += 1; invalidate();
    const previous = stopLease; stopLease = null;
    observe(() => previous?.()); observe(() => stopWatch?.()); stopWatch = null;
  }
  stopWatch = watchPanelServices(session, adopt);
  const hasPending = () => !!pending && (!pending.module || owns(pending));
  return {open, close, invalidate, dispose,
    get pending() { return hasPending(); },
    get active() { return !disposed && (hasPending() || owns(held) && safely(() => held.module.isArenaOpen(), false)); },
  };
}
