// The prediction kiosk: one modal with the tabs Questions, My stakes and (for hosts) Presenter.
// It asks the server for fresh numbers when it opens, after every action and every 30 seconds while it is
// open. It never asks while it is closed. The server decides every coin; this file only shows its answers.
//
//   const desk = createDesk({ container, resetInput, focus });
//   desk.open();      // the harbor's prediction_kiosk hotspot calls this (src/game.js)
//   desk.close();     // desk.active tells whether it is open
//   desk.dispose();   // when the game shuts down
//
// Used by: src/game.js (loaded on first use).

import './desk.css';
import { createModal } from '../../ui/kit/modal.js';
import { createTabs } from '../../ui/kit/tabs.js';
import { createDeskAdapter } from './adapter.js';
import { deskStateFrom, initialDeskState } from './desk-state.js';
import { button, node } from './dom-helpers.js';
import { createDeskFlow } from './flow.js';
import { CLOSED_LINE, CREDIT_LINE, GENERIC_LINE, PLAY_MONEY_LINE } from './messages.js';
import { createPresenterView } from './presenter-view.js';
import { createQuestionsView } from './questions-view.js';
import { createStakesView } from './stakes-view.js';

const REFRESH_MS = 30000;

export function createDesk({ container, resetInput, focus }) {
  const body = node('div', 'desk-body');
  const practice = node('p', 'desk-practice');
  const notice = node('p', 'desk-notice');
  notice.setAttribute('role', 'status');
  const main = node('div', 'desk-main');
  const footer = node('footer', 'desk-footer');
  const playMoney = node('p', 'desk-play-money');
  const credit = node('p', 'desk-credit');
  footer.append(playMoney, credit);
  body.append(practice, notice, main, footer);

  const modal = createModal({ title: 'Prediction kiosk', body, onCancel: cancel, onClose: closed });
  modal.element.classList.add('desk-modal');
  // The game listens for keys on the window. Inside the dialog they must not walk the explorer around.
  for (const type of ['keydown', 'keyup']) modal.element.addEventListener(type, event => event.stopPropagation());

  let adapter = null;
  let views = null; // { questions, stakes, presenter } once the adapter is ready
  let tabs = null;
  let tabsHaveHost = false;
  let selectedTab = 'questions';
  let state = initialDeskState();
  let timer = null;
  let refreshCount = 0;
  let disposed = false;

  function showLine(text, withRetry = false) {
    const line = node('p', 'desk-empty', text);
    line.setAttribute('role', 'status');
    main.replaceChildren(line, ...(withRetry ? [button('Try again', () => load())] : []));
  }

  function ensureTabs() {
    if (tabs && tabsHaveHost === state.host) return;
    tabs?.dispose();
    const items = [
      { id: 'questions', label: 'Questions', body: views.questions.element },
      { id: 'stakes', label: 'My stakes', body: views.stakes.element },
    ];
    if (state.host) items.push({ id: 'presenter', label: 'Presenter', body: views.presenter.element });
    const selected = Math.max(0, items.findIndex(item => item.id === selectedTab));
    tabs = createTabs({ items, selected, onChange: id => { selectedTab = id; } });
    tabsHaveHost = state.host;
  }

  function render() {
    practice.textContent = adapter?.label ?? '';
    practice.hidden = !practice.textContent;
    playMoney.textContent = state.list?.playMoney || PLAY_MONEY_LINE;
    credit.textContent = state.list?.attribution || CREDIT_LINE;
    notice.textContent = state.phase === 'ready' ? state.notice ?? '' : '';
    notice.hidden = !notice.textContent;
    if (state.phase === 'closed') return showLine(CLOSED_LINE);
    if (state.phase === 'unavailable') return showLine(state.notice ?? GENERIC_LINE, true);
    if (state.phase !== 'ready') return showLine('Opening the kiosk…');
    ensureTabs();
    if (main.firstElementChild !== tabs.element) main.replaceChildren(tabs.element);
    const now = Date.now();
    views.questions.update(state, now);
    views.stakes.update(state);
    if (state.host) views.presenter.update(state);
  }

  async function refresh() {
    if (!adapter || disposed || !modal.element.open) return;
    const thisRefresh = ++refreshCount;
    const [listReply, mineReply] = await Promise.all([adapter.list(), adapter.mine()]);
    if (disposed || thisRefresh !== refreshCount || !modal.element.open) return;
    state = deskStateFrom(state, listReply, mineReply);
    render();
  }

  async function prepare() {
    adapter ??= await createDeskAdapter();
    if (views) return;
    const flow = createDeskFlow({ adapter });
    views = {
      questions: createQuestionsView({ flow, refresh }),
      stakes: createStakesView({}),
      presenter: createPresenterView({ flow, refresh }),
    };
  }

  function stopPolling() {
    clearInterval(timer);
    timer = null;
  }

  function cancel() {
    if (views?.questions.cancelConfirm() || views?.presenter.cancelConfirm()) return;
    close();
  }

  function closed(reason) {
    stopPolling();
    resetInput?.();
    if (reason !== 'dispose') focus?.();
  }

  function close() {
    stopPolling();
    resetInput?.();
    modal.close();
  }

  // Gets the adapter ready (the first time) and asks the server. "Try again" runs this too.
  async function load() {
    try {
      await prepare();
    } catch (error) {
      console.error(error);
      state = { ...state, phase: 'unavailable', notice: GENERIC_LINE };
      render();
      return;
    }
    await refresh();
  }

  async function open() {
    if (disposed || modal.element.open) return;
    resetInput?.();
    render();
    const heading = modal.element.querySelector('h2');
    heading.tabIndex = -1;
    modal.open(container, heading);
    timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    await load();
  }

  return {
    open,
    close,
    get active() { return modal.element.open; },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPolling();
      tabs?.dispose();
      views?.questions.dispose();
      views?.stakes.dispose();
      views?.presenter.dispose();
      modal.dispose();
    },
  };
}
