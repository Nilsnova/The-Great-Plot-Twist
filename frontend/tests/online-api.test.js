// The browser's api client: it adds the token, sends JSON and turns the server's answers into results
// a screen can show. No network: a fake fetch stands in for the server, and fake timers stand in for
// ten seconds of waiting.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES, REQUEST_TIMEOUT_MS, api, createApi } from '../src/online/api.js';
import { createSession } from '../src/online/session.js';

const TOKEN = 'tok';

// A fake answer from the server: JSON with a status, like the real ones.
const answer = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
// The standard error shape of the server (backend/server/errors.py).
const errorAnswer = (status, code, message, headers = {}) => answer({ error: { code, message } }, status, headers);

// An api with a signed-in session (or a signed-out one) and a fake fetch that gives these answers.
function setup({ token = TOKEN, replies = [answer({ hello: 'world' })], timeoutMs } = {}) {
  const session = createSession();
  if (token) session.setToken(token);
  const fetchImpl = vi.fn();
  for (const reply of replies) fetchImpl.mockResolvedValueOnce(reply);
  return { session, fetchImpl, api: createApi({ session, fetchImpl, timeoutMs }) };
}

const lastCall = fetchImpl => ({ url: fetchImpl.mock.lastCall[0], options: fetchImpl.mock.lastCall[1] });

