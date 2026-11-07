// Request presentation only. L2 retains transport, receipts, server snapshots and held build IDs.
import {intentFailure} from '../../adapter/call-failure.js';
const businessCodes = new Set(['no_such_plot', 'no_such_building', 'wrong_plot', 'plot_occupied',
  'not_buildable_yet', 'not_enough_timber', 'insufficient_funds', 'validation_error', 'busy']);

// Reopening a panel must retain the original server deadline, including a fractional last second.
export function createIsletRequestClock(now = Date.now) {
  let sampled = null;
  return {now: () => sampled ?? now(), fail(call, failure) {
    const seconds = failure.retryAfterSeconds;
    if (failure.reason === 'rate_limited' && Number.isFinite(failure.retryAt)
      && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400) sampled = failure.retryAt - Math.ceil(seconds) * 1000;
    try { call.fail(failure); } finally { sampled = null; }
    call.refresh();
  }};
}

export function isletCallFailure(result = {}) {
  const reason = {feature_off: 'feature_off', stale_save: 'save_conflict', not_connected: 'not_connected',
    network_error: 'offline', unreadable: 'internal_error', session_expired: 'session_expired'}[result.code];
  const status = Number.isInteger(result.status) && result.status >= 0 && result.status <= 599 ? result.status : undefined;
  if (reason || status === 0 || status === 401 || status === 403 || status === 429 || status >= 500) {
    return {...intentFailure({status, reason, retryAfterSeconds: result.retryAfterSeconds}), ...(status !== undefined ? {status} : {})};
  }
  return businessCodes.has(result.code) ? {accepted: false, reason: result.code,
    message: 'The server refused this request. Check the plot details.', ...(status !== undefined ? {status} : {})}
    : {...intentFailure(), ...(status !== undefined ? {status} : {})};
}

export function createIsletRequests({adapter, call, onChange = () => {}, onSettled = () => {}, presentFailure = failure => call.fail(failure)}) {
  let disposed = false, generation = 0, pending = false, last = null;
  const current = token => !disposed && token === generation;
  const blocked = () => disposed || pending || call.read().remaining > 0;
  const notify = () => { try { onChange(); } catch { /* Presentation cannot change an L2 outcome. */ } };
  async function run(intent, retry = false) {
    if (blocked()) return {accepted: false, code: disposed ? 'disposed' : pending ? 'busy' : 'too_many_requests'};
    const token = ++generation; pending = true; last = intent;
    let failedEarly = false;
    const fail = failure => {
      if (!current(token)) return;
      failedEarly = true; presentFailure(failure); notify();
    };
    call.loading({read: intent.kind === 'refresh' || retry}); notify();
    try {
      let result;
      if (retry && intent.kind === 'build') {
        result = await adapter.refresh();
        if (!current(token)) return {accepted: false, code: 'session_expired'};
        if (result.stale) { call.showMessage('Your islet is still refreshing. Try again in a moment.'); return {...result, accepted: false}; }
        if (!result.accepted) { presentFailure(result.failure ?? isletCallFailure(result)); return result; }
        if (adapter.read().spots.find(spot => spot.plot === intent.plot)?.state === 'built') {
          call.succeed({message: 'Built.'}); return {accepted: true, code: 'confirmed', message: 'Built.'};
        }
        call.loading();
      }
      result = intent.kind === 'build' ? await adapter.build(intent.plot, {onFailure: fail}) : await adapter.refresh();
      if (!current(token)) return {accepted: false, code: 'session_expired'};
      if (result.stale) { call.showMessage('Your islet is still refreshing. Try again in a moment.'); return {...result, accepted: false}; }
      if (result.accepted) call.succeed();
      else if (!failedEarly) presentFailure(result.failure ?? isletCallFailure(result));
      return result;
    } catch {
      if (current(token) && !failedEarly) presentFailure(intentFailure());
      return {accepted: false, code: 'internal_error'};
    } finally {
      if (current(token)) {
        pending = false; notify();
        try { onSettled(intent); } catch { /* A focus failure cannot repeat a request. */ }
      }
    }
  }
  function cancel() { if (disposed) return; generation += 1; pending = false; last = null; call.clear(); notify(); }
  // resetPrivate has one canonical empty shape; accepted GETs always contain the five server plots.
  let hasSnapshot = adapter.read().spots.length > 0;
  const stopWatching = adapter.subscribe(({view}) => {
    const reset = hasSnapshot && view.coins === null && view.timber === null && view.spots.length === 0;
    hasSnapshot = view.spots.length > 0;
    if (reset) cancel();
  });
  return {get busy() { return pending; }, get blocked() { return blocked(); },
    refresh: () => run({kind: 'refresh'}),
    build(plot) { return run({kind: 'build', plot}, adapter.read().spots.some(spot => spot.plot === plot && spot.retry)); },
    retry: () => last ? run(last, last.kind === 'build') : Promise.resolve({accepted: false, code: 'not_ready'}),
    cancel,
    dispose() { if (disposed) return; disposed = true; generation += 1; pending = false; last = null; stopWatching(); call.dispose(); },
  };
}
