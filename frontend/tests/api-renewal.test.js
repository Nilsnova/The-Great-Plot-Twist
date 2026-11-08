// API renewal tests use injected fetches and generated placeholders, with no service or database.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createApi} from '../src/online/api.js';
import {createSession} from '../src/online/session.js';

const token = () => `test-${crypto.randomUUID()}`;
const reply = (status = 200) => new Response(JSON.stringify(status === 200 ? {ready: true}
  : {error: {code: 'unauthorized'}}), {status});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
function setup(fetchImpl) {
  const session = createSession();
  session.setToken(token());
  return {session, api: createApi({session, fetchImpl})};
}

describe('API access-token renewal', () => {
  afterEach(() => vi.useRealTimers());
  it.each(['/api/config', '/api/world', '/api/bulletin', '/api/market?replay=1'])(
    'keeps cached public reads anonymous even with a signed-in caller: %s', async path => {
      const fetchImpl = vi.fn().mockResolvedValue(reply(401));
      const {session, api} = setup(fetchImpl);
      const renew = vi.fn(() => true);
      session.setRenewal(renew);
      await api.get(path);
      expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(renew).not.toHaveBeenCalled();
      expect(session.isSignedIn()).toBe(true);
    });
  it('renews once on 401 and retries the unchanged write with a fresh bearer', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply());
    const {session, api} = setup(fetchImpl);
    const fresh = token();
    const renew = vi.fn(() => { session.setToken(fresh); return {ok: true}; });
    session.setRenewal(renew);
    const body = {actionUid: crypto.randomUUID()};
    expect((await api.post('/api/me/name/reroll', body)).ok).toBe(true);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/me/name/reroll');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({method: 'POST', body: JSON.stringify(body),
      headers: {Authorization: `Bearer ${fresh}`, 'Content-Type': 'application/json'}});
  });

  it('clears the failed session after a single refused retry', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => reply(401));
    const {session, api} = setup(fetchImpl);
    const renew = vi.fn(() => { session.setToken(token()); return true; });
    session.setRenewal(renew);
    expect((await api.get('/api/me')).status).toBe(401);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(session.isSignedIn()).toBe(false);
  });

  it('does not repeat the request when renewal fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(401));
    const {session, api} = setup(fetchImpl);
    session.setRenewal(() => ({ok: false}));
    expect((await api.get('/api/me')).status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(session.isSignedIn()).toBe(false);
  });

  it('shares renewal across concurrent 401 responses', async () => {
    const wait = deferred();
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401))
      .mockImplementation(() => reply());
    const {session, api} = setup(fetchImpl);
    const renew = vi.fn(async () => { await wait.promise; session.setToken(token()); return true; });
    session.setRenewal(renew);
    const first = api.get('/api/me');
    const second = api.get('/api/save');
    await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1));
    wait.resolve();
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not clear a new identity when an old request returns 401', async () => {
    const wait = deferred();
    const fetchImpl = vi.fn(() => wait.promise);
    const {session, api} = setup(fetchImpl);
    const old = session.getToken();
    const pending = api.get('/api/me');
    session.clearToken();
    session.setToken(old);
    const renew = vi.fn(() => true);
    session.setRenewal(renew);
    wait.resolve(reply(401));
    expect((await pending).status).toBe(401);
    expect(session.getToken()).toBe(old);
    expect(renew).not.toHaveBeenCalled();
  });

  it('does not replay a write after sign-out while renewal is pending', async () => {
    const wait = deferred();
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(401));
    const {session, api} = setup(fetchImpl);
    const renew = vi.fn(() => wait.promise);
    session.setRenewal(renew);
    const pending = api.post('/api/crews', {});
    await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1));
    session.clearToken();
    wait.resolve({ok: true});
    expect((await pending).status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(session.isSignedIn()).toBe(false);
  });

  it('never renews, retries or attaches a token to a public request', async () => {
    const wait = deferred();
    const fetchImpl = vi.fn(() => wait.promise);
    const {session, api} = setup(fetchImpl);
    session.clearToken();
    const renew = vi.fn(() => true);
    session.setRenewal(renew);
    const pending = api.get('/api/config');
    const fresh = token();
    session.setToken(fresh);
    wait.resolve(reply(401));
    expect((await pending).status).toBe(401);
    expect(session.getToken()).toBe(fresh);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
    expect(renew).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses an already refreshed token when a concurrent old 401 arrives late', async () => {
    const wait = deferred();
    const fetchImpl = vi.fn().mockImplementationOnce(() => wait.promise).mockResolvedValueOnce(reply());
    const {session, api} = setup(fetchImpl);
    const pending = api.get('/api/save');
    const fresh = token();
    session.setToken(fresh);
    const renew = vi.fn(() => true);
    session.setRenewal(renew);
    wait.resolve(reply(401));
    expect((await pending).ok).toBe(true);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(renew).not.toHaveBeenCalled();
  });

  it('does not replay an old private write after sign-out during the first 401 body read', async () => {
    const wait = deferred();
    const readBody = vi.fn(() => wait.promise);
    const fetchImpl = vi.fn().mockResolvedValueOnce({status: 401, ok: false, text: readBody});
    const {session, api} = setup(fetchImpl);
    session.setRenewal(() => { session.setToken(token()); return true; });
    const pending = api.post('/api/crews', {});
    await vi.waitFor(() => expect(readBody).toHaveBeenCalledTimes(1));
    session.clearToken();
    const fresh = token();
    session.setToken(fresh);
    wait.resolve(JSON.stringify({error: {code: 'unauthorized'}}));
    expect((await pending).status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(session.getToken()).toBe(fresh);
  });

  it('keeps the request timeout while renewal is stuck', async () => {
    vi.useFakeTimers();
    const session = createSession();
    session.setToken(token());
    const wait = deferred();
    session.setRenewal(() => wait.promise);
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(401));
    const api = createApi({session, fetchImpl, timeoutMs: 20});
    const pending = api.get('/api/me');
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).code).toBe('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    wait.resolve(false);
  });

  it('never retries an uncertain write after a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const {session, api} = setup(fetchImpl);
    const renew = vi.fn(() => true);
    session.setRenewal(renew);
    expect((await api.post('/api/crews')).code).toBe('network_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renew).not.toHaveBeenCalled();
  });
});
