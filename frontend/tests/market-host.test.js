// Exercise the actual registry and market policy with explicit sessions and injected module promises only.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createMarketHost} from '../src/online/market-host.js';
import {registerPanelServices} from '../src/online/panel-services.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const cleanups = [];
function sessionFixture(signedIn = true) {
  let identity = Object.freeze({}), token = `fixture-${crypto.randomUUID()}`;
  const listeners = new Set();
  return {isSignedIn: () => signedIn, getScope: () => identity, getToken: vi.fn(() => token),
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    change(next = true) { signedIn = next; identity = Object.freeze({}); token = `fixture-${crypto.randomUUID()}`;
      for (const listener of [...listeners]) listener(); },
    get listenerCount() { return listeners.size; }};
}
function provider(session = sessionFixture(), initial = {}) {
  const state = {ready: true, flags: {market: true, arena: false}, ...initial};
  const board = {tradingEnabled: true, companies: [], rules: {stakeChoices: []}};
  const api = {get: vi.fn(async () => ({ok: true, status: 200, data: {positions: []}})),
    post: vi.fn(async () => ({ok: true, status: 200, data: {positionId: crypto.randomUUID()}}))};
  const publicApi = {get: vi.fn(async () => ({ok: true, status: 200, data: board}))};
  const lease = registerPanelServices(session, {api, publicApi, getFlags: () => state.flags, isReady: () => state.ready});
  cleanups.push(() => lease.dispose()); return {session, state, api, publicApi, board, lease};
}
function entryModule(override) {
  const contexts = [], entries = [], created = deferred(), waiters = [];
  const createMarketEntry = vi.fn(context => {
    const entry = {active: false, unknownUid: crypto.randomUUID(),
      open: vi.fn(() => { entry.active = true; }), close: vi.fn(() => { entry.active = false; }),
      dispose: vi.fn(() => { entry.active = false; })};
    override?.(entry, context); contexts.push(context); entries.push(entry); created.resolve(entry);
    for (const waiter of waiters) if (entries.length >= waiter.count) waiter.resolve(entries[waiter.count - 1]);
    return entry;
  });
  return {createMarketEntry, contexts, entries, created,
    waitForEntry: count => entries.length >= count ? Promise.resolve(entries[count - 1])
      : new Promise(resolve => waiters.push({count, resolve}))};
}
function hostFor(fixture, extra = {}) {
  const module = entryModule(), load = vi.fn(async () => module), notify = vi.fn();
  const host = createMarketHost({session: fixture.session, container: {}, search: '', dev: false, load, notify, ...extra});
  cleanups.push(() => host.dispose()); return {host, module, load, notify};
}
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); vi.restoreAllMocks(); });

describe('deferred public market admission', () => {
  it('does not load or invent a client without a ready provider', async () => {
    const session = sessionFixture(), fixture = {session};
    const {host, load} = hostFor(fixture);
    expect(await host.open()).toBe(false); expect(load).not.toHaveBeenCalled(); expect(host.pending).toBe(false);
    const service = provider(session, {ready: false});
    expect(await host.open()).toBe(false); expect(load).not.toHaveBeenCalled();
    service.state.ready = true; service.lease.refresh(); expect(await host.open()).toBe(true);
    expect(load).toHaveBeenCalledOnce(); expect(session.getToken).not.toHaveBeenCalled();
  });

  it.each([false, 'true', 1])('permits anonymous prices and rejects private calls for strict flag %j', async market => {
    const fixture = provider(sessionFixture(false), {flags: {market}}), {host, module} = hostFor(fixture);
    expect(await host.open()).toBe(true);
    const context = module.contexts[0], board = await context.publicGet('/api/market');
    expect(typeof context.request).toBe('function'); expect(board.data.tradingEnabled).toBe(false);
    expect(board.data).not.toBe(fixture.board); expect(fixture.board.tradingEnabled).toBe(true);
    expect(await context.request('/api/market/open', {method: 'POST', body: {actionUid: crypto.randomUUID()}}))
      .toMatchObject({ok: false, code: 'feature_off'});
    expect(fixture.api.get).not.toHaveBeenCalled(); expect(fixture.api.post).not.toHaveBeenCalled();
    expect(fixture.publicApi.get.mock.calls).toEqual([['/api/market']]); expect(fixture.session.getToken).not.toHaveBeenCalled();
  });

  it('blocks live demo imports while allowing only the explicit development local mode', async () => {
    const fixture = provider(), live = hostFor(fixture, {search: '?demo=1'});
    expect(await live.host.open()).toBe(false); expect(live.load).not.toHaveBeenCalled();
    const production = hostFor(fixture, {search: '?demo=1&market=local', dev: false});
    expect(await production.host.open()).toBe(false); expect(production.load).not.toHaveBeenCalled();
    const local = hostFor({session: sessionFixture()}, {search: '?demo=1&market=local', dev: true,
      watchServices: vi.fn(() => { throw new Error('Local mode needs no service'); })});
    expect(await local.host.open()).toBe(true);
    const context = local.module.contexts[0]; expect(context.getToken()).toBeNull();
    expect(await context.request('/api/market/open', {method: 'POST'})).toMatchObject({ok: false});
    expect(await context.publicGet('/api/market')).toMatchObject({ok: false});
    expect(fixture.api.post).not.toHaveBeenCalled(); expect(fixture.publicApi.get).not.toHaveBeenCalled();
  });
});

