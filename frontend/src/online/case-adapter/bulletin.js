// The optional public bulletin has its own cache and lifetime; no account client or token is read here.
import {validBulletinReply, emptyOnlineBulletin, onlineBulletinView, bulletinObservations} from './bulletin-view.js';

export const BULLETIN_CACHE_MS = 300000;
const retryDelays = [5000, 15000, 30000];
const staleMessage = 'This is the last posted bulletin. The latest update is unavailable.';
const unavailableMessage = 'The harbor bulletin is unavailable right now.';
const empty = (...args) => ({...emptyOnlineBulletin(...args), request: null});
const requestMessages = {
  offline: 'You are offline. Your progress on this device is kept.',
  internal_error: 'The public bulletin could not be read. Try again or report a problem.',
  not_connected: 'The harbor bulletin is unavailable right now. Try again in a moment.',
  rate_limited: 'Too many attempts. Try again in a moment.',
  feature_off: 'The harbor bulletin is closed. You can keep exploring.',
};
function publicFailure(reply) {
  const status = Number.isInteger(reply.status) && reply.status >= 0 && reply.status <= 599 ? reply.status : undefined;
  const reason = status === 404 && ['feature_off', 'feature_disabled'].includes(reply.code) ? 'feature_off'
    : status === 0 ? 'offline' : status === 429 ? 'rate_limited' : status === 503 ? 'not_connected' : 'internal_error';
  return {reason, message: requestMessages[reason], ...(status !== undefined ? {status} : {})};
}
export function createOnlineBulletin(ctx, {publicApi = ctx.publicApi, now = ctx.now ?? Date.now,
  document = ctx.document, window = ctx.window, setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout, onRead = () => {}} = {}) {
  if (typeof publicApi?.get !== 'function') throw new TypeError('The bulletin needs a public API.');
  let view = empty(), lastGood = null, nextAt = 0, failures = 0, retryUntil = 0;
  let generation = 0, pending = null, timer = null, closed = false;
  const live = () => !closed && !ctx.store.isClosed();
  const enabled = () => ctx.state.config?.flags?.bulletin === true;
  const scope = () => ctx.store.scope?.() ?? 0;
  let ownerScope = scope();
  const current = task => live() && enabled() && task.generation === generation && task.scope === scope();
  const read = () => structuredClone(live() && enabled() && ownerScope === scope() ? view : empty());
  const answer = (ok, reason = null) => ({ok, reason, bulletin: read()});
  function publish(next) {
    if (!live()) return;
    view = next;
    ctx.store.commit({bulletin: read(), bulletinObservations: bulletinObservations(view)});
  }
  function clear() { if (timer !== null) clearTimer(timer); timer = null; }
  function arm() {
    clear();
    if (!live() || !enabled() || document?.hidden || pending || !Number.isFinite(nextAt)) return;
    timer = setTimer(() => { timer = null; void refresh(); }, Math.max(0, nextAt - now()));
    timer?.unref?.();
  }
  function finishRead(task, result) {
    const finish = task?.finish;
    if (task) task.finish = null;
    try { finish?.(result); } catch { /* Read observers cannot interrupt cleanup or public data. */ }
  }
  function stop() {
    const stopped = pending;
    generation += 1; pending = null; clear();
    lastGood = null; nextAt = 0; failures = 0; retryUntil = 0; ownerScope = scope(); view = empty();
    finishRead(stopped, {status: 0, accepted: true, reason: null, cancelled: true});
    publish(view);
  }
  function applyReply(reply) {
    if (reply.ok && validBulletinReply(reply.data)) {
      lastGood = onlineBulletinView(reply.data); failures = 0; retryUntil = 0; nextAt = now() + BULLETIN_CACHE_MS;
      publish({...onlineBulletinView(lastGood), request: null});
      return answer(true);
    }
    const request = publicFailure(reply), at = now(), seconds = reply.retryAfterSeconds;
    retryUntil = request.reason === 'rate_limited' ? at + (typeof seconds === 'number' && Number.isFinite(seconds)
      && seconds >= 0 && seconds <= 86400 ? Math.ceil(seconds) * 1000 : 0) : 0;
    if (request.reason === 'rate_limited') request.retryUntil = retryUntil;
    if (request.reason === 'feature_off') {
      lastGood = null; failures = 0; nextAt = Infinity;
      publish({...empty(), request});
      return answer(false, 'feature_off');
    }
    if (reply.status === 503 && reply.code === 'bulletin_unavailable') lastGood = null;
    nextAt = failures < retryDelays.length ? Math.max(at + retryDelays[failures], retryUntil) : Infinity;
    failures += 1;
    publish({...(lastGood ? onlineBulletinView(lastGood, {stale: true, message: staleMessage})
      : empty('unavailable', unavailableMessage)), request});
    return answer(false, request.reason);
  }
  function refresh({force = false} = {}) {
    if (!live()) return Promise.resolve(answer(false, 'disposed'));
    if (ownerScope !== scope()) stop();
    if (!enabled()) { stop(); return Promise.resolve(answer(false, 'feature_off')); }
    if (view.status === 'off' && view.request?.reason === 'feature_off') return Promise.resolve(answer(false, 'feature_off'));
    if (document?.hidden) return Promise.resolve(answer(false, 'not_ready'));
    if (pending?.scope === scope()) return pending.promise;
    if (pending) {
      generation += 1;
      finishRead(pending, {status: 0, accepted: true, reason: null, cancelled: true});
      pending = null;
    }
    if (now() < retryUntil) { arm(); return Promise.resolve(answer(false, 'rate_limited')); }
    if (!force && now() < nextAt) { arm(); return Promise.resolve(answer(view.status === 'ready')); }
    if (force) failures = 0;
    clear();
    const task = {generation, scope: scope(), promise: null, finish: null, started: false};
    pending = task;
    task.promise = Promise.resolve().then(() => {
      if (!current(task) || document?.hidden) return null;
      try { task.finish = onRead({kind: 'bulletin', retry: () => refresh({force: true})}); }
      catch { /* Optional presentation monitoring cannot block the public read. */ }
      if (!current(task) || document?.hidden) return null;
      task.started = true;
      return publicApi.get('/api/bulletin');
    }).catch(() => ({ok: false, status: 0, code: 'network_error'})).then(reply => {
        if (!task.started || !current(task)) {
          if (live() && !enabled() && task.generation === generation) stop();
          if (live() && enabled() && task.generation === generation) nextAt = now();
          finishRead(task, {status: 0, accepted: true, reason: null, cancelled: true});
          return answer(false, 'not_ready');
        }
        const result = applyReply(reply ?? {ok: false, status: 0});
        finishRead(task, {status: reply?.status ?? 0, accepted: result.ok, reason: result.reason});
        return result;
      }).finally(() => {
        if (pending === task) pending = null;
        if (task.generation === generation) arm();
      });
    if (!lastGood && current(task)) publish(empty('loading', 'Reading the harbor bulletin…'));
    return task.promise;
  }
  const visibility = () => document?.hidden ? clear() : arm();
  const focus = () => { if (live() && enabled()) void refresh(); };
  document?.addEventListener?.('visibilitychange', visibility);
  window?.addEventListener?.('focus', focus);
  return {read, refresh, stop,
    remaining: () => !live() || !enabled() || document?.hidden ? Infinity
      : ownerScope !== scope() ? 0 : pending ? Infinity : Math.max(0, nextAt - now()),
    dispose() {
      if (closed) return;
      closed = true; generation += 1;
      finishRead(pending, {status: 0, accepted: true, reason: null, cancelled: true});
      pending = null; clear(); lastGood = null; retryUntil = 0; view = empty();
      document?.removeEventListener?.('visibilitychange', visibility);
      window?.removeEventListener?.('focus', focus);
    },
  };
}
