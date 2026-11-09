// G29 C1: guest (anonymous) sign-in, Google next to GitHub, and the guest upgrade, with fake SDKs only.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAuth} from '../src/online/auth.js';
import {createSession} from '../src/online/session.js';
import {createAuthStorage} from '../src/online/auth-storage.js';
import {signInAddress} from '../src/online/auth-state.js';
import {createLazyAuth} from '../src/online/lazy-auth.js';

const origin = 'https://placeholder.supabase.co';
const placeholder = () => `runtime-${crypto.randomUUID()}`;
function browserStorage() {
  const values = new Map();
  return {values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)};
}
const sdkSession = (anonymous = false) => ({access_token: placeholder(), expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {id: crypto.randomUUID(), is_anonymous: anonymous}});
function setup(overrides = {}) {
  const tab = browserStorage(), session = createSession();
  const storage = createAuthStorage({sessionStorage: () => tab});
  const redirect = vi.fn();
  const sdk = {
    getSession: vi.fn(async () => ({data: {session: null}, error: null})),
    signInAnonymously: vi.fn(async () => ({data: {session: sdkSession(true)}, error: null})),
    signInWithOAuth: vi.fn(async ({provider}) => ({error: null, data: {url:
      `${origin}/auth/v1/authorize?provider=${provider}&code_challenge_method=s256&code_challenge=${placeholder()}`}})),
    linkIdentity: vi.fn(async ({provider}) => ({error: null, data: {url: provider === 'google'
      ? `https://accounts.google.com/o/oauth2/v2/auth?state=${placeholder()}` : `https://github.com/login/oauth/authorize?state=${placeholder()}`}})),
    signOut: vi.fn(async () => ({error: null})), dispose: vi.fn(async () => {}),
    onAuthStateChange: vi.fn(() => ({data: {subscription: {unsubscribe() {}}}})),
    ...overrides.sdk,
  };
  const auth = createAuth({session, storage, supabaseUrl: origin, publishableKey: placeholder(),
    createClient: () => ({auth: sdk, from: vi.fn()}), redirect, href: 'https://game.example/'});
  active.push(auth);
  return {auth, sdk, session, redirect};
}
const active = [];
beforeEach(() => { vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden in auth unit tests'); }); });
afterEach(() => { for (const auth of active.splice(0)) auth.dispose(); vi.unstubAllGlobals(); });

describe('guest sign-in', () => {
  it('signs in anonymously, keeps only the token in memory and reports a guest', async () => {
    const f = setup();
    const result = await f.auth.signInAnonymously();
    expect(result).toMatchObject({ok: true, state: 'signed_in', guest: true});
    expect(f.sdk.signInAnonymously).toHaveBeenCalledOnce();
    expect(f.session.isSignedIn()).toBe(true);
    expect(f.auth.read()).toMatchObject({state: 'signed_in', guest: true});
    expect(f.redirect).not.toHaveBeenCalled();
  });
  it('shares one request between quick repeats and skips it when already signed in', async () => {
    const f = setup();
    const [first, second] = await Promise.all([f.auth.signInAnonymously(), f.auth.signInAnonymously()]);
    expect(first.ok && second.ok).toBe(true);
    await f.auth.signInAnonymously();
    expect(f.sdk.signInAnonymously).toHaveBeenCalledOnce();
  });
  it('falls back to signed out when anonymous sign-ins are off or fail', async () => {
    const f = setup({sdk: {signInAnonymously: vi.fn(async () => ({data: {session: null}, error: {message: 'Anonymous sign-ins are disabled'}}))}});
    const result = await f.auth.signInAnonymously();
    expect(result).toMatchObject({ok: false, state: 'signed_out'});
    expect(f.session.isSignedIn()).toBe(false);
    expect(f.auth.read().guest).toBeUndefined();
  });
});

describe('providers and the guest upgrade', () => {
  it('starts Google through the same PKCE redirect as GitHub', async () => {
    const f = setup();
    expect(await f.auth.signIn('google')).toMatchObject({ok: true});
    expect(f.sdk.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({provider: 'google',
      options: expect.objectContaining({skipBrowserRedirect: true})}));
    expect(new URL(f.redirect.mock.calls[0][0]).searchParams.get('provider')).toBe('google');
  });
  it('refuses unknown providers without loading the SDK', async () => {
    const f = setup();
    expect(await f.auth.signIn('myspace')).toMatchObject({ok: false});
    expect(f.sdk.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('links a provider to a guest and refuses an upgrade for anyone else', async () => {
    const f = setup();
    expect(await f.auth.upgrade('github')).toMatchObject({ok: false});
    await f.auth.signInAnonymously();
    expect(await f.auth.upgrade('google')).toMatchObject({ok: true});
    expect(f.sdk.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({provider: 'google'}));
    expect(f.sdk.signInWithOAuth).not.toHaveBeenCalled();
    expect(new URL(f.redirect.mock.calls[0][0]).origin).toBe('https://accounts.google.com');
  });
  it('accepts only our Supabase start page or the provider consent page for an upgrade', () => {
    const configuration = {url: origin};
    const start = `${origin}/auth/v1/authorize?provider=google&code_challenge_method=s256`;
    expect(signInAddress(start, configuration, {provider: 'google'})).toBe(start);
    expect(signInAddress(start, configuration, {provider: 'github'})).toBeNull();
    expect(signInAddress(start)).toBeNull();
    expect(signInAddress('https://github.com/login/oauth/authorize?x=1', configuration, {provider: 'github', upgrade: true})).not.toBeNull();
    expect(signInAddress('https://evil.example/login/oauth/authorize', configuration, {provider: 'github', upgrade: true})).toBeNull();
    expect(signInAddress('https://github.com/login/oauth/authorize', configuration, {provider: 'google', upgrade: true})).toBeNull();
  });
  it('passes provider and guest calls through the lazy wrapper', async () => {
    const calls = [];
    const fake = {read: () => ({state: 'signed_out'}), dispose() {},
      signIn: async provider => { calls.push(['signIn', provider]); return {ok: true}; },
      upgrade: async provider => { calls.push(['upgrade', provider]); return {ok: true}; },
      signInAnonymously: async () => { calls.push(['guest']); return {ok: true}; }};
    const lazy = createLazyAuth({supabaseUrl: origin, publishableKey: 'placeholder', storage: {close() {}, clearSession() {}},
      loadAuth: async () => ({createAuth: () => fake})});
    await lazy.signIn('google'); await lazy.upgrade('github'); await lazy.signInAnonymously();
    expect(calls).toEqual([['signIn', 'google'], ['upgrade', 'github'], ['guest']]);
    lazy.dispose();
  });
});
