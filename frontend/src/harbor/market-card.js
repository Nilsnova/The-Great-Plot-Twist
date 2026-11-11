// The market stall card: one row per asset (Bitcoin, Ether, gold, two stocks) with its real price, a tiny
// sparkline and "Up or down?" with 5 / 10 / 25 coins. It talks to the Exchange routes through the
// Exchange's own HTTP adapter (screens/market/http.js); the server decides every number.
//   const market = createMarketEntry(ctx);  await market.open();  market.active;  market.close();  market.dispose();
// ctx comes from online/market-host.js: {container, resetInput, focusGame, onSignIn, request, publicGet,
// getToken, onSessionChange}; tests pass `adapter` instead. game.js hands this file to createMarketHost.
// The backend has no automatic close after one hour, so an open stake shows "Close" and its gain or loss.
import {emit} from '../core/events.js';
import {makeActionUid} from '../screens/market/uid.js';
import {button, createCard, createPicker, el, replaceKeepingFocus, signInLine, sparkline} from './dom.js';
import {STAKE_EVENT} from './stakes.js';
import {SIDES, closedResult, marketView, newlyClosed, rememberPrices} from './market-model.js';
import {LOADING, MARKET, NOT_HEARD, PLAY_MONEY, SEND_AGAIN, TITLES, TRY_AGAIN, refusalText} from './words.js';

const BOARD_MS = 30000, PORTFOLIO_MS = 15000;
const history = new Map(); // survives closing the card, so the sparkline grows during a session

async function makeAdapter(ctx) {
  if (ctx.adapter) return ctx.adapter;
  const search = globalThis.location?.search ?? '';
  if (import.meta.env.DEV && new URLSearchParams(search).get('market') === 'local') {
    const {createFakeMarketAdapter} = await import('../screens/market/fake.js');
    return createFakeMarketAdapter({scenario: new URLSearchParams(search).get('scenario') ?? undefined});
  }
  const {createMarketHttpAdapter} = await import('../screens/market/http.js');
  return createMarketHttpAdapter({getToken: ctx.getToken, request: ctx.request, publicGet: ctx.publicGet});
}

