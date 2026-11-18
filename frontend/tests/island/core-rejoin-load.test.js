// Exercise the actual island load/travel authority with only its DOM presentation replaced.
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('../../src/island/ui.js', () => ({createIslandUi: () => ({open: null, active: false,
  close() {}, dispose() {}, toast() {}, banner() {}, visit() {}})}));
vi.mock('../../src/island/move-bar.js', () => ({createMoveBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/village-bar.js', () => ({createVillageBar: () => ({render() {}, focusBuildings() { return false; }, setBuildings() {}, dispose() {}})}));
vi.mock('../../src/island/wall-builder-bar.js', () => ({createWallBuilderBar: () => ({render() {}, dispose() {}})}));
import {createIsland} from '../../src/island/index.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const INFO = {waveId: 'return-wave', wave: 2, seed: 77, startsAt: '2026-11-17T12:00:00Z',
  weather: {kind: 'calm'}, flagship: false};
const islands = [];
afterEach(() => { for (const island of islands.splice(0)) island.dispose(); vi.unstubAllGlobals(); });
function harness({getActorId = () => null} = {}) {
  const listeners = new Map(), base = createFakeIslandTransport(), coins = [], holds = new Map(), posts = [];
  const legacyRead = base.get;
  // This harness declares legacy accounting; missing context must not authorize private updates.
  base.get = async path => {
    const answer = await legacyRead(path);
    return answer.ok && (path === '/api/island' || path.startsWith('/api/island/visit/'))
      ? {...answer, data: {...answer.data, economy: {mode: 'personal_legacy', version: 0}}} : answer;
  };
  let readWave = () => Promise.resolve({ok: true, data: INFO}), failIsland = false, failVisit = false;
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn); return () => listeners.get(name).delete(fn);
  };
  const emit = event => { for (const fn of listeners.get(event.type) ?? []) fn(event); };
  const island = createIsland({container: {}, emit, on, storage: null, visitStorage: null, getActorId,
    transport: {...base, get: path => holds.get(path.split('?')[0])?.(path)
      ?? (path.startsWith('/api/waves/current?') ? readWave()
      : path.startsWith('/api/island/visit/') && failVisit ? {ok: false, status: 404, code: 'no_such_island'}
      : path === '/api/island' && failIsland ? {ok: false, status: 503, code: 'unavailable'} : base.get(path)),
      post: (path, body, ...options) => {posts.push({path, body}); return base.post(path, body, ...options);}},
    onCoins: value => coins.push(value), menu: () => () => {}, settings: () => () => {}});
  islands.push(island);
  return {island, travel: () => emit({type: 'travel', to: 'saltreach_harbor'}), failIsland: () => { failIsland = true; },
    failVisit: () => { failVisit = true; }, coins, emit, posts,
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
  it.each(['own', 'visit'])('ignores an initial %s load answered after an actor change', async place => {
    let actor = '11111111-1111-4111-8111-111111111111';
    const h = harness({getActorId: () => actor});
    const path = place === 'visit' ? '/api/island/visit/ISLE-FR3ND' : '/api/island';
    if (place === 'visit') h.island.visit('ISLE-FR3ND');
    const reply = h.hold(path), loading = h.island.load();
    await reply.asked;
    actor = '44444444-4444-4444-8444-444444444444';
    reply.resolve(answer => ({...answer, data: {...answer.data, economy: {
      mode: 'island_shared', version: 1, islandOwner: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222', runEpoch: '33333333-3333-4333-8333-333333333333',
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'},
    }}}));
    await loading;
    expect(h.island.economy).toBeNull();
    expect(h.island.island).toBeNull();
  });
  it.each(['own', 'visit'])('ignores a %s treasury reread answered after an actor change', async place => {
    let actor = '11111111-1111-4111-8111-111111111111';
    const economy = {mode: 'island_shared', version: 1, islandOwner: actor,
      accountId: '22222222-2222-4222-8222-222222222222', runEpoch: '33333333-3333-4333-8333-333333333333',
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}};
    const h = harness({getActorId: () => actor});
    const path = place === 'visit' ? '/api/island/visit/ISLE-FR3ND' : '/api/island';
    if (place === 'visit') h.island.visit('ISLE-FR3ND');
    const initial = h.hold(path), loading = h.island.load();
    initial.resolve(answer => ({...answer, data: {...answer.data, economy}}));
    await loading;
    expect(h.island.economy.revision).toBe('1');
    const reply = h.hold(path), newer = {...economy, revision: '2'};
    h.island.refreshEconomy(newer, economy);
    await reply.asked;
    actor = '44444444-4444-4444-8444-444444444444';
    reply.resolve(answer => ({...answer, data: {...answer.data, economy: newer}}));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.island.economy.revision).toBe('1');
  });
  it('does not spend the own shared treasury while a different visit is unresolved', async () => {
    const actor = '11111111-1111-4111-8111-111111111111', saved = new Map();
    vi.stubGlobal('sessionStorage', {getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key)});
    const h = harness({getActorId: () => actor}), own = h.hold('/api/island'), loading = h.island.load();
    own.resolve(answer => ({...answer, data: {...answer.data, economy: {
      mode: 'island_shared', version: 1, islandOwner: actor,
      accountId: '22222222-2222-4222-8222-222222222222', runEpoch: '33333333-3333-4333-8333-333333333333',
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'},
    }}}));
    await loading;
    expect(h.island.visit('ISLE-FR3ND')).toBe(true);
    h.island.arsenal.handlers.buy('pistols');
    await vi.waitFor(() => expect(h.island.arsenal.answer).toBeNull());
    expect(h.posts.filter(request => request.path === '/api/island/arsenal/buy')).toEqual([]);
  });
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

  it('a landing join whose wave read the load superseded asks to be tried again instead of never joining', async () => {
    const h = harness(); await h.island.load(); h.travel();
    const first = h.defer(), joining = h.island.joinRunningWave(); await first.asked;
    const second = h.defer(), loading = h.island.load(); await second.asked;
    first.resolve({ok: true, data: INFO});
    expect(await joining).toMatchObject({ok: false, code: 'busy'});
    second.resolve({ok: true, data: INFO}); await loading;
    expect(h.island.flow.current).toMatchObject({joined: false, wave: {waveId: INFO.waveId}});
    h.defer().resolve({ok: true, data: INFO});
    expect(await h.island.joinRunningWave()).not.toBeNull(); // the retry asks the server to join
  });
});
