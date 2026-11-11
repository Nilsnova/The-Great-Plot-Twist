// The fortune teller card: real yes or no questions (Manifold), pick a side, 5 / 10 / 25 coins, see what
// you would win, and "My stakes". Same surface as screens/predictions/desk.js, so game.js hands it to
// createPredictionsEntry: createDesk({container, resetInput, focus, search, onSignIn, request, getFlags,
// getIdentity, onIdentityChange}). The desk's own adapter (screens/predictions/adapter.js) does the HTTP.
import {emit} from '../core/events.js';
import {createDeskAdapter} from '../screens/predictions/adapter.js';
import {button, createCard, createPicker, el, myStakesList, replaceKeepingFocus, signInLine} from './dom.js';
import {fortuneView, sideLabel} from './fortune-model.js';
import {STAKE_EVENT} from './stakes.js';
import {FORTUNE, LOADING, MARKET, NOT_HEARD, PLAY_MONEY, POOL, SEND_AGAIN, TITLES, TRY_AGAIN, refusalText, resultText} from './words.js';

const REFRESH_MS = 30000;

export function createDesk(ctx = {}) {
  const {container, resetInput, focus, onSignIn, onIdentityChange = () => () => {}, refreshMs = REFRESH_MS} = ctx;
  let adapter = null, listReply = null, mineReply = null, busy = false, attempt = null, timer = null;
  let disposed = false, generation = 0, seen = null;
  const notices = new Map(), selections = new Map();
  const card = createCard({title: TITLES.fortune, kind: 'fortune', marker: 'desk-modal', resetInput, focusGame: focus,
    onClose: () => { generation += 1; clearInterval(timer); timer = null; }});
  const live = scope => !disposed && scope === generation && card.active;

  async function refresh(scope = generation) {
    const [list, mine] = await Promise.all([adapter.list(), adapter.mine()]);
    if (!live(scope)) return;
    if (list.kind === 'ok' || !listReply || listReply.kind !== 'ok') listReply = list;
    mineReply = mine;
    if (mine.kind === 'ok') {
      const settled = mine.data.stakes.filter(stake => stake.result);
      if (!seen) seen = new Set(settled.map(stake => stake.questionId));
      for (const stake of settled.filter(row => !seen.has(row.questionId))) {
        seen.add(stake.questionId);
        const gain = stake.result === 'won' ? (stake.payout ?? stake.amount) - stake.amount : stake.result === 'lost' ? -stake.amount : 0;
        notices.set(stake.questionId, {tone: gain > 0 ? 'good' : gain < 0 ? 'bad' : 'info', text: resultText(gain)});
      }
    }
    render();
  }

  async function place(body, label) {
    if (busy) return;
    const scope = generation;
    busy = true; attempt = {body, label}; card.say(''); render();
    let reply;
    try { reply = await adapter.stake(body); } catch { reply = {kind: 'unknown'}; }
    busy = false;
    if (!live(scope)) return;
    if (reply.kind === 'ok' || reply.kind === 'done') {
      attempt = null; selections.delete(body.questionId);
      notices.set(body.questionId, {tone: 'good', text: POOL.placed(body.amount, label)});
      emit({type: STAKE_EVENT, kind: 'fortune', stake: body.amount});
    } else if (reply.kind === 'unknown') {
      card.say(NOT_HEARD, 'warn', [button(SEND_AGAIN, () => { const held = attempt; if (held) place(held.body, held.label); })]);
    } else {
      attempt = null;
      if (reply.kind === 'signin') mineReply = reply;
      else notices.set(body.questionId, {tone: 'bad', text: reply.kind === 'wait' ? refusalText('too_many_requests')
        : reply.kind === 'closed' ? FORTUNE.closed : refusalText(reply.code)});
    }
    render();
    if (reply.kind !== 'unknown') await refresh(scope);
  }

  function questionNode(question) {
    const item = el('article', 'harbor-item harbor-question-item');
    const heading = el('h3', 'harbor-item-title', question.text); heading.id = `harbor-question-${question.id}`;
    item.setAttribute('aria-labelledby', heading.id); item.dataset.question = question.id;
    item.append(heading);
    const notice = notices.get(question.id);
    if (notice) item.append(el('p', `harbor-notice harbor-${notice.tone}`, notice.text));
    if (question.taken) item.append(el('p', 'harbor-holding', question.taken));
    if (question.canStake) {
      if (!selections.has(question.id)) selections.set(question.id, {side: null, stake: null});
      item.append(createPicker({name: question.id, itemName: question.text, busy, selection: selections.get(question.id), sides: question.sides,
        stakes: question.stakes, sideGroup: FORTUNE.pickGroup, stakeGroup: MARKET.stakeGroup, choose: POOL.choose,
        hint: question.hint, confirmText: POOL.confirm,
        onConfirm: (side, amount) => place({questionId: question.id, side, amount, stakeId: adapter.makeStakeId()}, sideLabel(side))}));
    }
    return item;
  }

  function render() {
    if (disposed) return;
    const view = fortuneView({listReply, mineReply});
    const nodes = [];
    if (view.state === 'loading') nodes.push(el('p', 'harbor-quiet', LOADING));
    else if (view.state === 'closed' || view.state === 'unavailable') {
      nodes.push(el('p', 'harbor-empty', view.line));
      if (view.state === 'unavailable') nodes.push(button(TRY_AGAIN, () => refresh()));
    } else {
      if (!view.signedIn) nodes.push(signInLine(onSignIn));
      if (view.state === 'empty') nodes.push(el('p', 'harbor-empty', view.line));
      const listNode = el('div', 'harbor-list'); listNode.append(...view.questions.map(questionNode)); nodes.push(listNode);
      if (view.signedIn) nodes.push(myStakesList(view.mine));
    }
    nodes.push(el('p', 'harbor-footnote', PLAY_MONEY));
    replaceKeepingFocus(card.main, ...nodes);
  }

  const stopIdentity = onIdentityChange(() => {
    mineReply = null; attempt = null; seen = null; notices.clear(); card.say('');
    if (card.active) refresh();
  });

  return {
    get active() { return card.active; },
    async open() {
      if (disposed || card.active) return;
      adapter ??= ctx.adapter ?? await createDeskAdapter({search: ctx.search, request: ctx.request, getFlags: ctx.getFlags, getIdentity: ctx.getIdentity});
      if (disposed) return;
      generation += 1; card.say(''); render(); card.open(container);
      const scope = generation;
      timer = setInterval(() => { if (!document.hidden && live(scope)) void refresh(scope); }, refreshMs);
      await refresh(scope);
    },
    close() { card.close(); },
    pause() {},
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; clearInterval(timer);
      if (typeof stopIdentity === 'function') stopIdentity();
      card.dispose();
    },
  };
}
