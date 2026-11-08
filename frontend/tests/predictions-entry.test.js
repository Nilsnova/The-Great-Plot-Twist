// Injected leases and lazy modules exercise ownership without accounts, services or a browser.
import {randomUUID} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {createPredictionsEntry} from '../src/online/predictions-entry.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const success = data => ({ok: true, status: 200, data});
function provider({identity = 0, ready = true, flag = true} = {}) {
  const listeners = new Set(), tickets = new WeakMap();
  const state = {identity, ready, flags: {predictions: flag, arena: false}, lifetime: 0, revision: 0};
  const lease = {getIdentity: vi.fn(() => state.identity), getLifetime: vi.fn(() => state.lifetime),
    getFlags: vi.fn(() => ({...state.flags})), isReady: vi.fn(() => state.ready), onIdentityChange: vi.fn(() => () => {}),
    request: Object.freeze({get: vi.fn(async () => state.identity == null ? {ok: false, status: 401} : success({stakes: []})),
      post: vi.fn(async (path, body) => state.identity == null ? {ok: false, status: 401} : success({path, body})),
      publicGet: vi.fn(async () => success({questions: []}))}),
    capture: vi.fn(feature => { if (feature !== 'predictions' || !state.ready || state.flags.predictions !== true) return null;
      const ticket = {}; tickets.set(ticket, {identity: state.identity, lifetime: state.lifetime, revision: state.revision}); return ticket; }),
    current: vi.fn(ticket => { const saved = tickets.get(ticket); return Boolean(saved && state.ready === true
      && state.flags.predictions === true && saved.lifetime === state.lifetime && saved.revision === state.revision
      && Object.is(saved.identity, state.identity)); }),
    subscribe: vi.fn(listener => { listeners.add(listener); return vi.fn(() => listeners.delete(listener)); }), dispose: vi.fn()};
  return {lease, state, notify() { for (const listener of [...listeners]) listener(); }, change(patch) {
    if (Object.hasOwn(patch, 'identity') && !Object.is(patch.identity, state.identity)
      || Object.hasOwn(patch, 'ready') && patch.ready !== state.ready) state.lifetime += 1;
    if (patch.flags && (patch.flags.predictions === true) !== (state.flags.predictions === true)) state.revision += 1;
    Object.assign(state, patch); for (const listener of [...listeners]) listener(); }};
}
function setup({initial = provider().lease, open: openDesk, onCreate, ...extra} = {}) {
  const session = {}, container = {}, document = {}, resetInput = vi.fn(), focus = vi.fn(), onSignIn = vi.fn(), notify = vi.fn();
  const desks = [], created = deferred(), stopWatch = vi.fn(); let publish;
  const watchServices = vi.fn((exact, listener) => { expect(exact).toBe(session); publish = listener; listener(initial); return stopWatch; });
  const module = {createDesk: vi.fn(context => {
    let active = false, disposed = false;
    const record = {context, index: desks.length, attemptUid: randomUUID(), activate() { if (!disposed) active = true; }};
    record.desk = {open: vi.fn(() => openDesk ? openDesk(record) : Promise.resolve(record.activate())),
      close: vi.fn(() => { active = false; }), dispose: vi.fn(() => { disposed = true; active = false; record.attemptUid = null; }),
      get active() { return active; }};
    desks.push(record); created.resolve(record); onCreate?.(record); return record.desk;
  })}, load = vi.fn(async () => module);
  const entry = createPredictionsEntry({session, container, document, resetInput, focus, onSignIn, notify, watchServices,
    load, dev: false, search: '', ...extra});
  return {entry, session, desks, module, load, created, container, document, resetInput, focus, onSignIn, notify,
    watchServices, stopWatch, publish: next => publish(next)};
}

