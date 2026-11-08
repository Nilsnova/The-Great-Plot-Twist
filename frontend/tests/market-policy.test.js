// The policy uses an injected lease only; no account, network, service, timers or SDK is involved.
import {randomUUID} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {createMarketPolicy} from '../src/online/market-policy.js';

const success = data => ({ok: true, status: 200, data});
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
function setup(overrides = {}) {
  const state = {flag: true, ready: true, identity: randomUUID(), token: `fixture-${randomUUID()}`, version: 0, ...overrides};
  const tickets = new WeakMap(), callbacks = new Set(), retained = new Set(), unsubscribes = [];
  const lease = {
    isReady: vi.fn(() => state.ready), getIdentity: vi.fn(() => state.identity),
    getToken: vi.fn(() => state.token), getFlags: vi.fn(() => ({market: state.flag})),
    capture: vi.fn((feature, {privateRead = false, allowFlagOff = false} = {}) => {
      if (feature !== 'market' || state.ready !== true || (privateRead && state.identity == null)
        || (state.flag !== true && !allowFlagOff)) return null;
      const ticket = {}; tickets.set(ticket, {version: state.version, privateRead, allowFlagOff}); return ticket;
    }),
    current: vi.fn(ticket => {
      const saved = tickets.get(ticket);
      return Boolean(saved && saved.version === state.version && state.ready === true
        && (!saved.privateRead || state.identity != null) && (state.flag === true || saved.allowFlagOff));
    }),
    marketRequest: vi.fn(async () => success({positions: []})),
    publicGet: vi.fn(async () => success({companies: [], rules: {stakeChoices: [17]}, tradingEnabled: true})),
    onSessionChange: vi.fn(callback => {
      callbacks.add(callback); retained.add(callback);
      const unsubscribe = vi.fn(() => callbacks.delete(callback)); unsubscribes.push(unsubscribe); return unsubscribe;
    }),
    renewToken: vi.fn(), dispose: vi.fn(),
  };
  const policy = createMarketPolicy(lease);
  return {state, lease, policy, unsubscribes,
    change(patch) { Object.assign(state, patch); state.version += 1; },
    notify(payload, evenStopped = false) { for (const callback of evenStopped ? retained : callbacks) callback(payload); }};
}
const safeFailure = (result, code = 'not_ready', status = 503) => {
  expect(result).toEqual({ok: false, status, code, message: code === 'unauthorized' ? 'Please sign in again.'
    : code === 'feature_off' ? 'The Island Exchange is not open yet.' : 'This part is not ready yet. You can keep exploring.'});
};

