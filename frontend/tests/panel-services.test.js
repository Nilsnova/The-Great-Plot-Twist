// Deferred capabilities use actual in-memory sessions and injected clients; no service is contacted.
import {randomUUID} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {claimPanelEntry, findPanelEntry, findPanelServices, registerPanelServices,
  releasePanelEntry, watchPanelServices} from '../src/online/panel-services.js';

const success = data => ({ok: true, status: 200, data});
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
const leases = [];
function setup({signedIn = true, flags = {arena: true, predictions: true, market: true}, ...extra} = {}) {
  const session = createSession(); if (signedIn) session.setToken(`fixture-${randomUUID()}`);
  const source = randomUUID(), state = {flags, ready: true};
  const api = {
    get: vi.fn(function (path) { expect(this).toBe(api); return Promise.resolve(success({source, path})); }),
    post: vi.fn(function (path, body) { expect(this).toBe(api); return Promise.resolve(success({source, path, body})); }),
  };
  const publicApi = {get: vi.fn(function (path) {
    expect(this).toBe(publicApi); return Promise.resolve(success({public: true, source, path}));
  })};
  const options = {api, publicApi, getFlags: () => state.flags, isReady: () => state.ready, ...extra};
  const lease = registerPanelServices(session, options); leases.push(lease);
  return {session, api, publicApi, source, state, lease, options};
}
afterEach(() => { for (const lease of leases.splice(0)) lease.dispose(); });