describe('prediction entry strict admission and stable context', () => {
  it.each([false, 'true', 1, undefined])('keeps non-true flag %s before the import boundary', async flag => {
    const p = provider(); p.state.flags.predictions = flag; const f = setup({initial: p.lease});
    expect(await f.entry.open()).toBe(false); expect(f.entry.active).toBe(false); expect(f.entry.pending).toBe(false);
    expect(f.load).not.toHaveBeenCalled(); expect(p.lease.capture).not.toHaveBeenCalled();
    for (const request of Object.values(p.lease.request)) expect(request).not.toHaveBeenCalled(); f.entry.dispose();
  });
  it('does not import for missing, unready or incomplete providers', async () => {
    const p = provider({ready: false}), cases = [setup({initial: null}), setup({initial: p.lease}),
      setup({initial: {...provider().lease, request: {get: vi.fn()}}})];
    for (const f of cases) { expect(await f.entry.open()).toBe(false); expect(f.load).not.toHaveBeenCalled(); f.entry.dispose(); }
    expect(p.lease.capture).not.toHaveBeenCalled();
  });
  it('passes exact explicit capabilities and numeric identity zero in one stable context', async () => {
    const p = provider({identity: 0}), f = setup({initial: p.lease, search: '?recorded=1'});
    expect(await f.entry.open()).toBe(true); const context = f.desks[0].context;
    expect(context).toMatchObject({container: f.container, resetInput: f.resetInput, focus: f.focus, onSignIn: f.onSignIn,
      document: f.document, search: '?recorded=1'});
    expect(context.request).toBe(p.lease.request); expect(context.getFlags).toBe(p.lease.getFlags);
    expect(context.getIdentity).toBe(p.lease.getIdentity); expect(context.onIdentityChange).toBe(p.lease.onIdentityChange);
    expect(context.getIdentity()).toBe(0); expect(p.lease.capture).toHaveBeenCalledExactlyOnceWith('predictions');
    expect(Object.hasOwn(context, 'getToken')).toBe(false); expect(Object.hasOwn(context, 'fetch')).toBe(false); f.entry.dispose();
  });
  it('permits anonymous public questions through the exact lease and its safe sign-in context', async () => {
    const p = provider({identity: null}), f = setup({initial: p.lease}); expect(await f.entry.open()).toBe(true);
    const context = f.desks[0].context; expect(context.getIdentity()).toBeNull(); expect(context.request).toBe(p.lease.request);
    expect(await context.request.publicGet('/api/predictions')).toEqual(success({questions: []}));
    expect(await context.request.get('/api/predictions/mine')).toMatchObject({ok: false, status: 401});
    context.onSignIn(); expect(f.onSignIn).toHaveBeenCalledOnce(); f.entry.dispose();
  });
  it('uses only inert requests for explicit dev practice and never admits live demo mode', async () => {
    const p = provider(), local = setup({initial: p.lease, dev: true, search: '?desk=local&demo=1'});
    expect(await local.entry.open()).toBe(true); expect(local.watchServices).not.toHaveBeenCalled();
    const context = local.desks[0].context; expect(context.getFlags()).toEqual({predictions: false}); expect(context.getIdentity()).toBeNull();
    for (const request of Object.values(context.request)) expect(await request('/api/predictions')).toMatchObject({ok: false});
    expect(context.request).not.toBe(p.lease.request); context.onSignIn(); expect(local.onSignIn).not.toHaveBeenCalled();
    for (const request of Object.values(p.lease.request)) expect(request).not.toHaveBeenCalled(); local.entry.dispose();
    const production = setup({initial: provider({flag: false}).lease, dev: false, search: '?desk=local'});
    expect(await production.entry.open()).toBe(false); expect(production.load).not.toHaveBeenCalled(); production.entry.dispose();
    const demo = setup({initial: p.lease, search: '?demo=1'});
    expect(await demo.entry.open()).toBe(false); expect(demo.load).not.toHaveBeenCalled(); expect(demo.watchServices).not.toHaveBeenCalled(); demo.entry.dispose();
  });
});

