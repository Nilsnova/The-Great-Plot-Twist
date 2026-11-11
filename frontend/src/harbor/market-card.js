// The market stall card: "Up or down in 5 minutes?" (INTERFACES.md, the market stall, D034). One item per asset
// (Bitcoin, Ether, Gold, Apple, NVIDIA, with the server's names) with its real price, a tiny sparkline,
// Up / Down and 5 / 10 / 25 coins. Open calls count down to their five minutes; decided calls show their result.
// It talks to GET and POST /api/market/calls through calls-http.js; the server decides every number.
//   const market = createMarketEntry(ctx);  await market.open();  market.active;  market.close();  market.dispose();
// ctx comes from online/market-host.js: {container, resetInput, focusGame, onSignIn, request, onSessionChange};
// tests pass `adapter` instead. game.js hands this file to createMarketHost. In a dev build ?market=local
// uses the in-memory calls-fake.js.
import {emit} from '../core/events.js';
import {makeActionUid} from '../screens/market/uid.js';
import {button, createCard, createPicker, el, replaceKeepingFocus, signInLine, sparkline} from './dom.js';
import {STAKE_EVENT} from './stakes.js';
import {SIDES, callsView, rememberPrices} from './market-model.js';
import {LOADING, MARKET, NOT_HEARD, PLAY_MONEY, SEND_AGAIN, TITLES, TRY_AGAIN, refusalText} from './words.js';

const READ_MS = 15000; // a countdown in minutes stays right, and well inside the GET budget of 60 a minute
const history = new Map(); // survives closing the card, so the sparkline grows during a session

async function makeAdapter(ctx) {
  if (ctx.adapter) return ctx.adapter;
  const search = globalThis.location?.search ?? '';
  // import.meta.env.DEV stands in front on purpose: the build then drops this branch and the fake is not shipped.
  if (import.meta.env.DEV && new URLSearchParams(search).get('market') === 'local') {
    const {createFakeCallsAdapter} = await import('./calls-fake.js');
    return createFakeCallsAdapter();
  }
  const {createCallsHttpAdapter} = await import('./calls-http.js');
  return createCallsHttpAdapter({request: ctx.request});
}

