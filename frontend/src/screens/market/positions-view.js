// The "Your positions" pane: the account lines, each open position with its live profit or loss in words,
// and the recently closed ones. It draws what view-models.js says and hands a close to onClosePosition.
// Closing asks once more ("Close and receive about 113 coins?"). Used by: panel.js.
import { node } from '../../ui/kit/dom.js';
import { createButton } from '../../ui/kit/button.js';
import { fact, factList, setText, syncList } from './parts.js';
import { positionRows } from './view-models.js';
import { SIGN_IN_WORDS } from './words.js';

function createPosition(onClosePosition) {
  const element = node('li', 'market-position');
  const title = node('h4', 'market-position-title'), side = node('span', 'kit-badge'), blocked = node('p', 'market-blocked');
  const facts = {
    stake: fact('Stake'), entry: fact('Entry price'), zero: fact('Zero point'),
    price: fact('Price now'), value: fact('Worth now'), profit: fact('Profit or loss'),
  };
  const receive = node('p', 'market-preview'), confirmText = node('p', 'market-preview');
  const ask = createButton({ label: 'Close position', onClick: () => { confirming = true; draw(); yes.element.focus(); } });
  const yes = createButton({ label: 'Yes, close it', onClick: close });
  const keep = createButton({ label: 'Keep it', variant: 'quiet', onClick: () => { confirming = false; draw(); ask.element.focus(); } });
  const confirmBox = node('div', 'market-form-actions');
  confirmBox.append(yes.element, keep.element);
  element.append(title, factList(...Object.values(facts)), receive, blocked, ask.element, confirmText, confirmBox);
  let row = null, confirming = false, busy = false;

  function draw() {
    const asking = confirming && row.canClose;
    ask.element.hidden = !row.canClose || asking;
    receive.hidden = !row.canClose || asking;
    confirmText.hidden = confirmBox.hidden = !asking;
    for (const button of [yes, keep]) button.update({ disabled: busy });
    blocked.hidden = row.canClose;
  }
  async function close() {
    if (busy) return;
    busy = true; draw();
    try { await onClosePosition({ positionId: row.id }); } finally { busy = false; confirming = false; draw(); }
  }

  return {
    element,
    reset() { confirming = false; if (row) draw(); },
    update(next) {
      row = next;
      if (!row.canClose) confirming = false;
      element.dataset.direction = row.direction;
      if (title.dataset.heading !== row.heading) { title.dataset.heading = row.heading; title.replaceChildren(row.heading, ' ', side); }
      setText(side, row.sideText);
      setText(facts.stake.value, row.stakeText);
      setText(facts.entry.value, row.entryText);
      setText(facts.zero.value, row.zeroText);
      setText(facts.price.term, row.priceLabel);
      setText(facts.price.value, row.priceAtText ? `${row.priceText} (${row.priceAtText})` : row.priceText);
      setText(facts.value.value, row.valueText);
      setText(facts.profit.value, row.profitText);
      setText(receive, row.receiveText);
      setText(confirmText, row.confirmText);
      setText(blocked, row.blockedText);
      ask.element.setAttribute('aria-label', row.closeLabel);
      draw();
    },
  };
}

function createClosed() {
  const element = node('li', 'market-closed'), title = node('h4', 'market-position-title'), line = node('p'), result = node('p', 'market-closed-result');
  element.append(title, line, result);
  return {
    element,
    update(row) {
      element.dataset.zeroed = String(row.zeroed);
      setText(title, `${row.heading}, ${row.sideText.toLowerCase()}`);
      setText(line, row.line);
      setText(result, row.resultText);
    },
  };
}

export function createPositionsView({ onClosePosition, timeZone }) {
  const element = node('div', 'market-positions');
  const note = node('p', 'market-refresh-note'), signIn = node('p', 'market-blocked', SIGN_IN_WORDS);
  const loading = node('p', 'market-empty', 'Loading your positions…');
  const account = node('div', 'market-account'), coins = node('p', 'market-coins'), staked = node('p'), count = node('p');
  const openTitle = node('h3', 'market-section-title', 'Open positions'), openList = node('ul', 'market-position-list'), openEmpty = node('p', 'market-empty');
  const closedTitle = node('h3', 'market-section-title', 'Recently closed');
  const closedList = node('ul', 'market-position-list'), closedEmpty = node('p', 'market-empty');
  account.append(coins, staked, count);
  const body = [account, openTitle, openList, openEmpty, closedTitle, closedList, closedEmpty];
  element.append(note, signIn, loading, ...body);
  const openItems = new Map(), closedItems = new Map();

  return {
    element,
    reset() { for (const item of openItems.values()) item.reset(); },
    update({ portfolio, board, signedIn, note: text }) {
      const view = positionRows(portfolio, board, { timeZone });
      setText(note, text);
      note.hidden = !text;
      signIn.hidden = signedIn !== false;
      loading.hidden = Boolean(portfolio) || signedIn === false || Boolean(text);
      for (const part of body) part.hidden = !portfolio;
      if (!portfolio) return;
      setText(coins, `You have ${view.coinsText}`);
      setText(staked, view.stakedText);
      setText(count, view.openCountText);
      syncList(openList, openItems, view.open, () => createPosition(onClosePosition));
      syncList(closedList, closedItems, view.closed, createClosed);
      setText(openEmpty, view.emptyOpenText);
      openEmpty.hidden = view.open.length > 0;
      setText(closedEmpty, view.emptyClosedText);
      closedEmpty.hidden = view.closed.length > 0;
    },
  };
}