describe('market policy public prices and strict private admission', () => {
  it.each([false, 'true', 1, undefined])('keeps a priceboard public but refuses private calls for market=%s', async flag => {
    const f = setup({flag, identity: null});
    const quote = Object.freeze({id: randomUUID(), price: 37.5, source: 'recorded', stale: false});
    const rules = Object.freeze({stakeChoices: Object.freeze([17]), leverage: 2});
    const board = Object.freeze({companies: Object.freeze([quote]), rules, generatedAt: new Date(0).toISOString(), tradingEnabled: true});
    const reply = success(board); f.lease.publicGet.mockResolvedValue(reply);
    const answer = await f.policy.publicGet('/api/market');
    expect(answer).toEqual({...reply, data: {...board, tradingEnabled: false}});
    expect(answer).not.toBe(reply); expect(answer.data).not.toBe(board);
    expect(answer.data.companies).toBe(board.companies); expect(answer.data.rules).toBe(rules);
    expect(board.tradingEnabled).toBe(true); expect(reply.data).toBe(board);
    expect(f.lease.publicGet).toHaveBeenCalledExactlyOnceWith('/api/market');
    expect(f.lease.capture).toHaveBeenCalledWith('market', {allowFlagOff: true, privateRead: false});
    safeFailure(await f.policy.request('/api/market/portfolio'), 'feature_off', 404);
    safeFailure(await f.policy.request('/api/market/open', {method: 'POST', body: {actionUid: randomUUID()}}), 'feature_off', 404);
    expect(f.lease.marketRequest).not.toHaveBeenCalled(); expect(f.lease.getToken).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined])('preserves the server tradingEnabled=%s unchanged when config is true', async tradingEnabled => {
    const f = setup(), board = {companies: [], rules: {stakeChoices: [17]}};
    if (tradingEnabled !== undefined) board.tradingEnabled = tradingEnabled;
    const reply = success(board); f.lease.publicGet.mockResolvedValue(reply);
    expect(await f.policy.publicGet('/api/market')).toBe(reply);
    expect(reply.data).toBe(board); expect(Object.hasOwn(board, 'tradingEnabled')).toBe(tradingEnabled !== undefined);
  });

  it('changes no other public response and never gets a token for public reads', async () => {
    const f = setup({flag: false, identity: null}), reply = success({tradingEnabled: true, value: randomUUID()});
    f.lease.publicGet.mockResolvedValue(reply);
    expect(await f.policy.publicGet('/api/market/portfolio')).toBe(reply);
    expect(f.lease.publicGet).toHaveBeenCalledExactlyOnceWith('/api/market/portfolio');
    expect(f.lease.getToken).not.toHaveBeenCalled(); expect(f.lease.marketRequest).not.toHaveBeenCalled();
  });

  it('requires public readiness, admits anonymous prices, and treats signed-in numeric identity zero as valid', async () => {
    const f = setup({ready: false});
    safeFailure(await f.policy.publicGet('/api/market')); safeFailure(await f.policy.request('/api/market/portfolio'));
    expect(f.lease.publicGet).not.toHaveBeenCalled(); expect(f.lease.marketRequest).not.toHaveBeenCalled();
    f.change({ready: true, identity: null});
    safeFailure(await f.policy.request('/api/market/portfolio'), 'unauthorized', 401);
    expect((await f.policy.publicGet('/api/market')).ok).toBe(true);
    f.change({identity: 0});
    expect((await f.policy.request('/api/market/portfolio')).ok).toBe(true);
    expect(f.lease.marketRequest).toHaveBeenCalledExactlyOnceWith('/api/market/portfolio', undefined);
    expect(f.lease.capture).toHaveBeenCalledWith('market', {privateRead: true});
  });
});

