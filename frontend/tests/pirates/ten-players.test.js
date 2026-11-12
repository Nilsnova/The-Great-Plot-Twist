// Ten players on one island (docs/GAME-V3.md §2): ten senders in one wave room keep the same order of inputs
// on every client, every message passes the live room's checks, and the room stays inside its send budget.
import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, createInputSchedule, readMessage, toMessage, tickOf } from '../../src/pirates/sync.js';
import { createLocalRoom } from '../../src/pirates/room.js';
import { MAX_WAVE_PLAYERS, WAVE_GAP_MS, WAVE_ROOM_BUDGET, readWaveMessage, waveGapMs } from '../../src/net/live-rules.js';

const SENDERS = Array.from({ length: 10 }, (_, i) => `captain-${i}`);
const WAVE = 'wave-ten';

// A BroadcastChannel stand-in: every channel of one name hears the others (never itself), like the browser's.
function channels() {
  const open = new Map();
  return class FakeChannel {
    constructor(name) { this.name = name; this.onmessage = null; if (!open.has(name)) open.set(name, new Set()); open.get(name).add(this); }
    postMessage(data) { for (const other of open.get(this.name)) if (other !== this) other.onmessage?.({ data: structuredClone(data) }); }
    close() { open.get(this.name)?.delete(this); }
  };
}
const shuffle = (list, seed) => {
  const out = [...list];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) { state = (state * 1103515245 + 12345) % 2147483648; const j = state % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

describe('ten senders in one wave', () => {
  it('raises the limit to ten players everywhere', () => {
    expect(MAX_PLAYERS).toBe(10);
    expect(MAX_WAVE_PLAYERS).toBe(10);
  });
  it('every client runs the inputs of one tick in the same order, however they arrive', () => {
    const tick = 120;
    const messages = SENDERS.flatMap((by, index) => [
      toMessage({ type: 'captain_shot', targetId: `ship_${index}`, level: 1 + (index % 5), x: index, z: -index }, { by, seq: 1, tick, waveId: WAVE }),
      toMessage({ type: 'repair', wallId: `wall_${1 + (index % 6)}` }, { by, seq: 2, tick, waveId: WAVE }),
    ]);
    const orders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seed => {
      const schedule = createInputSchedule();
      for (const message of shuffle(messages, seed)) {
        const read = readMessage(message.type, message.payload, WAVE);
        expect(read).not.toBe(null);
        expect(schedule.add(read, tick - 2)).toBe(tick);
      }
      return JSON.stringify(schedule.take(tick));
    });
    expect(new Set(orders).size).toBe(1);
    const first = JSON.parse(orders[0]);
    expect(first).toHaveLength(20);
    expect(first.filter(input => input.type === 'captain_shot').map(input => input.by)).toEqual([...SENDERS].sort());
    expect(tickOf(messages[0].payload.t)).toBe(tick);
  });
  it('ten tabs on one island hear each other through the room with the live room\'s rules', () => {
    const Channel = channels();
    const rooms = SENDERS.map((_, index) => createLocalRoom('live:place:isle_k7q2m:1', { Channel, id: `00000000-0000-4000-8000-00000000000${index}`.slice(-36) }));
    const heard = rooms.map(() => []);
    rooms.forEach((room, index) => room.on('captain_shot', data => heard[index].push(data.by)));
    rooms.forEach((room, index) => {
      const message = toMessage({ type: 'captain_shot', targetId: 'ship_1', level: 2, x: 3, z: -4 }, { by: SENDERS[index], seq: 1, tick: 40, waveId: WAVE });
      expect(room.send(message.type, message.payload)).toBe(true);
    });
    heard.forEach((list, index) => expect(list.sort()).toEqual(SENDERS.filter((_, other) => other !== index).sort()));
    expect(rooms.every(room => room.dropped === 0)).toBe(true);
    // The game's own messages (lobby Start, Pause) pass the same checks; a malformed one is dropped.
    expect(readWaveMessage('game_state', { v: 1, id: '00000000-0000-4000-8000-000000000001', seq: 1, data: { who: 'ben', started: true, paused: false, first: true } })).not.toBe(null);
    expect(readWaveMessage('game_hello', { v: 1, id: '00000000-0000-4000-8000-000000000001', seq: 1, data: { who: 'ben' } })).not.toBe(null);
    expect(readWaveMessage('game_state', { v: 1, id: '00000000-0000-4000-8000-000000000001', seq: 1, data: { who: 'ben', started: 'yes', paused: false, first: true } })).toBe(null);
    expect(readWaveMessage('game_hello', { v: 1, id: '00000000-0000-4000-8000-000000000001', seq: 1, data: { who: 'ben', name: 'Ben' } })).toBe(null);
    rooms.forEach(room => room.close());
  });
  it('a full room stays inside its send budget: the gap grows with the players', () => {
    expect(waveGapMs(1)).toBe(WAVE_GAP_MS);
    expect(waveGapMs(4)).toBe(WAVE_GAP_MS); // up to four players nothing changes (5 a second each)
    for (let players = 2; players <= 10; players++) {
      const perSecond = players * (players - 1) * (1000 / waveGapMs(players)); // deliveries a second at full speed
      expect(perSecond).toBeLessThanOrEqual(Math.max(WAVE_ROOM_BUDGET, 4 * 3 * 5));
    }
    expect(waveGapMs(10)).toBe(1000);
    expect(waveGapMs(25)).toBe(waveGapMs(10));
  });
});