export function createMarketEntry(ctx = {}) {
  const {container, resetInput, focusGame, onSignIn, onSessionChange, makeUid = makeActionUid, now = () => Date.now()} = ctx;
  let adapter = null, answer = null, failure = null;
  let busy = false, attempt = null, timer = null, disposed = false, opening = false, generation = 0;
  const notices = new Map(), selections = new Map();
  const card = createCard({title: TITLES.market, kind: 'market', marker: 'market-modal', resetInput, focusGame,
    onClose: () => { generation += 1; stopTimer(); }});
  const live = scope => !disposed && scope === generation && card.active;

  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  const hidden = () => globalThis.document?.hidden === true;
  async function read(scope) {
    const reply = await adapter.read();
    if (!live(scope)) return;
    if (reply.ok) { answer = reply.data; failure = null; rememberPrices(history, answer.assets); }
    else {
      failure = reply;
      if (reply.status === 401 || reply.code === 'unauthorized' || reply.code === 'feature_off') answer = null;
    }
    render();
  }

  // One confirmed click sends one call. "Send again" repeats it with the very same actionUid.
  async function place(body, uid = makeUid()) {
    if (busy) return;
    const scope = generation;
    busy = true; attempt = {body, uid}; card.say(''); render();
    const reply = await adapter.place(body, {uid});
    if (!live(scope)) { busy = false; return; }
    busy = false;
    if (reply.ok) {
      attempt = null; selections.delete(body.asset);
      notices.set(body.asset, {tone: 'good', text: MARKET.placed(body.stake, SIDES[body.direction])});
      emit({type: STAKE_EVENT, kind: 'market', stake: body.stake});
      if (answer && !answer.calls.some(call => call.id === reply.data.id)) {
        const {balance, ...call} = reply.data;
        answer = {...answer, calls: [call, ...answer.calls], balance: Number.isSafeInteger(balance) ? balance : answer.balance};
      }
      await read(scope);
      return;
    }
    if (reply.code === 'outcome_unknown') {
      card.say(NOT_HEARD, 'warn', [button(SEND_AGAIN, () => { const held = attempt; if (held) place(held.body, held.uid); })]);
      await read(scope);
      return;
    }
    attempt = null;
    if (reply.status === 401 || reply.code === 'unauthorized' || reply.code === 'feature_off') { failure = reply; answer = null; }
    else notices.set(body.asset, {tone: 'bad', text: refusalText(reply.code)});
    if (['market_closed', 'too_many_calls', 'insufficient_funds'].includes(reply.code)) await read(scope);
    render();
  }

  function assetNode(asset) {
    const item = el('article', 'harbor-item harbor-asset');
    const heading = el('h3', 'harbor-item-title', asset.name); heading.id = `harbor-asset-${asset.id}`;
    item.setAttribute('aria-labelledby', heading.id); item.dataset.asset = asset.id;
    const top = el('div', 'harbor-item-top');
    top.append(heading, el('p', 'harbor-price', asset.price));
    const spark = sparkline(asset.history); if (spark) top.append(spark);
    item.append(top);
    if (asset.reason) item.append(el('p', 'harbor-reason', asset.reason));
    const notice = notices.get(asset.id);
    if (notice) item.append(el('p', `harbor-notice harbor-${notice.tone}`, notice.text));
    for (const call of asset.calls) {
      const row = el('div', 'harbor-holding harbor-call'); row.dataset.call = call.id; row.dataset.open = String(call.open);
      row.append(el('p', '', call.line), el('p', `harbor-now harbor-${call.tone}`, call.state));
      item.append(row);
    }
    if (asset.canStake) {
      if (!selections.has(asset.id)) selections.set(asset.id, {side: null, stake: null});
      item.append(el('p', 'harbor-question', MARKET.question), createPicker({name: asset.id, itemName: asset.name, busy,
        selection: selections.get(asset.id), sides: [{id: 'up', label: MARKET.up}, {id: 'down', label: MARKET.down}],
        stakes: asset.stakes, sideGroup: MARKET.sideGroup(asset.name), stakeGroup: MARKET.stakeGroup, choose: MARKET.choose,
        hint: (_side, stake) => MARKET.promise(stake), confirmText: MARKET.confirm,
        onConfirm: (direction, stake) => place({asset: asset.id, direction, stake})}));
    }
    return item;
  }

  function render() {
    if (disposed) return;
    const view = callsView({answer, failure, history, now: now()});
    const nodes = [];
    if (view.state === 'loading') nodes.push(el('p', 'harbor-quiet', LOADING));
    else if (view.state === 'signed_out') nodes.push(signInLine(onSignIn));
    else if (view.state === 'off') nodes.push(el('p', 'harbor-empty', view.line));
    else if (view.state === 'unavailable') nodes.push(el('p', 'harbor-empty', view.line), button(TRY_AGAIN, () => refresh()));
    else {
      if (view.balance !== null) nodes.push(el('p', 'harbor-quiet harbor-balance', MARKET.balance(view.balance)));
      if (view.full) nodes.push(el('p', 'harbor-quiet', MARKET.full));
      const listNode = el('div', 'harbor-list');
      listNode.append(...view.assets.map(assetNode));
      nodes.push(listNode);
    }
    nodes.push(el('p', 'harbor-footnote', PLAY_MONEY));
    replaceKeepingFocus(card.main, ...nodes);
  }

  const refresh = () => read(generation);
  const stopSession = typeof onSessionChange === 'function' ? onSessionChange(() => {
    answer = null; failure = null; attempt = null; notices.clear(); selections.clear(); card.say('');
    if (card.active) { render(); void refresh(); }
  }) : null;

  return {
    get active() { return opening || card.active; },
    async open() {
      if (disposed || card.active) return;
      opening = true;
      try {
        adapter ??= await makeAdapter(ctx);
        if (disposed) return;
        generation += 1; card.say(''); render(); card.open(container);
        const scope = generation;
        stopTimer();
        timer = setInterval(() => { if (!hidden() && live(scope)) read(scope); }, READ_MS);
        void refresh();
      } finally { opening = false; }
    },
    close() { const was = opening || card.active; opening = false; card.close(); return was; },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; stopTimer();
      if (typeof stopSession === 'function') stopSession();
      card.dispose();
    },
  };
}
