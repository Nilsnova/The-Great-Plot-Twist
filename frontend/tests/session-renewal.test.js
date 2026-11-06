// Renewal stays in memory and shares one auth request without reviving a signed-out session.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';

const token = () => `test-${crypto.randomUUID()}`;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

describe('session token renewal', () => {
  it('does not renew while signed out or without a handler', async () => {
    const session = createSession();
    const renew = vi.fn();
    session.setRenewal(renew);
    expect(await session.renewToken()).toBe(false);
    expect(renew).not.toHaveBeenCalled();
    session.setToken(token());
    session.setRenewal(() => false)();
    expect(await session.renewToken()).toBe(false);
  });

  it('shares concurrent renewal and keeps token changes out of screen events', async () => {
    const session = createSession();
    session.setToken(token());
    const listener = vi.fn();
    session.onChange(listener);
    const wait = deferred();
    const next = token();
    const renew = vi.fn(async () => {
      await wait.promise;
      session.setToken(next);
      return {ok: true};
    });
    session.setRenewal(renew);
    const first = session.renewToken();
    const second = session.renewToken();
    await Promise.resolve();
    expect(renew).toHaveBeenCalledTimes(1);
    wait.resolve();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(session.getToken()).toBe(next);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports thrown or refused renewals as false', async () => {
    const session = createSession();
    session.setToken(token());
    session.setRenewal(() => { throw new Error('unavailable'); });
    expect(await session.renewToken()).toBe(false);
    session.setRenewal(() => ({ok: false}));
    expect(await session.renewToken()).toBe(false);
  });

  it('does not accept renewal that finishes after sign-out', async () => {
    const session = createSession();
    session.setToken(token());
    const wait = deferred();
    session.setRenewal(() => wait.promise);
    const pending = session.renewToken();
    session.clearToken();
    wait.resolve({ok: true});
    expect(await pending).toBe(false);
    expect(session.isSignedIn()).toBe(false);
  });

  it('does not accept an old handler result after replacement', async () => {
    const session = createSession();
    session.setToken(token());
    const wait = deferred();
    session.setRenewal(() => wait.promise);
    const pending = session.renewToken();
    session.setRenewal(() => true);
    wait.resolve({ok: true});
    expect(await pending).toBe(false);
    expect(await session.renewToken()).toBe(true);
  });

  it('does not let an old unsubscribe remove the new handler', async () => {
    const session = createSession();
    session.setToken(token());
    const stop = session.setRenewal(() => false);
    session.setRenewal(() => true);
    stop();
    expect(await session.renewToken()).toBe(true);
  });

  it('rejects a non-function renewal handler', () => {
    expect(() => createSession().setRenewal(null)).toThrow(TypeError);
  });
});
