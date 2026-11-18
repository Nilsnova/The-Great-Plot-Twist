import {describe, expect, it} from 'vitest';
import {createSharedWagersHttp} from '../../src/harbor/shared-wagers-http.js';
import {acceptedWager} from './shared-wager-fixtures.js';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = id(2);
const economy = () => ({mode: 'island_shared', version: 1, islandOwner: id(1), accountId: id(3),
  runEpoch: id(4), revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}});
function store() {
  const records = new Map();
  return {getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key)};
}
function accepted(body, context, user = actor) {
  return acceptedWager(body, context, user);
}
function projection(context) {
  return {economy: context, product: 'market_call', nextCursor: null, items: [{id: id(30),
    product: 'market_call', eventId: 'harbor-trust', selection: 'up', stake: '1',
    openedAt: '2026-11-18T15:00:00Z', settleAt: '2026-11-18T15:05:00Z',
    actorName: 'Captain', home: null, away: null, status: 'open', payout: null}],
  choices: [{id: 'harbor-trust', name: 'Bitcoin', open: true,
    options: [{id: 'up', label: 'Up'}, {id: 'down', label: 'Down'}]}]};
}

describe('dedicated shared wager transport', () => {
  it('sends canonical full-fund stake and capability to the shared route without payer authority', async () => {
    const context = economy(), sent = [];
    const api = {post: async (path, body, options) => { sent.push({path, body, options}); return accepted(body, context); }};
    const client = createSharedWagersHttp({api, getEconomy: () => context, getActorId: () => actor,
      product: 'market_call', pendingStore: store(), makeUid: () => 'market001'});
    expect((await client.place({eventId: 'harbor-trust', selection: 'up', stake: '100'})).ok).toBe(true);
    expect(sent[0].path).toBe('/api/island/wagers/market');
    expect(sent[0].options.headers).toEqual({'X-Island-Economy-Version': '1'});
    expect(sent[0].body).toEqual({economy: {mode: 'island_shared', version: 1,
      islandOwner: id(1), runEpoch: id(4)}, actionUid: 'market001', stake: '100',
      asset: 'harbor-trust', direction: 'up'});
    expect(client.pending).toBe(null);
  });
  it('keeps unknown intent across close/reload and retries its exact original body', async () => {
    const context = economy(), pendingStore = store(), sent = [];
    const api = {post: async (_path, body) => { sent.push(structuredClone(body));
      return sent.length === 1 ? {ok: false, status: 0} : accepted(body, context); }};
    const config = {api, getEconomy: () => context, getActorId: () => actor,
      product: 'market_call', pendingStore, makeUid: () => 'market001'};
    const first = createSharedWagersHttp(config);
    expect((await first.place({eventId: 'harbor-trust', selection: 'up', stake: '100'})).unknown).toBe(true);
    const reloaded = createSharedWagersHttp({...config, makeUid: () => 'different-uid'});
    expect(reloaded.pending.body.actionUid).toBe('market001');
    expect((await reloaded.retry()).ok).toBe(true);
    expect(sent[1]).toEqual(sent[0]);
  });
  it('allows independent same-event stakes with fresh UIDs after each confirmed result', async () => {
    const context = economy(), sent = []; let counter = 0;
    const api = {post: async (_path, body) => { sent.push(body); return accepted(body, context); }};
    const client = createSharedWagersHttp({api, getEconomy: () => context, getActorId: () => actor,
      product: 'market_call', pendingStore: store(), makeUid: () => `market00${++counter}`});
    await client.place({eventId: 'harbor-trust', selection: 'up', stake: '1'});
    await client.place({eventId: 'harbor-trust', selection: 'down', stake: '1'});
    expect(sent.map(body => body.actionUid)).toEqual(['market001', 'market002']);
  });
  it('does not let another sign-in adopt a persisted pending intent', async () => {
    const context = economy(), pendingStore = store(); let user = actor;
    const client = createSharedWagersHttp({api: {post: async () => ({ok: false, status: 0})},
      getEconomy: () => context, getActorId: () => user, product: 'market_call', pendingStore});
    await client.place({eventId: 'harbor-trust', selection: 'up', stake: '1'});
    user = id(7);
    expect(client.pending).toBe(null);
    expect((await client.retry()).code).toBe('no_pending_wager');
  });
  it('never retargets an in-flight intent after an island or epoch change', async () => {
    let context = economy(), finish;
    const original = context;
    const client = createSharedWagersHttp({api: {post: (_path, body) => new Promise(resolve => {
      finish = () => resolve(accepted(body, original));
    })}, getEconomy: () => context, getActorId: () => actor, product: 'market_call', pendingStore: store()});
    const task = client.place({eventId: 'harbor-trust', selection: 'up', stake: '1'});
    context = {...economy(), runEpoch: id(9), accountId: id(10)};
    finish();
    expect((await task).code).toBe('economy_scope_changed');
    expect(client.pending).toBe(null);
  });
  it('treats a wrong-origin success as unknown and retains its retry identity', async () => {
    const context = economy();
    const client = createSharedWagersHttp({api: {post: async (_path, body) => accepted(body,
      {...context, accountId: id(99)})}, getEconomy: () => context, getActorId: () => actor,
      product: 'market_call', pendingStore: store()});
    expect((await client.place({eventId: 'harbor-trust', selection: 'up', stake: '1'})).unknown).toBe(true);
    expect(client.pending).not.toBe(null);
  });
  it('does not infer a personal fallback when economy context is missing', async () => {
    let calls = 0;
    const client = createSharedWagersHttp({api: {get: () => calls++, post: () => calls++},
      getEconomy: () => null, getActorId: () => actor, product: 'market_call'});
    expect((await client.read()).code).toBe('economy_scope_changed');
    expect((await client.place({stake: '1'})).code).toBe('economy_scope_changed');
    expect(calls).toBe(0);
  });
  it('accepts the complete account-scoped nested projection', async () => {
    const context = economy();
    const client = createSharedWagersHttp({api: {get: async () => ({ok: true, data: projection(context)})},
      getEconomy: () => context, getActorId: () => actor, product: 'market_call'});
    expect((await client.read()).ok).toBe(true);
  });
  it.each([
    ['missing options', value => { value.choices[0].options = null; }],
    ['wrong option label type', value => { value.choices[0].options[0].label = 1; }],
    ['unknown option', value => { value.choices[0].options[0].id = 'left'; }],
    ['duplicate options', value => { value.choices[0].options[1].id = 'up'; }],
    ['coerced open flag', value => { value.choices[0].open = 'true'; }],
    ['oversized choice label', value => { value.choices[0].name = 'x'.repeat(257); }],
    ['noncanonical activity coins', value => { value.items[0].stake = '01'; }],
    ['coerced activity coins', value => { value.items[0].stake = 1; }],
    ['activity missing UUID', value => { delete value.items[0].id; }],
    ['invalid activity time', value => { value.items[0].settleAt = 'not-a-time'; }],
    ['open activity with payout', value => { value.items[0].payout = '2'; }],
    ['forged winning amount', value => { value.items[0].status = 'won'; value.items[0].payout = '3'; }],
    ['unbounded activity page', value => { value.items = Array(51).fill(value.items[0]); }],
  ])('rejects malformed nested projection: %s', async (_label, corrupt) => {
    const context = economy(), data = projection(context); corrupt(data);
    const client = createSharedWagersHttp({api: {get: async () => ({ok: true, data})},
      getEconomy: () => context, getActorId: () => actor, product: 'market_call'});
    const result = await client.read();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('bad_response');
  });
  it.each([
    ['missing receiptId', value => { delete value.receipt.receiptId; }],
    ['invalid receiptId', value => { value.receipt.receiptId = 'not-a-uuid'; }],
    ['wrong valid receiptId', value => { value.receipt.receiptId = id(99); }],
    ['missing result', value => { delete value.receipt.result; }],
    ['missing financial receipt', value => { delete value.receipt.result.financialReceipt; }],
    ['forged financial principal', value => { value.receipt.result.financialReceipt.committedDelta = '2'; }],
    ['noncanonical financial coins', value => { value.receipt.result.financialReceipt.balanceAtCommit = 100; }],
    ['wrong source linkage', value => { value.receipt.result.wager.sourceReservationId = id(99); }],
  ])('retains the exact pending operation on unreadable success: %s', async (_label, corrupt) => {
    const context = economy(); let sent;
    const client = createSharedWagersHttp({api: {post: async (_path, body) => {
      sent = structuredClone(body); const response = accepted(body, context); corrupt(response.data); return response;
    }}, getEconomy: () => context, getActorId: () => actor, product: 'market_call',
    pendingStore: store(), makeUid: () => 'market001'});
    const result = await client.place({eventId: 'harbor-trust', selection: 'up', stake: '1'});
    expect(result.unknown).toBe(true);
    expect(client.pending.body).toEqual(sent);
  });
});