describe('prediction entry queued loads and open epochs', () => {
  it.each(['close', 'off', 'dispose'])('cancels a queued import synchronously on %s', async action => {
    const p = provider(), f = setup({initial: p.lease}), opening = f.entry.open();
    expect(f.entry.active).toBe(true); expect(f.entry.pending).toBe(true);
    if (action === 'off') p.change({flags: {...p.state.flags, predictions: false}}); else f.entry[action]();
    expect(await opening).toBe(false); expect(f.load).not.toHaveBeenCalled(); expect(f.module.createDesk).not.toHaveBeenCalled(); f.entry.dispose();
  });
  it('shares one still-current pending open', async () => {
    const held = deferred(), started = deferred(), f = setup(); f.load.mockImplementationOnce(() => { started.resolve(); return held.promise; });
    const one = f.entry.open(), two = f.entry.open(); expect(two).toBe(one); await started.promise;
    expect(f.load).toHaveBeenCalledOnce(); held.resolve(f.module); expect(await one).toBe(true); expect(await two).toBe(true);
    expect(f.module.createDesk).toHaveBeenCalledOnce(); expect(f.desks[0].desk.open).toHaveBeenCalledOnce(); f.entry.dispose();
  });
  it('does not create a late desk after Escape closes a held import', async () => {
    const held = deferred(), started = deferred(), f = setup(); f.load.mockImplementationOnce(() => { started.resolve(); return held.promise; });
    const opening = f.entry.open(); await started.promise; expect(f.entry.close()).toBe(true);
    held.resolve(f.module); expect(await opening).toBe(false); expect(f.module.createDesk).not.toHaveBeenCalled(); expect(f.entry.active).toBe(false); f.entry.dispose();
  });
  it('closes a late held open without disposing the same-account attempt owner', async () => {
    const held = deferred(), f = setup({open: async record => { await held.promise; record.activate(); }}), opening = f.entry.open();
    const record = await f.created.promise, uid = record.attemptUid; expect(f.entry.close()).toBe(true);
    held.resolve(); expect(await opening).toBe(false); expect(record.desk.active).toBe(false);
    expect(record.desk.dispose).not.toHaveBeenCalled(); expect(record.attemptUid).toBe(uid); f.entry.dispose();
  });
  it('does not let an old import finally clear a newer pending open', async () => {
    const old = deferred(), fresh = deferred(), oldStarted = deferred(), freshStarted = deferred(), f = setup();
    f.load.mockImplementationOnce(() => { oldStarted.resolve(); return old.promise; })
      .mockImplementationOnce(() => { freshStarted.resolve(); return fresh.promise; });
    const older = f.entry.open(); await oldStarted.promise; f.entry.close(); const newer = f.entry.open(); await freshStarted.promise;
    old.resolve(f.module); expect(await older).toBe(false); expect(f.entry.pending).toBe(true); expect(f.entry.active).toBe(true);
    fresh.resolve(f.module); expect(await newer).toBe(true); expect(f.entry.pending).toBe(false); f.entry.dispose();
  });
  it('does not let an older held open close a newer opening of the same desk', async () => {
    const held = deferred(), f = setup(); await f.entry.open(); const record = f.desks[0];
    record.desk.open.mockImplementationOnce(async () => { await held.promise; record.activate(); });
    const older = f.entry.open(); await Promise.resolve(); f.entry.close(); expect(await f.entry.open()).toBe(true);
    const closes = record.desk.close.mock.calls.length; held.resolve(); expect(await older).toBe(false);
    expect(record.desk.active).toBe(true); expect(record.desk.close).toHaveBeenCalledTimes(closes); f.entry.dispose();
  });
  it('disposes a stale constructed desk while preserving a reentrant newer open', async () => {
    let f, newer, armed = true;
    f = setup({onCreate: () => { if (armed) { armed = false; f.entry.close(); newer = f.entry.open(); } }});
    expect(await f.entry.open()).toBe(false); expect(await newer).toBe(true);
    expect(f.desks).toHaveLength(2); expect(f.desks[0].desk.dispose).toHaveBeenCalledOnce();
    expect(f.desks[0].desk.open).not.toHaveBeenCalled(); expect(f.desks[1].desk.active).toBe(true); f.entry.dispose();
  });
});

