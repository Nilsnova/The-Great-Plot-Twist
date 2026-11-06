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

const BOARD_EVERY_MS = 30000;
const PORTFOLIO_EVERY_MS = 15000;

export function createMarketPanel({ container, adapter, resetInput, focusGame, openShareholderRegister }) {
  const status = node('p', 'market-status');
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const retryText = node('p', 'market-note', 'Your last trade is not confirmed yet.'), retry = node('div', 'market-retry');
  const forgetBox = node('div', 'market-forget'), forgetText = node('p', 'market-note', 'Only if your trade is not listed under Your positions:');
  retry.hidden = true;
  forgetBox.hidden = true;
  let tab = 'prices', poller = null, looked = false; // looked: the player pressed Check again for the trade that is not confirmed

  // Results and refusals go to the one status line. Only an action moves the focus there; polling never does.
  function say(text, { focus = false } = {}) {
    status.textContent = text;
    if (focus && text) status.focus();
  }
  const session = createMarketSession({ adapter, onNotice: text => say(text) });
  const trades = createTrades({ adapter, session });
  // The retry box shows while a trade is not confirmed. "Forget this trade" appears only after the player looked at the positions.
  function showRetry() {
    if (!trades.pending) looked = false;
    retry.hidden = !trades.pending;
    forgetBox.hidden = !looked;
  }
  async function act(promise) {
    const result = await promise;
    if (result.kind === 'unknown') looked = false;
    if (result.kind === 'checked') looked = true;
    say(result.message, { focus: true });
    showRetry();
    if (result.kind === 'done' || result.kind === 'already_done') boardView.reset(); // a trade went through: no stale form is left to press again
    return result;
  }

  const boardView = createBoardView({ onOpenPosition: intent => act(trades.open(intent)) });
  const positionsView = createPositionsView({ onClosePosition: intent => act(trades.close(intent)) });
  const checkAgain = createButton({ label: 'Check again', variant: 'quiet', onClick: () => act(trades.checkAgain()) });
  const sendAgain = createButton({ label: 'Send again', onClick: () => act(trades.sendAgain()) });
  const forget = createButton({ label: 'Forget this trade', variant: 'quiet', onClick: () => act(trades.forget()) });
  forgetBox.append(forgetText, forget.element);
  retry.append(retryText, checkAgain.element, sendAgain.element, forgetBox);
  const register = createButton({ label: 'Read the shareholder register', variant: 'quiet', onClick: () => { close(); openShareholderRegister?.(); } });

  const draw = () => {
    boardView.update(session.board, session.boardNote);
    positionsView.update({ portfolio: session.portfolio, board: session.board, signedIn: session.signedIn, note: session.portfolioNote });
  };
  const stopDrawing = session.subscribe(draw);

  poller = createPoller({
    tasks: [
      { name: 'board', everyMs: BOARD_EVERY_MS, run: session.refreshBoard },
      { name: 'portfolio', everyMs: PORTFOLIO_EVERY_MS, run: session.refreshPortfolio, enabled: () => tab === 'positions' },
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
  body.append(status, retry, tabs.element, register.element);
  // The close event arrives a moment after close(). If the panel was opened again in between, leave it alone.
  const modal = createModal({ title: 'Island Exchange', body, onClose() { if (modal.element.open) return; poller.stop(); resetInput?.(); focusGame?.(); } });
  modal.element.classList.add('market-modal');
  draw();

  function close() { modal.close(); }
  return {
    get active() { return modal.element.open; },
    open() {
      if (modal.element.open) return;
      resetInput?.();
      tabs.select(0); // every visit starts on the prices, with closed forms and a clean status line
      boardView.reset();
      positionsView.reset();
      say(trades.pending ? OUTCOME_UNKNOWN : '');
      showRetry();
      modal.open(container);
      poller.start();
      session.refreshPortfolio().catch(() => {}); // an adapter never throws, but a failed look must never break opening
    },
    close,
    dispose() { poller.stop(); stopDrawing(); modal.dispose(); },
  };
}
