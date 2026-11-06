// The sign-in session: a token in memory, and a way to hear about signing in and out. No network and no
// browser: the session is plain JavaScript.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createSession, session as sharedSession } from '../src/online/session.js';

const TOKEN = 'secret-login-token-123';

describe('the token', () => {
  it('starts signed out', () => {
    const session = createSession();
    expect(session.isSignedIn()).toBe(false);
    expect(session.getToken()).toBeNull();
  });

  it('keeps the token that is set', () => {
    const session = createSession();
    session.setToken(TOKEN);
    expect(session.isSignedIn()).toBe(true);
    expect(session.getToken()).toBe(TOKEN);
  });

  it('forgets the token when it is cleared', () => {
    const session = createSession();
    session.setToken(TOKEN);
    session.clearToken();
    expect(session.isSignedIn()).toBe(false);
    expect(session.getToken()).toBeNull();
  });

  it('replaces the token when a new one is set', () => {
    const session = createSession();
    session.setToken(TOKEN);
    session.setToken('a-fresh-token');
    expect(session.getToken()).toBe('a-fresh-token');
  });

  it.each([['an empty text', ''], ['only spaces', '   '], ['null', null], ['undefined', undefined], ['a number', 42], ['an object', { token: TOKEN }], ['a list', [TOKEN]]])(
    'refuses %s as a token and stays as it was',
    (_name, bad) => {
      const session = createSession();
      session.setToken(TOKEN);
      expect(() => session.setToken(bad)).toThrow(TypeError);
      expect(session.getToken()).toBe(TOKEN);
      expect(session.isSignedIn()).toBe(true);
    },
  );

  it('stays signed out after a refused token', () => {
    const session = createSession();
    expect(() => session.setToken('')).toThrow(TypeError);
    expect(session.isSignedIn()).toBe(false);
  });

  it('keeps one token per session: two sessions do not share', () => {
    const first = createSession();
    const second = createSession();
    first.setToken(TOKEN);
    expect(second.isSignedIn()).toBe(false);
    expect(second.getToken()).toBeNull();
    second.setToken('another-token');
    first.clearToken();
    expect(second.getToken()).toBe('another-token');
  });

  it('has one shared session for the game, signed out at the start', () => {
    expect(sharedSession.isSignedIn()).toBe(false);
  });
});

describe('listening', () => {
  it('tells a listener { signedIn } when the player signs in and out, and never the token', () => {
    const session = createSession();
    const listener = vi.fn();
    session.onChange(listener);
    session.setToken(TOKEN);
    session.clearToken();
    expect(listener.mock.calls).toEqual([[{ signedIn: true }], [{ signedIn: false }]]);
    expect(JSON.stringify(listener.mock.calls)).not.toContain(TOKEN);
    expect(listener.mock.calls.every(([state]) => Object.keys(state).join() === 'signedIn')).toBe(true);
  });

  it('stops telling a listener that unsubscribed', () => {
    const session = createSession();
    const listener = vi.fn();
    const stop = session.onChange(listener);
    session.setToken(TOKEN);
    stop();
    session.clearToken();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells nobody when clearing while already signed out', () => {
    const session = createSession();
    const listener = vi.fn();
    session.onChange(listener);
    session.clearToken();
    expect(listener).not.toHaveBeenCalled();
    session.setToken(TOKEN);
    session.clearToken();
    session.clearToken(); // twice
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('tells nobody when a new token replaces the old one, because nothing a screen shows has changed', () => {
    const session = createSession();
    session.setToken(TOKEN);
    const listener = vi.fn();
    session.onChange(listener);
    session.setToken('a-fresh-token');
    expect(listener).not.toHaveBeenCalled();
  });

  it('tells every listener', () => {
    const session = createSession();
    const first = vi.fn();
    const second = vi.fn();
    session.onChange(first);
    session.onChange(second);
    session.setToken(TOKEN);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not let a listener that throws break signing in or the other listeners', () => {
    const session = createSession();
    const after = vi.fn();
    session.onChange(() => { throw new Error('a broken screen'); });
    session.onChange(after);
    expect(() => session.setToken(TOKEN)).not.toThrow();
    expect(session.getToken()).toBe(TOKEN);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('lets a listener unsubscribe itself while it is being told', () => {
    const session = createSession();
    const other = vi.fn();
    let stop = () => {};
    stop = session.onChange(() => stop());
    session.onChange(other);
    session.setToken(TOKEN);
    session.clearToken();
    expect(other).toHaveBeenCalledTimes(2);
  });

  it.each([null, undefined, 'listener', 42, {}])('refuses %s as a listener', bad => {
    expect(() => createSession().onChange(bad)).toThrow(TypeError);
  });
});

describe('the source file', () => {
  // Whole-line comments are left out: they explain the rules and name the forbidden things.
  const source = readFileSync(new URL('../src/online/session.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

  it.each(['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console.'])(
    'never uses %s, so the token lives in memory only',
    forbidden => {
      expect(code).not.toContain(forbidden);
    },
  );
});