describe('prediction entry ordinary close and account cleanup', () => {
  it('retains desk, context and attempt through ordinary close and unrelated flag changes', async () => {
    const p = provider(), f = setup({initial: p.lease}); await f.entry.open(); const record = f.desks[0], uid = record.attemptUid;
    f.entry.close(); expect(record.desk.close).toHaveBeenCalledOnce(); expect(record.desk.dispose).not.toHaveBeenCalled();
    p.change({flags: {...p.state.flags, arena: true}}); p.notify(); expect(record.desk.dispose).not.toHaveBeenCalled();
    expect(await f.entry.open()).toBe(true); expect(f.module.createDesk).toHaveBeenCalledOnce();
    expect(f.desks[0].context).toBe(record.context); expect(record.attemptUid).toBe(uid); expect(f.load).toHaveBeenCalledOnce(); f.entry.dispose();
  });
  it.each(['identity', 'readiness', 'lifetime', 'flagBlink'])('disposes the old attempt owner across %s', async boundary => {
    const p = provider(), f = setup({initial: p.lease}); await f.entry.open(); const old = f.desks[0];
    if (boundary === 'identity') p.change({identity: 1});
    if (boundary === 'readiness') { p.change({ready: false}); p.change({ready: true}); }
    if (boundary === 'lifetime') { p.state.lifetime += 1; p.notify(); }
    if (boundary === 'flagBlink') { p.change({flags: {...p.state.flags, predictions: false}}); p.change({flags: {...p.state.flags, predictions: true}}); }
    expect(old.desk.dispose).toHaveBeenCalledOnce(); expect(old.attemptUid).toBeNull(); expect(f.entry.active).toBe(false);
    expect(await f.entry.open()).toBe(true); expect(f.module.createDesk).toHaveBeenCalledTimes(2); expect(f.desks[1].context).not.toBe(old.context); f.entry.dispose();
  });
  it.each(['identity', 'flagBlink'])('rejects a held import across %s', async boundary => {
    const p = provider(), held = deferred(), started = deferred(), f = setup({initial: p.lease});
    f.load.mockImplementationOnce(() => { started.resolve(); return held.promise; }); const opening = f.entry.open(); await started.promise;
    if (boundary === 'identity') p.change({identity: 1});
    else { p.change({flags: {...p.state.flags, predictions: false}}); p.change({flags: {...p.state.flags, predictions: true}}); }
    held.resolve(f.module); expect(await opening).toBe(false); expect(f.module.createDesk).not.toHaveBeenCalled();
    expect(await f.entry.open()).toBe(true); f.entry.dispose();
  });
  it('fences old-account held opens without closing the new account desk', async () => {
    const held = deferred(), p = provider(), f = setup({initial: p.lease, open: async record => { if (record.index === 0) await held.promise; record.activate(); }});
    const older = f.entry.open(); const old = await f.created.promise; p.change({identity: 1});
    expect(old.desk.dispose).toHaveBeenCalledOnce(); expect(await f.entry.open()).toBe(true); const current = f.desks[1];
    held.resolve(); expect(await older).toBe(false); expect(current.desk.active).toBe(true); expect(current.desk.close).not.toHaveBeenCalled(); f.entry.dispose();
  });
  it('keeps explicit sessions and replacement providers independent and detaches exact subscriptions once', async () => {
    const a = provider(), b = provider(), replacement = provider({identity: 2});
    const first = setup({initial: a.lease}), second = setup({initial: b.lease}); await first.entry.open(); await second.entry.open();
    const old = first.desks[0], other = second.desks[0]; first.publish(replacement.lease);
    expect(old.desk.dispose).toHaveBeenCalledOnce(); expect(other.desk.dispose).not.toHaveBeenCalled(); expect(second.entry.active).toBe(true);
    expect(a.lease.subscribe.mock.results[0].value).toHaveBeenCalledOnce(); expect(await first.entry.open()).toBe(true);
    expect(first.desks[1].context.request).toBe(replacement.lease.request); expect(other.context.request).toBe(b.lease.request);
    a.change({identity: 8}); expect(first.desks[1].desk.dispose).not.toHaveBeenCalled();
    first.entry.dispose(); first.entry.dispose(); second.entry.dispose(); expect(first.stopWatch).toHaveBeenCalledOnce(); expect(second.stopWatch).toHaveBeenCalledOnce();
    expect(replacement.lease.subscribe.mock.results[0].value).toHaveBeenCalledOnce();
    for (const p of [a, b, replacement]) expect(p.lease.dispose).not.toHaveBeenCalled(); expect(await first.entry.open()).toBe(false);
  });
  it('uses fixed failure copy and retries an import only on a later explicit open', async () => {
    const f = setup(), marker = randomUUID(); f.load.mockRejectedValueOnce(new Error(marker));
    expect(await f.entry.open()).toBe(false); expect(f.notify).toHaveBeenCalledExactlyOnceWith('Something went wrong. Try again.');
    expect(JSON.stringify(f.notify.mock.calls)).not.toContain(marker); expect(f.load).toHaveBeenCalledOnce();
    await Promise.resolve(); expect(f.load).toHaveBeenCalledOnce(); expect(await f.entry.open()).toBe(true); f.entry.dispose();
  });
});
