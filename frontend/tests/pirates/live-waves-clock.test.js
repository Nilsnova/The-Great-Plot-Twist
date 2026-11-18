// Two browsers in one legacy wave each run it from startsAt on their own clock. A clock off by a second
// put one screen 20 ticks ahead: a teammate's input (stamped 4 ticks ahead) landed late there, on another
// tick than on the sender's screen, and the two waves drifted apart. The wave answer's serverNow now
// gives such a browser the server's clock (island/api.js clockOffset).
import { describe, expect, it } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { clockOffset, createIslandApi, CLOCK_SLACK_MS } from '../../src/island/api.js';
import { createWaveFlow } from '../../src/island/wave-flow.js';

const START = Date.UTC(2026, 10, 18, 12, 0, 0);
const wave = { waveId: 'w-clock', wave: 2, seed: 99, startsAt: new Date(START + 10000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };

function linked() {
  const rooms = [0, 1].map(() => ({ handlers: new Map(), peer: null,
    on(type, handler) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(handler); return () => {}; },
    send(type, payload) { for (const handler of this.peer.handlers.get(type) ?? []) handler(payload); return true; } }));
  rooms[0].peer = rooms[1]; rooms[1].peer = rooms[0];
  return rooms;
}
function pair(skewMs, offsetForB) {
  const real = { now: START }, rooms = linked();
  const make = (index, skew) => createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, room: rooms[index],
    now: () => real.now + skew, playerId: `p-${index}`, getDefenses: () => [{ id: 'cannon_1', kind: 'cannon', level: 2, x: -12.5, z: -14.5 }],
    finishWave: async () => ({ loot: 1 }), loadAuto: () => false, saveAuto() {}, setTimer: () => 0, clearTimer() {} });
  const a = make(0, 0), b = make(1, skewMs);
  a.start(wave); b.start(offsetForB === null ? wave : { ...wave, clockOffsetMs: offsetForB });
  const run = ms => { for (let t = 0; t < ms; t += 50) { real.now += 50; a.update(.05); b.update(.05); } };
  return { a, b, run };
}

describe('the wave clock between two browsers', () => {
  it('a teammate\'s cannon shot lands late on a screen whose clock is a second ahead', () => {
    const { a, b, run } = pair(1000, null);
    run(12000);
    expect(a.fire('cannon_1', 'ship_1')).toBe(true);
    expect(b.wave.ticks - a.wave.ticks).toBe(20);
    expect(b.wave.schedule.late).toBe(1); // another tick than on the sender's screen
  });
  it('with the server\'s clock from the wave answer both screens count the same ticks', () => {
    const { a, b, run } = pair(1000, -1000);
    run(12000);
    expect(a.fire('cannon_1', 'ship_1')).toBe(true);
    expect(b.wave.ticks).toBe(a.wave.ticks);
    expect(b.wave.schedule.late).toBe(0);
    expect(b.wave.schedule.size).toBe(1); // the shot is waiting for its own tick
  });
  it('the api measures the offset when the answer arrives, and leaves a well-set clock alone', async () => {
    expect(clockOffset({ serverNow: new Date(START + 3000).toISOString() }, START)).toBe(3000);
    expect(clockOffset({ serverNow: new Date(START - 2500).toISOString() }, START)).toBe(-2500);
    expect(clockOffset({ serverNow: new Date(START + CLOCK_SLACK_MS - 1).toISOString() }, START)).toBe(null);
    expect(clockOffset({}, START)).toBe(null);
    const answer = { ...wave, recoveryVersion: 0, waveProtocol: 1, serverNow: new Date(START - 4000).toISOString() };
    const transport = { get: async () => ({ ok: true, status: 200, data: answer }), post: async () => ({ ok: true, status: 200, data: answer }) };
    const api = createIslandApi({ transport, now: () => START });
    expect((await api.startWave({ where: 'own' })).data.clockOffsetMs).toBe(-4000);
    expect((await api.joinWave({ waveId: wave.waveId })).data.clockOffsetMs).toBe(-4000);
    expect((await api.currentWave({ where: 'own' })).data.clockOffsetMs).toBe(-4000);
    const exact = createIslandApi({ transport: { ...transport, post: async () => ({ ok: true, status: 200, data: { ...answer, serverNow: new Date(START + 40).toISOString() } }) }, now: () => START });
    expect((await exact.startWave({ where: 'own' })).data).not.toHaveProperty('clockOffsetMs');
  });
  it('the bell hands the measured offset to the wave on screen', async () => {
    const events = [];
    const api = { startWave: async () => ({ ok: true, status: 200, data: { ...wave, clockOffsetMs: -1000 } }) };
    const flow = createWaveFlow({ api, emit: event => events.push(event), setTimer: () => 0, clearTimer() {} });
    await flow.ring('own');
    expect(events.find(event => event.type === 'wave_started_server')).toMatchObject({ waveId: wave.waveId, clockOffsetMs: -1000 });
    flow.dispose();
  });
});