describe('private deferred panel services', () => {
  it('keeps two injected sessions and clients isolated', async () => {
    const first = setup(), second = setup();
    expect(findPanelServices(first.session)).toBe(first.lease);
    expect(findPanelServices(second.session)).toBe(second.lease);
    expect(findPanelServices()).toBeNull();
    expect(await first.lease.request.get('/api/duels')).toMatchObject({data: {source: first.source}});
    expect(second.api.get).not.toHaveBeenCalled();
    expect(await second.lease.request.get('/api/predictions/mine')).toMatchObject({data: {source: second.source}});
    expect(first.lease.current(second.lease.capture('arena', {privateRead: true}))).toBe(false);
    first.lease.dispose();
    expect(findPanelServices(first.session)).toBeNull(); expect(findPanelServices(second.session)).toBe(second.lease);
    expect(second.lease.current(second.lease.capture('arena'))).toBe(true);
  });

  it('supplies both request shapes, preserving bodies and the anonymous public client', async () => {
    const f = setup(), body = {actionUid: randomUUID(), amount: 2};
    const answer = await f.lease.request.post('/api/market/open', body);
    expect(answer).toMatchObject({ok: true, data: {body}});
    expect(f.api.post.mock.calls[0][1]).toBe(body);
    await f.lease.marketRequest('/api/market/portfolio');
    await f.lease.marketRequest('/api/market/open', {method: 'POST', body});
    expect(f.api.get).toHaveBeenCalledExactlyOnceWith('/api/market/portfolio');
    expect(f.api.post.mock.calls[1][1]).toBe(body);
    await f.lease.request.publicGet('/api/predictions');
    await f.lease.publicGet('/api/market');
    expect(f.publicApi.get.mock.calls).toEqual([['/api/predictions'], ['/api/market']]);
    const privateCalls = f.api.get.mock.calls.length + f.api.post.mock.calls.length;
    expect(await f.lease.marketRequest('/api/market/open', {method: 'PUT', body})).toMatchObject({ok: false, status: 405});
    expect(await f.lease.marketRequest('/api/market/open', {method: 'DELETE'})).toMatchObject({code: 'method_not_allowed'});
    expect(f.api.get.mock.calls.length + f.api.post.mock.calls.length).toBe(privateCalls);
    expect(f.lease.getToken()).toBe(f.session.getToken());
  });

  it('keeps public reads anonymous and available while signed out without admitting a private request', async () => {
    const f = setup({signedIn: false, flags: {market: false}});
    expect(await f.lease.publicGet('/api/market')).toMatchObject({ok: true, data: {public: true}});
    expect(f.lease.capture('market', {allowFlagOff: true})).not.toBeNull();
    expect(f.lease.capture('market', {privateRead: true, allowFlagOff: true})).toBeNull();
    expect(await f.lease.request.get('/api/market/portfolio')).toMatchObject({ok: false});
    expect(await f.lease.request.post('/api/market/open', {actionUid: randomUUID()})).toMatchObject({ok: false});
    expect(f.api.get).not.toHaveBeenCalled(); expect(f.api.post).not.toHaveBeenCalled();
    expect(f.lease.getToken()).toBeNull();
  });

  it('preserves a pending ticket and exact write body through same-scope token renewal', async () => {
    const f = setup(), body = {actionUid: randomUUID(), side: 'left'}, held = deferred();
    f.api.post.mockReturnValueOnce(held.promise);
    const ticket = f.lease.capture('arena', {privateRead: true}), scope = f.session.getScope();
    const changed = vi.fn(), identities = vi.fn(), sessions = vi.fn();
    f.lease.subscribe(changed); f.lease.onIdentityChange(identities); f.lease.onSessionChange(sessions);
    const write = f.lease.request.post('/api/duels/accept', body), renewed = `fixture-${randomUUID()}`;
    f.session.setRenewal(async () => { f.session.setToken(renewed); return true; });
    expect(await f.session.renewToken()).toBe(true); f.lease.refresh();
    expect(f.session.getScope()).toBe(scope); expect(f.lease.current(ticket)).toBe(true);
    expect(f.lease.getToken()).toBe(renewed);
    expect(changed).not.toHaveBeenCalled(); expect(identities).not.toHaveBeenCalled(); expect(sessions).not.toHaveBeenCalled();
    const reply = success({accepted: true}); held.resolve(reply);
    expect(await write).toBe(reply); expect(f.api.post).toHaveBeenCalledTimes(1);
    expect(f.api.post.mock.calls[0][1]).toBe(body);
  });

  it.each([false, 'true', 1, undefined])('requires a strict true feature flag, received %s', value => {
    const f = setup({flags: {arena: value, predictions: value, market: false}});
    expect(f.lease.capture('arena')).toBeNull();
    expect(f.lease.capture('predictions', {privateRead: true})).toBeNull();
    expect(f.lease.capture('arena', {allowFlagOff: true})).toBeNull();
    expect(f.lease.capture('market', {allowFlagOff: true})).not.toBeNull();
    f.state.flags = {arena: true}; f.lease.refresh();
    expect(f.lease.capture('arena')).not.toBeNull();
    expect(f.lease.capture('arena', {allowFlagOff: true})).toBeNull();
  });

  it('invalidates only the changed feature across a flag blink and compares strict normalized values', () => {
    const f = setup(), arena = f.lease.capture('arena'), market = f.lease.capture('market');
    const changed = vi.fn(), identity = vi.fn(); f.lease.subscribe(changed); f.lease.onIdentityChange(identity);
    f.state.flags = {...f.state.flags, market: false}; f.lease.refresh();
    expect(f.lease.current(arena)).toBe(true); expect(f.lease.current(market)).toBe(false);
    f.state.flags = {...f.state.flags, market: 'true'}; f.lease.refresh();
    f.state.flags = {...f.state.flags, market: 1}; f.lease.refresh();
    expect(changed).toHaveBeenCalledTimes(1);
    f.state.flags = {...f.state.flags, arena: false}; f.lease.refresh();
    f.state.flags = {...f.state.flags, arena: true}; f.lease.refresh();
    expect(f.lease.current(arena)).toBe(false);
    expect(f.lease.current(f.lease.capture('arena'))).toBe(true); expect(identity).not.toHaveBeenCalled();
  });

  it('invalidates public tickets on account changes and reports only the existing signedIn shape once', () => {
    const f = setup({signedIn: false}), publicTicket = f.lease.capture('market');
    const identity = vi.fn(), sessionEvents = vi.fn();
    f.lease.onIdentityChange(identity); f.lease.onSessionChange(sessionEvents);
    f.session.setToken(`fixture-${randomUUID()}`); f.lease.refresh();
    expect(f.lease.current(publicTicket)).toBe(false);
    const privateTicket = f.lease.capture('arena', {privateRead: true});
    f.session.clearToken(); f.lease.refresh();
    f.session.setToken(`fixture-${randomUUID()}`); f.lease.refresh();
    expect(f.lease.current(privateTicket)).toBe(false);
    expect(identity.mock.calls).toEqual([[{signedIn: true}], [{signedIn: false}], [{signedIn: true}]]);
    expect(sessionEvents.mock.calls).toEqual(identity.mock.calls);
    expect(Object.keys(privateTicket)).toEqual([]); expect(Object.isFrozen(privateTicket)).toBe(true);
  });

  it('cancels pending opens on explicit invalidation, readiness loss and disposal without a request or resend', async () => {
    const f = setup(), opened = vi.fn(), held = deferred(), ticket = f.lease.capture('arena');
    const pending = held.promise.then(() => { if (f.lease.current(ticket)) opened(); });
    const changed = vi.fn(); f.lease.subscribe(changed); f.lease.invalidate();
    held.resolve(); await pending; expect(opened).not.toHaveBeenCalled(); expect(changed).toHaveBeenCalledOnce();
    const readyTicket = f.lease.capture('arena'); f.state.ready = false; f.lease.refresh();
    f.state.ready = true; f.lease.refresh(); expect(f.lease.current(readyTicket)).toBe(false);
    const finalTicket = f.lease.capture('arena'); f.lease.dispose(); f.lease.dispose();
    expect(f.lease.current(finalTicket)).toBe(false); expect(f.lease.getIdentity()).toBeNull();
    expect(await f.lease.publicGet('/api/market')).toMatchObject({ok: false});
    expect(f.api.get).not.toHaveBeenCalled(); expect(f.api.post).not.toHaveBeenCalled(); expect(f.publicApi.get).not.toHaveBeenCalled();
  });

  it('replaces a provider, detaches its session listener and makes old cleanup harmless', () => {
    const session = createSession(); session.setToken(`fixture-${randomUUID()}`);
    const original = session.onChange, stopped = [];
    session.onChange = vi.fn(listener => { const stop = vi.fn(original(listener)); stopped.push(stop); return stop; });
    const seen = [], stopWatch = watchPanelServices(session, lease => seen.push(lease));
    const options = {api: {}, publicApi: {}, getFlags: () => ({arena: true}), isReady: () => true};
    const old = registerPanelServices(session, options); leases.push(old);
    const ticket = old.capture('arena'), changed = vi.fn(); old.subscribe(changed);
    const replacement = registerPanelServices(session, options); leases.push(replacement);
    expect(old.current(ticket)).toBe(false); expect(stopped[0]).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce();
    old.dispose(); expect(findPanelServices(session)).toBe(replacement);
    expect(seen).toEqual([null, old, replacement]);
    replacement.dispose(); expect(stopped[1]).toHaveBeenCalledOnce(); expect(seen).toEqual([null, old, replacement, null]);
    stopWatch(); registerPanelServices(session, options).dispose(); expect(seen).toHaveLength(4);
  });

  it('allows safe unsubscription and reentrant listeners without duplicate or skipped current notifications', () => {
    const f = setup(), other = vi.fn(), failing = vi.fn(() => { throw new Error('fixture-listener'); });
    let stopFirst; const first = vi.fn(() => { stopFirst(); f.lease.invalidate(); });
    stopFirst = f.lease.subscribe(first); f.lease.subscribe(failing); f.lease.subscribe(other);
    expect(() => f.lease.invalidate()).not.toThrow();
    expect(first).toHaveBeenCalledOnce(); expect(other).toHaveBeenCalledOnce(); expect(failing).toHaveBeenCalledOnce();
    f.lease.invalidate(); expect(first).toHaveBeenCalledOnce(); expect(other).toHaveBeenCalledTimes(2);
    let replacement, once = false;
    const stop = watchPanelServices(f.session, current => {
      if (!current || once) return;
      once = true; replacement = registerPanelServices(f.session, f.options); leases.push(replacement);
    });
    expect(findPanelServices(f.session)).toBe(replacement); stop();
    f.lease.dispose(); expect(findPanelServices(f.session)).toBe(replacement);
  });

  it('removes a disposed provider before cleanup callbacks and preserves a reentrant newer registration', () => {
    const f = setup(), seen = [], stop = watchPanelServices(f.session, lease => seen.push(lease));
    let replacement, duringCleanup;
    f.lease.subscribe(() => {
      duringCleanup = findPanelServices(f.session);
      replacement = registerPanelServices(f.session, f.options); leases.push(replacement);
    });
    f.lease.dispose();
    expect(duringCleanup).toBeNull();
    expect(findPanelServices(f.session)).toBe(replacement); expect(seen).toEqual([f.lease, replacement]);
    f.lease.dispose(); expect(findPanelServices(f.session)).toBe(replacement); stop();
  });

  it('publishes a replacement using the identity reached during the old provider cleanup', () => {
    const f = setup();
    f.lease.subscribe(() => { f.session.clearToken(); f.session.setToken(`fixture-${randomUUID()}`); });
    const observed = [], stop = watchPanelServices(f.session, lease => observed.push(lease?.getIdentity() ?? null));
    const before = f.session.getScope(), newer = registerPanelServices(f.session, f.options); leases.push(newer);
    expect(f.session.getScope()).not.toBe(before); expect(newer.getIdentity()).toBe(f.session.getScope());
    expect(observed).toEqual([before, f.session.getScope()]); stop();
  });

  it('fails closed when capability getters or clients throw and does not reveal their errors', async () => {
    const secret = `fixture-${randomUUID()}`, fail = () => { throw new Error(secret); };
    const f = setup({getFlags: fail});
    expect(f.lease.capture('arena')).toBeNull(); expect(f.lease.getFlags()).toEqual({});
    const badIdentity = setup({getIdentity: fail});
    expect(badIdentity.lease.capture('arena', {privateRead: true})).toBeNull();
    expect(badIdentity.lease.getIdentity()).toBeNull();
    const badReadiness = setup({isReady: fail});
    expect(badReadiness.lease.capture('market', {allowFlagOff: true})).toBeNull();
    expect(await badReadiness.lease.publicGet('/api/market')).toMatchObject({ok: false});
    expect(badReadiness.publicApi.get).not.toHaveBeenCalled();
    const client = setup(); client.api.get.mockImplementation(fail);
    const answer = await client.lease.request.get('/api/duels');
    expect(answer).toMatchObject({ok: false, code: 'unavailable'}); expect(JSON.stringify(answer)).not.toContain(secret);
    expect(() => watchPanelServices(client.session, fail)()).not.toThrow();
    const rejected = vi.fn(async () => { throw new Error(secret); }), next = vi.fn();
    client.lease.subscribe(rejected); client.lease.subscribe(next); client.lease.invalidate();
    await Promise.resolve(); expect(rejected).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledOnce();
    const stop = watchPanelServices(client.session, rejected); await Promise.resolve(); stop();
  });

  it('claims one arena entry per explicit session and releases only the exact current owner', () => {
    const first = setup(), second = setup(), factory = vi.fn(() => ({close: vi.fn(), dispose: vi.fn()}));
    const entry = claimPanelEntry(first.session, 'arena', factory);
    expect(claimPanelEntry(first.session, 'arena', factory)).toBe(entry); expect(factory).toHaveBeenCalledOnce();
    expect(findPanelEntry(first.session, 'arena')).toBe(entry); expect(findPanelEntry(second.session, 'arena')).toBeNull();
    expect(claimPanelEntry(second.session, 'arena', factory)).not.toBe(entry);
    expect(releasePanelEntry(first.session, 'arena', {})).toBe(false);
    expect(releasePanelEntry(first.session, 'arena', entry)).toBe(true);
    const newer = claimPanelEntry(first.session, 'arena', factory);
    expect(releasePanelEntry(first.session, 'arena', entry)).toBe(false); expect(findPanelEntry(first.session, 'arena')).toBe(newer);
    expect(entry.dispose).not.toHaveBeenCalled(); expect(entry.close).not.toHaveBeenCalled();
    expect(releasePanelEntry(first.session, 'arena', newer)).toBe(true);
    expect(releasePanelEntry(second.session, 'arena', findPanelEntry(second.session, 'arena'))).toBe(true);
    expect(claimPanelEntry(first.session, 'arena', () => { throw new Error('fixture-entry'); })).toBeNull();
    const retried = claimPanelEntry(first.session, 'arena', factory); expect(retried).not.toBeNull();
    expect(releasePanelEntry(first.session, 'arena', retried)).toBe(true);
  });
});