describe('market entry lifetime', () => {
  it('cancels pending import before construction and prevents an old finally from erasing a newer open', async () => {
    const fixture = provider(), held = deferred(), started = deferred(), module = entryModule();
    const load = vi.fn(() => { started.resolve(); return held.promise; }), {host} = hostFor(fixture, {load});
    const old = host.open(); expect(host.active).toBe(true); expect(host.pending).toBe(true); await started.promise;
    expect(host.close()).toBe(true); expect(host.active).toBe(false); expect(host.pending).toBe(false);
    const fresh = host.open(); expect(host.pending).toBe(true);
    held.resolve(module); expect(await old).toBe(false); expect(await fresh).toBe(true);
    expect(load).toHaveBeenCalledOnce(); expect(module.createMarketEntry).toHaveBeenCalledOnce();
    expect(host.active).toBe(true); expect(host.pending).toBe(false);
  });

  it('retains the same entry and policy function references with unknown ids across ordinary close', async () => {
    const fixture = provider(), {host, module, load} = hostFor(fixture); await host.open();
    const entry = module.entries[0], context = module.contexts[0], uid = entry.unknownUid;
    expect(host.close()).toBe(true); expect(host.active).toBe(false); expect(await host.open()).toBe(true);
    expect(module.entries).toEqual([entry]); expect(entry.unknownUid).toBe(uid); expect(entry.dispose).not.toHaveBeenCalled();
    expect(module.contexts[0].request).toBe(context.request); expect(module.contexts[0].getIdentity).toBe(context.getIdentity);
    expect(module.contexts[0].onSessionChange).toBe(context.onSessionChange); expect(load).toHaveBeenCalledOnce();
  });

  it('invalidates delayed entry opening on close, even after a later open owns the pending indicator', async () => {
    const fixture = provider(), held = deferred(), opened = deferred(); let revision = 0;
    const module = entryModule(entry => {
      entry.open.mockImplementationOnce(() => { const mine = revision; opened.resolve();
        return held.promise.then(() => { if (mine === revision) entry.active = true; }); });
      entry.close.mockImplementation(() => { revision += 1; entry.active = false; });
    });
    const {host} = hostFor(fixture, {load: async () => module});
    const old = host.open(); await opened.promise; host.close();
    expect(await host.open()).toBe(true); held.resolve(); expect(await old).toBe(false);
    expect(host.active).toBe(true); expect(host.pending).toBe(false); expect(module.createMarketEntry).toHaveBeenCalledOnce();
  });

  it('does not construct or revive after disposal and retries a load failure only on another open', async () => {
    const fixture = provider(), held = deferred(), started = deferred(), module = entryModule();
    const cancelled = hostFor(fixture, {load: () => { started.resolve(); return held.promise; }});
    const old = cancelled.host.open(); await started.promise; cancelled.host.dispose(); held.resolve(module);
    expect(await old).toBe(false); expect(await cancelled.host.open()).toBe(false); expect(module.createMarketEntry).not.toHaveBeenCalled();
    const load = vi.fn().mockRejectedValueOnce(new Error(`fixture-${crypto.randomUUID()}`)).mockResolvedValueOnce(module);
    const retry = hostFor(fixture, {load}); expect(await retry.host.open()).toBe(false);
    expect(load).toHaveBeenCalledOnce(); expect(await retry.host.open()).toBe(true); expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('private market boundary cleanup', () => {
  it('leaves Account attention unobscured after expiry while allowing a later explicit anonymous price visit', async () => {
    const fixture = provider(), {host, module} = hostFor(fixture); await host.open();
    const old = module.entries[0]; fixture.session.change(false);
    expect(old.dispose).toHaveBeenCalledOnce(); expect(host.active).toBe(false);
    await Promise.resolve(); await Promise.resolve(); expect(module.entries).toHaveLength(1);
    expect(await host.open()).toBe(true); expect(module.entries).toHaveLength(2);
    expect(module.contexts[1].getIdentity()).toBeNull(); expect(module.contexts[1].getToken()).toBeNull();
    expect(fixture.api.post).not.toHaveBeenCalled();
  });
  it('clears old identity immediately, rejects a late request, and reopens through a fresh default entry', async () => {
    const fixture = provider(), {host, module} = hostFor(fixture); await host.open();
    const old = module.entries[0], context = module.contexts[0], held = deferred();
    fixture.api.post.mockReturnValueOnce(held.promise);
    const requested = context.request('/api/market/open', {method: 'POST', body: {actionUid: crypto.randomUUID()}});
    const identity = context.getIdentity(); fixture.session.change();
    expect(old.dispose).toHaveBeenCalledOnce(); expect(context.getIdentity()).toBeNull();
    expect(await context.request('/api/market/portfolio', {method: 'GET'})).toMatchObject({ok: false, code: 'not_ready'});
    held.resolve({ok: true, status: 200, data: {positionId: crypto.randomUUID()}});
    expect(await requested).toMatchObject({ok: false}); const fresh = await module.waitForEntry(2);
    expect(fresh.open).toHaveBeenCalledOnce(); expect(fresh.active).toBe(true);
    expect(module.entries).toHaveLength(2); expect(module.contexts[1].getIdentity()).not.toBe(identity);
    expect(module.entries[1].unknownUid).not.toBe(old.unknownUid); expect(fixture.api.post).toHaveBeenCalledOnce();
  });

  it('resets on market blinks and lifetime invalidation while ignoring unrelated and nontrue flag changes', async () => {
    const fixture = provider(), {host, module} = hostFor(fixture); await host.open(); const first = module.entries[0];
    fixture.state.flags.arena = true; fixture.lease.refresh(); expect(first.dispose).not.toHaveBeenCalled();
    fixture.state.flags.market = false; fixture.lease.refresh(); expect(first.dispose).toHaveBeenCalledOnce();
    await host.open(); const off = module.entries[1];
    for (const value of ['true', 1, false]) { fixture.state.flags.market = value; fixture.lease.refresh(); }
    expect(off.dispose).not.toHaveBeenCalled();
    fixture.state.flags.market = true; fixture.lease.refresh(); expect(off.dispose).toHaveBeenCalledOnce(); await host.open();
    const live = module.entries[2]; fixture.lease.invalidate(); expect(live.dispose).toHaveBeenCalledOnce(); await host.open();
    expect(module.entries).toHaveLength(4);
  });

  it('retains a prior open preference across provider replacement but never shares another session transport', async () => {
    const a = provider(), b = provider(), first = hostFor(a), other = hostFor(b); await first.host.open(); await other.host.open();
    const old = first.module.entries[0], otherEntry = other.module.entries[0];
    const replacement = provider(a.session); expect(old.dispose).toHaveBeenCalledOnce(); expect(otherEntry.dispose).not.toHaveBeenCalled();
    const reopened = await first.module.waitForEntry(2); expect(reopened.open).toHaveBeenCalledOnce();
    const context = first.module.contexts[1];
    await context.publicGet('/api/market'); await context.request('/api/market/portfolio', {method: 'GET'});
    expect(replacement.publicApi.get).toHaveBeenCalledOnce(); expect(replacement.api.get).toHaveBeenCalledOnce();
    expect(a.api.get).not.toHaveBeenCalled(); expect(b.api.get).not.toHaveBeenCalled();
    first.host.dispose(); first.host.dispose(); expect(first.host.active).toBe(false); expect(other.host.active).toBe(true);
  });

  it('pauses an open board for unreadiness, reopens when ready, and lets ordinary close cancel that preference', async () => {
    const fixture = provider(), {host, module} = hostFor(fixture); await host.open();
    fixture.state.ready = false; fixture.lease.refresh(); expect(module.entries[0].dispose).toHaveBeenCalledOnce();
    expect(host.active).toBe(false); fixture.state.ready = true; fixture.lease.refresh();
    const fresh = await module.waitForEntry(2); expect(fresh.active).toBe(true);
    await host.open(); fixture.state.ready = false; fixture.lease.refresh(); host.close();
    fixture.state.ready = true; fixture.lease.refresh();
    expect(module.entries).toHaveLength(2); expect(host.active).toBe(false);
  });
});
