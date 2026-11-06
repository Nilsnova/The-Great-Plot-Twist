// The islet adapter: holds the view, turns two intents into the two routes, and keeps one click id per build. It decides no rule.
import {makeActionUid} from './action-uid.js';
import {
  MESSAGES, alreadyAppliedNotice, buildingNotice, builtNotice, createEmptyView, failureNotice, makeNotice, readIsletAnswer,
} from './view.js';

const ISLET_PATH = '/api/islet';
const BUILD_PATH = '/api/islet/build';
const NETWORK_FAILURE = {ok: false, status: 0, code: 'network_error', message: MESSAGES.network};

const refused = (code, message = '') => ({accepted: false, code, message});
// A 4xx answer means the server looked at the request and said no. Anything else leaves the outcome unknown.
const isRefusal = result => result.status >= 400 && result.status < 500;

export function createIsletAdapter({transport, mode, makeUid = makeActionUid}) {
  let view = createEmptyView(mode);
  const keptIds = new Map(); // plot -> the click id of a build whose outcome is unknown, kept for a safe retry
  const listeners = new Set();
  let disposed = false;
  let started = 0; // how many refreshes have been sent
  let shown = 0; // which refresh the view shows now

  // "answered" marks a change that came from a good GET answer. The host tells the world about those.
  function publish(answered = false) {
    view.revision += 1;
    const event = {type: 'islet_updated', view: structuredClone(view), answered};
    for (const listener of [...listeners]) listener(event);
  }

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
    shown = sequence;
    const keep = keepNotice || view.busyPlot !== null;
    view = {...view, ...answer, status: 'ready', notice: keep ? view.notice : null};
    syncRetryFlags();
    publish(true);
    return {accepted: true, code: 'refreshed', message: ''};
  }

  // The last good view stays on screen when a refresh fails.
  function showFailure(result) {
    view.status = view.spots.length === 0 ? 'error' : 'ready';
    view.notice = failureNotice(result);
    publish();
    return refused(view.notice.code, view.notice.message);
  }

  async function loadIslet(keepNotice) {
    if (disposed) return refused('disposed');
    if (mode === 'unavailable') return refused('not_connected', MESSAGES.notConnected);
    const mine = ++started;
    if (view.spots.length === 0) {
      view.status = 'loading';
      publish();
    }
    const result = await ask(() => transport.get(ISLET_PATH));
    if (disposed) return refused('disposed');
    if (mine < shown) return {accepted: true, code: 'superseded', message: ''};
    const answer = result.ok ? readIsletAnswer(result.data) : null;
    if (answer) return showAnswer(mine, answer, keepNotice);
    return showFailure(result.ok ? {status: 200, code: 'unreadable', message: MESSAGES.unreadable} : result);
  }

  async function confirmed(spot, code, receipt) {
    keptIds.delete(spot.plot);
    const reloaded = (await loadIslet(true)).accepted;
    if (disposed) return refused('disposed');
    view.notice = code === 'built' ? builtNotice(spot, receipt, reloaded) : alreadyAppliedNotice(reloaded);
    return {accepted: true, code, message: view.notice.message};
  }

  async function rejected(spot, result) {
    keptIds.delete(spot.plot);
    await loadIslet(true);
    if (disposed) return refused('disposed');
    view.notice = failureNotice(result);
    return refused(view.notice.code, view.notice.message);
  }

  // No answer, or a server error: keep the click id, check the islet, and let the player retry safely.
  async function unknownOutcome(spot, actionUid) {
    keptIds.set(spot.plot, actionUid);
    syncRetryFlags();
    view.notice = makeNotice('info', 'checking', MESSAGES.checking);
    publish();
    const reloaded = (await loadIslet(true)).accepted;
    if (disposed) return refused('disposed');
    if (view.spots.find(item => item.plot === spot.plot)?.state === 'built') {
      view.notice = makeNotice('success', 'confirmed', MESSAGES.confirmed);
      return {accepted: true, code: 'confirmed', message: MESSAGES.confirmed};
    }
    view.notice = reloaded ? makeNotice('info', 'not_done', MESSAGES.notDone) : makeNotice('error', 'unconfirmed', MESSAGES.unconfirmed);
    return refused('unconfirmed', view.notice.message);
  }

  function settle(spot, actionUid, result) {
    if (result.ok) return confirmed(spot, 'built', result.data);
    if (result.status === 409 && result.code === 'already_applied') return confirmed(spot, 'already_applied');
    if (isRefusal(result)) return rejected(spot, result);
    return unknownOutcome(spot, actionUid);
  }

  // The type comes from the spot the server sent, never from the browser. One request runs at a time.
  async function build(plot) {
    if (disposed) return refused('disposed');
    if (mode === 'unavailable') return refused('not_connected', MESSAGES.notConnected);
    if (view.busyPlot !== null) return refused('busy', MESSAGES.busy);
    const spot = view.spots.find(item => item.plot === plot);
    if (!spot) return refused('no_such_plot', MESSAGES.noSuchPlot);
    const actionUid = keptIds.get(plot) ?? makeUid();
    view.busyPlot = plot;
    view.notice = buildingNotice(spot);
    publish();
    const result = await ask(() => transport.post(BUILD_PATH, {plot, type: spot.type, actionUid}));
    if (disposed) return refused('disposed');
    const outcome = await settle(spot, actionUid, result);
    if (disposed) return outcome;
    view.busyPlot = null;
    publish();
    return outcome;
  }

  return {
    read: () => structuredClone(view),
    refresh: () => loadIslet(false),
    build,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