describe('market policy ownership and exact forwarding', () => {
  it.each(['flag', 'flagBlink', 'identity', 'readiness', 'dispose'])('fences a held private result after %s', async boundary => {
    const f = setup(), held = deferred(), marker = randomUUID(); f.lease.marketRequest.mockReturnValue(held.promise);
    const pending = f.policy.request('/api/market/open', {method: 'POST', body: {actionUid: randomUUID(), stake: 17}});
    if (boundary === 'flag') f.change({flag: false});
    if (boundary === 'flagBlink') { f.change({flag: false}); f.change({flag: true}); }
    if (boundary === 'identity') f.change({identity: randomUUID()});
    if (boundary === 'readiness') f.change({ready: false});
    if (boundary === 'dispose') f.policy.dispose();
    held.resolve(success({private: marker})); const answer = await pending;
    safeFailure(answer); expect(JSON.stringify(answer)).not.toContain(marker);
    expect(f.lease.marketRequest).toHaveBeenCalledTimes(1); expect(f.lease.renewToken).not.toHaveBeenCalled();
  });

  it.each(['flag', 'identity', 'readiness', 'dispose'])('fences a held public board after %s', async boundary => {
    const f = setup({flag: false, identity: null}), held = deferred(), marker = randomUUID();
    f.lease.publicGet.mockReturnValue(held.promise); const pending = f.policy.publicGet('/api/market');
    if (boundary === 'flag') f.change({flag: true});
    if (boundary === 'identity') f.change({identity: randomUUID()});
    if (boundary === 'readiness') f.change({ready: false});
    if (boundary === 'dispose') f.policy.dispose();
    held.resolve(success({companies: [{id: marker}], rules: {stakeChoices: [17]}, tradingEnabled: true}));
    const answer = await pending; safeFailure(answer); expect(JSON.stringify(answer)).not.toContain(marker);
    expect(f.lease.publicGet).toHaveBeenCalledTimes(1); expect(f.lease.marketRequest).not.toHaveBeenCalled();
  });

  it.each(['private', 'public'])('does not start a %s request when capture disposes its facade reentrantly', async kind => {
    const f = setup(), capture = f.lease.capture.getMockImplementation();
    f.lease.capture.mockImplementationOnce((...args) => { const ticket = capture(...args); f.policy.dispose(); return ticket; });
    const answer = kind === 'private' ? await f.policy.request('/api/market/portfolio') : await f.policy.publicGet('/api/market');
    expect(answer.ok).toBe(false); expect(f.lease.marketRequest).not.toHaveBeenCalled(); expect(f.lease.publicGet).not.toHaveBeenCalled();
    expect(f.lease.dispose).not.toHaveBeenCalled();
  });

  it('forwards the original path, options and body exactly once, including a final 401 without another renewal', async () => {
    const f = setup(), body = Object.freeze({companyId: randomUUID(), side: 'long', stake: 17, actionUid: randomUUID()});
    const options = Object.freeze({method: 'POST', body}), reply = {ok: false, status: 401, code: 'unauthorized', message: 'Please sign in again.'};
    f.lease.marketRequest.mockResolvedValue(reply);
    expect(await f.policy.request('/api/market/open', options)).toBe(reply);
    expect(f.lease.marketRequest).toHaveBeenCalledExactlyOnceWith('/api/market/open', options);
    expect(f.lease.marketRequest.mock.calls[0][1]).toBe(options); expect(f.lease.marketRequest.mock.calls[0][1].body).toBe(body);
    expect(f.lease.renewToken).not.toHaveBeenCalled(); expect(f.lease.getToken).not.toHaveBeenCalled();
    expect(f.lease.publicGet).not.toHaveBeenCalled();
  });

  it.each([0, 400, 401, 403, 404, 409, 429, 500, 502, 503, 504])('preserves a current normalized upstream failure with status %s', async status => {
    const f = setup({flag: false}), reply = {ok: false, status, code: `recorded_${status}`, message: randomUUID(), retryAfterSeconds: 7};
    f.lease.publicGet.mockResolvedValue(reply);
    expect(await f.policy.publicGet('/api/market')).toBe(reply);
    f.change({flag: true}); f.lease.marketRequest.mockResolvedValue(reply);
    expect(await f.policy.request('/api/market/portfolio')).toBe(reply);
    expect(f.lease.publicGet).toHaveBeenCalledTimes(1); expect(f.lease.marketRequest).toHaveBeenCalledTimes(1);
  });

  it('passes successful private responses unchanged and makes no request for a missing ticket', async () => {
    const f = setup(), reply = success({positionId: randomUUID(), coins: 283}); f.lease.marketRequest.mockResolvedValue(reply);
    expect(await f.policy.request('/api/market/open', {method: 'POST', body: {actionUid: randomUUID()}})).toBe(reply);
    f.lease.capture.mockReturnValue(null);
    safeFailure(await f.policy.request('/api/market/portfolio')); safeFailure(await f.policy.publicGet('/api/market'));
    expect(f.lease.marketRequest).toHaveBeenCalledTimes(1); expect(f.lease.publicGet).not.toHaveBeenCalled();
  });

  it('returns a fixed safe refusal for thrown clients or unreadable responses without exposing error details', async () => {
    const f = setup(), marker = randomUUID(), fail = () => { throw new Error(marker); };
    f.lease.marketRequest.mockImplementation(fail); f.lease.publicGet.mockImplementation(fail);
    for (const answer of [await f.policy.request('/api/market/portfolio'), await f.policy.publicGet('/api/market')]) {
      safeFailure(answer, 'unavailable'); expect(JSON.stringify(answer)).not.toContain(marker);
    }
    f.lease.marketRequest.mockResolvedValue(null); f.lease.publicGet.mockResolvedValue({ok: true, data: null});
    safeFailure(await f.policy.request('/api/market/portfolio'), 'unavailable');
    f.change({flag: false}); safeFailure(await f.policy.publicGet('/api/market'), 'unavailable');
  });
});