describe('what it sends', () => {
  it('sends the token of a signed-in player as "Authorization: Bearer"', async () => {
    const { api, fetchImpl } = setup();
    await api.get('/api/me');
    const { url, options } = lastCall(fetchImpl);
    expect(url).toBe('/api/me');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(options.body).toBeUndefined();
  });

  it('sends no Authorization header when the player is signed out', async () => {
    const { api, fetchImpl } = setup({ token: null });
    await api.get('/api/me');
    expect(lastCall(fetchImpl).options.headers).toEqual({});
  });

  it('sends a body as JSON with its Content-Type', async () => {
    const { api, fetchImpl } = setup();
    await api.post('/api/me/name/reroll', { actionUid: 'r8x2k9m4' });
    const { options } = lastCall(fetchImpl);
    expect(options.method).toBe('POST');
    expect(options.body).toBe('{"actionUid":"r8x2k9m4"}');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('sends a post without a body as a post without a body', async () => {
    const { api, fetchImpl } = setup();
    await api.post('/api/me/name');
    const { options } = lastCall(fetchImpl);
    expect(options.body).toBeUndefined();
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('sends put and del with their method and body', async () => {
    const { api, fetchImpl } = setup({ replies: [answer({}), answer({})] });
    await api.put('/api/save', { version: 3, data: { a: 1 } });
    expect(lastCall(fetchImpl).options.method).toBe('PUT');
    expect(lastCall(fetchImpl).options.body).toBe('{"version":3,"data":{"a":1}}');
    await api.del('/api/me', { confirm: true });
    expect(lastCall(fetchImpl).options.method).toBe('DELETE');
    expect(lastCall(fetchImpl).options.body).toBe('{"confirm":true}');
  });

  it('keeps a query string in the address, and the token out of it', async () => {
    const { api, fetchImpl } = setup();
    await api.get('/api/save?x=1');
    expect(lastCall(fetchImpl).url).toBe('/api/save?x=1');
  });

  it('never puts the token in the address', async () => {
    const { api, fetchImpl } = setup({ replies: [answer({}), answer({}), answer({}), answer({})] });
    await api.get('/api/me');
    await api.post('/api/me/name', { a: 1 });
    await api.put('/api/save', { version: 1, data: {} });
    await api.del('/api/me', { confirm: true });
    for (const [url] of fetchImpl.mock.calls) expect(url).not.toContain(TOKEN);
  });

  it('gives fetch a signal, so a hanging call can be cancelled', async () => {
    const { api, fetchImpl } = setup();
    await api.get('/api/me');
    expect(lastCall(fetchImpl).options.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the token that the session holds right now, not the one from the start', async () => {
    const { api, session, fetchImpl } = setup({ replies: [answer({}), answer({})] });
    await api.get('/api/me');
    session.setToken('a-fresh-token');
    await api.get('/api/me');
    expect(lastCall(fetchImpl).options.headers.Authorization).toBe('Bearer a-fresh-token');
  });
});

describe('a path that could send the token to another site', () => {
  it.each([
    'https://evil.example/api/me',
    '//evil.example/api/me',
    'api/me',
    '/api',
    '/apix/me',
    '/api//evil.example/x',
    '/api/me?next=https://evil.example',
    'http://localhost:8000/api/me',
    '',
    undefined,
    null,
    42,
  ])('is refused at once for %s, and fetch is never called', path => {
    const { api, fetchImpl } = setup();
    expect(() => api.get(path)).toThrow(TypeError);
    expect(() => api.post(path, {})).toThrow(TypeError);
    expect(() => api.put(path, {})).toThrow(TypeError);
    expect(() => api.del(path, {})).toThrow(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a body that cannot be written as JSON, and fetch is never called', () => {
    const { api, fetchImpl } = setup();
    const circular = {};
    circular.self = circular;
    expect(() => api.post('/api/me/name', circular)).toThrow(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('a good answer', () => {
  it('gives { ok: true, status, data }', async () => {
    const { api } = setup({ replies: [answer({ displayName: 'Brave Puffin 17' })] });
    expect(await api.get('/api/me')).toEqual({ ok: true, status: 200, data: { displayName: 'Brave Puffin 17' } });
  });

  it('gives data null for an empty answer', async () => {
    const { api } = setup({ replies: [new Response(null, { status: 204 })] });
    expect(await api.del('/api/me', { confirm: true })).toEqual({ ok: true, status: 204, data: null });
  });

  it('gives data null for an answer that is not JSON', async () => {
    const { api } = setup({ replies: [new Response('<html>hello</html>', { status: 200 })] });
    expect(await api.get('/api/me')).toEqual({ ok: true, status: 200, data: null });
  });
});

describe('401, 409 and 429', () => {
  it('turns 401 into the sign-in message and clears the session', async () => {
    const { api, session } = setup({ replies: [errorAnswer(401, 'unauthorized', 'Your login is not valid or has expired.')] });
    expect(session.isSignedIn()).toBe(true);
    const result = await api.get('/api/me');
    expect(result).toEqual({ ok: false, status: 401, code: 'unauthorized', message: 'Please sign in again.' });
    expect(MESSAGES.unauthorized).toBe('Please sign in again.');
    expect(session.isSignedIn()).toBe(false);
  });

  it('tells the session listeners about the 401', async () => {
    const { api, session } = setup({ replies: [errorAnswer(401, 'unauthorized', 'x')] });
    const listener = vi.fn();
    session.onChange(listener);
    await api.get('/api/me');
    expect(listener).toHaveBeenCalledWith({ signedIn: false });
  });

  it('handles a 401 without a usable body the same way', async () => {
    const { api, session } = setup({ replies: [new Response('nope', { status: 401 })] });
    const result = await api.get('/api/me');
    expect(result).toMatchObject({ ok: false, status: 401, code: 'unauthorized', message: MESSAGES.unauthorized });
    expect(session.isSignedIn()).toBe(false);
  });

  it('keeps the server message and code for a 409', async () => {
    const { api, session } = setup({ replies: [errorAnswer(409, 'already_applied', 'This was already done.')] });
    const result = await api.post('/api/market/trade', {});
    expect(result).toEqual({ ok: false, status: 409, code: 'already_applied', message: 'This was already done.' });
    expect(session.isSignedIn()).toBe(true); // a 409 does not sign anybody out
  });

  it.each(['already_applied', 'already_seated', 'already_started', 'stale_save'])('keeps the code %s, so a caller can tell what happened', async code => {
    const { api } = setup({ replies: [errorAnswer(409, code, 'Some message.')] });
    expect((await api.post('/api/crews/join', {})).code).toBe(code);
  });

  it('uses the default message for a 409 without a usable body', async () => {
    const { api } = setup({ replies: [new Response('conflict', { status: 409 }), answer({ error: { code: 'x' } }, 409), answer({ error: { message: '  ' } }, 409)] });
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await api.post('/api/crews', {});
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      expect(result.message).toBe(MESSAGES.conflict);
    }
  });

  it('uses the word "conflict" for a 409 that carries no code', async () => {
    const { api } = setup({ replies: [new Response('', { status: 409 })] });
    expect((await api.post('/api/crews', {})).code).toBe('conflict');
  });

  it('reads Retry-After: 30 and says how long to wait', async () => {
    const { api } = setup({ replies: [errorAnswer(429, 'too_many_requests', 'Slow down.', { 'Retry-After': '30' })] });
    const result = await api.post('/api/crews/join', { code: 'K7QF2M' });
    expect(result).toEqual({
      ok: false, status: 429, code: 'too_many_requests',
      message: 'Too many tries. Wait 30 seconds, then try again.', retryAfterSeconds: 30,
    });
    expect(result.message).toContain('30');
  });

  it('says "1 second" and not "1 seconds"', async () => {
    const { api } = setup({ replies: [errorAnswer(429, 'too_many_requests', 'x', { 'Retry-After': '1' })] });
    expect((await api.post('/api/crews/join', {})).message).toBe('Too many tries. Wait 1 second, then try again.');
  });

  it.each([[null], ['soon'], ['Wed, 21 Oct 2026 07:28:00 GMT'], ['0'], ['-5'], ['1.5']])('gives the plain message for a 429 with the Retry-After header %s', async header => {
    const headers = header === null ? {} : { 'Retry-After': header };
    const { api } = setup({ replies: [errorAnswer(429, 'too_many_requests', 'Slow down.', headers)] });
    const result = await api.post('/api/crews/join', {});
    expect(result.message).toBe('Too many tries. Wait a moment, then try again.');
    expect(result).not.toHaveProperty('retryAfterSeconds');
  });
});

describe('other errors', () => {
  it('uses the server message', async () => {
    const { api } = setup({ replies: [errorAnswer(422, 'validation_error', 'The request is not valid. body.version: x')] });
    expect(await api.put('/api/save', {})).toEqual({
      ok: false, status: 422, code: 'validation_error', message: 'The request is not valid. body.version: x',
    });
  });

  it('uses the plain message when the answer has no message', async () => {
    const { api } = setup({ replies: [new Response('<html>Bad gateway</html>', { status: 502 })] });
    expect(await api.get('/api/me')).toEqual({ ok: false, status: 502, code: 'http_error', message: MESSAGES.unknown });
  });

  it.each([[403, 'forbidden'], [404, 'not_found'], [500, 'server_error'], [503, 'unavailable'], [418, 'http_error']])('names status %i with the word %s when the server sent no code', async (status, code) => {
    const { api } = setup({ replies: [new Response('', { status })] });
    expect((await api.get('/api/me')).code).toBe(code);
  });

  it('keeps the server code for an error it does not know', async () => {
    const { api } = setup({ replies: [errorAnswer(503, 'database_unavailable', 'The database is not available right now.')] });
    const result = await api.get('/api/me');
    expect(result.code).toBe('database_unavailable');
    expect(result.message).toBe('The database is not available right now.');
  });

  it('never throws for a problem with the call: a thrown fetch is a network error', async () => {
    const session = createSession();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await createApi({ session, fetchImpl }).get('/api/me');
    expect(result).toEqual({ ok: false, status: 0, code: 'network_error', message: MESSAGES.network });
  });
});

describe('a call that takes too long', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // A fetch that never answers, and fails the way a real one does when it is cancelled.
  const hangingFetch = () => vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  }));

  it('gives up after 10 seconds and answers timeout', async () => {
    const session = createSession();
    const call = createApi({ session, fetchImpl: hangingFetch() }).get('/api/me');
    let done = false;
    call.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await call).toEqual({ ok: false, status: 0, code: 'timeout', message: MESSAGES.timeout });
    expect(REQUEST_TIMEOUT_MS).toBe(10000);
  });

  it('uses the timeout it is given', async () => {
    const session = createSession();
    const call = createApi({ session, fetchImpl: hangingFetch(), timeoutMs: 500 }).get('/api/me');
    await vi.advanceTimersByTimeAsync(500);
    expect((await call).code).toBe('timeout');
  });

  it('does not cancel a call that answered in time', async () => {
    const { api, fetchImpl } = setup();
    await api.get('/api/me');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
    expect(lastCall(fetchImpl).options.signal.aborted).toBe(false);
  });
});

describe('creating an api', () => {
  it('needs a session', () => {
    expect(() => createApi({ fetchImpl: vi.fn() })).toThrow(TypeError);
    expect(() => createApi({ session: {}, fetchImpl: vi.fn() })).toThrow(TypeError);
  });

  it('needs a fetch function', () => {
    expect(() => createApi({ session: createSession(), fetchImpl: 'fetch' })).toThrow(TypeError);
  });

  it('has the four methods, and one ready-made api for the game', () => {
    for (const client of [api, createApi({ session: createSession(), fetchImpl: vi.fn() })]) {
      expect(Object.keys(client).sort()).toEqual(['del', 'get', 'post', 'put']);
    }
  });
});

describe('the source file', () => {
  // Whole-line comments are left out: they explain the rules.
  const source = readFileSync(new URL('../src/online/api.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

  it.each(['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console.'])('never uses %s, so nothing about the token is stored or logged', forbidden => {
    expect(code).not.toContain(forbidden);
  });
});
