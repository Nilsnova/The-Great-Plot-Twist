// Versioned arsenal client rules and durable retries; no authenticated execution is simulated.
import {expect, it, vi} from 'vitest';
import {createArsenalApi} from '../../src/island/arsenal-api.js';
import {arsenalModel, readArsenal} from '../../src/island/arsenal-model.js';
import {createArsenal} from '../../src/island/arsenal.js';

import {id, ACTOR, OWNER, economy, data} from './shared-arsenal-fixture.js';
function storage() {
  const records = new Map();
  return {getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key), records};
}
function mutation(view = data()) {
  return {status: 'done', operationId: id(6), repeat: false, currentEconomy: view.economy, arsenal: view,
    receipt: {receiptId: id(6), actionUid: 'arsenal001', action: 'arsenal_buy', actorId: ACTOR,
      origin: {mode: 'island_shared', version: 1, islandOwner: OWNER, accountId: id(3), runEpoch: id(4)},
      result: {copyId: id(5), weapon: 'pistols', holderGeneration: '1', priceCoins: '60', financialReceiptId: id(7)}}};
}

const legacy = () => ({code: 'ISLE-K7Q2M', capacity: 20, stored: 0, copies: [],
  mine: null, carried: 'musket', waveRunning: false, coins: 1000, unlockWave: 4});

it('uses an explicitly verified legacy context for reads, purchases and private controller updates', async () => {
  const context = {mode: 'personal_legacy', version: 0, islandOwner: OWNER};
  const bought = {...legacy(), coins: 940, mine: id(5), carried: 'pistols',
    copies: [{id: id(5), no: 1, weapon: 'pistols', holder: ACTOR, you: true, away: false}]};
  const transport = {get: vi.fn(async () => ({ok: true, data: legacy()})),
    post: vi.fn(async () => ({ok: true, data: bought}))};
  const getEconomy = () => context, api = createArsenalApi({transport, getEconomy, makeUid: () => 'legacy001'});
  expect((await api.state()).ok).toBe(true);
  const onCoins = vi.fn(), ui = {open: 'arsenal', arsenalCard: vi.fn(), toast: vi.fn()};
  const arsenal = createArsenal({api, getEconomy, ui, onCoins, enabled: () => true});
  await arsenal.refresh();
  expect(arsenal.answer.coins).toBe(1000);
  arsenal.handlers.buy('pistols');
  await new Promise(resolve => setImmediate(resolve));
  expect(transport.post).toHaveBeenCalledExactlyOnceWith('/api/island/arsenal/buy',
    {weapon: 'pistols', actionUid: 'legacy001'});
  expect(arsenal.answer.coins).toBe(940);
  expect(onCoins).toHaveBeenLastCalledWith(940, expect.any(Function));
});

it.each([null, undefined, {}, {mode: 'personal_legacy', version: 1},
  {mode: 'personal_legacy', version: '0'}, {mode: 'island_shared', version: 1}])(
  'refuses supplied unknown context %j before any private mutation', async context => {
    const transport = {post: vi.fn()};
    const api = createArsenalApi({transport, getEconomy: () => context});
    for (const result of [await api.buy({weapon: 'pistols'}), await api.take({copy: id(5)}), await api.giveBack()]) {
      expect(result).toMatchObject({ok: false, status: 409, code: 'economy_context_required'});
    }
    expect(transport.post).not.toHaveBeenCalled();
  });

it('reserves legacy factory compatibility for an omitted getter and allows read discovery with null', async () => {
  const transport = {get: vi.fn(async () => ({ok: true, data: legacy()})), post: vi.fn()};
  const api = createArsenalApi({transport, getEconomy: undefined});
  expect((await api.buy({weapon: 'pistols'})).status).toBe(409);
  const discovering = createArsenalApi({transport, getEconomy: () => null});
  expect((await discovering.state()).ok).toBe(true);
  expect(transport.post).not.toHaveBeenCalled();
});