describe('market policy callbacks and getter cleanup', () => {
  it('fences old callbacks and getters after disposal, unsubscribes once and leaves the lease owned by its factory', async () => {
    const f = setup(), listener = vi.fn(), payload = {signedIn: true};
    expect(f.policy.getToken()).toBe(f.state.token); expect(f.policy.getIdentity()).toBe(f.state.identity);
    expect(f.policy.getFlags()).toEqual({market: true});
    const unsubscribe = f.policy.onSessionChange(listener); f.notify(payload); expect(listener).toHaveBeenCalledExactlyOnceWith(payload);
    f.policy.dispose(); f.policy.dispose(); unsubscribe();
    f.notify({signedIn: false}, true); expect(listener).toHaveBeenCalledTimes(1); expect(f.unsubscribes[0]).toHaveBeenCalledTimes(1);
    const counts = [f.lease.getToken, f.lease.getIdentity, f.lease.getFlags].map(method => method.mock.calls.length);
    expect(f.policy.getToken()).toBeNull(); expect(f.policy.getIdentity()).toBeNull(); expect(f.policy.getFlags()).toEqual({});
    expect([f.lease.getToken, f.lease.getIdentity, f.lease.getFlags].map(method => method.mock.calls.length)).toEqual(counts);
    f.policy.onSessionChange(listener)(); expect(f.lease.onSessionChange).toHaveBeenCalledTimes(1);
    safeFailure(await f.policy.request('/api/market/portfolio')); safeFailure(await f.policy.publicGet('/api/market'));
    expect(f.lease.marketRequest).not.toHaveBeenCalled(); expect(f.lease.publicGet).not.toHaveBeenCalled(); expect(f.lease.dispose).not.toHaveBeenCalled();
  });

  it('fences a listener after its own unsubscribe even if the lease retains the callback', () => {
    const f = setup(), listener = vi.fn(), unsubscribe = f.policy.onSessionChange(listener);
    unsubscribe(); unsubscribe(); f.notify({signedIn: false}, true);
    expect(listener).not.toHaveBeenCalled(); expect(f.unsubscribes[0]).toHaveBeenCalledTimes(1);
    f.policy.dispose(); expect(f.unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it('handles reentrant disposal during registration without leaving a live listener', () => {
    const f = setup(), unsubscribe = vi.fn();
    f.lease.onSessionChange.mockImplementation(callback => { callback({signedIn: false}); return unsubscribe; });
    f.policy.onSessionChange(() => f.policy.dispose());
    expect(unsubscribe).toHaveBeenCalledTimes(1); expect(f.lease.dispose).not.toHaveBeenCalled();
  });

  it('fails closed for unavailable capability methods and does not leak thrown getter details', async () => {
    const marker = randomUUID(), fail = () => { throw new Error(marker); }, f = setup();
    f.lease.getToken.mockImplementation(fail); f.lease.getIdentity.mockImplementation(fail); f.lease.getFlags.mockImplementation(fail);
    expect(f.policy.getToken()).toBeNull(); expect(f.policy.getIdentity()).toBeNull(); expect(f.policy.getFlags()).toEqual({});
    const answer = await f.policy.request('/api/market/portfolio'); safeFailure(answer, 'feature_off', 404);
    expect(JSON.stringify(answer)).not.toContain(marker); expect(f.lease.marketRequest).not.toHaveBeenCalled();
    f.lease.isReady.mockImplementation(fail); safeFailure(await f.policy.publicGet('/api/market'));
    const missing = createMarketPolicy(null); safeFailure(await missing.request('/api/market/portfolio'));
    expect(missing.getIdentity()).toBeNull(); expect(missing.getFlags()).toEqual({}); missing.dispose();
  });
});
