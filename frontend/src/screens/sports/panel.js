// The pavilion's two-tab native dialog. Reads stop on close; late answers cannot reopen it.
// Team names are plain text. Forms send intents only, and uncertain stakes keep their reference.
import './sports.css';
import { node, uniqueId } from '../../ui/kit/dom.js';
import { createModal } from '../../ui/kit/modal.js';
import { createTabs } from '../../ui/kit/tabs.js';
import { createSportsActions } from './actions.js';
import { formatCoins } from '../../lib/coins.js';
import { SIMULATION, UNKNOWN, fixtureStatus, pickName, settlementText, when } from './words.js';

function button(label, click, key) {
  const element = node('button', 'kit-button', label);
  element.type = 'button';
  if (key) element.dataset.focusKey = key;
  element.addEventListener('click', click);
  return element;
}
function line(text, className = '') { return node('p', className, text); }

export function createSportsPanel({ container, adapter, getToken = () => null, resetInput, focusGame,
  onSessionChange, refreshMs = 30000, clock = Date.now }) {
  const body = node('div', 'sports-body');
  const summary = node('header', 'sports-summary');
  const notice = line('', 'sports-notice');
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  notice.tabIndex = -1;
  const pendingBox = node('section', 'sports-pending');
  const fixtures = node('div', 'sports-fixtures'), mine = node('div', 'sports-mine');
  const tabs = createTabs({ items: [
    { id: 'fixtures', label: 'Fixtures', body: fixtures },
    { id: 'mine', label: 'My stakes', body: mine },
  ] });
  const refreshButton = button('Refresh results', () => refresh(), 'refresh');
  const footer = node('footer', 'sports-footer');
  footer.append(line(SIMULATION), line('Payouts wait for a verified result. Source credits are in Settings → Credits.'), refreshButton);
  body.append(summary, notice, pendingBox, tabs.element, footer);
  const modal = createModal({ title: 'Sports pavilion', body, onCancel: close,
    onClose(reason) { stop(); resetInput?.(); if (reason !== 'dispose') focusGame?.(); } });
  modal.element.classList.add('sports-modal');
  const stopKeys = event => event.stopPropagation();
  modal.element.addEventListener('keydown', stopKeys);
  modal.element.addEventListener('keyup', stopKeys);
  const actions = createSportsActions({ adapter, getToken });
  const drafts = new Map();
  let board = null, own = null, boardError = null, mineError = null;
  let disposed = false, timer = null, epoch = 0, sequence = 0, loading = false;
  const stopSession = onSessionChange?.(() => {
    epoch++; sequence++; loading = false; actions.sync(); own = null; mineError = null; drafts.clear();
    if (modal.element.open) { say('Your sign-in changed. Checking your own stakes…'); render(); void refresh(); }
  });

  function stop() { clearInterval(timer); timer = null; epoch++; sequence++; loading = false; }
  function close() { stop(); resetInput?.(); modal.close(); }
  function say(text) { notice.textContent = text; notice.hidden = !text; }
  function retainFocus(render) {
    const key = modal.element.contains(document.activeElement) ? document.activeElement?.dataset?.focusKey : null;
    render();
    if (key) [...modal.element.querySelectorAll('[data-focus-key]')]
      .find(element => element.dataset.focusKey === key)?.focus({ preventScroll: true });
  }
  function showError(parent, reply, fallback) {
    const off = reply?.code === 'feature_off';
    parent.append(line(off ? 'The sports pavilion is not open yet.'
      : reply?.status === 401 ? 'Sign in to see your stakes and use your play coins.'
      : reply?.message || fallback, 'sports-empty'));
  }
  function renderSummary() {
    summary.replaceChildren(node('span', 'sports-eyebrow', 'THE HARBOR SCOREBOARD'));
    summary.append(line('Play-money simulation · no cash value or prizes', 'sports-simulation'));
    if (board) {
      summary.append(line(`${board.provider} · ${board.source === 'recorded' ? 'Recorded data' : 'Live source, scores may be delayed'}`, 'sports-source'),
        line(`Source updated ${when(board.fetchedAt)}`, 'sports-freshness'));
    } else summary.append(line('Current fixtures, shared play-coin pools.', 'sports-source'));
    if (own) summary.append(line(`${formatCoins(own.coins)} · ${formatCoins(own.stakedToday)} staked today · ${formatCoins(own.coinsLeftToday)} left in today’s allowance`, 'sports-balance'));
  }
  function renderPending() {
    const pending = actions.pending;
    pendingBox.replaceChildren(); pendingBox.hidden = !pending;
    if (!pending) return;
    const fixture = board?.fixtures.find(value => value.id === pending.fixtureId);
    pendingBox.append(node('h3', '', actions.busy ? 'Waiting for the server' : 'One stake to check'),
      line(`${formatCoins(pending.amount)} · ${fixture ? pickName(pending.pick, fixture) : pending.pick} · ${fixture ? `${fixture.home} v ${fixture.away}` : pending.fixtureId}`),
      line(`Reference ${pending.stakeId}`, 'sports-reference'));
    const retry = button('Retry same stake', () => submit(pending), 'retry-stake');
    retry.disabled = actions.busy;
    pendingBox.append(retry);
  }
  function formFor(fixture) {
    const draft = drafts.get(fixture.id) ?? { pick: fixture.picks[0], amount: String(board.rules.minStake), review: false };
    drafts.set(fixture.id, draft);
    const form = node('form', 'sports-form');
    if (draft.review) {
      form.append(line(`Confirm ${formatCoins(draft.amount)} on ${pickName(draft.pick, fixture)}?`, 'sports-confirm'),
        line('The server checks the closing time, your balance and your daily limit.'));
      const confirm = button('Confirm stake', () => submit({ fixtureId: fixture.id, pick: draft.pick, amount: Number(draft.amount) }), `confirm-${fixture.id}`);
      const cancel = button('Edit choice', () => {
        draft.review = false; render();
        [...modal.element.querySelectorAll('[data-focus-key]')].find(element => element.dataset.focusKey === `pick-${fixture.id}`)?.focus();
      }, `edit-${fixture.id}`);
      form.append(confirm, cancel);
    } else {
      const pickId = uniqueId('sports-pick'), amountId = uniqueId('sports-amount');
      const pickLabel = node('label', '', 'Your pick'); pickLabel.htmlFor = pickId;
      const pick = node('select'); pick.id = pickId; pick.dataset.focusKey = `pick-${fixture.id}`;
      for (const value of fixture.picks) {
        const option = node('option', '', pickName(value, fixture)); option.value = value; pick.append(option);
      }
      pick.value = draft.pick; pick.addEventListener('change', () => { draft.pick = pick.value; });
      const amountLabel = node('label', '', 'Play coins'); amountLabel.htmlFor = amountId;
      const amount = node('input'); amount.id = amountId; amount.type = 'number'; amount.inputMode = 'numeric';
      amount.min = String(board.rules.minStake); amount.max = String(board.rules.maxStake); amount.step = '1';
      amount.required = true; amount.value = draft.amount; amount.dataset.focusKey = `amount-${fixture.id}`;
      amount.addEventListener('input', () => { draft.amount = amount.value; });
      const review = button('Review stake', () => {
        if (!form.reportValidity()) return;
        draft.review = true; render();
        [...modal.element.querySelectorAll('[data-focus-key]')].find(element => element.dataset.focusKey === `confirm-${fixture.id}`)?.focus();
      }, `review-${fixture.id}`);
      const choice = node('div', 'sports-field'), coins = node('div', 'sports-field');
      choice.append(pickLabel, pick); coins.append(amountLabel, amount);
      form.append(choice, coins, review);
    }
    form.addEventListener('submit', event => { event.preventDefault(); form.querySelector('button')?.click(); });
    return form;
  }
  function fixtureCard(fixture) {
    const card = node('article', 'sports-card');
    const head = node('header', 'sports-card-head');
    head.append(line(`${fixture.competition ?? fixture.sport ?? 'Sport'}`, 'sports-competition'),
      node('span', 'sports-badge', fixtureStatus(fixture, clock())));
    card.append(head, node('h3', '', `${fixture.home} v ${fixture.away}`),
      line(`Kickoff ${when(fixture.kickoff)}`, 'sports-time'),
      line(`Staking closes ${when(fixture.closesAt)}`, 'sports-time'));
    if (Number.isInteger(fixture.homeScore) && Number.isInteger(fixture.awayScore)) card.append(line(`${fixture.homeScore} : ${fixture.awayScore}`, 'sports-score'));
    const pool = node('ul', 'sports-pool');
    for (const pick of fixture.picks) {
      const side = fixture.pool.sides[pick] ?? { players: 0, coins: 0 };
      pool.append(node('li', '', `${pickName(pick, fixture)} · ${side.players} players · ${formatCoins(side.coins)}`));
    }
    card.append(pool, line(`Pool total · ${formatCoins(fixture.pool.total)}`, 'sports-pool-total'));
    if (fixture.pool.status === 'settled') {
      card.append(line(fixture.pool.outcome === 'void' ? 'Voided result · pool refunded'
        : `Verified result · ${pickName(fixture.pool.outcome, fixture)}`, 'sports-saved'));
      if (Number.isInteger(fixture.pool.paidCoins) && Number.isInteger(fixture.pool.cutCoins)) {
        card.append(line(`Pool returned ${formatCoins(fixture.pool.paidCoins)} · ${formatCoins(fixture.pool.cutCoins)} pool cut`));
      }
    }
    const available = fixture.canStake && fixture.source === 'live' && fixture.status === 'scheduled'
      && clock() < Date.parse(fixture.closesAt);
    const already = own?.stakes.some(stake => stake.fixtureId === fixture.id);
    if (already) card.append(line('Your stake is on file. See My stakes.', 'sports-saved'));
    else if (available && getToken() && !mineError && own && !actions.pending && !actions.busy) card.append(formFor(fixture));
    else if (available && !getToken()) card.append(line('Sign in from the game menu to use your play coins.'));
    else if (available && mineError) card.append(line('Your account could not be checked. Refresh before staking.'));
    else if (!available) card.append(line('Staking is closed for this fixture.'));
    return card;
  }
  function renderFixtures() {
    fixtures.replaceChildren();
    if (boardError) return showError(fixtures, boardError, 'Current sports fixtures are unavailable. Try again later.');
    if (!board) { fixtures.append(line('Checking the fixture board…')); return; }
    fixtures.append(line(`${formatCoins(board.rules.minStake)} to ${formatCoins(board.rules.maxStake)} per stake · ${formatCoins(board.rules.dailyCap)} per day · ${board.rules.poolCutPercent}% pool cut · closes ${board.rules.pickLeadMinutes} minutes before kickoff`, 'sports-rules'));
    if (!board.fixtures.length) fixtures.append(line('No current fixtures are listed. Check back later.', 'sports-empty'));
    for (const fixture of board.fixtures) fixtures.append(fixtureCard(fixture));
  }
  function renderMine() {
    mine.replaceChildren();
    if (!getToken()) { mine.append(line('Sign in from the game menu to see your own stakes.', 'sports-empty')); return; }
    if (mineError) return showError(mine, mineError, 'Your stakes are unavailable. Refresh to try again.');
    if (!own) { mine.append(line('Checking your stakes…')); return; }
    if (own.checksUnavailable) mine.append(line('Result checks are temporarily unavailable. Pending stakes have no confirmed payout.', 'sports-warning'));
    if (!own.stakes.length) mine.append(line('No sports stakes yet. Your play coins stay yours until you confirm a stake.', 'sports-empty'));
    for (const stake of own.stakes) {
      const card = node('article', 'sports-card');
      card.append(node('h3', '', `${stake.home} v ${stake.away}`),
        line(`${formatCoins(stake.amount)} on ${pickName(stake.pick, stake)}`),
        line(`Kickoff ${when(stake.kickoff)}`, 'sports-time'), line(settlementText(stake), 'sports-saved'));
      if (stake.status === 'open') {
        const check = button('Check verified result', () => settle(stake.fixtureId), `settle-${stake.id}`);
        check.disabled = actions.busy || Boolean(actions.pending);
        card.append(check);
      }
      mine.append(card);
    }
  }
  function render() {
    if (disposed) return;
    retainFocus(() => { renderSummary(); renderPending(); renderFixtures(); renderMine(); });
    refreshButton.disabled = actions.busy || loading;
  }
  async function refresh({ quiet = false } = {}) {
    if (disposed || !modal.element.open || actions.busy || loading) return;
    const current = epoch, ticket = ++sequence, account = getToken();
    loading = true; refreshButton.disabled = true;
    const [boardReply, mineReply] = await Promise.all([adapter.board(), account ? adapter.mine() : Promise.resolve(null)]);
    if (disposed || !modal.element.open || current !== epoch || ticket !== sequence) return;
    loading = false;
    if (account !== getToken()) { actions.sync(); own = null; mineError = null; return refresh(); }
    board = boardReply.ok ? boardReply.data : null; boardError = boardReply.ok ? null : boardReply;
    own = mineReply?.ok ? mineReply.data : null; mineError = mineReply && !mineReply.ok ? mineReply : null;
    const editing = modal.element.contains(document.activeElement) && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
    if (!quiet || (!editing && ![...drafts.values()].some(draft => draft.review))) render();
    else refreshButton.disabled = false;
  }
  async function submit(draft) {
    if (!actions.pending) {
      const fixture = board?.fixtures.find(value => value.id === draft.fixtureId);
      if (!fixture?.canStake || fixture.source !== 'live' || fixture.status !== 'scheduled'
        || clock() >= Date.parse(fixture.closesAt)) {
        say('Staking is closed or unavailable for that fixture. Refreshing the board…');
        drafts.delete(draft.fixtureId); render(); await refresh(); return;
      }
    }
    const current = epoch;
    const result = actions.stake(draft); say('Checking your stake with the server…'); render();
    const reply = await result;
    if (disposed || !modal.element.open) return;
    if (current !== epoch) { render(); await refresh(); return; }
    say(reply.ok ? (reply.data.repeat ? 'This stake was already saved. No second charge.' : 'Stake saved. Your play coins have been updated.')
      : reply.unknown ? UNKNOWN : reply.message);
    if (reply.ok) drafts.delete(draft.fixtureId);
    render();
    (actions.pending ? pendingBox.querySelector('button') : notice)?.focus({ preventScroll: true });
    if (reply.ok || !reply.unknown) await refresh();
  }
  async function settle(fixtureId) {
    const current = epoch;
    const result = actions.settle(fixtureId); say('Checking the provider’s verified result…'); render();
    const reply = await result;
    if (disposed || current !== epoch || !modal.element.open) return;
    say(reply.ok ? 'Result checked. Your stakes will show the confirmed return.'
      : reply.unknown ? 'The result check did not answer. Refresh your stakes; checking again is safe.' : reply.message);
    render(); await refresh();
  }
  return {
    get active() { return modal.element.open; },
    async open() {
      if (disposed || modal.element.open) return;
      epoch++; actions.sync(); own = null; board = null; mineError = null; boardError = null;
      say(actions.pending ? UNKNOWN : ''); resetInput?.(); render();
      const heading = modal.element.querySelector('h2'); heading.tabIndex = -1;
      modal.open(container, heading);
      timer = setInterval(() => { if (!document.hidden) void refresh({ quiet: true }); }, refreshMs);
      await refresh();
    }, close,
    dispose() {
      if (disposed) return; disposed = true; stop(); stopSession?.(); actions.dispose(); tabs.dispose();
      modal.element.removeEventListener('keydown', stopKeys); modal.element.removeEventListener('keyup', stopKeys);
      modal.dispose(); drafts.clear();
    },
  };
}
