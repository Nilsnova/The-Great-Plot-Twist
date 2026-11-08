// Deferred local module promises exercise the real entry; no browser, account or HTTP request is used.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createMarketEntry} from '../../src/screens/market/index.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const entries = [];
function panelModule() {
  const panel = {active: false, open: vi.fn(() => { panel.active = true; }),
    close: vi.fn(() => { panel.active = false; }), dispose: vi.fn(() => { panel.active = false; })};
  return {panel, createMarketPanel: vi.fn(() => panel)};
}
function create(loadPanel, extra={}) {
  const entry = createMarketEntry({...extra,loadPanel, container: {}, request: vi.fn(), publicGet: vi.fn(),
    getToken: () => `fixture-${crypto.randomUUID()}`});
  entries.push(entry); return entry;
}
beforeEach(() => { vi.stubGlobal('window', {}); vi.stubGlobal('location', {search: ''});
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network in entry lifetime tests'); })); });
afterEach(() => { for (const entry of entries.splice(0)) entry.dispose(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('market pending entry ownership', () => {
  it('passes the app-owned sign-in navigation callback to the actual panel constructor',async()=>{
    const module=panelModule(),onSignIn=vi.fn(),entry=create(async()=>module,{onSignIn});await entry.open();
    expect(module.createMarketPanel.mock.calls[0][0].onSignIn).toBe(onSignIn);
  });
  it('counts the pending import as active and cancels close before any panel is created', async () => {
    const held = deferred(), started = deferred(), module = panelModule();
    const load = vi.fn().mockImplementationOnce(() => { started.resolve(); return held.promise; })
      .mockResolvedValueOnce(module);
    const entry = create(load), opening = entry.open();
    expect(entry.active).toBe(true); await started.promise;
    expect(entry.close()).toBe(true); expect(entry.active).toBe(false);
    held.resolve(module); await opening;
    expect(module.createMarketPanel).not.toHaveBeenCalled(); expect(module.panel.open).not.toHaveBeenCalled();
    await entry.open(); expect(module.createMarketPanel).toHaveBeenCalledOnce(); expect(entry.active).toBe(true);
    entry.close(); await entry.open();
    expect(module.createMarketPanel).toHaveBeenCalledOnce(); expect(module.panel.dispose).not.toHaveBeenCalled();
    expect(module.panel.open).toHaveBeenCalledTimes(2);
  });

  it('does not reach the panel loader after an immediate close before the adapter import completes', async () => {
    const load = vi.fn(), entry = create(load), opening = entry.open();
    entry.close(); await opening;
    expect(load).not.toHaveBeenCalled(); expect(entry.active).toBe(false);
  });

  it('shares concurrent current opens but never lets an obsolete rejected load clear a newer one', async () => {
    const old = deferred(), fresh = deferred(), firstStarted = deferred(), nextStarted = deferred(), module = panelModule();
    const load = vi.fn().mockImplementationOnce(() => { firstStarted.resolve(); return old.promise; })
      .mockImplementationOnce(() => { nextStarted.resolve(); return fresh.promise; });
    const entry = create(load), first = entry.open(), duplicate = entry.open(); await firstStarted.promise;
    expect(load).toHaveBeenCalledOnce(); entry.close();
    const newer = entry.open(); await nextStarted.promise;
    old.reject(new Error('Recorded old chunk failure')); await first; await duplicate;
    expect(entry.active).toBe(true); expect(module.createMarketPanel).not.toHaveBeenCalled();
    fresh.resolve(module); await newer;
    expect(entry.active).toBe(true); expect(module.createMarketPanel).toHaveBeenCalledOnce();
  });

  it('retries a current load error on the next explicit opening', async () => {
    const module = panelModule(), load = vi.fn().mockRejectedValueOnce(new Error('Recorded chunk failure')).mockResolvedValueOnce(module);
    const entry = create(load); await expect(entry.open()).rejects.toThrow('Recorded chunk failure');
    expect(entry.active).toBe(false); await entry.open();
    expect(module.createMarketPanel).toHaveBeenCalledOnce(); expect(entry.active).toBe(true);
  });

  it('does not create or revive a panel after final disposal', async () => {
    const held = deferred(), started = deferred(), module = panelModule();
    const entry = create(() => { started.resolve(); return held.promise; }), opening = entry.open();
    await started.promise; entry.dispose(); entry.dispose(); held.resolve(module); await opening;
    await entry.open(); expect(entry.active).toBe(false); expect(module.createMarketPanel).not.toHaveBeenCalled();
  });

  it('disposes a panel cancelled reentrantly during its construction before it can open', async () => {
    const module = panelModule(); let entry;
    module.createMarketPanel.mockImplementationOnce(() => { entry.close(); return module.panel; });
    entry = create(async () => module); await entry.open();
    expect(entry.active).toBe(false); expect(module.panel.open).not.toHaveBeenCalled(); expect(module.panel.dispose).toHaveBeenCalledOnce();
  });
});
