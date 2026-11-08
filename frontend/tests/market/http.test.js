// The HTTP mapping of the Exchange adapter. A fake fetch stands in for the server: no network is used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketHttpAdapter } from '../../src/screens/market/http.js';

const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const refusal = (status, code, message = 'Plain words.', headers = {}) => reply({ error: { code, message } }, status, headers);
const later = answers => {
  const queue = [...answers];
  return vi.fn(async () => { const next = queue.shift(); if (next instanceof Error) throw next; return next; });
};
const hangUntilAborted = () => vi.fn((url, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
}));
const adapterFor = (fetchImpl, extra = {}) => createMarketHttpAdapter({ fetchImpl, getToken: () => 'tok-123', makeUid: () => 'made-uid-1', ...extra });
const headersOf = call => Object.fromEntries(Object.entries(call[1].headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));

const BOARD = { generatedAt: '2026-11-06T12:05:03Z', companies: [], rules: { stakeChoices: [] } };
const PORTFOLIO = { coins: 940, positions: [], recentlyClosed: [] };
const OPENED = { positionId: '2f0c', companyId: 'harbor-trust', side: 'rising', stake: 100, fee: 2, coinsChange: -102, coins: 838, entryPrice: 76159.21, zeroPrice: 68543.289, openedAt: '2026-11-06T12:05:04Z' };
const CLOSED = { positionId: '7b3e', closedAs: 'closed', closePrice: 76159.21, value: 115, fee: 2, coinsChange: 113, coins: 951, closedAt: '2026-11-06T12:06:10Z' };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('what it sends', () => {
  it('asks for the board without any token, because anyone may look', async () => {
    const fetchImpl = later([reply(BOARD)]);
    await adapterFor(fetchImpl).board();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/market');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    expect(headersOf(fetchImpl.mock.calls[0]).authorization).toBeUndefined();
  });

  it('asks for the portfolio with the bearer token', async () => {
    const fetchImpl = later([reply(PORTFOLIO)]);
    await adapterFor(fetchImpl).portfolio();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/market/portfolio');
    expect(headersOf(fetchImpl.mock.calls[0]).authorization).toBe('Bearer tok-123');
  });

  it('sends no Authorization header at all when there is no token, so the server answers 401', async () => {
    const fetchImpl = later([refusal(401, 'unauthorized', 'Not authenticated')]);
    const result = await adapterFor(fetchImpl, { getToken: () => null }).portfolio();
    expect(headersOf(fetchImpl.mock.calls[0]).authorization).toBeUndefined();
    expect(result).toMatchObject({ ok: false, code: 'unauthorized', status: 401 });
  });

  it('treats a token reader that throws as no token', async () => {
    const fetchImpl = later([reply(PORTFOLIO)]);
    const result = await adapterFor(fetchImpl, { getToken: () => { throw new Error('storage denied'); } }).portfolio();
    expect(result.ok).toBe(true);
    expect(headersOf(fetchImpl.mock.calls[0]).authorization).toBeUndefined();
  });

  it('posts the camelCase body for an open, with the uid of the click and nothing else', async () => {
    const fetchImpl = later([reply(OPENED)]);
    await adapterFor(fetchImpl).open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'click-uid-1' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/market/open');
    expect(options.method).toBe('POST');
    expect(headersOf(fetchImpl.mock.calls[0])['content-type']).toBe('application/json');
    expect(headersOf(fetchImpl.mock.calls[0]).authorization).toBe('Bearer tok-123');
    expect(JSON.parse(options.body)).toEqual({ companyId: 'harbor-trust', side: 'rising', stake: 100, actionUid: 'click-uid-1' });
  });

  it('never sends a price, a player or any extra field the caller slipped in', async () => {
    const fetchImpl = later([reply(OPENED)]);
    await adapterFor(fetchImpl).open({ companyId: 'harbor-trust', side: 'rising', stake: 100, price: 1, playerId: 'me' }, { uid: 'click-uid-1' });
    expect(Object.keys(JSON.parse(fetchImpl.mock.calls[0][1].body)).sort()).toEqual(['actionUid', 'companyId', 'side', 'stake']);
  });

  it('makes a fresh uid when the caller gives none, and a different one for each call', async () => {
    let count = 0;
    const fetchImpl = later([reply(OPENED), reply(OPENED)]);
    const adapter = adapterFor(fetchImpl, { makeUid: () => `made-${++count}` });
    await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 });
    await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).actionUid).toBe('made-1');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).actionUid).toBe('made-2');
  });

  it('sends the same uid again when the caller sends again', async () => {
    const fetchImpl = later([reply(OPENED), refusal(409, 'already_applied')]);
    const adapter = adapterFor(fetchImpl);
    const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
    await adapter.open(intent, { uid: 'same-click' });
    await adapter.open(intent, { uid: 'same-click' });
    const uids = fetchImpl.mock.calls.map(call => JSON.parse(call[1].body).actionUid);
    expect(uids).toEqual(['same-click', 'same-click']);
  });

  it('posts the position id and the uid for a close', async () => {
    const fetchImpl = later([reply(CLOSED)]);
    await adapterFor(fetchImpl).close({ positionId: '7b3e' }, { uid: 'close-uid-1' });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/market/close');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ positionId: '7b3e', actionUid: 'close-uid-1' });
  });

  it('keeps tokens and ids out of the address', async () => {
    const fetchImpl = later([reply(PORTFOLIO), reply(OPENED), reply(CLOSED)]);
    const adapter = adapterFor(fetchImpl);
    await adapter.portfolio();
    await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' });
    await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' });
    for (const call of fetchImpl.mock.calls) expect(call[0]).not.toMatch(/[?#]|tok-123|7b3e|u-1234567/);
  });
});

