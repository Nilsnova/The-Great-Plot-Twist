// Exercise the actual island load/travel authority with only its DOM presentation replaced.
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('../../src/island/ui.js', () => ({createIslandUi: () => ({open: null, active: false,
  close() {}, dispose() {}, toast() {}, banner() {}, visit() {}})}));
vi.mock('../../src/island/move-bar.js', () => ({createMoveBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/village-bar.js', () => ({createVillageBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/wall-builder-bar.js', () => ({createWallBuilderBar: () => ({render() {}, dispose() {}})}));
import {createIsland} from '../../src/island/index.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const INFO = {waveId: 'return-wave', wave: 2, seed: 77, startsAt: '2026-11-17T12:00:00Z',
  weather: {kind: 'calm'}, flagship: false};
const islands = [];
afterEach(() => { for (const island of islands.splice(0)) island.dispose(); });
// Production flags (arsenal on) unless a test says otherwise.
function harness() {
  const listeners = new Map(), base = createFakeIslandTransport(), coins = [], holds = new Map();
  let readWave = () => Promise.resolve({ok: true, data: INFO}), failIsland = false, failVisit = false;
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn); return () => listeners.get(name).delete(fn);
  };
  const emit = event => { for (const fn of listeners.get(event.type) ?? []) fn(event); };
  const island = createIsland({container: {}, emit, on, storage: null, visitStorage: null,
    transport: {...base, get: path => holds.get(path.split('?')[0])?.(path)
      ?? (path.startsWith('/api/waves/current?') ? readWave()
      : path.startsWith('/api/island/visit/') && failVisit ? {ok: false, status: 404, code: 'no_such_island'}
      : path === '/api/island' && failIsland ? {ok: false, status: 503, code: 'unavailable'} : base.get(path))},
    onCoins: value => coins.push(value), menu: () => () => {}, settings: () => () => {}, arsenalOn: () => true});
  islands.push(island);
  return {island, travel: () => emit({type: 'travel', to: 'saltreach_harbor'}), failIsland: () => { failIsland = true; },
    failVisit: () => { failVisit = true; }, coins, emit,
    // Holds the next GET of this path (any query); resolve(edit) answers it with edit(the fake's answer).
    hold(prefix) {
      let resolve, started;
      const asked = new Promise(done => { started = done; });
      const answered = new Promise(done => { resolve = done; });
      holds.set(prefix, path => {
        holds.delete(prefix); started();
        return answered.then(async edit => { const answer = await base.get(path); return edit ? edit(answer) : answer; });
      });
      return {asked, resolve: (edit = null) => resolve(edit)};
    },
    defer() {
      let resolve, started;
      const pending = new Promise(done => { resolve = done; });
      const asked = new Promise(done => { started = done; });
      readWave = () => { started(); return pending; };
      return {asked, resolve};
    }};
}

