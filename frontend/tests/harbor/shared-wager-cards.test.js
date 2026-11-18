// Real Chromium component checks with injected API/auth/source data; not authenticated game acceptance.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('releases the actual host input block when the native card closes before its initial GET returns', async () => {
  const result = await evaluate(async () => {
    const {createSharedWagerHost} = await window.g20Import('/src/harbor/shared-wager-host.js');
    const {registerPanelServices} = await window.g20Import('/src/online/panel-services.js');
    const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const economy = {mode: 'island_shared', version: 1, islandOwner: id(1), accountId: id(3), runEpoch: id(4),
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}};
    const session = {isSignedIn: () => true, getScope: () => session};
    let releaseRead, requested;
    const waiting = new Promise(resolve => {requested = resolve;});
    const provider = registerPanelServices(session, {isReady: () => true, getActorId: () => id(2),
      getFlags: () => ({market: true}), api: {get: () => {requested(); return new Promise(resolve => {releaseRead = resolve;});}}});
    const host = createSharedWagerHost({session, container: document.body, getEconomy: () => economy});
    const opening = host.open('market'); await waiting;
    const before = host.active, dialog = document.querySelector('.shared-harbor');
    const closed = new Promise(resolve => dialog.addEventListener('close', resolve, {once: true}));
    dialog.querySelector('[aria-label="Close dialog"]').click(); await closed;
    const afterClose = host.active, stillOpen = dialog.open;
    releaseRead({ok: false, status: 503}); const opened = await opening;
    host.dispose(); provider.dispose();
    return {before, afterClose, stillOpen, opened};
  });
  expect(result).toEqual({before: true, afterClose: false, stillOpen: false, opened: false});
});

it('uses exact all-in above Number limits and publishes only the verified island origin', async () => {
  const result = await evaluate(async () => {
    const {createSharedMarketEntry} = await window.g20Import('/src/harbor/shared-market-card.js');
    const {acceptedWager} = await window.g20Import('/tests/harbor/shared-wager-fixtures.js');
    const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    let economy = {mode: 'island_shared', version: 1, islandOwner: uuid(1), accountId: uuid(3),
      runEpoch: uuid(4), revision: '1', treasury: {balanceCoins: '9007199254740993123', committedCoins: '0', availableCoins: '9007199254740993123'}};
    const sent = [], accepted = [];
    const api = {get: async () => ({ok: true, data: {economy, product: 'market_call', items: [], nextCursor: null,
      choices: [{id: 'harbor-trust', name: 'Bitcoin', open: true, options: [{id: 'up', label: 'Up'}, {id: 'down', label: 'Down'}]}]}}),
    post: async (path, body, options) => {
      sent.push({path, body, options});
      const next = {...economy, revision: '2', treasury: {...economy.treasury, committedCoins: body.stake, availableCoins: '0'}};
      return acceptedWager(body, economy, uuid(2), next);
    }};
    const card = createSharedMarketEntry({api, getEconomy: () => economy, getActorId: () => uuid(2),
      onEconomy(next, origin) { accepted.push(origin.accountId); economy = next; }});
    await card.open();
    const select = document.querySelector('.shared-harbor select'); select.value = 'up'; select.dispatchEvent(new Event('change'));
    document.querySelector('[data-key="harbor-trust:all"]').click();
    const value = document.querySelector('.shared-harbor input').value;
    document.querySelector('[data-key="harbor-trust:confirm"]').click();
    await new Promise(resolve => setTimeout(resolve, 60));
    const text = document.querySelector('.shared-harbor').textContent;
    card.dispose();
    return {sent, accepted, value, text};
  });
  expect(result.value).toBe('9007199254740993123');
  expect(result.sent[0].body.stake).toBe(result.value);
  expect(result.sent[0].path).toBe('/api/island/wagers/market');
  expect(result.sent[0].body).not.toHaveProperty('accountId');
  expect(result.accepted).toEqual(['00000000-0000-0000-0000-000000000003']);
  expect(result.text).toContain('Island available: 🪙 0');
});

it('keeps an unknown operation after closing and retries the exact body without another stake', async () => {
  const result = await evaluate(async () => {
    const {createSharedMatchEntry} = await window.g20Import('/src/harbor/shared-match-card.js');
    const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const economy = {mode: 'island_shared', version: 1, islandOwner: id(1), accountId: id(3), runEpoch: id(4),
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}};
    const sent = [];
    const api = {get: async () => ({ok: true, data: {economy, product: 'football', items: [], nextCursor: null,
      choices: [{id: 'fd-123', name: 'Home v Away', open: true, options: [{id: 'home', label: 'Home'}, {id: 'draw', label: 'Draw'}, {id: 'away', label: 'Away'}]}]}}),
      post: async (_path, body) => { sent.push(structuredClone(body)); return {ok: false, status: 0}; }};
    const make = () => createSharedMatchEntry({api, getEconomy: () => economy, getActorId: () => id(2)});
    let card = make(); await card.open();
    const select = document.querySelector('.shared-harbor select'); select.value = 'home'; select.dispatchEvent(new Event('change'));
    document.querySelector('[data-key="fd-123:confirm"]').click();
    await new Promise(resolve => setTimeout(resolve, 30)); card.dispose();
    card = make(); await card.open();
    const retry = [...document.querySelectorAll('.shared-harbor button')].find(button => button.textContent === 'Retry the same stake');
    retry.click(); await new Promise(resolve => setTimeout(resolve, 30)); card.dispose();
    return sent;
  });
  expect(result).toHaveLength(2);
  expect(result[1]).toEqual(result[0]);
  expect(result[0].stake).toBe('1');
});