describe('what comes back', () => {
  it('wraps a good answer', async () => {
    const adapter = adapterFor(later([reply(BOARD), reply(PORTFOLIO), reply(OPENED), reply(CLOSED)]));
    expect(await adapter.board()).toEqual({ ok: true, data: BOARD });
    expect(await adapter.portfolio()).toEqual({ ok: true, data: PORTFOLIO });
    expect(await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' })).toEqual({ ok: true, data: OPENED });
    expect(await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' })).toEqual({ ok: true, data: CLOSED });
  });

  it('maps a refusal to code, message and status', async () => {
    const result = await adapterFor(later([refusal(409, 'market_closed', 'Apple trades in New York, which is closed now.')])).open({ companyId: 'apple', side: 'rising', stake: 100 }, { uid: 'u-1234567' });
    expect(result).toEqual({ ok: false, code: 'market_closed', message: 'Apple trades in New York, which is closed now.', status: 409, retryAfterSeconds: null });
  });

  it('reads how long to wait from Retry-After', async () => {
    const adapter = adapterFor(later([
      refusal(429, 'too_many_requests', 'Slow down.', { 'Retry-After': '7' }),
      refusal(429, 'too_many_requests', 'Slow down.', { 'Retry-After': 'soon' }),
      refusal(429, 'too_many_requests', 'Slow down.'),
    ]));
    const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
    expect((await adapter.open(intent, { uid: 'u-1234567' })).retryAfterSeconds).toBe(7);
    expect((await adapter.open(intent, { uid: 'u-1234567' })).retryAfterSeconds).toBe(null);
    expect((await adapter.open(intent, { uid: 'u-1234567' })).retryAfterSeconds).toBe(null);
  });

  it('gives an error without a readable body a code of its own', async () => {
    const adapter = adapterFor(later([new Response('<html>Bad gateway</html>', { status: 502 }), new Response('nope', { status: 418 })]));
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'server_error', status: 502, message: '' });
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'bad_response', status: 418 });
  });

  it('refuses an answer that is not the shape of the contract, so the panel never meets it', async () => {
    const adapter = adapterFor(later([reply({ hello: 'world' }), reply({ companies: [] }), reply({ coins: 3 }), reply('text')]));
    expect(await adapter.board()).toMatchObject({ ok: false, code: 'bad_response' });
    expect(await adapter.board()).toMatchObject({ ok: false, code: 'bad_response' });
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'bad_response' });
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'bad_response' });
  });
});

