// #324: a recovery wave may only run ticks the server has sealed, and the seal moves on each poll.
// Without a buffer the wave freezes between polls and then jumps (ships and shots stutter live).
// With the playout buffer it runs a steady tick or so per frame, a little behind real time.
import { describe, expect, it } from 'vitest';
import { createWaveController, RECOVERY_PLAYOUT_MS } from '../../src/pirates/controller.js';

const START = Date.UTC(2026, 10, 14, 12, 0, 0), STARTS = START + 1000, TICK_MS = 50, FRAME_MS = 16, ROUND_TRIP_MS = 150;
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const snapshot = () => ({ recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-p', islandEpoch: 'epoch-p', seed: 77,
  startsAt: new Date(STARTS).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
  participants: [{ participantToken: TOKEN, captain: { level: 1, skills: [], weapon: 'musket' } }],
  createWave: { seed: 77, wave: 3, weather: { kind: 'calm', ships: 1, fog: 0 }, defenses: [{ id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 }] },
  structures: [{ spot: 'wall_1', instanceId: 'wall-instance', kind: 'wall', level: 1, x: 0, z: 1, hpUnits: 1_000_000, maxHP: 60, repairSeq: 0 }] });

async function ticksPerFrame(recoveryPlayoutMs) {
  const listeners = new Map(), bus = {
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
  };
  let now = START;
  // The server seals through its own "now" when it answers; the answer is ROUND_TRIP_MS old on arrival.
  const readEvents = async () => ({ headSeq: 0, sealedThroughTick: Math.floor((now - ROUND_TRIP_MS - STARTS) / TICK_MS) - 1, events: [] });
  const controller = createWaveController({ recoveryPlayoutMs, bus, now: () => now,
    recoveryTransport: { readEvents, sendInputs: async () => ({ accepted: [] }), checkpoint: async () => ({ accepted: false }), finishWave: async () => null },
    world: {}, getDefenses: () => [{ id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 1 }],
    createRenderer: () => null, createHud: () => null, setTimer: () => ({}), clearTimer: () => {} });
  bus.emit({ type: 'wave_started_server', waveId: 'wave-p', wave: 3, seed: 77, startsAt: new Date(STARTS).toISOString(),
    weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'], recoveryVersion: 1, waveProtocol: 2,
    initialSnapshot: snapshot(), participantToken: TOKEN, lastActorCounter: 0 });
  const steps = [];
  let last = 0;
  while (now < STARTS + 8000) {
    now += FRAME_MS; controller.update(FRAME_MS / 1000);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const ticks = controller.wave?.ticks ?? last;
    if (now > STARTS + 3000) steps.push(ticks - last);
    last = ticks;
  }
  controller.dispose();
  return { max: Math.max(...steps), frozen: steps.filter(step => step === 0).length / steps.length, moved: last };
}

describe('recovery waves play out smoothly (#324)', () => {
  it('without the buffer the wave freezes between polls and jumps after each one', async () => {
    const raw = await ticksPerFrame(0);
    expect(raw.moved).toBeGreaterThan(100);
    expect(raw.max).toBeGreaterThanOrEqual(5);
  });

  it('with the default buffer it advances at most two ticks a frame, like the local clock', async () => {
    expect(RECOVERY_PLAYOUT_MS).toBeGreaterThan(250 + 150); // longer than one poll plus a round trip
    const smooth = await ticksPerFrame(RECOVERY_PLAYOUT_MS);
    expect(smooth.moved).toBeGreaterThan(100);
    expect(smooth.max).toBeLessThanOrEqual(2);
    expect(smooth.frozen).toBeLessThan(.75); // a 16 ms frame is a third of a 50 ms tick: some frames rightly show no new tick
  });
});
