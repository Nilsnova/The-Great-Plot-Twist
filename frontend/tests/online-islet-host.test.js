// Private ownership races use injected host/provider objects, never accounts or network services.
import {describe, expect, it, vi} from 'vitest';
import {createIsletHost} from '../src/online/islet-host.js';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
function provider({identity = 1, ready = true, getIslet = vi.fn(async () => ({}))} = {}) {
  const listeners = new Set(), state = {identity, ready, lifetime: 0};
  const lease = {getIdentity: () => state.identity, isReady: () => state.ready, getLifetime: () => state.lifetime, getIslet,
    onSessionChange: vi.fn(() => () => {}),
    subscribe: vi.fn(listener => { listeners.add(listener); return () => listeners.delete(listener); })};
  return {lease, state, notify: () => { for (const listener of [...listeners]) listener(); }};
}
function setup({initial = null, ...extra} = {}) {
  const hosts = [], session = {}, resetWorld = vi.fn(), stopWatch = vi.fn();
  let publish;
  const watchServices = vi.fn((exactSession, listener) => {
    expect(exactSession).toBe(session); publish = listener; listener(initial); return stopWatch;
  });
  const attach = vi.fn(options => {
    let active = false;
    const stop = vi.fn(() => { active = false; });
    stop.refresh = vi.fn(async () => ({accepted: true, code: 'refreshed'}));
    stop.open = vi.fn(async () => { active = true; return true; });
    stop.close = vi.fn(() => { const was = active; active = false; return was; });
    Object.defineProperty(stop, 'active', {get: () => active});
    hosts.push({options, stop}); return stop;
  });
  const stop = createIsletHost({session, attach, resetWorld, watchServices, dev: false, search: '', ...extra});
  return {stop, hosts, attach, resetWorld, watchServices, stopWatch, publish: next => publish(next)};
}

describe('factory-owned islet presentation bridge', () => {
  it('shares one current adapter and one startup read while an explicit startup refresh is pending', async () => {
    const adapter = {dispose: vi.fn()}, p = provider({getIslet: vi.fn(async () => adapter)});
    const f = setup({initial: p.lease});
    expect((await f.stop.refresh()).accepted).toBe(true);
    expect(p.lease.getIslet).toHaveBeenCalledOnce();
    const live = f.hosts.at(-1);
    expect(live.options.suppliedAdapter).toBe(adapter);
    expect(live.options.transport).toBeNull(); expect(live.options.canAsk()).toBe(true);
    expect(live.stop.refresh).toHaveBeenCalledOnce();
    p.notify(); await Promise.resolve();
    expect(p.lease.getIslet).toHaveBeenCalledOnce();
    f.stop(); expect(adapter.dispose).not.toHaveBeenCalled();
  });

  it('keeps anonymous and not-ready presentation free of private capabilities', async () => {
    const p = provider({identity: null, ready: false}), f = setup({initial: p.lease});
    await f.stop.refresh(); expect(p.lease.getIslet).not.toHaveBeenCalled();
    expect(f.hosts.at(-1).options.suppliedAdapter).toBeUndefined();
    p.state.ready = true; p.notify(); await f.stop.refresh();
    expect(p.lease.getIslet).not.toHaveBeenCalled();
    p.state.identity = 2; p.notify(); await f.stop.refresh();
    expect(p.lease.getIslet).toHaveBeenCalledOnce(); f.stop();
  });

  it('cancels a user opening during the factory import without opening a late panel', async () => {
    const load = deferred(), p = provider({getIslet: vi.fn(() => load.promise)});
    const f = setup({initial: p.lease}), opening = f.stop.open();
    expect(f.stop.active).toBe(true); expect(f.stop.close()).toBe(true);
    load.resolve({}); expect(await opening).toBe(false);
    expect(f.stop.active).toBe(false);
    expect(f.hosts.every(host => host.stop.open.mock.calls.length === 0)).toBe(true); f.stop();
  });

  it('cannot attach a previous identity after a newer identity is already displayed', async () => {
    const oldLoad = deferred(), old = {dispose: vi.fn()}, next = {dispose: vi.fn()};
    const p = provider({getIslet: vi.fn().mockReturnValueOnce(oldLoad.promise).mockResolvedValue(next)});
    const f = setup({initial: p.lease});
    p.state.identity = 2; p.notify(); await f.stop.refresh();
    oldLoad.resolve(old); await Promise.resolve(); await Promise.resolve();
    expect(f.hosts.at(-1).options.suppliedAdapter).toBe(next);
    expect(f.hosts.some(host => host.options.suppliedAdapter === old)).toBe(false);
    expect(f.resetWorld).toHaveBeenCalled(); expect(old.dispose).not.toHaveBeenCalled(); f.stop();
  });

  it('closes old presentation on provider replacement and disposal but leaves factory resource cleanup to its owner', async () => {
    const old = {dispose: vi.fn()}, next = {dispose: vi.fn()};
    const a = provider({getIslet: vi.fn(async () => old)}), b = provider({getIslet: vi.fn(async () => next)});
    const f = setup({initial: a.lease}); await f.stop.refresh(); await f.stop.open();
    const first = f.hosts.at(-1); expect(f.stop.active).toBe(true);
    f.publish(b.lease); expect(first.stop).toHaveBeenCalledOnce();
    await f.stop.refresh(); expect(f.hosts.at(-1).options.suppliedAdapter).toBe(next);
    f.stop(); f.stop(); expect(f.stopWatch).toHaveBeenCalledOnce();
    expect(old.dispose).not.toHaveBeenCalled(); expect(next.dispose).not.toHaveBeenCalled();
    expect(await f.stop.open()).toBe(false); expect((await f.stop.refresh()).code).toBe('disposed');
  });

  it('retries a failed private import only on a later explicit opening', async () => {
    const adapter = {}, p = provider({getIslet: vi.fn().mockRejectedValueOnce(new Error('fixture')).mockResolvedValue(adapter)});
    const f = setup({initial: p.lease}); expect((await f.stop.refresh()).accepted).toBe(false);
    expect(p.lease.getIslet).toHaveBeenCalledOnce();
    expect(await f.stop.open()).toBe(true);
    expect(p.lease.getIslet).toHaveBeenCalledTimes(2); expect(f.hosts.at(-1).options.suppliedAdapter).toBe(adapter);
    f.stop();
  });

  it('keeps the dev local fake separate and does not let the production query select it', async () => {
    const p = provider(), local = setup({initial: p.lease, dev: true, search: '?islet=local'});
    expect(local.watchServices).not.toHaveBeenCalled(); expect(local.hosts).toHaveLength(1);
    await local.stop.refresh(); expect(p.lease.getIslet).not.toHaveBeenCalled(); local.stop();
    const production = setup({initial: p.lease, dev: false, search: '?islet=local'});
    await production.stop.refresh(); expect(p.lease.getIslet).toHaveBeenCalledOnce(); production.stop();
  });

  it('never loads a private islet capability for the server-free tour', async () => {
    const p = provider(), f = setup({initial: p.lease, isDemo: () => true});
    await f.stop.refresh(); await f.stop.open(); p.notify();
    expect(p.lease.getIslet).not.toHaveBeenCalled();
    expect(f.hosts.every(host => host.options.transport === null && !host.options.suppliedAdapter)).toBe(true);
    f.stop();
  });
});