describe('when the outcome of a trade is not known', () => {
  const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
  const unknown = { ok: false, code: 'outcome_unknown' };

  it('turns a network failure on open and close into outcome_unknown', async () => {
    const adapter = adapterFor(later([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]));
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ...unknown, status: 0 });
    expect(await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' })).toMatchObject({ ...unknown, status: 0 });
  });

  it('turns a timeout after 10 seconds into outcome_unknown and cancels the request', async () => {
    const fetchImpl = hangUntilAborted();
    const pending = adapterFor(fetchImpl).open(intent, { uid: 'u-1234567' });
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ ...unknown, status: 0 });
  });

  it('turns a 503 from the database, a bare 503 and a 504 on open or close into outcome_unknown', async () => {
    const adapter = adapterFor(later([
      refusal(503, 'database_unavailable', 'The database did not answer in time.'),
      new Response('Service Unavailable', { status: 503 }),
      new Response('Gateway Timeout', { status: 504 }),
    ]));
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ...unknown, status: 503 });
    expect(await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' })).toMatchObject({ ...unknown, status: 503 });
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ...unknown, status: 504 });
  });

  it('keeps the code of a 503 that is a clear refusal, because nothing happened', async () => {
    const adapter = adapterFor(later([refusal(503, 'market_unavailable', 'The Island Exchange is not available right now.'), refusal(503, 'database_not_configured')]));
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'market_unavailable', status: 503 });
    expect(await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' })).toMatchObject({ ok: false, code: 'database_not_configured', status: 503 });
  });

  it.each([
    [500, 'server_error'], [502, 'bad_gateway'], [501, 'market_unavailable'],
    [505, 'database_not_configured'], [507, 'server_error'], [599, 'server_error'],
  ])('keeps uncertain HTTP%i opens and closes unknown without repeating a request', async (status, code) => {
    const privateText = `fixture-${crypto.randomUUID()}`, credential = `fixture-${crypto.randomUUID()}`;
    const fetchImpl = later([refusal(status, code, privateText), refusal(status, code, privateText)]);
    const adapter = adapterFor(fetchImpl, {getToken: () => credential});
    const openUid = crypto.randomUUID(), closeUid = crypto.randomUUID();
    const opened = await adapter.open(intent, {uid: openUid});
    const closed = await adapter.close({positionId: crypto.randomUUID()}, {uid: closeUid});
    for (const result of [opened, closed]) {
      expect(result).toMatchObject({ok: false, code: 'outcome_unknown', status});
      expect(result.message).not.toContain(privateText);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(call => JSON.parse(call[1].body).actionUid)).toEqual([openUid, closeUid]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([500, 502, 599])('keeps HTTP%i reads as ordinary failures without unknown-write recovery', async status => {
    const credential = `fixture-${crypto.randomUUID()}`;
    const adapter = adapterFor(later([refusal(status, 'server_error'), refusal(status, 'server_error')]), {getToken: () => credential});
    expect(await adapter.board()).toMatchObject({ok: false, code: 'server_error', status});
    expect(await adapter.portfolio()).toMatchObject({ok: false, code: 'server_error', status});
  });

  it('treats a good status with an unreadable body as an unknown outcome, because the trade may have happened', async () => {
    const adapter = adapterFor(later([new Response('<html>', { status: 200 }), reply({ nothing: true }), reply({ nothing: true })]));
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject(unknown);
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject(unknown);
    expect(await adapter.close({ positionId: '7b3e' }, { uid: 'u-7654321' })).toMatchObject(unknown);
  });

  it('does not call a failed read an unknown outcome, because a read changes nothing', async () => {
    const adapter = adapterFor(later([new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), refusal(503, 'database_unavailable')]));
    expect(await adapter.board()).toMatchObject({ ok: false, code: 'network_error', status: 0 });
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'network_error', status: 0 });
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'database_unavailable', status: 503 });
  });

  it('turns a timeout on a read into network_error', async () => {
    const pending = adapterFor(hangUntilAborted()).board();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ ok: false, code: 'network_error', status: 0 });
  });

  it('uses the timeout it is given', async () => {
    const fetchImpl = hangUntilAborted();
    const pending = adapterFor(fetchImpl, { timeoutMs: 2000 }).board();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({ code: 'network_error' });
  });
});

describe('it never throws and never leaves a timer behind', () => {
  it('resolves even when fetch throws at once', async () => {
    const adapter = adapterFor(() => { throw new Error('boom'); });
    expect(await adapter.board()).toMatchObject({ ok: false, code: 'network_error' });
    expect(await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'outcome_unknown' });
  });

  it('clears its timeout after every answer', async () => {
    const adapter = adapterFor(later([reply(BOARD), refusal(409, 'market_closed'), new TypeError('x')]));
    await adapter.board();
    await adapter.open({ companyId: 'apple', side: 'rising', stake: 100 }, { uid: 'u-1234567' });
    await adapter.board();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the global fetch by default', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = later([reply(BOARD)]);
    try {
      expect(await createMarketHttpAdapter().board()).toMatchObject({ ok: true });
      expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market');
    } finally { globalThis.fetch = original; }
  });
});