describe('unflagged factory-owned islet capability', () => {
  it('admits only a ready signed-in lease and returns the same factory adapter without requiring a feature flag', async () => {
    const adapter = {build: vi.fn()}, load = vi.fn(async () => adapter);
    const f = setup({flags: {}, getIslet: load});
    expect(f.lease.isReady()).toBe(true);
    expect(await f.lease.getIslet()).toBe(adapter);
    expect(await f.lease.getIslet()).toBe(adapter);
    f.state.ready = false; f.lease.refresh();
    expect(f.lease.isReady()).toBe(false); expect(await f.lease.getIslet()).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    f.state.ready = true; f.lease.refresh(); f.session.clearToken();
    expect(f.lease.isReady()).toBe(true); expect(await f.lease.getIslet()).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(f.api.get).not.toHaveBeenCalled(); expect(f.publicApi.get).not.toHaveBeenCalled();
  });

  it.each(['identity', 'readiness', 'invalidate', 'replacement', 'dispose'])(
    'rejects an adapter imported across %s ownership changes without disposing the factory resource', async boundary => {
      const pending = deferred(), adapter = {dispose: vi.fn()};
      const f = setup({getIslet: () => pending.promise});
      const result = f.lease.getIslet();
      if (boundary === 'identity') { f.session.clearToken(); f.session.setToken(`fixture-${randomUUID()}`); }
      if (boundary === 'readiness') { f.state.ready = false; f.lease.refresh(); f.state.ready = true; f.lease.refresh(); }
      if (boundary === 'invalidate') f.lease.invalidate();
      if (boundary === 'replacement') leases.push(registerPanelServices(f.session, f.options));
      if (boundary === 'dispose') f.lease.dispose();
      pending.resolve(adapter);
      expect(await result).toBeNull(); expect(adapter.dispose).not.toHaveBeenCalled();
    });

  it('refuses absent or throwing providers without leaking their error', async () => {
    const empty = setup(); expect(await empty.lease.getIslet()).toBeNull();
    const f = setup({getIslet: async () => { throw new Error(`fixture-${randomUUID()}`); }});
    expect(await f.lease.getIslet()).toBeNull();
  });
});
