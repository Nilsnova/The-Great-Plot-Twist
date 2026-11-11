// The match board card: real football fixtures, pick a side, 5 / 10 / 25 coins, see what you would win,
// and "My stakes". Same surface as screens/sports/panel.js, so game.js hands it to createSportsEntry:
//   createSportsPanel({container, adapter, getToken, resetInput, focusGame, onSessionChange, onSignIn})
// adapter is screens/sports/http.js; screens/sports/actions.js keeps one stake id per click, so a
// "Send again" after a lost answer can never pay twice.
import {emit} from '../core/events.js';
import {createSportsActions} from '../screens/sports/actions.js';
import {button, createCard, createPicker, el, myStakesList, replaceKeepingFocus, signInLine} from './dom.js';
import {matchView} from './match-model.js';
import {STAKE_EVENT} from './stakes.js';
import {LOADING, MARKET, MATCH, NOT_HEARD, PLAY_MONEY, POOL, SEND_AGAIN, TITLES, TRY_AGAIN, refusalText, resultText} from './words.js';

export function createSportsPanel({container, adapter, getToken = () => null, resetInput, focusGame, onSessionChange,
  onSignIn, refreshMs = 30000, clock = Date.now, timeZone} = {}) {
  const actions = createSportsActions({adapter, getToken});
  let board = null, boardFailure = null, mine = null, mineFailure = null, busy = false, timer = null;
  let disposed = false, generation = 0, seen = null;
  const notices = new Map(), selections = new Map();
  const card = createCard({title: TITLES.match, kind: 'match', marker: 'sports-modal', resetInput, focusGame,
    onClose: () => { generation += 1; clearInterval(timer); timer = null; }});
  const live = scope => !disposed && scope === generation && card.active;
  const signedIn = () => Boolean(getToken()) && mineFailure?.status !== 401;

  async function refresh(scope = generation) {
    const [boardReply, mineReply] = await Promise.all([adapter.board(), getToken() ? adapter.mine() : Promise.resolve(null)]);
    if (!live(scope)) return;
    if (boardReply.ok) { board = boardReply.data; boardFailure = null; } else if (!board) boardFailure = boardReply;
    mine = mineReply?.ok ? mineReply.data : null; mineFailure = mineReply && !mineReply.ok ? mineReply : null;
    if (mine) {
      const settled = mine.stakes.filter(stake => stake.status === 'settled');
      if (!seen) seen = new Set(settled.map(stake => stake.id));
      for (const stake of settled.filter(row => !seen.has(row.id))) {
        seen.add(stake.id);
        const gain = String(stake.settlement ?? '').startsWith('refund_') ? 0 : (stake.payout ?? 0) - stake.amount;
        notices.set(stake.fixtureId, {tone: gain > 0 ? 'good' : gain < 0 ? 'bad' : 'info', text: resultText(gain)});
      }
    }
    render();
  }

  async function place(fixtureId, pick, amount, label) {
    if (busy) return;
    const scope = generation;
    busy = true; card.say(''); render();
    const reply = await actions.stake({fixtureId, pick, amount});
    busy = false;
    if (!live(scope)) return;
    if (reply.ok) {
      selections.delete(fixtureId);
      notices.set(fixtureId, {tone: 'good', text: POOL.placed(reply.data.amount, label)});
      emit({type: STAKE_EVENT, kind: 'match', stake: reply.data.amount});
    } else if (reply.unknown) {
      card.say(NOT_HEARD, 'warn', [button(SEND_AGAIN, () => { const held = actions.pending; if (held) place(held.fixtureId, held.pick, held.amount, label); })]);
    } else if (reply.status === 401) mineFailure = reply;
    else notices.set(fixtureId, {tone: 'bad', text: refusalText(reply.code)});
    render();
    if (reply.ok || !reply.unknown) await refresh(scope);
  }

  function matchNode(match) {
    const item = el('article', 'harbor-item harbor-match');
    const heading = el('h3', 'harbor-item-title', match.name); heading.id = `harbor-match-${match.id}`;
    item.setAttribute('aria-labelledby', heading.id); item.dataset.fixture = match.id;
    item.append(heading, el('p', 'harbor-quiet', match.when));
    const notice = notices.get(match.id);
    if (notice) item.append(el('p', `harbor-notice harbor-${notice.tone}`, notice.text));
    if (match.taken) item.append(el('p', 'harbor-holding', match.taken));
    else if (match.reason) item.append(el('p', 'harbor-reason', match.reason));
    if (match.canStake && mine) {
      if (!selections.has(match.id)) selections.set(match.id, {side: null, stake: null});
      item.append(createPicker({name: match.id, busy, selection: selections.get(match.id), sides: match.picks, stakes: match.stakes,
        sideGroup: MATCH.pickGroup(match.name), stakeGroup: MARKET.stakeGroup, choose: POOL.choose,
        hint: match.hint, confirmText: POOL.confirm, onConfirm: (pick, stake, label) => place(match.id, pick, stake, label)}));
    }
    return item;
  }

  function render() {
    if (disposed) return;
    const view = matchView({board, boardFailure, mine, signedIn: signedIn(), now: clock(), timeZone});
    const nodes = [];
    if (view.state === 'loading') nodes.push(el('p', 'harbor-quiet', LOADING));
    else if (view.state === 'closed' || view.state === 'unavailable') {
      nodes.push(el('p', 'harbor-empty', view.line));
      if (view.state === 'unavailable') nodes.push(button(TRY_AGAIN, () => refresh()));
    } else {
      if (!signedIn()) nodes.push(signInLine(onSignIn));
      if (view.state === 'empty') nodes.push(el('p', 'harbor-empty', view.line));
      const listNode = el('div', 'harbor-list'); listNode.append(...view.matches.map(matchNode)); nodes.push(listNode);
      if (signedIn()) nodes.push(myStakesList(view.mine));
    }
    nodes.push(el('p', 'harbor-footnote', PLAY_MONEY));
    replaceKeepingFocus(card.main, ...nodes);
  }

  const stopSession = typeof onSessionChange === 'function' ? onSessionChange(() => {
    actions.sync(); mine = null; mineFailure = null; seen = null; notices.clear(); card.say('');
    if (card.active) refresh();
  }) : null;

  return {
    get active() { return card.active; },
    async open() {
      if (disposed || card.active) return;
      generation += 1; actions.sync(); card.say(''); render(); card.open(container);
      const scope = generation;
      timer = setInterval(() => { if (!document.hidden && live(scope)) void refresh(scope); }, refreshMs);
      await refresh(scope);
    },
    close() { card.close(); },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; clearInterval(timer);
      if (typeof stopSession === 'function') stopSession();
      actions.dispose(); card.dispose();
    },
  };
}
