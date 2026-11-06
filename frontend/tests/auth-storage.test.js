// Auth persistence keeps PKCE in this tab and never clears the game's unrelated local progress.
import {describe, expect, it} from 'vitest';
import {AUTH_STORAGE_KEY as key, AUTH_STORAGE_MODE, createAuthStorage} from '../src/online/auth-storage.js';

const legacy = `${key}-code-verifier`;
const flow = `${key}-flow-placeholder-flow-code-verifier`;
const index = `${key}-flows-code-verifier`;
const value = () => JSON.stringify({placeholder: Math.random()});
function browserStorage() {
  const values = new Map();
  return {values, get length() { return values.size; }, key: number => [...values.keys()][number] ?? null,
    getItem: name => values.get(name) ?? null, setItem: (name, text) => { values.set(name, text); },
    removeItem: name => { values.delete(name); }};
}
function environment() {
  const session = browserStorage();
  const local = browserStorage();
  return {session, local, options: {sessionStorage: () => session, localStorage: () => local}};
}

describe('auth SDK storage', () => {
  it('defaults to session storage and preserves raw strings unchanged', () => {
    const env = environment();
    const storage = createAuthStorage(env.options);
    const raw = value();
    expect(AUTH_STORAGE_MODE).toBe('session');
    storage.setItem(key, raw);
    expect(env.session.getItem(key)).toBe(raw);
    expect(storage.getItem(key)).toBe(raw);
    expect(env.local.length).toBe(0);
  });

  it('keeps memory sessions ephemeral but survives reloads for every PKCE verifier key', () => {
    const env = environment();
    const options = {...env.options, mode: 'memory'};
    const first = createAuthStorage(options);
    first.setItem(key, value());
    for (const name of [legacy, flow, index]) first.setItem(name, value());
    const reloaded = createAuthStorage(options);
    expect(reloaded.getItem(key)).toBeNull();
    for (const name of [legacy, flow, index]) expect(reloaded.getItem(name)).toBe(first.getItem(name));
    expect(env.session.getItem(key)).toBeNull();
  });

  it('uses local storage only for an opted-in session while PKCE remains in session storage', () => {
    const env = environment();
    const storage = createAuthStorage({...env.options, mode: 'local'});
    storage.setItem(key, value());
    storage.setItem(`${key}-user`, value());
    storage.setItem(flow, value());
    expect(env.local.getItem(key)).toBe(storage.getItem(key));
    expect(env.local.getItem(`${key}-user`)).toBe(storage.getItem(`${key}-user`));
    expect(env.local.getItem(flow)).toBeNull();
    expect(env.session.getItem(flow)).toBe(storage.getItem(flow));
  });

  it('falls back to fixed instance memory when storage acquisition is blocked', () => {
    const storage = createAuthStorage({sessionStorage: () => { throw new Error('Blocked placeholder'); }});
    const raw = value();
    storage.setItem(key, raw);
    storage.setItem(legacy, raw);
    expect(storage.getItem(key)).toBe(raw);
    expect(storage.getItem(legacy)).toBe(raw);
    expect(storage.canKeepVerifier()).toBe(false);
    storage.removeItem(key);
    expect(storage.getItem(key)).toBeNull();
  });

  it.each(['getItem', 'setItem', 'removeItem'])('guards %s failures without losing shadow memory', method => {
    const env = environment();
    const storage = createAuthStorage(env.options);
    const raw = value();
    storage.setItem(key, raw);
    env.session[method] = () => { throw new Error('Quota placeholder'); };
    if (method === 'removeItem') storage.removeItem(key);
    else if (method === 'setItem') storage.setItem(key, raw);
    expect(storage.getItem(key)).toBe(method === 'removeItem' ? null : raw);
    storage.setItem(key, raw);
    expect(storage.getItem(key)).toBe(raw);
  });

  it('probes verifier capability with no session reads and removes its nonsecret probe', () => {
    const env = environment();
    const read=env.session.getItem;
    env.session.getItem = name => {
      expect(name).toBe(`${key}-storage-probe`);
      return read(name);
    };
    const storage = createAuthStorage(env.options);
    expect(storage.canKeepVerifier()).toBe(true);
    expect(env.session.length).toBe(0);
  });

  it('clears enumerated and previously untracked owned verifier keys without touching the session', () => {
    const env = environment();
    const raw = value();
    for (const name of [legacy, flow, index, key, 'journal', 'other-code-verifier']) env.session.setItem(name, raw);
    env.session.getItem = () => { throw new Error('Cleanup must not inspect stored values'); };
    createAuthStorage(env.options).clearVerifiers();
    expect([...env.session.values.keys()]).toEqual([key, 'journal', 'other-code-verifier']);
  });

  it('clears only its own session, user and verifier keys across persistence modes', () => {
    const env = environment();
    for (const store of [env.session, env.local]) {
      for (const name of [key, `${key}-user`, legacy, flow, index, 'journal', 'preferences']) store.setItem(name, value());
    }
    createAuthStorage({...env.options, mode: 'local'}).clearSession();
    expect([...env.session.values.keys()]).toEqual(['journal', 'preferences']);
    expect([...env.local.values.keys()]).toEqual(['journal', 'preferences']);
  });

  it('guards enumeration failures and can still clear keys written by this instance', () => {
    const env = environment();
    const storage = createAuthStorage(env.options);
    storage.setItem(flow, value());
    Object.defineProperty(env.session, 'length', {get() { throw new Error('Blocked enumeration'); }});
    expect(() => storage.clearVerifiers()).not.toThrow();
    expect(env.session.values.has(flow)).toBe(false);
  });

  it('closes storage permanently so late SDK operations cannot restore a signed-out session', () => {
    const env = environment();
    const storage = createAuthStorage(env.options);
    for (const name of [key, `${key}-user`, legacy, flow, index]) storage.setItem(name, value());
    storage.close();
    storage.close();
    for (const name of [key, `${key}-user`, legacy, flow, index]) {
      storage.setItem(name, value());
      expect(storage.getItem(name)).toBeNull();
    }
    expect(env.session.length).toBe(0);
    expect(storage.canKeepVerifier()).toBe(false);
  });
  it('can stop old SDK writes while preserving the stored session for a reload',()=>{
    const env=environment(),storage=createAuthStorage(env.options),saved=value();
    storage.setItem(key,saved);
    storage.close({clear:false});
    storage.setItem(key,value());
    expect(storage.getItem(key)).toBeNull();
    expect(createAuthStorage(env.options).getItem(key)).toBe(saved);
  });
});
