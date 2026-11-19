// Economy protocol negotiation adds one read header without replacing verified-session authentication.
import {expect, it, vi} from 'vitest';
import {createIslandApi} from '../../src/island/api.js';
import {createApi} from '../../src/online/api.js';
import {createSession} from '../../src/online/session.js';
import {sharedIsland} from './economy-fixture.js';

it('negotiates a shared read through the authenticated HTTP adapter without altering Authorization', async () => {
  const session = createSession(); session.setToken('verified-session');
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(sharedIsland()), {status: 200}));
  const transport = createApi({session, fetchImpl});
  const api = createIslandApi({transport, negotiateEconomy: true});
  expect((await api.getIsland({headers: {Authorization: 'Bearer caller-value'}})).ok).toBe(true);
  expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({'X-Island-Economy-Version': '1', Authorization: 'Bearer verified-session'});
  expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty('body');
});

it('keeps the default legacy island read request unchanged', async () => {
  const get = vi.fn(async () => ({ok: true, data: {code: 'ISLE-K7Q2M', coins: 200, waveBest: 0, flags: 0, spots: []}}));
  const api = createIslandApi({transport: {get, post() {}}});
  expect((await api.getIsland()).ok).toBe(true);
  expect(get).toHaveBeenCalledWith('/api/island');
});

it('retains the economy capability through token renewal and keeps authentication session-owned', async () => {
  let token = 'old-session';
  const session = {getToken: () => token, getScope: () => 'same-account', clearToken: vi.fn(),
    renewToken: async () => { token = 'new-session'; return true; }};
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({error: {code: 'unauthorized', message: 'Renew the session.'}}), {status: 401}))
    .mockResolvedValueOnce(new Response(JSON.stringify(sharedIsland()), {status: 200}));
  const transport = createApi({session, fetchImpl});
  const api = createIslandApi({transport, negotiateEconomy: true});
  expect((await api.getIsland()).ok).toBe(true);
  expect(fetchImpl.mock.calls.map(call => call[1].headers['X-Island-Economy-Version'])).toEqual(['1', '1']);
  expect(fetchImpl.mock.calls.map(call => call[1].headers.Authorization)).toEqual(['Bearer old-session', 'Bearer new-session']);
});