it('does not apply private snapshots or send controller actions with a supplied null context', async () => {
  const api = {state: vi.fn(async () => ({ok: true, data: legacy()})), buy: vi.fn()};
  const onCoins = vi.fn(), ui = {open: 'arsenal', arsenalCard: vi.fn(), toast: vi.fn()};
  const arsenal = createArsenal({api, getEconomy: () => null, onCoins, ui, enabled: () => true});
  await arsenal.refresh();
  arsenal.handlers.buy('pistols');
  await new Promise(resolve => setImmediate(resolve));
  expect(arsenal.answer).toBeNull();
  expect(onCoins).not.toHaveBeenCalled();
  expect(api.buy).not.toHaveBeenCalled();
});

it('reads shared decimal funds without a private coins field or numeric ceiling', () => {
  const view = data();
  expect(readArsenal(view)).toBe(true);
  const model = arsenalModel({answer: view});
  expect(model.coins).toContain('Island');
  expect(model.shop.find(row => row.id === 'pistols').button.disabled).toBe(false);
  expect(model.stock).toContain('1 of 20');
  expect(model.shopTitle).toContain('island');
});

it('counts carried copies toward total20 and allows every grandfathered return', () => {
  const view = data();
  for (let i = 1; i < 24; i++) view.copies.push({...view.copies[0], id: id(50 + i), no: i + 1,
    holder: null, holderName: null, you: false, holderGeneration: '0'});
  view.total = 24; view.stored = 23;
  expect(readArsenal(view)).toBe(true);
  const model = arsenalModel({answer: view});
  expect(model.shop.every(row => row.button.disabled)).toBe(true);
  expect(model.back.disabled).toBe(false);
});

it('never treats malformed shared money as legacy personal coins', () => {
  const view = data(); view.coins = 1000; view.economy.treasury.availableCoins = 1000;
  expect(readArsenal(view)).toBe(false);
});

it('never accepts a legacy personal snapshot while a shared origin is selected', async () => {
  const legacy = {code: 'ISLE-K7Q2M', capacity: 20, stored: 0, copies: [], waveRunning: false, coins: 1000};
  const api = createArsenalApi({transport: {get: async () => ({ok: true, data: legacy})}, getEconomy: () => economy()});
  expect((await api.state()).ok).toBe(false);
});

it('shows a pending copy as unavailable until canonical wave closure', () => {
  const view = data();
  view.copies[0].pendingReturnWaveId = id(9); view.copies[0].you = false;
  view.mine = null; view.carried = 'musket'; view.waveRunning = true;
  const model = arsenalModel({answer: view});
  expect(model.rack[0].holder).toContain('return');
  expect(model.rack[0].button).toBeNull();
});

it('preserves exact original action and scope through unknown outcome, reload and retry', async () => {
  const store = storage(), transport = {post: vi.fn(async () => ({ok: false, status: 503, code: 'database_unavailable'}))};
  const options = {transport, getEconomy: () => economy(), getActorId: () => ACTOR, pendingStore: store,
    makeUid: () => 'arsenal001'};
  const first = createArsenalApi(options);
  await first.buy({weapon: 'pistols', code: 'ISLE-K7Q2M'});
  const original = structuredClone(transport.post.mock.calls[0]);
  const reloaded = createArsenalApi({...options, makeUid: () => 'different001'});
  transport.post.mockResolvedValue({ok: true, data: mutation()});
  const answer = await reloaded.buy({weapon: 'pistols', code: 'ISLE-K7Q2M'});
  expect(answer.ok).toBe(true);
  expect(transport.post.mock.calls[1]).toEqual(original);
  expect(original[1].economy).toEqual({mode: 'island_shared', version: 1, islandOwner: OWNER, runEpoch: id(4)});
  expect(original[1]).not.toHaveProperty('code');
  expect(original[2].headers).toEqual({'X-Island-Economy-Version': '1'});
  expect(store.records.size).toBe(0);
});

