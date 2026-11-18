// Actual private registry, with deferred card modules and canonical-context fixtures only.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {registerPanelServices} from '../../src/online/panel-services.js';
import {createSharedWagerHost} from '../../src/harbor/shared-wager-host.js';

const uuid = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`;
const envelope = () => ({mode: 'island_shared', version: 1, islandOwner: uuid(1), accountId: uuid(2),
  runEpoch: uuid(3), revision: '1', treasury: {balanceCoins: '100', committedCoins: '20', availableCoins: '80'}});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const stops = [];
function moduleFor(product = 'market', override) {
  const contexts = [], entries = [];
  const factory = vi.fn(context => {
    const entry = {active: false, open: vi.fn(async () => {entry.active = true;}),
      close: vi.fn(() => {entry.active = false;}), dispose: vi.fn(() => {entry.active = false;})};
    override?.(entry); contexts.push(context); entries.push(entry); return entry;
  });
  return {[product === 'market' ? 'createSharedMarketEntry' : 'createSharedMatchEntry']: factory, factory, contexts, entries};
}
function fixture(extra = {}) {
  let identity = {}, signedIn = true;
  const sessionListeners = new Set(), economyListeners = new Set();
  const session = {isSignedIn: () => signedIn, getScope: () => identity,
    getToken: vi.fn(() => {throw new Error('Host must not read tokens');}),
    onChange: listener => {sessionListeners.add(listener); return () => sessionListeners.delete(listener);}};
  const state = {economy: envelope(), actor: uuid(4), ready: true, flags: {market: true, sports: true}};
  const api = {get: vi.fn(async () => ({ok: true, data: {read: true}})), post: vi.fn(async () => ({ok: true, data: {paid: true}}))};
  const install = () => registerPanelServices(session, {api, getFlags: () => state.flags, isReady: () => state.ready, getActorId: () => state.actor});
  const lease = install(), market = moduleFor(), match = moduleFor('football');
  const callbacks = {resetInput: vi.fn(), focusGame: vi.fn(), onSignIn: vi.fn(), notify: vi.fn(), onEconomy: vi.fn()};
  const host = createSharedWagerHost({session, container: {}, getEconomy: () => state.economy,
    subscribeEconomy: listener => {economyListeners.add(listener); return () => economyListeners.delete(listener);},
    ...callbacks, loadMarket: vi.fn(async () => market), loadMatch: vi.fn(async () => match), ...extra});
  stops.push(() => lease.dispose(), () => host.dispose());
  return {host, state, api, lease, market, match, callbacks, install, session,
    changeEconomy(next) {state.economy = next; for (const listener of [...economyListeners]) listener();},
    changeIdentity(next = true) {signedIn = next; identity = {}; for (const listener of [...sessionListeners]) listener();},
    get economyListeners() {return economyListeners.size;}};
}
afterEach(() => {for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks();});

describe('shared wager host admission and transport', () => {
  it('does not import a card without a registered private provider', async () => {
    const loadMarket = vi.fn(), host = createSharedWagerHost({session: {}, getEconomy: envelope, loadMarket});
    stops.push(() => host.dispose()); expect(await host.open('market')).toBe(false);
    expect(loadMarket).not.toHaveBeenCalled(); expect(host.active).toBe(false);
  });
  it.each([null, {mode: 'personal_legacy'}, {...envelope(), accountId: 'invalid'}])('fails closed for context %j without importing', async economy => {
    const loadMarket = vi.fn(), f = fixture({loadMarket}); f.state.economy = economy;
    expect(await f.host.open('market')).toBe(false); expect(loadMarket).not.toHaveBeenCalled(); expect(f.host.active).toBe(false);
  });
  it('requires a ready signed-in provider, authoritative actor and exact feature flag', async () => {
    const loadMarket = vi.fn(), f = fixture({loadMarket});
    for (const actor of [null, 'invalid']) {f.state.actor = actor; expect(await f.host.open('market')).toBe(false);}
    f.state.actor = uuid(4); f.state.ready = false; f.lease.refresh(); expect(await f.host.open('market')).toBe(false);
    f.state.ready = true; f.state.flags.market = 'true'; f.lease.refresh(); expect(await f.host.open('market')).toBe(false);
    f.state.flags.market = true; f.lease.refresh(); f.changeIdentity(false); expect(await f.host.open('market')).toBe(false);
    expect(loadMarket).not.toHaveBeenCalled(); expect(f.session.getToken).not.toHaveBeenCalled();
  });
  it('selects dedicated lazy factories and forwards provider capability options and callbacks exactly', async () => {
    const f = fixture(); expect(await f.host.open('market')).toBe(true);
    const ctx = f.market.contexts[0], config = {headers: {'X-Island-Economy-Version': '1'}}, body = {actionUid: 'intent123'};
    expect(ctx.getActorId()).toBe(uuid(4)); expect(ctx.getEconomy()).toBe(f.state.economy);
    for (const name of ['resetInput', 'focusGame', 'onSignIn', 'notify']) expect(ctx[name]).toBe(f.callbacks[name]);
    await ctx.api.get('/api/island/wagers', config); await ctx.api.post('/api/island/wagers/market', body, config);
    expect(f.api.get.mock.calls).toEqual([['/api/island/wagers', config]]);
    expect(f.api.post.mock.calls).toEqual([['/api/island/wagers/market', body, config]]);
    expect(await f.host.open('football')).toBe(true); expect(f.market.entries[0].dispose).toHaveBeenCalledOnce();
    expect(f.match.factory).toHaveBeenCalledOnce(); expect(await f.host.open('unsupported')).toBe(false);
    expect(f.session.getToken).not.toHaveBeenCalled();
  });
  it('forwards only matching fresh economy through a frozen origin and guarded subscriptions', async () => {
    const f = fixture(); await f.host.open('market'); const ctx = f.market.contexts[0], changed = vi.fn();
    const stop = ctx.subscribeEconomy(changed), fresh = {...envelope(), revision: '2'};
    ctx.onEconomy(fresh, envelope());
    expect(f.callbacks.onEconomy).toHaveBeenCalledWith(fresh, {mode: 'island_shared', version: 1,
      islandOwner: uuid(1), accountId: uuid(2), runEpoch: uuid(3)});
    expect(Object.isFrozen(f.callbacks.onEconomy.mock.calls[0][1])).toBe(true);
    ctx.onEconomy({...fresh, accountId: uuid(5)}, envelope()); ctx.onEconomy(fresh, {...envelope(), runEpoch: uuid(5)});
    f.changeEconomy(fresh); expect(changed).toHaveBeenCalledOnce();
    ctx.onEconomy(envelope(), envelope()); expect(f.callbacks.onEconomy).toHaveBeenCalledOnce();
    f.host.close(); f.changeEconomy({...fresh, revision: '3'}); expect(changed).toHaveBeenCalledOnce(); stop();
    expect(ctx.getEconomy()).toBeNull(); expect(ctx.getActorId()).toBeNull();
    expect(await ctx.api.get('/api/island/wagers')).toMatchObject({ok: false});
  });
  it('keeps a late mutation outcome unknown after scope loss instead of clearing its retry identity', async () => {
    const f = fixture(), response = deferred(); await f.host.open('market');
    const ctx = f.market.contexts[0]; f.api.post.mockReturnValueOnce(response.promise);
    const pending = ctx.api.post('/api/island/wagers/market', {actionUid: 'intent123'});
    f.changeIdentity(); response.resolve({ok: true, data: {receipt: 'old-origin'}});
    expect(await pending).toMatchObject({ok: false, status: 0, unknown: true});
    ctx.onEconomy({...envelope(), revision: '2'}, envelope()); expect(f.callbacks.onEconomy).not.toHaveBeenCalled();
    expect(f.market.entries[0].active).toBe(false);
  });
  it('uses the sports feature for football independently of the market feature', async () => {
    const f = fixture(); f.state.flags.market = false; f.lease.refresh();
    expect(await f.host.open('market')).toBe(false); expect(await f.host.open('football')).toBe(true);
    expect(f.market.factory).not.toHaveBeenCalled(); expect(f.match.factory).toHaveBeenCalledOnce();
  });
});

describe('shared wager host deferred lifetime', () => {
  it.each(['actor', 'origin', 'mutated origin', 'identity', 'provider', 'flag', 'readiness'])('cancels deferred imports on %s changes', async change => {
    const held = deferred(), loadMarket = vi.fn(() => held.promise), f = fixture({loadMarket});
    const pending = f.host.open('market'); expect(f.host.active).toBe(true);
    await Promise.resolve();
    if (change === 'actor') {f.state.actor = uuid(5); f.lease.invalidate();}
    if (change === 'origin') f.changeEconomy({...envelope(), runEpoch: uuid(5)});
    if (change === 'mutated origin') {f.state.economy.accountId = uuid(5); f.changeEconomy(f.state.economy);}
    if (change === 'identity') f.changeIdentity();
    if (change === 'provider') {const next = f.install(); stops.push(() => next.dispose());}
    if (change === 'flag') {f.state.flags.market = false; f.lease.refresh();}
    if (change === 'readiness') {f.state.ready = false; f.lease.refresh();}
    expect(f.host.active).toBe(false); held.resolve(f.market); expect(await pending).toBe(false);
    expect(f.market.factory).not.toHaveBeenCalled();
  });
  it('rechecks actor and origin after import even without an economy subscription', async () => {
    const held = deferred(), f = fixture({loadMarket: () => held.promise, subscribeEconomy: undefined});
    const pending = f.host.open('market'); f.state.actor = uuid(5); held.resolve(f.market);
    expect(await pending).toBe(false); expect(f.market.factory).not.toHaveBeenCalled(); expect(f.host.active).toBe(false);
  });
  it('closes active entries on scope changes but retains same-origin revision updates', async () => {
    const f = fixture(); await f.host.open('football'); const entry = f.match.entries[0];
    f.changeEconomy({...envelope(), revision: '2'}); expect(entry.dispose).not.toHaveBeenCalled();
    f.state.flags.sports = false; f.lease.refresh(); expect(entry.dispose).toHaveBeenCalledOnce(); expect(f.host.active).toBe(false);
    expect(f.market.factory).not.toHaveBeenCalled();
  });
  it('coalesces a pending product and close cannot erase or revive a newer open', async () => {
    const held = deferred(), f = fixture({loadMarket: vi.fn(() => held.promise)});
    const old = f.host.open('market'), duplicate = f.host.open('market');
    expect(f.host.close()).toBe(true); expect(f.host.active).toBe(false);
    const fresh = f.host.open('football'); held.resolve(f.market);
    expect(await old).toBe(false); expect(await duplicate).toBe(false); expect(await fresh).toBe(true); expect(f.host.active).toBe(true);
    expect(f.market.factory).not.toHaveBeenCalled();
  });
  it('reopens after the card closes itself and releases the previous card subscriptions', async () => {
    const f = fixture(); expect(await f.host.open('market')).toBe(true);
    f.market.entries[0].close(); expect(f.host.active).toBe(false);
    expect(await f.host.open('market')).toBe(true); expect(f.market.entries[0].dispose).toHaveBeenCalledOnce();
    expect(f.market.entries).toHaveLength(2); expect(f.market.entries[1].active).toBe(true);
  });
  it('discards entry opens completed after close and never constructs after disposal', async () => {
    const held = deferred(), started = deferred(), module = moduleFor('market', entry => {
      entry.open.mockImplementation(async () => {started.resolve(); await held.promise; entry.active = true;});
    });
    const f = fixture({loadMarket: async () => module}), pending = f.host.open('market'); await started.promise;
    f.host.close(); held.resolve(); expect(await pending).toBe(false); expect(module.entries[0].active).toBe(false);
    const imported = deferred(), g = fixture({loadMarket: () => imported.promise}), late = g.host.open('market');
    g.host.dispose(); imported.resolve(g.market); expect(await late).toBe(false); expect(g.market.factory).not.toHaveBeenCalled();
    expect(g.economyListeners).toBe(0); expect(await g.host.open('market')).toBe(false); g.host.dispose();
  });
  it('retries lazy load failure only after a fresh explicit open', async () => {
    const loadMarket = vi.fn().mockRejectedValueOnce(new Error('fixture failure')), f = fixture({loadMarket});
    loadMarket.mockResolvedValueOnce(f.market); expect(await f.host.open('market')).toBe(false);
    expect(f.host.active).toBe(false); expect(await f.host.open('market')).toBe(true); expect(loadMarket).toHaveBeenCalledTimes(2);
  });
});
