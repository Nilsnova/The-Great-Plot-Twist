// Personal balance reconciliation survives overlapping real island reads without replacing island/rejoin identity.
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('../../src/island/ui.js', () => ({createIslandUi: () => ({open: null, active: false,
  close() {}, dispose() {}, toast() {}, banner() {}, visit() {}, captainCard() {}, overviewCard() {}})}));
vi.mock('../../src/island/move-bar.js', () => ({createMoveBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/village-bar.js', () => ({createVillageBar: () => ({render() {}, setBuildings() {}, dispose() {}})}));
vi.mock('../../src/island/wall-builder-bar.js', () => ({createWallBuilderBar: () => ({render() {}, dispose() {}})}));
import {createIsland} from '../../src/island/index.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const fixtures = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.island.dispose(); });
function harness() {
  const base = createFakeIslandTransport(), ownReads = [], arsenalReads = [], coins = [], listeners = new Map();
  const legacyRead = base.get;
  // Keep this legacy-wallet fixture explicit when the live owner supplies context callbacks.
  base.get = async path => {
    const answer = await legacyRead(path);
    return answer.ok && (path === '/api/island' || path.startsWith('/api/island/visit/'))
      ? {...answer, data: {...answer.data, economy: {mode: 'personal_legacy', version: 0}}} : answer;
  };
  const held = {own: true, arsenal: false};
  const on = (type, callback) => {
    const callbacks = listeners.get(type) ?? new Set(); callbacks.add(callback); listeners.set(type, callbacks);
    return () => callbacks.delete(callback);
  };
  const emit = event => { for (const callback of listeners.get(event.type) ?? []) callback(event); };
  const get = path => {
    const requests = path === '/api/island' && held.own ? ownReads
      : path.split('?')[0] === '/api/island/arsenal' && held.arsenal ? arsenalReads : null;
    if (!requests) return base.get(path);
    const snapshot = Promise.resolve(base.get(path));
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    requests.push({answer: async () => { resolve(await snapshot); await flush(); }});
    return pending;
  };
  const island = createIsland({container: {}, emit, on, storage: null, visitStorage: null,
    transport: {...base, get}, onCoins: value => coins.push(value), menu: () => () => {}, settings: () => () => {}});
  const fixture = {island, ownReads, arsenalReads, coins, held, setCoins: value => base.dev.setCoins(value),
    setWaveBest: value => base.dev.setWaveBest(value)};
  fixtures.push(fixture); return fixture;
}
const recover = (fixture, value) => { fixture.setCoins(value); fixture.island.setWalletCoins(value); };

describe('the wallet watermark across accepted reads', () => {
  it.each([false, true])('covers two independently accepted first-load reads, reverse replies=%s', async reverse => {
    const h = harness(), loading = h.island.load();
    h.island.openCaptain(); expect(h.ownReads).toHaveLength(2);
    recover(h, 120);
    await h.ownReads[reverse ? 1 : 0].answer();
    if (!reverse) await loading;
    expect(h.island.island.coins).toBe(120);
    await h.ownReads[reverse ? 0 : 1].answer(); await loading;
    expect(h.island.island.coins).toBe(120); expect(h.coins.at(-1)).toBe(120);
  });

  it('allows a newer own read to replace the recovered balance and fence both older replies', async () => {
    const h = harness(), loading = h.island.load(); h.island.openCaptain(); recover(h, 120);
    await h.ownReads[0].answer(); await loading;
    h.setCoins(80); const newer = h.island.refreshDefended(); expect(h.ownReads).toHaveLength(3);
    await h.ownReads[2].answer(); await newer; await h.ownReads[1].answer();
    expect(h.island.island.coins).toBe(80); expect(h.coins.at(-1)).toBe(80);
  });

  it('keeps an actual captain purchase and its level when the second older read arrives', async () => {
    const h = harness(); h.setWaveBest(100);
    const loading = h.island.load(); h.island.openCaptain(); recover(h, 2000);
    await h.ownReads[0].answer(); await loading;
    await h.island.upgradeCaptain();
    const bought = h.island.island;
    expect(bought.captain.level).toBe(2); expect(bought.coins).toBeLessThan(2000);
    await h.ownReads[1].answer();
    expect(h.island.island.coins).toBe(bought.coins); expect(h.island.island.captain.level).toBe(2);
  });

  it('invalidates outstanding old-account reads when wallet recovery resets', async () => {
    const h = harness(), loading = h.island.load(); h.island.openCaptain(); recover(h, 120);
    await h.ownReads[0].answer(); await loading;
    h.island.resetWalletRecovery(); h.setCoins(55); const newer = h.island.refreshDefended();
    const before = h.coins.length;
    await h.ownReads[1].answer();
    expect(h.coins.slice(before)).not.toContain(100);
    await h.ownReads[2].answer(); await newer; expect(h.island.island.coins).toBe(55);
  });

  it('fences all pending own reads when the island was already loaded at recovery', async () => {
    const h = harness(), initial = h.island.load(); await h.ownReads[0].answer(); await initial;
    const loading = h.island.load(), refreshing = h.island.refreshDefended(); recover(h, 120);
    await h.ownReads[1].answer(); await h.ownReads[2].answer(); await loading; await refreshing;
    expect(h.island.island.coins).toBe(120);
  });
});

describe('arsenal coin ordering beside a fresh personal wallet', () => {
  it.each([false, true])('rejects an arsenal reply asked before recovery, own loaded=%s', async loaded => {
    const h = harness();
    if (loaded) { const initial = h.island.load(); await h.ownReads[0].answer(); await initial; }
    h.held.arsenal = true;
    const refreshing = h.island.arsenal.refresh(); expect(h.arsenalReads).toHaveLength(1);
    recover(h, 120); await h.arsenalReads[0].answer(); await refreshing;
    expect(h.coins.at(-1)).toBe(120);
    if (loaded) expect(h.island.island.coins).toBe(120);
  });

  it('waits for verified legacy context before accepting an arsenal wallet balance', async () => {
    const h = harness(), loading = h.island.load(); recover(h, 120);
    h.setCoins(80); h.held.arsenal = true;
    const refreshing = h.island.arsenal.refresh(); await h.arsenalReads[0].answer(); await refreshing;
    expect(h.coins.at(-1)).toBe(120);
    await h.ownReads[0].answer(); await loading;
    await h.arsenalReads[1].answer();
    expect(h.coins.at(-1)).toBe(80); expect(h.island.island.coins).toBe(80);
  });

  it('lets an own read asked after the arsenal request keep its newer balance', async () => {
    const h = harness(), loading = h.island.load(); recover(h, 120);
    h.setCoins(80); h.held.arsenal = true;
    const refreshing = h.island.arsenal.refresh();
    h.setCoins(60); h.island.openCaptain();
    await h.arsenalReads[0].answer(); await refreshing;
    await h.ownReads[1].answer(); await h.ownReads[0].answer(); await loading;
    expect(h.island.island.coins).toBe(60); expect(h.coins.at(-1)).toBe(60);
  });
});
