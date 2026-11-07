// The Island Exchange panel: one kit modal with two tabs, "Prices" and "Your positions". It shows what the server
// says and sends the player's intents; every rule is on the server. No fetch here: the adapter does the talking.
// Polling: the board every 30 s, the portfolio every 15 s while its tab is shown; quiet while the page is hidden.
// Used by: index.js. The accessibility checklist is in README.md.
import './market.css';
import { createModal } from '../../ui/kit/modal.js';
import { createTabs } from '../../ui/kit/tabs.js';
import { createButton } from '../../ui/kit/button.js';
import { node } from '../../ui/kit/dom.js';
import { createMarketSession } from './session.js';
import { createTrades } from './trades.js';
import { createPoller } from './poller.js';
import { createBoardView } from './board-view.js';
import { createPositionsView } from './positions-view.js';
import { OUTCOME_UNKNOWN } from './words.js';
import {safeMarketAdapter} from './call-results.js';
import {createMarketCalls} from './request-state.js';

const BOARD_EVERY_MS = 30000;
const PORTFOLIO_EVERY_MS = 15000;

export function createMarketPanel({ container, adapter, resetInput, focusGame, openShareholderRegister, onSessionChange, onSignIn, now = Date.now }) {
  const status = node('p', 'market-status');
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const retryText = node('p', 'market-note', OUTCOME_UNKNOWN), retry = node('div', 'market-retry');
  const forgetBox = node('div', 'market-forget'), forgetText = node('p', 'market-note', 'Only if your trade is not listed under Your positions:');
  retry.hidden = true;
  forgetBox.hidden = true;
  let tab = 'prices', poller = null, looked = false; // looked: the player pressed Check again for the trade that is not confirmed
  let disposed = false;

  const safeAdapter = safeMarketAdapter(adapter);
  const session = createMarketSession({ adapter: safeAdapter, onNotice: text => calls.notice(text) });
  const trades = createTrades({ adapter: safeAdapter, session, now });
  const act = (run, options) => calls.run(run, options);
  // The retry box shows while a trade is not confirmed. "Forget this trade" appears only after the player looked at the positions.
  function showRetry() {
    if (!trades.pending) looked = false;
    retry.hidden = !trades.pending;
    forgetBox.hidden = !looked;
  }
  const boardView = createBoardView({ onOpenPosition: intent => act(() => trades.open(intent)) });
  const positionsView = createPositionsView({ onClosePosition: intent => act(() => trades.close(intent)) });
  const checkAgain = createButton({ label: 'Check again', variant: 'quiet', onClick: () => act(() => trades.checkAgain(), {read: true, remember: false, retryKind: 'check'}) });
  const sendAgain = createButton({ label: 'Send again', onClick: () => act(() => trades.sendAgain(), {read: true, remember: false, retryKind: 'resend'}) });
  const forget = createButton({ label: 'Forget this trade', variant: 'quiet', onClick: () => looked && act(() => trades.forget(), {remember: false}) });
  forgetBox.append(forgetText, forget.element);
  retry.append(retryText, checkAgain.element, sendAgain.element, forgetBox);
  const register = createButton({ label: 'Read the shareholder register', variant: 'quiet', onClick: () => {
    if (disposed || !modal.element.open) return;
    close(); openShareholderRegister?.();
  } });

  const calls = createMarketCalls({session, trades, messageElement: status, now, onSignIn,
    isActive: () => modal.element.open, onChange: draw,
    onResult(result) {
      if (result.kind === 'unknown') looked = false;
      if (result.kind === 'checked') looked = true;
      if (result.kind === 'done' || result.kind === 'already_done') boardView.reset();
      showRetry();
    },
  });
  function draw() {
    const disabled = calls.blocked;
    boardView.update(session.board, session.boardNote, { disabled });
    positionsView.update({ portfolio: session.portfolio, board: session.board, signedIn: session.signedIn, note: session.portfolioNote, disabled });
    checkAgain.update({disabled}); sendAgain.update({disabled}); forget.update({disabled: disabled || !looked});
    showRetry();
  }
  const stopDrawing = session.subscribe(draw);
  poller = createPoller({
    tasks: [
      { name: 'board', everyMs: BOARD_EVERY_MS, run: () => calls.read('refreshBoard') },
      { name: 'portfolio', everyMs: PORTFOLIO_EVERY_MS, run: () => calls.read('refreshPortfolio'), enabled: () => tab === 'positions' && session.signedIn !== false },
    ],
    isHidden: () => document.hidden,
    watchVisibility(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  });
  const tabs = createTabs({
    items: [{ id: 'prices', label: 'Prices', body: boardView.element }, { id: 'positions', label: 'Your positions', body: positionsView.element }],
    onChange: id => { tab = id; poller?.runNow('portfolio'); },
  });
  const body = node('div', 'market-body');
  body.append(calls.element, retry, tabs.element, register.element);
  // The close event arrives a moment after close(). If the panel was opened again in between, leave it alone.
  const modal = createModal({ title: 'Island Exchange', body, onClose() { if (modal.element.open) return; calls.cancel(); poller.stop(); resetInput?.(); focusGame?.(); } });
  modal.element.classList.add('market-modal');
  draw();
  const stopIdentity = onSessionChange?.(({ signedIn } = {}) => {
    if (disposed) return;
    calls.reset(); looked = false;
    trades.resetPrivate(); session.resetPrivate(signedIn);
    boardView.reset(); positionsView.reset(); showRetry(); draw();
    if (signedIn && modal.element.open) calls.read('refreshPortfolio').catch(() => {});
  });

  function close() { calls.cancel(); modal.close(); }
  return {
    get active() { return modal.element.open; },
    open() {
      if (disposed || modal.element.open) return;
      resetInput?.();
      tabs.select(0); // every visit starts on the prices, with closed forms and a clean status line
      boardView.reset();
      positionsView.reset();
      showRetry();
      modal.open(container);
      calls.resume();
      poller.start();
      if (session.signedIn !== false) calls.read('refreshPortfolio').catch(() => {});
    },
    close,
    dispose() {
      if (disposed) return;
      disposed = true; calls.dispose(); stopIdentity?.();
      poller.stop(); stopDrawing(); session.dispose(); trades.resetPrivate();
      boardView.reset(); positionsView.dispose(); modal.dispose();
      for (const control of [checkAgain, sendAgain, forget, register]) control.dispose();
    },
  };
}