describe('actual returned-island current-wave authority', () => {
  it('clears proof on travel and authorizes the new context only after a successful same-target server read', async () => {
    const h = harness(); await h.island.load();
    const before = h.island.coreContext;
    h.travel();
    const returned = h.island.coreContext;
    expect(returned.key).not.toBe(before.key);
    expect(returned.islandIdentity).toBe(before.islandIdentity);
    expect(returned.rejoin).toBeNull();
    const reply = h.defer(), loading = h.island.load(); await reply.asked;
    expect(h.island.coreContext.rejoin).toBeNull();
    reply.resolve({ok: true, data: INFO}); await loading;
    expect(h.island.coreContext.rejoin).toEqual({contextKey: returned.key, waveId: INFO.waveId});
  });

  it('does not authorize a late current-wave answer from before another travel', async () => {
    const h = harness(); await h.island.load(); h.travel();
    const reply = h.defer(), loading = h.island.load(); await reply.asked;
    h.travel(); reply.resolve({ok: true, data: INFO}); await loading;
    expect(h.island.coreContext.rejoin).toBeNull();
    expect(h.island.flow.current).toBeNull();
  });

  it('requires a fresh island answer rather than authorizing cached identity after a failed island read', async () => {
    const h = harness(); await h.island.load(); h.travel(); h.failIsland();
    await h.island.load();
    expect(h.island.flow.current.wave.waveId).toBe(INFO.waveId);
    expect(h.island.coreContext.rejoin).toBeNull();
  });

  it('does not let an older concurrent load replace the newer confirmed wave proof', async () => {
    const h = harness(); await h.island.load(); h.travel();
    const old = h.defer(), oldLoad = h.island.load(); await old.asked;
    const fresh = h.defer(), freshLoad = h.island.load(); await fresh.asked;
    fresh.resolve({ok: true, data: {...INFO, waveId: 'newer-wave'}}); await freshLoad;
    const proof = h.island.coreContext.rejoin;
    old.resolve({ok: true, data: INFO}); await oldLoad;
    expect(h.island.coreContext.rejoin).toEqual(proof);
    expect(proof.waveId).toBe('newer-wave');
    expect(h.island.flow.current.wave.waveId).toBe('newer-wave');
  });

  it('clears a joined friend wave when a failed visit reload falls back to an empty own island', async () => {
    const h = harness(); h.island.visit('ISLE-FR3ND'); await h.island.load();
    await h.island.flow.ring('ISLE-FR3ND');
    expect(h.island.flow.current).toMatchObject({where: 'ISLE-FR3ND', joined: true});
    h.failVisit(); const reply = h.defer(), loading = h.island.load(); await reply.asked;
    reply.resolve({ok: true, data: null}); await loading;
    expect(h.island.visiting).toBeNull(); expect(h.island.flow.current).toBeNull();
  });

  it.each([{ok: true, data: null}, {ok: false, status: 503, code: 'unavailable'},
    {ok: true, data: {waveId: 'unreadable'}}])('does not authorize absent, failed or invalid current-wave answers: %j', async answer => {
    const h = harness(); await h.island.load(); h.travel();
    const reply = h.defer(), loading = h.island.load(); await reply.asked;
    reply.resolve(answer); await loading;
    expect(h.island.coreContext.rejoin).toBeNull();
  });

  describe('the arsenal coins answer crossing a load (flag arsenal on, as in production)', () => {
    const withCoins = value => answer => ({...answer, data: {...answer.data, coins: value}});
    it('keeps the rejoin proof when the arsenal answers after the island read, while the wave read is out', async () => {
      const h = harness(); await h.island.load(); h.travel();
      const arsenal = h.hold('/api/island/arsenal'), reply = h.defer(), loading = h.island.load();
      await arsenal.asked; await reply.asked;
      arsenal.resolve(withCoins(4321)); await vi.waitFor(() => expect(h.coins.at(-1)).toBe(4321));
      const returned = h.island.coreContext;
      reply.resolve({ok: true, data: INFO}); await loading;
      expect(h.island.coreContext.rejoin).toEqual({contextKey: returned.key, waveId: INFO.waveId});
      expect(h.island.flow.current.wave.waveId).toBe(INFO.waveId);
    });

    it('keeps the rejoin proof when the arsenal answers before the island read', async () => {
      const h = harness(); await h.island.load(); h.travel();
      const arsenal = h.hold('/api/island/arsenal'), refreshing = h.island.arsenal.refresh(); await arsenal.asked;
      const own = h.hold('/api/island'), reply = h.defer(), loading = h.island.load(); await own.asked;
      arsenal.resolve(withCoins(4321)); await refreshing;
      expect(h.coins.at(-1)).toBe(4321);
      own.resolve(withCoins(1234)); await reply.asked;
      await vi.waitFor(() => expect(h.coins.at(-1)).toBe(1234));
      reply.resolve({ok: true, data: INFO}); await loading;
      expect(h.island.coreContext.rejoin).toMatchObject({waveId: INFO.waveId});
    });

    it('does not let an arsenal answer asked before a newer island read step the coins back', async () => {
      const h = harness(); await h.island.load();
      const arsenal = h.hold('/api/island/arsenal'), refreshing = h.island.arsenal.refresh(); await arsenal.asked;
      const own = h.hold('/api/island'); h.emit({type: 'wave_finished', survived: true}); await own.asked;
      own.resolve(withCoins(1234)); await vi.waitFor(() => expect(h.coins.at(-1)).toBe(1234));
      arsenal.resolve(withCoins(4321)); await refreshing;
      expect(h.coins.at(-1)).toBe(1234);
    });
  });

  describe('other reads of the same island crossing a load', () => {
    it("keeps the rejoin proof when a crewmate's change reads the own island again during the wave read", async () => {
      const h = harness(); await h.island.load(); h.travel();
      const reply = h.defer(), loading = h.island.load(); await reply.asked;
      await h.island.refreshDefended();
      const returned = h.island.coreContext;
      reply.resolve({ok: true, data: INFO}); await loading;
      expect(h.island.coreContext.rejoin).toEqual({contextKey: returned.key, waveId: INFO.waveId});
    });

    it("keeps the rejoin proof when a crewmate's change reads the visited island again during the wave read", async () => {
      const h = harness(); h.island.visit('ISLE-FR3ND'); await h.island.load();
      h.emit({type: 'travel', to: 'home_islet'}); expect(h.island.coreContext.rejoin).toBeNull(); // the visit stays
      const reply = h.defer(), loading = h.island.load(); await reply.asked;
      await h.island.refreshDefended();
      reply.resolve({ok: true, data: INFO}); await loading;
      expect(h.island.visiting).not.toBeNull();
      expect(h.island.coreContext.rejoin).toMatchObject({waveId: INFO.waveId});
    });

    it('keeps the rejoin proof when a finished wave reads the island again during the wave read', async () => {
      const h = harness(); await h.island.load(); h.travel();
      const own = h.hold('/api/island'), reply = h.defer(), loading = h.island.load(); await own.asked;
      own.resolve(); await reply.asked;
      const again = h.hold('/api/island'); h.emit({type: 'wave_finished', survived: true, coins: 150}); await again.asked;
      again.resolve(); await vi.waitFor(() => expect(h.coins.at(-1)).toBe(100));
      reply.resolve({ok: true, data: INFO}); await loading;
      expect(h.island.coreContext.rejoin).toMatchObject({waveId: INFO.waveId});
    });

  });
});
