// The live co-op path (structure_recovery off, legacy waves): no island reread piles up behind another,
// and the quiet 15 s reread waits while a wave runs (the wave keeps the island it started with).
import { describe, expect, it, vi } from 'vitest';
import { wireWaves } from '../../src/pirates/game-wiring.js';

function harness() {
  const handlers = new Map(), rooms = [], ticks = [], laters = [];
  const on = (type, handler) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); return () => handlers.get(type).delete(handler); };
  const emit = event => { for (const handler of [...(handlers.get(event.type) ?? [])]) handler(event); };
  const openRoom = topic => {
    const listeners = new Map(), room = { topic, sent: [], send(type, payload) { room.sent.push([type, payload]); return true; },
      on(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); return () => listeners.get(type).delete(handler); },
      hear(type, payload) { for (const handler of [...(listeners.get(type) ?? [])]) handler(payload); }, close() {} };
    rooms.push(room); return room;
  };
  let release = null;
  const island = {
    api: {}, get island() { return { code: 'K7Q2M' }; }, get visiting() { return null; }, defenses: () => [], roomPlace: () => 'isle_k7q2m',
    joinRunningWave: vi.fn(async () => null), loadPoint: vi.fn(async () => {}), ringBell: vi.fn(async () => ({ ok: true })),
    refreshDefended: vi.fn(() => new Promise(resolve => { release = resolve; })),
    setBattle: vi.fn(), setPointBattle() {}, setRecoveryCombatState() {}, setRecoveryCheckpointHandler() {}, point: null,
  };
  const world = { current: { id: 'home_islet' } };
  const waves = wireWaves({ island, on, emit, world, openRoom, loop: false, every: run => { ticks.push(run); return () => {}; },
    later: (run, ms) => { const item = { run, ms }; laters.push(item); return () => { laters.splice(laters.indexOf(item), 1); }; } });
  const tick = () => ticks.forEach(run => run());
  const flush = async () => { while (laters.length) { const item = laters.shift(); item.run(); await Promise.resolve(); } for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const answer = async () => { release?.(); release = null; for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { waves, island, rooms, emit, tick, flush, answer };
}

describe('island rereads on the live path', () => {
  it('one reread at a time: island_changed hints during a slow read add one more read, not one each', async () => {
    const h = harness();
    h.tick();
    const room = h.rooms[0];
    room.hear('island_changed', { spot: 'cannon_1' });
    await h.flush();
    expect(h.island.refreshDefended).toHaveBeenCalledTimes(1); // still waiting for its answer
    for (const spot of ['cannon_2', 'cannon_3', 'wall_1']) { room.hear('island_changed', { spot }); await h.flush(); }
    expect(h.island.refreshDefended).toHaveBeenCalledTimes(1);
    await h.answer();
    expect(h.island.refreshDefended).toHaveBeenCalledTimes(2); // the hints that came meanwhile: one more read
    await h.answer();
    expect(h.island.refreshDefended).toHaveBeenCalledTimes(2);
    h.waves.dispose();
  });
  it('the quiet 15 s reread waits while a wave runs on the island', async () => {
    const h = harness();
    h.waves.pirates.island.start({ waveId: 'w-1', wave: 1, seed: 7, startsAt: new Date(Date.now() + 10000).toISOString(), weather: {}, flagship: false });
    for (let i = 0; i < 40; i++) h.tick();
    await h.flush();
    expect(h.island.refreshDefended).not.toHaveBeenCalled();
    h.waves.dispose();
  });
});
