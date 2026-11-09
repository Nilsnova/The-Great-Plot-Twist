// G29 email: the 6-digit email code sign-in (Supabase email OTP) and the guest upgrade to email,
// against a fake supabase-js client. No network: global fetch throws.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAuth} from '../src/online/auth.js';
import {createSession} from '../src/online/session.js';
import {createAuthStorage} from '../src/online/auth-storage.js';
import {emailFailure, normalEmail, validEmailCode} from '../src/online/auth-state.js';

const origin = 'https://placeholder.supabase.co';
const address = 'captain@example.org';
const placeholder = () => `runtime-${crypto.randomUUID()}`;
function browserStorage() {
  const values = new Map();
  return {values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)};
}
const sdkSession = (user) => ({access_token: placeholder(), expires_at: Math.floor(Date.now() / 1000) + 3600, user});
// SDK errors as supabase-js returns them: an AuthApiError has message, status and code.
const sdkError = (status, code) => ({name: 'AuthApiError', message: `secret-sdk-text ${code}`, status, code});

function setup(overrides = {}) {
  const tab = browserStorage(), session = createSession();
  const storage = createAuthStorage({sessionStorage: () => tab});
  const guestUser = {id: crypto.randomUUID(), is_anonymous: true};
  const emailUser = {id: crypto.randomUUID(), is_anonymous: false, email: address};
  const sdk = {
    getSession: vi.fn(async () => ({data: {session: null}, error: null})),
    signInAnonymously: vi.fn(async () => ({data: {session: sdkSession(guestUser)}, error: null})),
    signInWithOtp: vi.fn(async () => {
      // supabase-js in PKCE mode keeps a code verifier for the link variant; the code path never uses it.
      tab.setItem('plot-twist-auth-v1-code-verifier', placeholder());
      return {data: {user: null, session: null}, error: null};
    }),
    verifyOtp: vi.fn(async ({type}) => ({error: null, data: type === 'email_change'
      ? {user: {...guestUser, is_anonymous: false, email: address}, session: sdkSession({...guestUser, is_anonymous: false, email: address})}
      : {user: emailUser, session: sdkSession(emailUser)}})),
    updateUser: vi.fn(async ({email}) => ({data: {user: {...guestUser, new_email: email}}, error: null})),
    refreshSession: vi.fn(async () => ({data: {session: sdkSession({...guestUser, is_anonymous: false, email: address})}, error: null})),
    signInWithOAuth: vi.fn(), linkIdentity: vi.fn(),
    signOut: vi.fn(async () => ({error: null})), dispose: vi.fn(async () => {}),
    onAuthStateChange: vi.fn(() => ({data: {subscription: {unsubscribe() {}}}})),
    ...overrides.sdk,
  };
  const redirect = vi.fn();
  const auth = createAuth({session, storage, supabaseUrl: origin, publishableKey: placeholder(),
    createClient: () => ({auth: sdk, from: vi.fn()}), redirect, href: 'https://game.example/'});
  active.push(auth);
  return {auth, sdk, session, tab, redirect, guestUser, emailUser};
}
const active = [];
beforeEach(() => { vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden in auth unit tests'); }); });
afterEach(() => { for (const auth of active.splice(0)) auth.dispose(); vi.unstubAllGlobals(); });

describe('email code sign-in', () => {
  it('sends a sign-in code that may create the account, with no redirect and no session yet', async () => {
    const f = setup();
    const result = await f.auth.sendEmailCode(`  ${address} `);
    expect(result).toMatchObject({ok: true, reason: 'sent', state: 'signed_out'});
    expect(f.sdk.signInWithOtp).toHaveBeenCalledExactlyOnceWith({email: address, options: {shouldCreateUser: true}});
    expect(f.sdk.updateUser).not.toHaveBeenCalled();
    expect(f.redirect).not.toHaveBeenCalled();
    expect(f.session.isSignedIn()).toBe(false);
  });

  it('checks the code as type email, signs in and clears the unused PKCE verifier', async () => {
    const f = setup();
    await f.auth.sendEmailCode(address);
    expect([...f.tab.values.keys()].some(key => key.endsWith('-code-verifier'))).toBe(true);
    const result = await f.auth.verifyEmailCode(address, '012345');
    expect(result).toMatchObject({ok: true, reason: 'signed_in', state: 'signed_in'});
    expect(result.guest).toBeUndefined();
    expect(f.sdk.verifyOtp).toHaveBeenCalledExactlyOnceWith({email: address, token: '012345', type: 'email'});
    expect(f.session.isSignedIn()).toBe(true);
    expect([...f.tab.values.keys()].some(key => key.endsWith('-code-verifier'))).toBe(false);
    // The code is used up: a second check needs a new code.
    expect(await f.auth.verifyEmailCode(address, '012345')).toMatchObject({ok: false, reason: 'no_code'});
    expect(f.sdk.verifyOtp).toHaveBeenCalledOnce();
  });

  it('refuses a malformed address or code without asking Supabase', async () => {
    const f = setup();
    for (const bad of ['', 'captain', 'captain@', '@example.org', 'captain@example', 'a b@example.org', 42, null, `${'a'.repeat(250)}@x.io`]) {
      expect(await f.auth.sendEmailCode(bad)).toMatchObject({ok: false, reason: 'invalid_email'});
    }
    await f.auth.sendEmailCode(address);
    for (const bad of ['12345', '1234567', 'abcdef', '12 345', 123456, undefined]) {
      expect(await f.auth.verifyEmailCode(address, bad)).toMatchObject({ok: false, reason: 'wrong_code'});
    }
    expect(f.sdk.signInWithOtp).toHaveBeenCalledOnce();
    expect(f.sdk.verifyOtp).not.toHaveBeenCalled();
  });

  it('answers a wrong or expired code with wrong_code, stays signed out and accepts the right code next', async () => {
    const verifyOtp = vi.fn()
      .mockResolvedValueOnce({data: {user: null, session: null}, error: sdkError(403, 'otp_expired')})
      .mockResolvedValueOnce({data: {user: {id: 'x'}, session: sdkSession({id: 'x', is_anonymous: false})}, error: null});
    const f = setup({sdk: {verifyOtp}});
    await f.auth.sendEmailCode(address);
    const wrong = await f.auth.verifyEmailCode(address, '999999');
    expect(wrong).toMatchObject({ok: false, reason: 'wrong_code', state: 'signed_out'});
    expect(JSON.stringify(wrong)).not.toContain('secret-sdk-text');
    expect(f.session.isSignedIn()).toBe(false);
    expect(await f.auth.verifyEmailCode(address, '123456')).toMatchObject({ok: true, state: 'signed_in'});
  });

  it('reports too many requests (429) on sending and on checking', async () => {
    const f = setup({sdk: {
      signInWithOtp: vi.fn(async () => ({data: {}, error: sdkError(429, 'over_email_send_rate_limit')})),
    }});
    const sent = await f.auth.sendEmailCode(address);
    expect(sent).toMatchObject({ok: false, reason: 'rate_limited'});
    expect(JSON.stringify(sent)).not.toContain('secret-sdk-text');
    // Without a sent code there is nothing to check.
    expect(await f.auth.verifyEmailCode(address, '123456')).toMatchObject({ok: false, reason: 'no_code'});
    const g = setup({sdk: {verifyOtp: vi.fn(async () => ({data: {}, error: sdkError(429, 'over_request_rate_limit')}))}});
    await g.auth.sendEmailCode(address);
    expect(await g.auth.verifyEmailCode(address, '123456')).toMatchObject({ok: false, reason: 'rate_limited'});
  });

  it('checks a code only for the address it was sent to', async () => {
    const f = setup();
    await f.auth.sendEmailCode(address);
    expect(await f.auth.verifyEmailCode('other@example.org', '123456')).toMatchObject({ok: false, reason: 'no_code'});
    expect(f.sdk.verifyOtp).not.toHaveBeenCalled();
  });

  it('shares one request between quick repeats and forgets the code on sign-out', async () => {
    const f = setup();
    const [first, second] = await Promise.all([f.auth.sendEmailCode(address), f.auth.sendEmailCode(address)]);
    expect(first.ok && second.ok).toBe(true);
    expect(f.sdk.signInWithOtp).toHaveBeenCalledOnce();
    await f.auth.signOut();
    expect(await f.auth.verifyEmailCode(address, '123456')).toMatchObject({ok: false, reason: 'no_code'});
  });

  it('refuses a plain email sign-in while someone is signed in', async () => {
    const f = setup();
    await f.auth.signInAnonymously();
    expect(await f.auth.sendEmailCode(address)).toMatchObject({ok: false, reason: 'not_allowed'});
    expect(f.sdk.signInWithOtp).not.toHaveBeenCalled();
  });

  it('turns an email provider that is off into email_off and other failures into error', async () => {
    const f = setup({sdk: {signInWithOtp: vi.fn(async () => ({data: {}, error: sdkError(422, 'email_provider_disabled')}))}});
    expect(await f.auth.sendEmailCode(address)).toMatchObject({ok: false, reason: 'email_off'});
    const g = setup({sdk: {signInWithOtp: vi.fn(async () => { throw new Error('offline'); })}});
    expect(await g.auth.sendEmailCode(address)).toMatchObject({ok: false, reason: 'error'});
  });
});

describe('guest upgrade to email', () => {
  it('confirms an address on the same guest user (updateUser, then email_change) and ends guest mode', async () => {
    const f = setup();
    const guest = await f.auth.signInAnonymously();
    expect(guest).toMatchObject({guest: true});
    const tokenBefore = f.session.getToken();
    expect(await f.auth.sendEmailCode(address, {upgrade: true})).toMatchObject({ok: true, reason: 'sent', guest: true});
    expect(f.sdk.updateUser).toHaveBeenCalledExactlyOnceWith({email: address});
    expect(f.sdk.signInWithOtp).not.toHaveBeenCalled();
    const result = await f.auth.verifyEmailCode(address, '654321');
    expect(f.sdk.verifyOtp).toHaveBeenCalledExactlyOnceWith({email: address, token: '654321', type: 'email_change'});
    expect(result).toMatchObject({ok: true, reason: 'confirmed', state: 'signed_in'});
    expect(result.guest).toBeUndefined();
    expect(f.auth.read().guest).toBeUndefined();
    // The same user id: the new token belongs to the guest's user, so the server keeps its progress.
    expect(f.session.getToken()).not.toBe(tokenBefore);
    await expect(f.sdk.verifyOtp.mock.results[0].value).resolves.toMatchObject({data: {session: {user: {id: f.guestUser.id, is_anonymous: false}}}});
  });

  it('renews the session when the confirmation answer carries none', async () => {
    const f = setup({sdk: {verifyOtp: vi.fn(async () => ({data: {user: {id: 'x'}, session: null}, error: null}))}});
    await f.auth.signInAnonymously();
    await f.auth.sendEmailCode(address, {upgrade: true});
    expect(await f.auth.verifyEmailCode(address, '123456')).toMatchObject({ok: true, reason: 'confirmed'});
    expect(f.sdk.refreshSession).toHaveBeenCalledOnce();
    expect(f.auth.read().guest).toBeUndefined();
  });

  it('refuses the upgrade for anyone but a signed-in guest', async () => {
    const f = setup();
    expect(await f.auth.sendEmailCode(address, {upgrade: true})).toMatchObject({ok: false, reason: 'not_allowed'});
    await f.auth.sendEmailCode(address);
    await f.auth.verifyEmailCode(address, '123456');
    expect(await f.auth.sendEmailCode('new@example.org', {upgrade: true})).toMatchObject({ok: false, reason: 'not_allowed'});
    expect(f.sdk.updateUser).not.toHaveBeenCalled();
  });

  it('says when the address already has an account and keeps the guest signed in', async () => {
    const f = setup({sdk: {updateUser: vi.fn(async () => ({data: {user: null}, error: sdkError(422, 'email_exists')}))}});
    await f.auth.signInAnonymously();
    expect(await f.auth.sendEmailCode(address, {upgrade: true})).toMatchObject({ok: false, reason: 'email_taken', guest: true});
    expect(f.session.isSignedIn()).toBe(true);
  });
});

describe('email helpers', () => {
  it('normalizes addresses, accepts only six digits and sorts SDK errors', () => {
    expect(normalEmail(' Captain@Example.org ')).toBe('Captain@Example.org');
    expect(normalEmail('captain@example.')).toBeNull();
    expect(validEmailCode('000000')).toBe(true);expect(validEmailCode('00000')).toBe(false);
    expect(emailFailure({status: 429}, 'send')).toBe('rate_limited');
    expect(emailFailure({status: 400, code: 'over_email_send_rate_limit'}, 'verify')).toBe('rate_limited');
    expect(emailFailure({status: 403, code: 'otp_expired'}, 'verify')).toBe('wrong_code');
    expect(emailFailure({status: 400, code: 'email_address_invalid'}, 'send')).toBe('invalid_email');
    expect(emailFailure({status: 422, code: 'signup_disabled'}, 'send')).toBe('email_off');
    expect(emailFailure({status: 500}, 'send')).toBe('error');
  });
});
