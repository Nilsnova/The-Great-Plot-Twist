// The desk's own small fetch wrapper: where it may call, when it sends the token, and what it answers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequest, REQUEST_TIMEOUT_MS } from '../../src/screens/predictions/request.js';

// A fake fetch that records every call and answers with the given status, body and headers.
function fakeFetch({ status = 200, body = {}, headers = {}, text } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: name => headers[name] ?? headers[name.toLowerCase()] ?? null },
      text: async () => (text !== undefined ? text : body === null ? '' : JSON.stringify(body)),
    };
  };
  return { fetchImpl, calls };
}

afterEach(() => vi.useRealTimers());

describe('where the desk may call', () => {
  const BAD_PATHS = [
    '/api/me',
    '/api/predictionsX',
    '/api/predictions/../me',
    '//evil.example/api/predictions',
    'https://evil.example/api/predictions',
    'api/predictions',
    '/api/predictions?player=1',
    '/api/predictions//mine',
  ];
  for (const path of BAD_PATHS) {
    it(`refuses ${path} before it calls fetch`, () => {
      const { fetchImpl, calls } = fakeFetch();
      const request = createRequest({ getToken: () => 'secret-token', fetchImpl });
      expect(() => request.get(path)).toThrow(TypeError);
      expect(() => request.post(path, {})).toThrow(TypeError);
      expect(calls).toHaveLength(0);
    });
  }

  it('accepts the four desk routes', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const request = createRequest({ fetchImpl });
    await request.get('/api/predictions');
    await request.get('/api/predictions/mine');
    await request.post('/api/predictions/stake', {});
    await request.post('/api/predictions/settle', {});
    expect(calls.map(call => call.url)).toEqual([
      '/api/predictions',
      '/api/predictions/mine',
      '/api/predictions/stake',
      '/api/predictions/settle',
    ]);
  });
});

describe('which fetch it uses', () => {
  it('looks up the global fetch at the moment of each call', async () => {
    const { fetchImpl, calls } = fakeFetch();
    vi.stubGlobal('fetch', fetchImpl);
    const request = createRequest();
    await request.get('/api/predictions');
    vi.unstubAllGlobals();
    expect(calls).toHaveLength(1);
  });

  it('refuses a fetchImpl that is not a function', () => {
    expect(() => createRequest({ fetchImpl: 'not a function' })).toThrow(TypeError);
  });
});

describe('the sign-in token', () => {
  it('is added as a bearer header when there is a token', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ getToken: () => 'abc123', fetchImpl }).get('/api/predictions/mine');
    expect(calls[0].options.headers.Authorization).toBe('Bearer abc123');
  });

  it('is left out when there is no token', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ getToken: () => null, fetchImpl }).get('/api/predictions/mine');
    expect(calls[0].options.headers.Authorization).toBeUndefined();
  });

  it('is left out of an anonymous call even when the player is signed in', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ getToken: () => 'abc123', fetchImpl }).get('/api/predictions', { anonymous: true });
    expect(calls[0].options.headers.Authorization).toBeUndefined();
  });

  it('never goes into the address', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ getToken: () => 'abc123', fetchImpl }).get('/api/predictions/mine');
    expect(calls[0].url).not.toContain('abc123');
  });
});

describe('what goes out', () => {
  it('sends a body as JSON with the right method and content type', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ fetchImpl }).post('/api/predictions/stake', { questionId: 'q-1', amount: 20 });
    const { options } = calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ questionId: 'q-1', amount: 20 });
  });

  it('sends a GET without a body', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ fetchImpl }).get('/api/predictions');
    expect(calls[0].options.method).toBe('GET');
    expect(calls[0].options.body).toBeUndefined();
  });

  it('hands fetch an abort signal so a stuck call can end', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await createRequest({ fetchImpl }).get('/api/predictions');
    expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('what comes back', () => {
  it('answers { ok: true, status, data } for a good answer', async () => {
    const { fetchImpl } = fakeFetch({ body: { questions: [] } });
    expect(await createRequest({ fetchImpl }).get('/api/predictions')).toEqual({
      ok: true,
      status: 200,
      data: { questions: [] },
    });
  });

  it('answers data null for an empty good answer', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, text: '' });
    expect(await createRequest({ fetchImpl }).get('/api/predictions')).toEqual({ ok: true, status: 200, data: null });
  });

  it('answers { ok: false, status, code, message } with the server error', async () => {
    const body = { error: { code: 'already_applied', message: 'This stake was already placed.' } };
    const { fetchImpl } = fakeFetch({ status: 409, body });
    expect(await createRequest({ fetchImpl }).post('/api/predictions/stake', {})).toEqual({
      ok: false,
      status: 409,
      code: 'already_applied',
      message: 'This stake was already placed.',
    });
  });

  it('uses a word for the status when the error has no code', async () => {
    const { fetchImpl } = fakeFetch({ status: 404, body: { detail: 'Not Found' } });
    const answer = await createRequest({ fetchImpl }).get('/api/predictions');
    expect(answer).toMatchObject({ ok: false, status: 404, code: 'not_found' });
    expect(answer.message.length).toBeGreaterThan(0);
  });

  it('reads Retry-After on a 429', async () => {
    const body = { error: { code: 'too_many_requests', message: 'Slow down.' } };
    const { fetchImpl } = fakeFetch({ status: 429, body, headers: { 'Retry-After': '7' } });
    const answer = await createRequest({ fetchImpl }).post('/api/predictions/stake', {});
    expect(answer).toMatchObject({ ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 7 });
  });

  it('ignores a Retry-After that is not a whole number', async () => {
    const { fetchImpl } = fakeFetch({ status: 429, body: null, headers: { 'Retry-After': 'Wed, 21 Oct 2026' } });
    const answer = await createRequest({ fetchImpl }).post('/api/predictions/stake', {});
    expect(answer.retryAfterSeconds).toBeUndefined();
  });

  it('answers status 0 and network_error when fetch fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await createRequest({ fetchImpl }).get('/api/predictions')).toMatchObject({
      ok: false,
      status: 0,
      code: 'network_error',
    });
  });

  it('never throws for a problem with the call itself', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, headers: { get: () => null }, text: async () => 'not json' });
    const answer = await createRequest({ fetchImpl }).get('/api/predictions');
    expect(answer).toMatchObject({ ok: false, status: 502 });
  });
});

describe('the time limit', () => {
  it('is 10 seconds', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10000);
  });

  it('gives up after 10 seconds with the code timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const pending = createRequest({ fetchImpl }).get('/api/predictions');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ ok: false, status: 0, code: 'timeout' });
  });
});
