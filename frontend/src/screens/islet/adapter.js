// The islet adapter: holds the view, turns two intents into the two routes, and keeps one click id per build. It decides no rule.
import {makeActionUid} from './action-uid.js';
import {isletCallFailure} from './request-state.js';
import {createCallState} from '../../ui/kit/call-state.js';
import {createBuildOutcomes} from './build-outcome.js';
import {createIsletPublications} from './publications.js';
import {
  MESSAGES, buildingNotice, createEmptyView, failureNotice, readIsletAnswer, validBuildReceipt,
} from './view.js';
const ISLET_PATH = '/api/islet';
const BUILD_PATH = '/api/islet/build';
const NETWORK_FAILURE = {ok: false, status: 0, code: 'network_error', message: MESSAGES.network};
const refused = (code, message = '') => ({accepted: false, code, message});
export function createIsletAdapter({transport, mode, makeUid = makeActionUid, now = Date.now}) {
  let view = createEmptyView(mode);
  let sampledNow = null, retryAt = 0;
  const limit = createCallState({now: () => sampledNow ?? now()});
  const keptIds = new Map(); // plot -> the click id of a build whose outcome is unknown, kept for a safe retry
  let disposed = false, epoch = 0;
  let started = 0; // how many refreshes have been sent
  const current = owner => !disposed && owner === epoch;
  const expired = () => refused(disposed ? 'disposed' : 'session_expired', disposed ? '' : MESSAGES.signIn);
  const publications = createIsletPublications({getView: () => view, getEpoch: () => epoch, current});
  const {publish} = publications;
  function rememberLimit(result) {
    const failure = isletCallFailure(result), seconds = failure.retryAfterSeconds ?? 0;
    sampledNow = now(); retryAt = sampledNow + seconds * 1000;
    try { limit.fail(failure); } finally { sampledNow = null; }
  }
  const limited = () => {
    const remaining = limit.read().remaining;
    return remaining > 0 ? {accepted: false, code: 'too_many_requests', message: limit.read().message,
      failure: {...isletCallFailure({status: 429, retryAfterSeconds: remaining}), retryAt}} : null;
  };
  // A transport that throws counts as no answer at all.
  async function ask(send) {
    try { return await send(); } catch { return NETWORK_FAILURE; }
  }
  function syncRetryFlags() {
    for (const spot of view.spots) {
      if (spot.state === 'built') keptIds.delete(spot.plot);
      spot.retry = keptIds.has(spot.plot);
    }
  }
  function showAnswer(sequence, answer, keepNotice) {
    const keep = keepNotice || view.busyPlot !== null;
    view = {...view, ...answer, status: 'ready', notice: keep ? view.notice : null};
    syncRetryFlags();
    publish(true);
    return {accepted: true, code: 'refreshed', message: ''};
  }
  // The last good view stays on screen when a refresh fails.
  function showFailure(result) {
    view.status = view.spots.length === 0 ? 'error' : 'ready';
    const notice = failureNotice(result); view.notice = notice;
    publish();
    return {...refused(notice.code, notice.message), failure: isletCallFailure(result)};
  }
  async function loadIslet(keepNotice, owner = epoch) {
    if (!current(owner)) return expired();
    if (mode === 'unavailable') return refused('not_connected', MESSAGES.notConnected);
    const mine = ++started;
    if (view.spots.length === 0) {
      view.status = 'loading';
      publish();
    }
    if (!current(owner)) return expired();
    const result = await ask(() => transport.get(ISLET_PATH));
    if (!current(owner)) return expired();
    if (mine < started) return {accepted: true, code: 'superseded', message: '', stale: true};
    if (result.status === 429) rememberLimit(result);
    const answer = result.ok ? readIsletAnswer(result.data) : null;
    if (answer) {
      const outcome = showAnswer(mine, answer, keepNotice); return current(owner) ? outcome : expired();
    }
    const outcome = showFailure(result.ok ? {status: 200, code: 'unreadable', message: MESSAGES.unreadable} : result);
    if (!current(owner)) return expired();
    return result.status === 429 ? {...outcome, failure: {...outcome.failure, retryAt}} : outcome;
  }
  const settle = createBuildOutcomes({keptIds, loadIslet, current, expired, syncRetryFlags, publish, refused,
    get view() { return view; },
  });
  // The type comes from the spot the server sent, never from the browser. One request runs at a time.
  async function build(plot, {onFailure} = {}) {
    if (disposed) return refused('disposed');
    if (mode === 'unavailable') return refused('not_connected', MESSAGES.notConnected);
    const waiting = limited(); if (waiting) return waiting;
    if (view.busyPlot !== null) return refused('busy', MESSAGES.busy);
    const spot = view.spots.find(item => item.plot === plot);
    if (!spot) return refused('no_such_plot', MESSAGES.noSuchPlot);
    const owner = epoch;
    const actionUid = keptIds.get(plot) ?? makeUid();
    view.busyPlot = plot;
    view.notice = buildingNotice(spot);
    publish();
    if (!current(owner)) return expired();
    const result = await ask(() => transport.post(BUILD_PATH, {plot, type: spot.type, actionUid}));
    if (!current(owner)) return expired();
    if (result.status === 429) rememberLimit(result);
    const rejectedReply = !result.ok && !(result.status === 409 && result.code === 'already_applied');
    const invalidReceipt = result.ok && !validBuildReceipt(result.data, spot);
    const normalized = rejectedReply || invalidReceipt ? isletCallFailure(invalidReceipt ? {status: 502, code: 'unreadable'} : result) : null;
    const failure = normalized?.reason === 'rate_limited' ? {...normalized, retryAt} : normalized;
    // Tell an active panel at the actual response time; a recovery GET must not restart a 429 clock.
    if (failure && typeof onFailure === 'function') {
      try { const pending = onFailure(failure); pending?.catch?.(() => {}); } catch { /* An observer never owns the build. */ }
    }
    if (!current(owner)) return expired();
    const outcome = await settle(spot, actionUid, result, owner);
    if (!current(owner)) return expired();
    view.busyPlot = null;
    publish();
    if (!current(owner)) return expired();
    if (!outcome.accepted && failure) {
      const heldFailure = failure.reason === 'rate_limited' ? {...failure, retryAfterSeconds: limit.read().remaining} : failure;
      return {...outcome, failure: heldFailure};
    }
    return outcome;
  }
  return {
    read: () => structuredClone(view),
    refresh() {
      if (disposed) return Promise.resolve(expired());
      const waiting = limited(); return waiting ? Promise.resolve(waiting) : loadIslet(false);
    },
    build,
    resetPrivate() {
      if (disposed) return;
      epoch += 1; keptIds.clear(); limit.clear(); retryAt = 0;
      view = {...createEmptyView(mode), revision: view.revision};
      publish();
    },
    subscribe: publications.subscribe,
    dispose() {
      if (disposed) return;
      disposed = true; epoch += 1; keptIds.clear(); limit.clear(); retryAt = 0;
      view = {...createEmptyView(mode), revision: view.revision + 1};
      publications.clear();
    },
  };
}
