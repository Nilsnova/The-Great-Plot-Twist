// The market stall's HTTP side (src/harbor/calls-http.js) and its local dev fake (calls-fake.js): the exact
// routes and bodies of INTERFACES.md (the market stall), the house error shape, and "outcome_unknown"
// whenever a POST may have been applied.
import {describe, expect, it, vi} from 'vitest';
import {createCallsHttpAdapter} from '../../src/harbor/calls-http.js';
import {createFakeCallsAdapter} from '../../src/harbor/calls-fake.js';
import {callAssets, marketCall} from './fixtures.js';

const board = {assets: callAssets(), calls: [], balance: 100};

describe('calls http adapter', () => {
  it('reads GET /api/market/calls and posts exactly asset, direction, stake and actionUid', async () => {
    const request = vi.fn(async (_path, options) => (options.method === 'GET' ? {ok: true, status: 200, data: board}
      : {ok: true, status: 200, data: {...marketCall(), balance: 90}}));
    const adapter = createCallsHttpAdapter({request, makeUid: () => 'made-uid-1234'});
    expect(await adapter.read()).toEqual({ok: true, data: board});
    expect((await adapter.place({asset: 'harbor-trust', direction: 'up', stake: 10, extra: 1}, {uid: 'click-uid-1234'})).ok).toBe(true);
    await adapter.place({asset: 'apple', direction: 'down', stake: 5});
    expect(request.mock.calls).toEqual([['/api/market/calls', {method: 'GET'}],
      ['/api/market/calls', {method: 'POST', body: {asset: 'harbor-trust', direction: 'up', stake: 10, actionUid: 'click-uid-1234'}}],
      ['/api/market/calls', {method: 'POST', body: {asset: 'apple', direction: 'down', stake: 5, actionUid: 'made-uid-1234'}}]]);
  });
  it('keeps the server codes of refusals, and calls a lost or broken POST answer unknown', async () => {
    const answer = reply => createCallsHttpAdapter({request: async () => reply}).place({asset: 'apple', direction: 'up', stake: 5}, {uid: 'uid-12345678'});
    expect(await answer({ok: false, status: 409, code: 'insufficient_funds', message: 'Not enough.'}))
      .toEqual({ok: false, code: 'insufficient_funds', status: 409, message: 'Not enough.'});
    expect((await answer({ok: false, status: 401, code: 'whatever'})).code).toBe('unauthorized');
    expect((await answer({ok: false, status: 404, code: 'feature_off'})).code).toBe('feature_off');
    expect((await answer({ok: false, status: 503, code: 'market_unavailable'})).code).toBe('market_unavailable');
    for (const reply of [{ok: false, status: 0, code: 'network_error'}, {ok: false, status: 503, code: 'database_unavailable'},
      {ok: false, status: 502, code: 'database_error'}, {ok: true, status: 200, data: null}, null])
      expect((await answer(reply)).code).toBe('outcome_unknown');
    const thrown = createCallsHttpAdapter({request: async () => { throw new Error('gone'); }});
    expect((await thrown.place({}, {uid: 'uid-12345678'})).code).toBe('outcome_unknown');
    expect((await thrown.read()).code).toBe('network_error');
    expect((await createCallsHttpAdapter({request: async () => ({ok: true, status: 200, data: {}})}).read()).code).toBe('bad_response');
  });
});

describe('local calls fake (?market=local)', () => {
  it('shows prices, takes calls, refuses like the server and decides after the five minutes', async () => {
    let clock = Date.parse('2026-11-11T12:00:00Z');
    const fake = createFakeCallsAdapter({now: () => clock});
    const first = await fake.read();
    expect(first.data.assets.map(asset => asset.name)).toEqual(['Bitcoin', 'Ether', 'Gold', 'Apple', 'NVIDIA']);
    expect(first.data.assets.filter(asset => asset.open).length).toBe(4);
    const placed = await fake.place({asset: 'harbor-trust', direction: 'up', stake: 10}, {uid: 'uid-a-12345'});
    expect(placed.data).toMatchObject({status: 'open', stake: 10, balance: 90, settleAt: '2026-11-11T12:05:00Z'});
    expect((await fake.place({asset: 'harbor-trust', direction: 'up', stake: 10}, {uid: 'uid-a-12345'})).data).toMatchObject({id: placed.data.id, balance: 90});
    expect((await fake.place({asset: 'nvidia', direction: 'up', stake: 5}, {uid: 'uid-b-12345'})).code).toBe('market_closed');
    expect((await fake.place({asset: 'apple', direction: 'up', stake: 7}, {uid: 'uid-c-12345'})).code).toBe('bad_stake');
    await fake.place({asset: 'apple', direction: 'up', stake: 5}, {uid: 'uid-d-12345'});
    await fake.place({asset: 'apple', direction: 'down', stake: 5}, {uid: 'uid-e-12345'});
    expect((await fake.place({asset: 'apple', direction: 'up', stake: 5}, {uid: 'uid-f-12345'})).code).toBe('too_many_calls');
    clock += 300000;
    const later = await fake.read();
    expect(later.data.calls.every(call => ['won', 'lost', 'refunded'].includes(call.status))).toBe(true);
    const back = later.data.calls.reduce((sum, call) => sum + call.payout, 0);
    expect(later.data.balance).toBe(80 + back);
  });
});