describe('optional normalized A2 facades', () => {
  const intent = {companyId: 'harbor-trust', side: 'rising', stake: 100};
  function facades() {
    const fetchImpl = vi.fn(() => { throw new Error('Fallback must not run'); });
    const getToken = vi.fn(() => `runtime-${crypto.randomUUID()}`);
    const publicGet = vi.fn(async () => ({ok: true, status: 200, data: BOARD}));
    const request = vi.fn(async path => ({ok: true, status: 200,
      data: path.endsWith('/portfolio') ? PORTFOLIO : path.endsWith('/close') ? CLOSED : OPENED}));
    return {fetchImpl, getToken, publicGet, request,
      adapter: createMarketHttpAdapter({fetchImpl, getToken, publicGet, request})};
  }
  it('uses only the public client for the board without consulting an auth token', async () => {
    const test = facades();
    expect(await test.adapter.board()).toEqual({ok: true, data: BOARD});
    expect(test.publicGet).toHaveBeenCalledExactlyOnceWith('/api/market');
    expect(test.request).not.toHaveBeenCalled();
    expect(test.getToken).not.toHaveBeenCalled();
    expect(test.fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only contract fields and preserves the action uid through the private facade', async () => {
    const test = facades(), uid = crypto.randomUUID();
    await test.adapter.portfolio();
    await test.adapter.open({...intent, price: 1, playerId: crypto.randomUUID()}, {uid});
    await test.adapter.open(intent, {uid});
    await test.adapter.close({positionId: 'recorded-position', price: 2}, {uid});
    expect(test.request.mock.calls).toEqual([
      ['/api/market/portfolio', {method: 'GET'}],
      ['/api/market/open', {method: 'POST', body: {...intent, actionUid: uid}}],
      ['/api/market/open', {method: 'POST', body: {...intent, actionUid: uid}}],
      ['/api/market/close', {method: 'POST', body: {positionId: 'recorded-position', actionUid: uid}}],
    ]);
    expect(test.publicGet).not.toHaveBeenCalled();
    expect(test.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'timeout', 'outcome_unknown'],
    [500, 'server_error', 'outcome_unknown'],
    [501, 'market_unavailable', 'outcome_unknown'],
    [502, 'bad_gateway', 'outcome_unknown'],
    [503, 'database_unavailable', 'outcome_unknown'],
    [504, 'server_error', 'outcome_unknown'],
    [505, 'database_not_configured', 'outcome_unknown'],
    [599, 'server_error', 'outcome_unknown'],
    [503, 'market_unavailable', 'market_unavailable'],
    [503, 'database_not_configured', 'database_not_configured'],
    [401, 'unauthorized', 'unauthorized'],
    [429, 'too_many_requests', 'too_many_requests'],
  ])('preserves the trade recovery meaning of status %i code %s', async (status, code, expected) => {
    const test = facades();
    test.request.mockResolvedValueOnce({ok: false, status, code, message: 'Recorded refusal.', retryAfterSeconds: 7});
    expect(await test.adapter.open(intent, {uid: crypto.randomUUID()}))
      .toMatchObject({ok: false, status, code: expected});
  });

  it.each([500, 502, 507, 599])('retains an uncertain normalized HTTP%i close with no fallback or automatic repeat', async status => {
    const test = facades(), positionId = crypto.randomUUID(), uid = crypto.randomUUID();
    test.request.mockResolvedValueOnce({ok: false, status, code: 'server_error', message: `fixture-${crypto.randomUUID()}`});
    expect(await test.adapter.close({positionId}, {uid})).toMatchObject({ok: false, code: 'outcome_unknown', status});
    expect(test.request.mock.calls).toEqual([['/api/market/close', {method: 'POST', body: {positionId, actionUid: uid}}]]);
    expect(test.fetchImpl).not.toHaveBeenCalled();
    expect(test.publicGet).not.toHaveBeenCalled();
    expect(test.getToken).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the countdown seconds and validates success shapes through the facade', async () => {
    const test = facades();
    test.request.mockResolvedValueOnce({ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 7});
    expect((await test.adapter.open(intent)).retryAfterSeconds).toBe(7);
    test.request.mockResolvedValueOnce({ok: true, status: 200, data: {coins: 1}});
    expect(await test.adapter.portfolio()).toMatchObject({ok: false, code: 'bad_response', status: 200});
    test.request.mockResolvedValueOnce({ok: true, status: 200, data: {coins: 1}});
    expect(await test.adapter.open(intent)).toMatchObject({ok: false, code: 'outcome_unknown', status: 200});
    test.publicGet.mockResolvedValueOnce({ok: true, status: 200, data: {companies: []}});
    expect(await test.adapter.board()).toMatchObject({ok: false, code: 'bad_response'});
  });

  it.each([200, 201, 204])('keeps an unreadable normalized HTTP%i write as an unknown outcome', async status => {
    const test = facades();
    test.request.mockResolvedValueOnce({ok: false, status, code: 'bad_response'});
    expect(await test.adapter.open(intent)).toMatchObject({ok: false, code: 'outcome_unknown', status});
  });

  it('treats rejected facade calls as safe read failures or unknown writes', async () => {
    const test = facades();
    test.publicGet.mockRejectedValueOnce(new Error(`runtime-${crypto.randomUUID()}`));
    test.request.mockRejectedValueOnce(new Error(`runtime-${crypto.randomUUID()}`));
    expect(await test.adapter.board()).toMatchObject({ok: false, code: 'network_error', status: 0});
    expect(await test.adapter.open(intent)).toMatchObject({ok: false, code: 'outcome_unknown', status: 0});
    expect(vi.getTimerCount()).toBe(0);
  });
});