export function createMarketEntry(ctx = {}) {
  const {container, resetInput, focusGame, onSignIn, onSessionChange, makeUid = makeActionUid, now = () => Date.now()} = ctx;
  let adapter = null, board = null, boardFailure = null, portfolio = null, portfolioFailure = null;
  let busy = false, attempt = null, seen = null, timers = [], disposed = false, opening = false, generation = 0;
  const notices = new Map(), selections = new Map();
  const card = createCard({title: TITLES.market, kind: 'market', marker: 'market-modal', resetInput, focusGame,
    onClose: () => { generation += 1; stopTimers(); }});
  const live = scope => !disposed && scope === generation && card.active;

  function stopTimers() { for (const timer of timers) clearInterval(timer); timers = []; }
  const hidden = () => globalThis.document?.hidden === true;
  async function readBoard(scope) {
    const answer = await adapter.board();
    if (!live(scope)) return;
    if (answer.ok) { board = answer.data; boardFailure = null; rememberPrices(history, board.companies); }
    else boardFailure = answer;
    render();
  }
  async function readPortfolio(scope) {
    const answer = await adapter.portfolio();
    if (!live(scope)) return;
    if (answer.ok) {
      portfolio = answer.data; portfolioFailure = null;
      if (!seen) seen = new Set((portfolio.recentlyClosed ?? []).map(position => position.id));
      for (const position of newlyClosed(portfolio, seen)) notices.set(position.companyId, {tone: tone(position.result), text: closedResult(position)});
    } else {
      portfolioFailure = answer;
      if (answer.status === 401 || answer.code === 'unauthorized') portfolio = null;
    }
    render();
  }
  const tone = gain => (gain > 0 ? 'good' : gain < 0 ? 'bad' : 'info');

  async function trade(kind, body, assetId, uid = makeUid()) {
    if (busy) return;
    const scope = generation;
    busy = true; attempt = {kind, body, assetId, uid}; card.say(''); render();
    const answer = kind === 'open' ? await adapter.open(body, {uid}) : await adapter.close(body, {uid});
    if (!live(scope)) { busy = false; return; }
    busy = false;
    if (answer.ok || answer.code === 'already_applied') {
      attempt = null;
      if (kind === 'open') {
        selections.delete(assetId);
        notices.set(assetId, {tone: 'good', text: MARKET.placed(body.stake, SIDES[body.side])});
        emit({type: STAKE_EVENT, kind: 'market', stake: body.stake});
      }
      await readPortfolio(scope);
      if (kind === 'close' && live(scope)) {
        const done = (portfolio?.recentlyClosed ?? []).find(position => position.id === body.positionId);
        seen?.add(body.positionId);
        notices.set(assetId, {tone: tone(done?.result), text: closedResult(done ?? answer.data)});
        render();
      }
      return;
    }
    if (answer.code === 'outcome_unknown') {
      card.say(NOT_HEARD, 'warn', [button(SEND_AGAIN, () => { const held = attempt; if (held) trade(held.kind, held.body, held.assetId, held.uid); })]);
      await readPortfolio(scope);
      return;
    }
    attempt = null;
    if (answer.status === 401 || answer.code === 'unauthorized') { portfolioFailure = answer; portfolio = null; }
    else notices.set(assetId, {tone: 'bad', text: refusalText(answer.code)});
    if (answer.code === 'market_closed' || answer.code === 'prices_stale') await readBoard(scope);
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
    if (notice) { const line = el('p', `harbor-notice harbor-${notice.tone}`, notice.text); item.append(line); }
    for (const holding of asset.holdings) {
      const row = el('div', 'harbor-holding');
      row.append(el('p', '', holding.line), el('p', 'harbor-now', holding.now));
      if (holding.canClose && portfolio) {
        const close = button(MARKET.close, () => trade('close', {positionId: holding.id}, asset.id));
        close.setAttribute('aria-label', holding.closeLabel); close.dataset.key = `close:${holding.id}`; close.disabled = busy;
        row.append(close);
      }
      item.append(row);
    }
    if (asset.canStake && !asset.holdings.length && portfolio) {
      if (!selections.has(asset.id)) selections.set(asset.id, {side: null, stake: null});
      item.append(el('p', 'harbor-question', MARKET.question), createPicker({name: asset.id, itemName: asset.name, busy, selection: selections.get(asset.id),
        sides: [{id: 'rising', label: MARKET.up}, {id: 'falling', label: MARKET.down}], stakes: asset.stakes,
        sideGroup: MARKET.sideGroup(asset.name), stakeGroup: MARKET.stakeGroup, choose: MARKET.choose,
        hint: (_side, stake) => MARKET.promise(stake), confirmText: MARKET.confirm,
        onConfirm: (side, stake) => trade('open', {companyId: asset.id, side, stake}, asset.id)}));
    }
    return item;
  }

  function render() {
    if (disposed) return;
    const view = marketView({board, boardFailure, portfolio, portfolioFailure, history, now: now()});
    const nodes = [];
    if (view.state === 'loading') nodes.push(el('p', 'harbor-quiet', LOADING));
    else if (view.state === 'unavailable') nodes.push(el('p', 'harbor-empty', view.line), button(TRY_AGAIN, () => refresh()));
    else {
      if (view.state === 'signed_out') nodes.push(signInLine(onSignIn));
      const listNode = el('div', 'harbor-list');
      listNode.append(...view.assets.map(assetNode));
      nodes.push(listNode);
    }
    nodes.push(el('p', 'harbor-footnote', PLAY_MONEY));
    replaceKeepingFocus(card.main, ...nodes);
  }

  function refresh() {
    const scope = generation;
    return Promise.all([readBoard(scope), readPortfolio(scope)]);
  }
  const stopSession = typeof onSessionChange === 'function' ? onSessionChange(() => {
    portfolio = null; portfolioFailure = null; attempt = null; seen = null; notices.clear(); card.say('');
    if (card.active) readPortfolio(generation);
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
        timers = [setInterval(() => { if (!hidden() && live(scope)) readBoard(scope); }, BOARD_MS),
          setInterval(() => { if (!hidden() && live(scope)) readPortfolio(scope); }, PORTFOLIO_MS)];
        void refresh();
      } finally { opening = false; }
    },
    close() { const was = opening || card.active; opening = false; card.close(); return was; },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; stopTimers();
      if (typeof stopSession === 'function') stopSession();
      card.dispose();
    },
  };
}
