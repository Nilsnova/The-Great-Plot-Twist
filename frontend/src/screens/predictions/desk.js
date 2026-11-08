// The kiosk displays injected server answers. Account scopes cancel late private work.
import './desk.css';
import {createModal} from '../../ui/kit/modal.js';
import {createTabs} from '../../ui/kit/tabs.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {createDeskAdapter} from './adapter.js';
import {deskStateFrom, initialDeskState} from './desk-state.js';
import {button, node} from './dom-helpers.js';
import {createDeskFlow} from './flow.js';
import {CLOSED_LINE, GENERIC_LINE, PLAY_MONEY_LINE, SIGN_IN_LINE} from './messages.js';
import {createQuestionsView} from './questions-view.js';
import {createStakesView} from './stakes-view.js';
import {createDeskScope, predictionEnabled, predictionFailure} from './g9-policy.js';

const REFRESH_MS = 30000;

export function createDesk({container, resetInput, focus, request, getFlags = () => ({}),
  getIdentity = () => null, onIdentityChange = () => () => {}, onSignIn,
  search = globalThis.location?.search ?? '', document = globalThis.document} = {}) {
  const practiceRequested = import.meta.env.DEV && new URLSearchParams(search).get('desk') === 'local';
  const demo = new URLSearchParams(search).get('demo') === '1';
  const practiceIdentity = Symbol('practice');
  const identity = () => practiceRequested ? practiceIdentity : getIdentity();
  const enabled = () => practiceRequested || (!demo && predictionEnabled(getFlags));
  const scope = createDeskScope({getIdentity: identity, enabled});
  const body = node('div', 'desk-body'), practice = node('p', 'desk-practice');
  const main = node('div', 'desk-main'), footer = node('footer', 'desk-footer');
  const playMoney = node('p', 'desk-play-money'); footer.append(playMoney);
  const call = createServerCallState({label: 'prediction kiosk', onRetry: () => load(), onSignIn});
  body.append(practice, call.element, main, footer);
  const modal = createModal({title: 'Prediction kiosk', body, onCancel: cancel, onClose: closed});
  modal.element.classList.add('desk-modal');
  const stopKey = event => event.stopPropagation();
  for (const type of ['keydown', 'keyup']) modal.element.addEventListener(type, stopKey);

  let adapter = null, views = null, flow = null, tabs = null, preparing = null;
  let selectedTab = 'questions', state = initialDeskState(), timer = null, refreshCount = 0, disposed = false;
  const visible = () => !disposed && modal.element.open && !document?.hidden;
  const current = (ticket, privateRead = false) => visible() && scope.current(ticket, {privateRead});

  function showLine(text, withRetry = false) {
    const line = node('p', 'desk-empty', text); line.setAttribute('role', 'status');
    main.replaceChildren(line, ...(withRetry ? [button('Try again', () => load())] : []));
  }
  function disposeViews({forgetAttempts = false} = {}) {
    // Ordinary close/hide removes private presentation, while its same-account write owner survives.
    if (forgetAttempts) { flow?.dispose(); flow = null; }
    else flow?.pause();
    tabs?.dispose(); tabs = null;
    views?.questions.dispose(); views?.stakes.dispose(); views?.presenter?.dispose(); views = null;
  }
  function render() {
    if (disposed) return;
    practice.textContent = adapter?.label ?? ''; practice.hidden = !practice.textContent;
    playMoney.textContent = state.list?.playMoney || PLAY_MONEY_LINE;
    if (state.phase === 'closed') return showLine(CLOSED_LINE);
    if (state.phase === 'unavailable') return showLine(state.notice ?? GENERIC_LINE, true);
    if (state.phase !== 'ready' || !views) return showLine('Opening the kiosk…');
    if (!tabs) {
      const items = [{id: 'questions', label: 'Questions', body: views.questions.element},
        {id: 'stakes', label: 'My stakes', body: views.stakes.element}];
      // Ordinary hosts get no settlement control; only explicit development practice owns it.
      if (practiceRequested && state.host && views.presenter) {
        items.push({id: 'presenter', label: 'Presenter', body: views.presenter.element});
      }
      tabs = createTabs({items, selected: Math.max(0, items.findIndex(item => item.id === selectedTab)),
        onChange: id => { selectedTab = id; }});
    }
    if (main.firstElementChild !== tabs.element) main.replaceChildren(tabs.element);
    views.questions.update(state, Date.now()); views.stakes.update(state);
    if (practiceRequested && state.host) views.presenter?.update(state);
  }
  function stopPolling() { clearInterval(timer); timer = null; }
  function startPolling() {
    stopPolling();
    if (visible() && enabled()) timer = setInterval(() => { if (visible()) void load(); }, REFRESH_MS);
  }
  async function prepare(ticket) {
    if (!adapter) adapter = await createDeskAdapter({search, request, getFlags, getIdentity: identity});
    if (!current(ticket)) return false;
    if (views) return true;
    let createPresenterView;
    if (import.meta.env.DEV && practiceRequested) {
      ({createPresenterView} = await import('./presenter-view.js'));
      if (!current(ticket)) return false;
    }
    flow ??= createDeskFlow({adapter, readBeforeRetry: true, validateReceipt: true, allowSettle: practiceRequested,
      capture: scope.capture, isCurrent: token => current(token, true)});
    views = {
      questions: createQuestionsView({flow, refresh: load, onSignIn,
        capture: scope.capture, isCurrent: token => current(token, true)}),
      stakes: createStakesView({}), presenter: createPresenterView?.({flow, refresh: load}),
    };
    return true;
  }
  function showHeldRetry() {
    const remaining = Math.max(0, (flow?.retryUntil ?? 0) - Date.now());
    if (!remaining) return false;
    call.fail(predictionFailure({kind: 'wait', seconds: Math.ceil(remaining / 1000)}),
      {retryAfterMs: Math.min(86400000, remaining)});
    return true;
  }
  async function load() {
    if (!visible()) return;
    if (!enabled()) {
      scope.invalidate(); refreshCount += 1; disposeViews({forgetAttempts: true}); stopPolling();
      state = {...initialDeskState(), phase: 'closed', notice: CLOSED_LINE};
      call.fail({reason: 'feature_off', message: CLOSED_LINE}); render(); return;
    }

    if (showHeldRetry()) {
      if (!views) showLine('');
      return;
    }
    const ticket = scope.capture(), thisRefresh = ++refreshCount; call.loading({read: true});
    try {
      if (!preparing) {
        const task = prepare(ticket).finally(() => { if (preparing === task) preparing = null; });
        preparing = task;
      }
      if (!await preparing || !current(ticket) || thisRefresh !== refreshCount) return;
      const readOwner = flow;
      const remember = reply => {
        if (!disposed && flow === readOwner && enabled() && Object.is(identity(), ticket.identity)) {
          flow.holdRetry(reply);
          if (reply.kind === 'wait' && current(ticket) && thisRefresh === refreshCount) { showHeldRetry(); render(); }
        }
        return reply;
      };
      const mine = (ticket.identity == null ? Promise.resolve({kind: 'signin', message: SIGN_IN_LINE}) : adapter.mine()).then(remember);
      const [listReply, mineReply] = await Promise.all([adapter.list().then(remember), mine]);
      if (!current(ticket) || thisRefresh !== refreshCount) return;
      state = deskStateFrom(state, listReply, mineReply);
      const failed = [listReply, mineReply].find(reply => reply.kind === 'wait')
        ?? [listReply, mineReply].find(reply => !['ok', 'signin'].includes(reply.kind));
      if (showHeldRetry()) { /* An older successful read cannot clear a current server wait. */ }
      else if (failed) call.fail(predictionFailure(failed), failed.kind === 'wait'
        ? {retryAfterMs: Math.min(86400000, Math.max(0, flow.retryUntil - Date.now()))} : undefined);
      else if (mineReply.kind === 'signin') call.fail({reason: 'sign_in_required', message: SIGN_IN_LINE});
      else call.succeed();
      render();
    } catch {
      if (!current(ticket) || thisRefresh !== refreshCount) return;
      state = {...state, phase: state.list ? 'ready' : 'unavailable', notice: GENERIC_LINE};
      call.fail({reason: 'not_connected', message: GENERIC_LINE}); render();
    }
  }
  function invalidate({forgetAttempts = true} = {}) {
    scope.invalidate(); refreshCount += 1; preparing = null; disposeViews({forgetAttempts}); selectedTab = 'questions';
    state = {...initialDeskState(), list: state.list, phase: state.list ? 'ready' : 'loading',
      signedIn: identity() == null ? false : null}; call.clear();
  }
  function cancel() {
    if (views?.questions.cancelConfirm() || views?.presenter?.cancelConfirm()) return;
    close();
  }
  function closed(reason) {
    stopPolling(); scope.close(); refreshCount += 1; preparing = null; disposeViews();
    state = {...initialDeskState(), list: state.list}; call.clear();
    resetInput?.(); if (reason !== 'dispose') focus?.();
  }
  function close() {
    stopPolling(); scope.close(); refreshCount += 1; preparing = null; disposeViews(); call.clear();
    resetInput?.(); modal.close();
  }
  function changedIdentity() {
    if (disposed || practiceRequested) return;
    invalidate(); if (visible()) { render(); void load(); }
  }
  const stopIdentity = onIdentityChange(changedIdentity);
  function changedVisibility() {
    if (disposed || !modal.element.open) return;
    if (document.hidden) { stopPolling(); invalidate({forgetAttempts: false}); }
    else { render(); startPolling(); void load(); }
  }
  document?.addEventListener('visibilitychange', changedVisibility);
  return {
    async open() {
      if (disposed) return;
      if (!modal.element.open) {
        scope.open(); resetInput?.(); render();
        const heading = modal.element.querySelector('h2'); heading.tabIndex = -1; modal.open(container, heading);
      }
      startPolling(); await load();
    },
    close, refresh: load,
    get active() { return modal.element.open; },
    dispose() {
      if (disposed) return;
      disposed = true; stopPolling(); scope.dispose(); refreshCount += 1; preparing = null;
      stopIdentity?.(); document?.removeEventListener('visibilitychange', changedVisibility); disposeViews({forgetAttempts: true}); call.dispose();
      for (const type of ['keydown', 'keyup']) modal.element.removeEventListener(type, stopKey);
      modal.dispose();
    },
  };
}
