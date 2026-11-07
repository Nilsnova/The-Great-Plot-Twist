// Injected SDK clients verify auth lifecycle without accounts, credential literals or network access.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAuth} from '../src/online/auth.js';
import {createSession} from '../src/online/session.js';
import {AUTH_STORAGE_KEY, createAuthStorage} from '../src/online/auth-storage.js';

const origin = 'https://placeholder.supabase.co';
const placeholder = () => `runtime-${crypto.randomUUID()}`;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
function browserStorage() {
  const values = new Map();
  return {values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)};
}
function sdkSession(expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return {access_token: placeholder(), expires_at: expiresAt, user: {id: crypto.randomUUID()}};
}
function fixture(overrides = {}) {
  const tab = overrides.tab ?? browserStorage();
  const session = overrides.session ?? createSession();
  const storage = overrides.storage ?? createAuthStorage({sessionStorage: () => tab});
  const notifications = [], callbacks = new Set(), clients = [];
  const redirect = vi.fn();
  let held = overrides.held ?? null;
  const sdk = {
    getSession: vi.fn(async () => ({data: {session: held}, error: null})),
    refreshSession: vi.fn(async () => ({data: {session: held}, error: null})),
    exchangeCodeForSession: vi.fn(async () => ({data: {session: held}, error: null})),
    signInWithOAuth: vi.fn(async () => ({error: null, data: {url:
      `${origin}/auth/v1/authorize?provider=github&code_challenge_method=s256&code_challenge=${placeholder()}`}})),
    signOut: vi.fn(async () => ({error: null})),
    dispose: vi.fn(async () => {}),
    onAuthStateChange: vi.fn(listener => {
      callbacks.add(listener);
      return {data: {subscription: {unsubscribe: () => callbacks.delete(listener)}}};
    }),
  };
  const createClient = vi.fn((url, key, options) => {
    const client = {auth: sdk, from: vi.fn()};
    clients.push({client, url, key, options});
    return client;
  });
  const auth = createAuth({session, storage, supabaseUrl: origin, publishableKey: placeholder(),
    createClient, redirect, href: 'https://game.example/?case=online&code=remove-me#world',
    onState: value => notifications.push(value), ...overrides});
  return {auth, sdk, session, storage, tab, redirect, createClient, clients, callbacks, notifications,
    hold(value) { held = value; }, emit(event, value) { for (const callback of [...callbacks]) callback(event, value); }};
}
const active = [];
function setup(overrides) { const result = fixture(overrides); active.push(result.auth); return result; }
beforeEach(() => { vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden in auth unit tests'); }); });
afterEach(() => { for (const auth of active.splice(0)) auth.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lazy GitHub PKCE auth', () => {
  it('constructs without importing the SDK or contacting any service', () => {
    const loadClient = vi.fn();
    const test = setup({createClient: undefined, loadClient});
    expect(loadClient).not.toHaveBeenCalled();
    expect(test.auth.read()).toEqual({state: 'signed_out', configured: true,
      message: 'You are signed out. Your progress on this device is kept.'});
  });

  it.each([{}, {supabaseUrl: 'http://placeholder.supabase.co'}, {supabaseUrl: `${origin}/path`},
    {supabaseUrl: `${origin}/?unexpected=1`}, {publishableKey: ''}])('fails closed on absent or unsafe public configuration %j', async values => {
    const options = Object.keys(values).length ? values : {supabaseUrl: undefined, publishableKey: undefined};
    const test = setup(options);
    expect((await test.auth.signIn()).ok).toBe(false);
    expect(test.createClient).not.toHaveBeenCalled();
    expect(test.auth.read().message).toBe('Sign-in is not set up on this build');
  });

  it('uses the pinned SDK options and redirects only after a tab-storage probe', async () => {
    const test = setup();
    expect((await test.auth.signIn()).ok).toBe(true);
    expect(test.sdk.signInWithOAuth).toHaveBeenCalledWith({provider: 'github',
      options: {redirectTo: 'https://game.example/', skipBrowserRedirect: true}});
    expect(test.clients[0].options.auth).toMatchObject({flowType: 'pkce', persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: false, debug: false});
    expect(test.redirect).toHaveBeenCalledTimes(1);
    expect(test.auth.read().state).toBe('signing_in');
    expect(test.tab.values.size).toBe(0);
  });

  it('loads the client module only on demand and shares simultaneous sign-in requests', async () => {
    const loading = deferred();
    const test = setup({createClient: undefined, loadClient: () => loading.promise});
    const first = test.auth.signIn(), second = test.auth.signIn();
    expect(first).toBe(second);
    loading.resolve({createClient: test.createClient});
    await first;
    expect(test.createClient).toHaveBeenCalledTimes(1);
    expect(test.sdk.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('refuses sign-in before loading the SDK when session storage is blocked', async () => {
    const storage = createAuthStorage({mode: 'memory', sessionStorage() { throw new Error(placeholder()); }});
    const test = setup({storage});
    expect((await test.auth.signIn()).ok).toBe(false);
    expect(test.createClient).not.toHaveBeenCalled();
    expect(test.redirect).not.toHaveBeenCalled();
    expect(test.auth.read().message).toContain('This tab cannot keep');
  });

  it('checks verifier storage again after the SDK prepares navigation', async () => {
    const test = setup();
    test.sdk.signInWithOAuth.mockImplementation(async () => {
      test.tab.setItem = () => { throw new Error(placeholder()); };
      return {error: null, data: {url: `${origin}/auth/v1/authorize?provider=github&code_challenge_method=s256`}};
    });
    expect((await test.auth.signIn()).ok).toBe(false);
    expect(test.redirect).not.toHaveBeenCalled();
  });

  it.each(['https://elsewhere.example/auth/v1/authorize?provider=github&code_challenge_method=s256',
    `${origin}/auth/v1/authorize?provider=github&code_challenge_method=plain`,
    `${origin}/auth/v1/authorize?provider=other&code_challenge_method=s256`,
    `${origin}/other?provider=github&code_challenge_method=s256`])('refuses unsafe SDK redirect %s', async url => {
    const test = setup();
    test.sdk.signInWithOAuth.mockResolvedValue({error: null, data: {url}});
    expect((await test.auth.signIn()).ok).toBe(false);
    expect(test.redirect).not.toHaveBeenCalled();
  });

  it('converts SDK errors and listener failures into fixed safe screen messages', async () => {
    const secret = placeholder();
    const test = setup({onState() { throw new Error(secret); }});
    const seen = [];
    test.auth.subscribe(() => { throw new Error(secret); });
    test.auth.subscribe(value => seen.push(value));
    test.sdk.signInWithOAuth.mockRejectedValue(new Error(secret));
    expect((await test.auth.signIn()).ok).toBe(false);
    expect(JSON.stringify(seen)).not.toContain(secret);
    expect(seen.at(-1).state).toBe('error');
  });
});

describe('callback, restoration and renewal', () => {
  it('exchanges one callback once, forwards the flow selector, clears all verifiers and publishes safe state', async () => {
    const held = sdkSession(), test = setup({held});
    for (const suffix of ['-code-verifier', '-flow-placeholder-code-verifier', '-flows-code-verifier']) {
      test.storage.setItem(`${AUTH_STORAGE_KEY}${suffix}`, placeholder());
    }
    const result = {code: placeholder(), error: false, flowId: placeholder()};
    const first = test.auth.handleReturn(result), second = test.auth.handleReturn(result);
    expect(first).toBe(second);
    expect((await first).ok).toBe(true);
    expect(test.sdk.exchangeCodeForSession).toHaveBeenCalledWith(result.code, {flowId: result.flowId});
    expect(test.sdk.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(test.session.getToken()).toBe(held.access_token);
    expect([...test.tab.values.keys()]).toEqual([]);
    const serialized = JSON.stringify([test.auth.read(), test.notifications]);
    expect(serialized).not.toContain(held.access_token);
    expect(serialized).not.toContain(held.user.id);
  });

  it.each([{error: true}, {code: ''}, {code: 'not valid'}, null])('does not initialize an SDK for a denied or invalid return %j', async result => {
    const test = setup();
    expect((await test.auth.handleReturn(result)).ok).toBe(false);
    expect(test.createClient).not.toHaveBeenCalled();
    expect(test.auth.read().state).toBe('error');
  });

  it('maps a rejected exchange to an error and removes the verifier', async () => {
    const test = setup();
    test.storage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, placeholder());
    test.sdk.exchangeCodeForSession.mockResolvedValue({error: new Error(placeholder()), data: {session: null}});
    expect((await test.auth.handleReturn({code: placeholder()})).ok).toBe(false);
    expect(test.auth.read().state).toBe('error');
    expect(test.tab.values.size).toBe(0);
  });

  it('shares the callback result with restoration so a stale empty session cannot expire a new sign-in', async () => {
    const test = setup(), pendingExchange = deferred(), emptySession = deferred();
    test.sdk.exchangeCodeForSession.mockReturnValue(pendingExchange.promise);
    test.sdk.getSession.mockReturnValue(emptySession.promise);
    const returned = test.auth.handleReturn({code: placeholder()});
    await vi.waitFor(() => expect(test.sdk.exchangeCodeForSession).toHaveBeenCalledOnce());
    const restored = test.auth.restore();
    const held = sdkSession();
    pendingExchange.resolve({data: {session: held}, error: null});
    expect((await returned).ok).toBe(true);
    emptySession.resolve({data: {session: null}, error: null});
    expect((await restored).ok).toBe(true);
    expect(test.session.getToken()).toBe(held.access_token);
    expect(test.auth.read().state).toBe('signed_in');
    expect(test.sdk.getSession).not.toHaveBeenCalled();
    expect((await test.auth.restore()).ok).toBe(true);
    expect(test.sdk.getSession).not.toHaveBeenCalled();
  });

  it('restores SDK-held sessions and synchronously applies refreshed access tokens', async () => {
    const held = sdkSession(), test = setup({held});
    expect((await test.auth.restore()).ok).toBe(true);
    expect(await test.auth.getAccessToken()).toBe(held.access_token);
    const refreshed = sdkSession();
    const callback = [...test.callbacks][0];
    expect(callback('TOKEN_REFRESHED', refreshed)).toBeUndefined();
    expect(test.session.getToken()).toBe(refreshed.access_token);
    expect(test.sdk.refreshSession).not.toHaveBeenCalled();
  });

  it('dedupes renewal and updates memory only after a successful SDK response', async () => {
    const held = sdkSession(), test = setup({held});
    await test.auth.restore();
    const pending = deferred();
    test.sdk.refreshSession.mockReturnValue(pending.promise);
    const first = test.auth.renew(), second = test.auth.renew();
    expect(first).toBe(second);
    expect(test.session.getToken()).toBe(held.access_token);
    const renewed = sdkSession();
    pending.resolve({data: {session: renewed}, error: null});
    expect((await first).ok).toBe(true);
    expect(test.sdk.refreshSession).toHaveBeenCalledTimes(1);
    expect(test.session.getToken()).toBe(renewed.access_token);
  });

  it('renews a nearly expired token before handing it to Realtime', async () => {
    const held = sdkSession(Math.floor(Date.now() / 1000) + 5), test = setup({held});
    await test.auth.restore();
    const renewed = sdkSession();
    test.sdk.refreshSession.mockResolvedValue({data: {session: renewed}, error: null});
    expect(await test.auth.getAccessToken()).toBe(renewed.access_token);
    expect(test.sdk.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('expires failed renewal and rejects later events or SDK writes from that client', async () => {
    const held = sdkSession(), test = setup({held});
    await test.auth.restore();
    const callback = [...test.callbacks][0], options = test.clients[0].options.auth;
    test.sdk.refreshSession.mockRejectedValue(new Error(placeholder()));
    expect((await test.auth.renew()).ok).toBe(false);
    callback('TOKEN_REFRESHED', sdkSession());
    options.storage.setItem(options.storageKey, placeholder());
    expect(test.auth.read().state).toBe('expired');
    expect(test.session.isSignedIn()).toBe(false);
    expect(test.tab.values.size).toBe(0);
  });

  it('treats an external API token clear as expiry and clears persisted credentials', async () => {
    const test = setup({held: sdkSession()});
    await test.auth.restore();
    const options = test.clients[0].options.auth;
    options.storage.setItem(options.storageKey, placeholder());
    test.session.clearToken();
    expect(test.auth.read().state).toBe('expired');
    expect(test.tab.values.size).toBe(0);
    options.storage.setItem(options.storageKey, placeholder());
    expect(test.tab.values.size).toBe(0);
  });

  it('registers the optional A2 renewal hook and removes it during disposal', async () => {
    const session = createSession(), unsubscribe = vi.fn();
    session.setRenewal = vi.fn(() => unsubscribe);
    const test = setup({session});
    const handler = session.setRenewal.mock.calls[0][0];
    expect(typeof handler).toBe('function');
    test.auth.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('SDK lifecycle and persistence isolation', () => {
  it('maps every verifier key to stable tab storage even in memory mode and across new SDK keys', async () => {
    const tab = browserStorage();
    const first = setup({tab, storage: createAuthStorage({mode: 'memory', sessionStorage: () => tab})});
    await first.auth.signIn();
    const a = first.clients[0].options.auth;
    const saved = placeholder();
    for (const suffix of ['-code-verifier', '-flow-placeholder-code-verifier', '-flows-code-verifier']) {
      a.storage.setItem(`${a.storageKey}${suffix}`, saved);
    }
    first.auth.dispose();
    const second = setup({tab, storage: createAuthStorage({mode: 'memory', sessionStorage: () => tab})});
    await second.auth.restore();
    const b = second.clients[0].options.auth;
    expect(b.storageKey).not.toBe(a.storageKey);
    for (const suffix of ['-code-verifier', '-flow-placeholder-code-verifier', '-flows-code-verifier']) {
      expect(b.storage.getItem(`${b.storageKey}${suffix}`)).toBe(saved);
    }
    expect([...tab.values.keys()].every(key => key.startsWith(AUTH_STORAGE_KEY))).toBe(true);
  });

  it('gives separate tabs distinct SDK broadcast namespaces and independent sessions', async () => {
    const first = setup({held: sdkSession()}), second = setup();
    await first.auth.restore(); await second.auth.restore();
    expect(first.clients[0].options.auth.storageKey).not.toBe(second.clients[0].options.auth.storageKey);
    expect(first.session.isSignedIn()).toBe(true);
    expect(second.session.isSignedIn()).toBe(false);
  });

  it('signs out the current SDK session and clears only owned storage, allowing a later sign-in', async () => {
    const test = setup({held: sdkSession()});
    test.tab.setItem('intro-journal', placeholder());
    await test.auth.restore();
    const old = test.clients[0].options.auth;
    old.storage.setItem(old.storageKey, placeholder());
    expect((await test.auth.signOut()).ok).toBe(true);
    expect(test.sdk.signOut).toHaveBeenCalledWith({scope: 'local'});
    expect(test.auth.read().state).toBe('signed_out');
    old.storage.setItem(old.storageKey, placeholder());
    expect([...test.tab.values.keys()]).toEqual(['intro-journal']);
    await test.auth.signIn();
    expect(test.createClient).toHaveBeenCalledTimes(2);
  });

  it('finishes local sign-out even when the server logout fails', async () => {
    const test = setup({held: sdkSession()});
    await test.auth.restore();
    test.sdk.signOut.mockRejectedValue(new Error(placeholder()));
    expect((await test.auth.signOut()).ok).toBe(true);
    expect(test.session.isSignedIn()).toBe(false);
    expect(test.auth.read().state).toBe('signed_out');
  });

  it('erases persisted auth immediately while the SDK finishes logout from its opaque memory storage', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const options = test.clients[0].options.auth, raw = placeholder(), pending = deferred();
    options.storage.setItem(options.storageKey, raw);
    let sdkStoredValue;
    test.sdk.signOut.mockImplementation(async () => {
      await Promise.resolve();
      sdkStoredValue = options.storage.getItem(options.storageKey);
      await pending.promise;
      return {error: null};
    });
    const logout = test.auth.signOut();
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(test.session.isSignedIn()).toBe(false);
    const reloaded = setup({tab: test.tab});
    let reloadedValue;
    reloaded.sdk.getSession.mockImplementation(async () => {
      const fresh = reloaded.clients[0].options.auth;
      reloadedValue = fresh.storage.getItem(fresh.storageKey);
      return {data: {session: null}, error: null};
    });
    await reloaded.auth.restore();
    expect(reloadedValue).toBeNull();
    expect(reloaded.auth.read().state).toBe('signed_out');
    expect(sdkStoredValue === raw).toBe(true);
    options.storage.setItem(options.storageKey, placeholder());
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBeNull();
    const fresh = reloaded.clients[0].options.auth, nextSession = placeholder();
    fresh.storage.setItem(fresh.storageKey, nextSession);
    pending.resolve(); await logout;
    expect(options.storage.getItem(options.storageKey)).toBeNull();
    options.storage.setItem(options.storageKey, placeholder());
    expect(test.tab.getItem(AUTH_STORAGE_KEY) === nextSession).toBe(true);
  });

  it('finishes local logout and closes detached SDK storage after ten seconds without a server answer', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const options = test.clients[0].options.auth;
    options.storage.setItem(options.storageKey, placeholder());
    test.sdk.signOut.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers();
    let finished = false;
    const logout = test.auth.signOut().then(result => { finished = true; return result; });
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(9999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(finished).toBe(true);
    expect((await logout).ok).toBe(true);
    expect(test.sdk.dispose).toHaveBeenCalledOnce();
    expect(options.storage.getItem(options.storageKey)).toBeNull();
    options.storage.setItem(options.storageKey, placeholder());
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the logout deadline and releases detached storage when the application closes', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const options = test.clients[0].options.auth;
    options.storage.setItem(options.storageKey, placeholder());
    test.sdk.signOut.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers();
    const logout = test.auth.signOut();
    expect(vi.getTimerCount()).toBe(1);
    test.auth.dispose();
    await logout;
    expect(vi.getTimerCount()).toBe(0);
    expect(test.sdk.dispose).toHaveBeenCalledOnce();
    expect(options.storage.getItem(options.storageKey)).toBeNull();
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('waits for logout before beginning a new SDK sign-in', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const pending = deferred(); test.sdk.signOut.mockReturnValue(pending.promise);
    const logout = test.auth.signOut(), login = test.auth.signIn();
    await Promise.resolve();
    expect(test.sdk.signInWithOAuth).not.toHaveBeenCalled();
    pending.resolve({error: null}); await logout; await login;
    expect(test.sdk.signInWithOAuth).toHaveBeenCalledOnce();
  });

  it('discards a late callback after sign-out without accepting its token', async () => {
    const test = setup(), pending = deferred();
    test.sdk.exchangeCodeForSession.mockReturnValue(pending.promise);
    const callback = test.auth.handleReturn({code: placeholder()});
    await vi.waitFor(() => expect(test.sdk.exchangeCodeForSession).toHaveBeenCalledOnce());
    await test.auth.signOut();
    pending.resolve({data: {session: sdkSession()}, error: null});
    expect((await callback).ok).toBe(false);
    expect(test.session.isSignedIn()).toBe(false);
    expect(test.auth.read().state).toBe('signed_out');
  });

  it('disposes without erasing the tab session, blocks old SDK writes and removes observers', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const old = test.clients[0].options.auth, saved = placeholder(), listener = vi.fn();
    old.storage.setItem(old.storageKey, saved);
    const stop = test.auth.subscribe(listener); stop();
    test.auth.dispose(); test.auth.dispose();
    old.storage.setItem(old.storageKey, placeholder());
    expect(test.tab.getItem(AUTH_STORAGE_KEY)).toBe(saved);
    expect(test.callbacks.size).toBe(0);
    expect(test.sdk.dispose).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
    expect(await test.auth.getAccessToken()).toBeNull();
  });

  it('does not construct a client after disposal while its lazy import is pending', async () => {
    const pending = deferred();
    const test = setup({createClient: undefined, loadClient: () => pending.promise});
    const task = test.auth.restore(); test.auth.dispose();
    pending.resolve({createClient: test.createClient});
    expect((await task).ok).toBe(false);
    expect(test.createClient).not.toHaveBeenCalled();
  });
});

describe('restricted own-player SDK reads', () => {
  function query(test, data) {
    const chain = {select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(async () => ({data, error: null}))};
    for (const method of ['select', 'eq', 'order']) chain[method].mockReturnValue(chain);
    test.clients[0].client.from.mockReturnValue(chain);
    return chain;
  }
  it('reads only the current player ledger, with 50-row limit and no returned identifiers or refs', async () => {
    const held = sdkSession(), test = setup({held}); await test.auth.restore();
    const row = {delta: 12, reason: 'kit_grant', created_at: new Date().toISOString(), ref: placeholder(), id: 1};
    const chain = query(test, [row, {delta: 'bad', reason: 'invalid'}]);
    expect(await test.auth.readOwnLedger()).toEqual({ok: true, rows: [{amount: 12, reason: 'kit_grant', created_at: row.created_at}]});
    expect(test.clients[0].client.from).toHaveBeenCalledWith('wallet_transactions');
    expect(chain.select).toHaveBeenCalledWith('delta,reason,created_at');
    expect(chain.eq).toHaveBeenCalledWith('player_id', held.user.id);
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it('reads only member ids for the requested crew and rejects malformed crew identifiers', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const id = crypto.randomUUID(), crew = crypto.randomUUID();
    const chain = query(test, [{player_id: id}, {player_id: null}, {player_id: id}]);
    expect(await test.auth.readCrewMemberIds(crew)).toEqual({ok: true, ids: [id]});
    expect(chain.select).toHaveBeenCalledWith('player_id');
    expect(chain.eq).toHaveBeenCalledWith('crew_id', crew);
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(await test.auth.readCrewMemberIds('invalid')).toEqual({ok: false, ids: []});
  });

  it('reads private player-to-seat links without names or other account fields and skips NPC seats', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const crewId = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID();
    const privateText = placeholder();
    const chain = query(test, [{player_id: first.toUpperCase(), seat_no: 4, name: privateText},
      {player_id: null, seat_no: 2}, {player_id: second, seat_no: 1, token: privateText}]);
    const result = await test.auth.readCrewSeats(crewId);
    expect(result).toEqual({ok: true, seats: [{playerId: first, seatNo: 4}, {playerId: second, seatNo: 1}]});
    expect(test.clients[0].client.from).toHaveBeenCalledExactlyOnceWith('crew_seats');
    expect(chain.select).toHaveBeenCalledExactlyOnceWith('player_id,seat_no');
    expect(chain.eq).toHaveBeenCalledExactlyOnceWith('crew_id', crewId);
    expect(chain.limit).toHaveBeenCalledExactlyOnceWith(4);
    expect(JSON.stringify(result)).not.toContain(privateText);
    expect(JSON.stringify(test.auth.read())).not.toContain(first);
  });

  it('accepts an empty or all-NPC crew seat response without inventing players', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    query(test, []);
    expect(await test.auth.readCrewSeats(crypto.randomUUID())).toEqual({ok: true, seats: []});
    query(test, [{player_id: null, seat_no: 1}, {player_id: null, seat_no: 4}]);
    expect(await test.auth.readCrewSeats(crypto.randomUUID())).toEqual({ok: true, seats: []});
  });

  it.each(['invalid', '0'.repeat(36), null, undefined])('rejects malformed crew UUID %s before querying', async crewId => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    expect(await test.auth.readCrewSeats(crewId)).toEqual({ok: false, status: 0, seats: []});
    expect(test.clients[0].client.from).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed player UUID', () => [{player_id: '0'.repeat(36), seat_no: 1}]],
    ['missing player id', () => [{seat_no: 1}]],
    ['null row', () => [null]],
    ['array row', () => [[]]],
    ['zero seat', () => [{player_id: crypto.randomUUID(), seat_no: 0}]],
    ['out-of-range seat', () => [{player_id: crypto.randomUUID(), seat_no: 5}]],
    ['fractional seat', () => [{player_id: crypto.randomUUID(), seat_no: 1.5}]],
    ['text seat', () => [{player_id: crypto.randomUUID(), seat_no: '1'}]],
    ['duplicate seat', () => [{player_id: crypto.randomUUID(), seat_no: 1},
      {player_id: crypto.randomUUID(), seat_no: 1}]],
    ['duplicate NPC seat', () => [{player_id: null, seat_no: 1}, {player_id: crypto.randomUUID(), seat_no: 1}]],
    ['duplicate player', () => {
      const playerId = crypto.randomUUID();
      return [{player_id: playerId, seat_no: 1}, {player_id: playerId.toUpperCase(), seat_no: 2}];
    }],
    ['more than four rows', () => Array.from({length: 5}, (_, index) => ({player_id: null, seat_no: index + 1}))],
  ])('fails closed on %s without returning a partial seat map', async (_label, rows) => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    query(test, rows());
    expect(await test.auth.readCrewSeats(crypto.randomUUID())).toEqual({ok: false, status: 0, seats: []});
  });

  it('does not create a client for a signed-out seat read', async () => {
    const test = setup();
    expect(await test.auth.readCrewSeats(crypto.randomUUID())).toEqual({ok: false, status: 0, seats: []});
    expect(test.createClient).not.toHaveBeenCalled();
  });

  it.each([403, 503])('returns only safe seat-read status %i without query data or SDK errors', async status => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const privateText = placeholder(), chain = query(test, []);
    chain.limit.mockResolvedValue({status, data: [{player_id: crypto.randomUUID(), seat_no: 1, query: privateText}],
      error: {message: privateText, details: privateText}});
    expect(await test.auth.readCrewSeats(crypto.randomUUID())).toEqual({ok: false, status, seats: []});
  });

  it.each(['signOut', 'dispose'])('discards a seat read that completes after %s', async method => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const chain = query(test, []), pending = deferred(); chain.limit.mockReturnValue(pending.promise);
    const read = test.auth.readCrewSeats(crypto.randomUUID());
    await vi.waitFor(() => expect(chain.limit).toHaveBeenCalledTimes(1));
    await test.auth[method]();
    pending.resolve({data: [{player_id: crypto.randomUUID(), seat_no: 1}], error: null});
    expect(await read).toEqual({ok: false, status: 0, seats: []});
  });

  it.each([403, 503])('returns only safe status %i when the ledger request fails', async status => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const privateText = placeholder(), chain = query(test, []);
    chain.limit.mockResolvedValue({status, data: [{query: privateText, ref: privateText}],
      error: {message: privateText, details: privateText, hint: privateText}});
    const result = await test.auth.readOwnLedger();
    expect(result).toEqual({ok: false, status, rows: []});
    expect(JSON.stringify(result)).not.toContain(privateText);
  });

  it.each([200, '503', Infinity])('uses unknown status for an unsafe failed-ledger status %s', async status => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    query(test, []).limit.mockResolvedValue({status, data: null, error: {message: placeholder()}});
    expect(await test.auth.readOwnLedger()).toEqual({ok: false, status: 0, rows: []});
  });

  it('uses unknown status for a ledger read that throws and exposes no exception fields', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    query(test, []).limit.mockRejectedValue(Object.assign(new Error(placeholder()), {status: 503}));
    expect(await test.auth.readOwnLedger()).toEqual({ok: false, status: 0, rows: []});
  });

  it('discards late ledger reads after sign-out', async () => {
    const test = setup({held: sdkSession()}); await test.auth.restore();
    const chain = query(test, []), pending = deferred(); chain.limit.mockReturnValue(pending.promise);
    const read = test.auth.readOwnLedger(); await Promise.resolve();
    await test.auth.signOut(); pending.resolve({status: 503, data: null, error: {message: placeholder()}});
    expect(await read).toEqual({ok: false, status: 0, rows: []});
  });
});