describe('islet host private invalidation and callback ownership', () => {
  it('reacquires on a same-identity private invalidation while ordinary feature notifications do not rebuild', async () => {
    const one = {}, two = {}, p = provider({getIslet: vi.fn().mockResolvedValueOnce(one).mockResolvedValue(two)});
    const f = setup({initial: p.lease}); await f.stop.refresh();
    p.notify(); await Promise.resolve(); expect(p.lease.getIslet).toHaveBeenCalledOnce();
    p.state.lifetime += 1; p.notify(); await f.stop.refresh();
    expect(p.lease.getIslet).toHaveBeenCalledTimes(2); expect(f.hosts.at(-1).options.suppliedAdapter).toBe(two);
    f.stop();
  });

  it.each(['replace', 'stop'])('cannot attach a stale host after resetWorld synchronously asks to %s', async action => {
    const one = {}, two = {}, a = provider({getIslet: vi.fn(async () => one)});
    const b = provider({getIslet: vi.fn(async () => two)});
    let f, armed = false;
    const resetWorld = vi.fn(() => {
      if (!armed) return;
      armed = false;
      if (action === 'replace') f.publish(b.lease); else f.stop();
    });
    f = setup({initial: a.lease, resetWorld}); await f.stop.refresh();
    const before = f.hosts.length; armed = true; a.state.lifetime += 1; a.notify();
    if (action === 'replace') {
      await f.stop.refresh(); expect(f.hosts.at(-1).options.suppliedAdapter).toBe(two);
    } else {
      expect((await f.stop.refresh()).code).toBe('disposed'); expect(f.hosts.length).toBe(before);
    }
    expect(a.lease.getIslet).toHaveBeenCalledOnce(); f.stop();
  });
});


it('refuses an explicit refresh when retry cleanup synchronously stops the wrapper', async () => {
  const p = provider({getIslet: vi.fn().mockRejectedValueOnce(new Error('fixture'))});
  let f, armed = false;
  f = setup({initial: p.lease, resetWorld: () => { if (armed) f.stop(); }});
  expect((await f.stop.refresh()).accepted).toBe(false);
  armed = true;
  expect((await f.stop.refresh()).code).toBe('disposed');
  expect(p.lease.getIslet).toHaveBeenCalledOnce();
});
