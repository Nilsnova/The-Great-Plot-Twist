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
function harness() {
  const listeners = new Map(), base = createFakeIslandTransport();
  let readWave = () => Promise.resolve({ok: true, data: INFO}), failIsland = false;
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn); return () => listeners.get(name).delete(fn);
  };
  const emit = event => { for (const fn of listeners.get(event.type) ?? []) fn(event); };
  const island = createIsland({container: {}, emit, on, storage: null, visitStorage: null,
    transport: {...base, get: path => path.startsWith('/api/waves/current?') ? readWave()
      : path === '/api/island' && failIsland ? {ok: false, status: 503, code: 'unavailable'} : base.get(path)},
    menu: () => () => {}, settings: () => () => {}});
  islands.push(island);
  return {island, travel: () => emit({type: 'travel', to: 'saltreach_harbor'}), failIsland: () => { failIsland = true; },
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

  it.each([{ok: true, data: null}, {ok: false, status: 503, code: 'unavailable'},
    {ok: true, data: {waveId: 'unreadable'}}])('does not authorize absent, failed or invalid current-wave answers: %j', async answer => {
    const h = harness(); await h.island.load(); h.travel();
    const reply = h.defer(), loading = h.island.load(); await reply.asked;
    reply.resolve(answer); await loading;
    expect(h.island.coreContext.rejoin).toBeNull();
  });
});