it('keeps the original scoped intent through a 401 and restores it for the same actor', async () => {
  let actor = ACTOR;
  const store = storage(), transport = {post: vi.fn(async () => ({ok: false, status: 503}))};
  const options = {transport, pendingStore: store, getEconomy: () => economy(), getActorId: () => actor};
  await createArsenalApi({...options, makeUid: () => 'arsenal001'}).buy({weapon: 'pistols'});
  const original = structuredClone(transport.post.mock.calls[0]);
  transport.post.mockResolvedValue({ok: false, status: 401, code: 'unauthorized'});
  const denied = await createArsenalApi({...options, makeUid: () => 'different001'}).buy({weapon: 'pistols'});
  expect(denied.status).toBe(401);
  expect(transport.post.mock.calls[1]).toEqual(original);
  expect(store.records.size).toBe(1);

  actor = id(90);
  transport.post.mockResolvedValue({ok: false, status: 503});
  await createArsenalApi({...options, makeUid: () => 'otheractor001'}).buy({weapon: 'pistols'});
  expect(transport.post.mock.calls[2][1].actionUid).toBe('otheractor001');
  expect(store.records.size).toBe(2);

  actor = ACTOR;
  transport.post.mockResolvedValue({ok: true, data: mutation()});
  const restored = await createArsenalApi({...options, makeUid: () => 'restored001'}).buy({weapon: 'pistols'});
  expect(restored.ok).toBe(true);
  expect(transport.post.mock.calls[3]).toEqual(original);
  expect(store.records.size).toBe(1);
  expect(JSON.parse([...store.records.values()][0]).actor).toBe(id(90));
});

it('sends the selected copy tenure and requires durable identity before shared writes', async () => {
  const transport = {post: vi.fn(async () => ({ok: false, status: 503}))};
  const api = createArsenalApi({transport, getEconomy: () => economy(), getActorId: () => ACTOR,
    pendingStore: storage(), makeUid: () => 'arsenal001'});
  await api.giveBack({copy: id(5), holderGeneration: '12345678901234567890'});
  expect(transport.post.mock.calls[0][1]).toMatchObject({copy: id(5), holderGeneration: '12345678901234567890'});
  const blocked = createArsenalApi({transport, getEconomy: () => economy(), getActorId: () => ACTOR,
    pendingStore: {getItem() { throw new Error('blocked'); }}});
  expect((await blocked.buy({weapon: 'pistols'})).ok).toBe(false);
  expect(transport.post).toHaveBeenCalledTimes(1);
});

it('drops a same-code old-epoch controller response and orders free changes by arsenal revision', async () => {
  let current = economy(), finish;
  const view = data(), api = {state: vi.fn(async () => ({ok: true, data: view})),
    buy: vi.fn(() => new Promise(resolve => { finish = resolve; }))};
  const onEconomy = vi.fn(), onCoins = vi.fn(), ui = {open: 'arsenal', arsenalCard: vi.fn(), toast: vi.fn()};
  const arsenal = createArsenal({api, ui, enabled: () => true, getEconomy: () => current,
    getActorId: () => ACTOR, onEconomy, onCoins});
  await arsenal.refresh();
  arsenal.handlers.buy('pistols');
  current = {...economy(id(90)), accountId: id(91)};
  const replacement = {...data(), economy: current, arsenalRevision: '5'};
  api.state.mockResolvedValue({ok: true, data: replacement});
  await arsenal.refresh();
  finish({ok: true, data: view}); await new Promise(resolve => setImmediate(resolve));
  expect(arsenal.answer.economy.runEpoch).toBe(id(90));
  expect(onCoins).not.toHaveBeenCalled();
  api.state.mockResolvedValue({ok: true, data: {...replacement, arsenalRevision: '4'}});
  await arsenal.refresh();
  expect(arsenal.answer.arsenalRevision).toBe('5');
});
