// Shared market/football presentation. Money and results remain authoritative on the server.
import {button, createCard, el, replaceKeepingFocus} from './dom.js';
import {coinInteger, coinsText, validEconomy} from './shared-stakes.js';
import {createSharedWagersHttp} from './shared-wagers-http.js';
import './shared-wagers.css';

export function createSharedWagerCard(ctx = {}, product) {
  const client = ctx.adapter ?? createSharedWagersHttp({...ctx, product});
  const card = createCard({title: product === 'market_call' ? 'Island market stall' : 'Island match board',
    kind: product === 'market_call' ? 'market' : 'match',
    marker: product === 'market_call' ? 'market-modal' : 'sports-modal',
    resetInput: ctx.resetInput, focusGame: ctx.focusGame,
    onClose(reason) { generation++; clearInterval(timer); timer = null; ctx.onClose?.(reason); }});
  card.element.classList.add('shared-harbor');
  let page = null, items = [], message = '', busy = false, disposed = false, generation = 0, timer = null;
  let currentKey = client.scopeKey();
  const selections = new Map();
  const current = token => !disposed && card.active && token === generation && currentKey === client.scopeKey();
  async function refresh(cursor = null) {
    if (disposed || !card.active) return;
    const expectedOrigin = ctx.getEconomy?.();
    const token = generation, reply = await client.read(cursor);
    if (!current(token)) return;
    if (reply.ok) {
      if (page && coinInteger(reply.data.economy.revision) < coinInteger(page.economy.revision)) return;
      page = reply.data; message = '';
      items = cursor ? [...items, ...page.items.filter(row => !items.some(item => item.id === row.id))] : page.items;
      const latest = ctx.getEconomy?.();
      if (!validEconomy(latest) || coinInteger(page.economy.revision) > coinInteger(latest.revision)) ctx.onEconomy?.(page.economy, expectedOrigin);
    } else message = reply.message || 'The shared Harbor could not be read. Try again.';
    render();
  }
  async function place(draft, retry = false) {
    if (busy) return;
    busy = true; message = ''; render();
    const expectedOrigin = ctx.getEconomy?.();
    const token = generation;
    let reply;
    try { reply = await (retry ? client.retry() : client.place(draft)); }
    catch { reply = {ok: false, unknown: true, message: 'The server did not answer. Retry the same stake.'}; }
    if (!current(token)) { busy = false; return; }
    busy = false;
    if (reply.ok) {
      const economy = reply.data.currentEconomy;
      const latest = ctx.getEconomy?.();
      if (validEconomy(economy) && (!validEconomy(latest) || coinInteger(economy.revision) > coinInteger(latest.revision))) ctx.onEconomy?.(economy, expectedOrigin);
      message = 'The island stake was accepted.';
      await refresh();
    } else message = reply.message || 'The stake could not be placed.';
    render();
  }
  function choiceCard(choice, available) {
    const box = el('section', 'harbor-item'); box.dataset.event = choice.id;
    box.append(el('h3', 'harbor-item-title', choice.name));
    if (!choice.open) { box.append(el('p', 'harbor-quiet', 'This event is not open for new stakes.')); return box; }
    let selection = selections.get(choice.id);
    if (!selection) { selection = {pick: '', stake: '1'}; selections.set(choice.id, selection); }
    const pick = document.createElement('select'); pick.dataset.key = `${choice.id}:pick`;
    pick.setAttribute('aria-label', `Pick a side for ${choice.name}`);
    pick.append(new Option('Choose a side', ''));
    for (const option of choice.options) pick.append(new Option(option.label, option.id));
    pick.value = selection.pick;
    const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric';
    input.autocomplete = 'off'; input.value = selection.stake;
    input.className = 'shared-harbor-amount'; input.dataset.key = `${choice.id}:stake`;
    input.setAttribute('aria-label', `Whole-coin stake for ${choice.name}`);
    const preview = el('p', 'harbor-win');
    const confirm = button('Place island stake', () => void place({eventId: choice.id,
      selection: selection.pick, stake: selection.stake}), 'kit-button harbor-confirm');
    confirm.dataset.key = `${choice.id}:confirm`;
    const all = button('All in', () => { selection.stake = available; input.value = available; sync(); });
    all.dataset.key = `${choice.id}:all`; all.setAttribute('aria-label', `All in for ${choice.name}`);
    function sync() {
      let value = 0n;
      try { value = coinInteger(selection.stake); } catch { /* Invalid text never becomes a payment. */ }
      preview.textContent = value > 0n ? `A correct pick returns ${coinsText((value * 2n).toString())}.` : 'Enter a positive whole-coin amount.';
      confirm.disabled = busy || Boolean(client.pending) || !selection.pick || value < 1n || value > coinInteger(available);
      pick.disabled = input.disabled = all.disabled = busy || Boolean(client.pending);
    }
    pick.addEventListener('change', () => { selection.pick = pick.value; sync(); });
    input.addEventListener('input', () => { selection.stake = input.value; sync(); });
    box.append(pick, input, all, preview, confirm); sync(); return box;
  }
  function render() {
    if (disposed) return;
    const nodes = [];
    if (page) {
      const funds = page.economy.treasury;
      nodes.push(el('p', 'harbor-price', `Island available: ${coinsText(funds.availableCoins)} · Held: ${coinsText(funds.committedCoins)}`));
    }
    if (message) nodes.push(el('p', 'harbor-status', message));
    if (client.pending) {
      const retry = button('Retry the same stake', () => void place(null, true)); retry.disabled = busy;
      nodes.push(el('p', 'harbor-quiet', 'A stake is awaiting confirmation. Its original island and amount are preserved.'), retry);
    }
    if (!page) nodes.push(button('Refresh shared Harbor', () => void refresh()));
    else {
      nodes.push(...page.choices.map(choice => choiceCard(choice, page.economy.treasury.availableCoins)));
      if (!page.choices.length) nodes.push(el('p', 'harbor-quiet', 'Live events are unavailable. Your existing stakes remain recorded.'));
      const activity = el('section', 'harbor-own'); activity.append(el('h3', 'harbor-own-title', 'Island stakes'));
      for (const item of items) activity.append(el('p', 'shared-harbor-activity',
        `${item.actorName}: ${item.eventName ?? (item.home && item.away ? `${item.home} v ${item.away}` : 'Market call')} · ${item.selection} · ${coinsText(item.stake)} · ${item.status}${item.payout !== null ? ` · returned ${coinsText(item.payout)}` : ''}`));
      nodes.push(activity);
      if (page.nextCursor) nodes.push(button('More island activity', () => void refresh(page.nextCursor)));
    }
    nodes.push(el('p', 'harbor-footnote', 'Shared island play coins only. They cannot be bought or cashed out.'));
    replaceKeepingFocus(card.main, ...nodes);
  }
  function changed() {
    const key = client.scopeKey();
    if (key === currentKey) { if (card.active && !busy) void refresh(); return; }
    currentKey = key; generation++; busy = false; page = null; items = []; selections.clear();
    if (card.active) { render(); void refresh(); }
  }
  const stops = [ctx.subscribeEconomy?.(changed), ctx.onSessionChange?.(changed)];
  return {get active() { return card.active; }, async open() {
    if (disposed) return;
    currentKey = client.scopeKey(); generation++; card.open(ctx.container); render();
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !busy) void refresh(); }, ctx.refreshMs ?? 15000);
    await refresh();
  }, close: () => card.close(), dispose() {
    if (disposed) return; disposed = true; generation++; clearInterval(timer);
    for (const stop of stops) if (typeof stop === 'function') stop(); card.dispose();
  }};
}
