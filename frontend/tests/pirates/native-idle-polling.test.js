// Production wave wiring under controlled clocks and the server's rolling read budget; no provider calls.
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {wireWaves} from '../../src/pirates/game-wiring.js';

const mounted = [];
beforeEach(() => vi.useFakeTimers({now: Date.UTC(2026, 10, 19)}));
afterEach(() => {for (const waves of mounted.splice(0)) waves.dispose(); vi.useRealTimers();});

function harness(join = async () => null) {
  const handlers = new Map(), roomHandlers = new Map();
  const on = (type, handler) => {
    const values = handlers.get(type) ?? new Set(); values.add(handler); handlers.set(type, values);
    return () => values.delete(handler);
  };
  const emit = event => {for (const handler of handlers.get(event.type) ?? []) handler(event);};
  const room = {send() {}, close() {}, on(type, handler) {
    const values = roomHandlers.get(type) ?? new Set(); values.add(handler); roomHandlers.set(type, values);
    return () => values.delete(handler);
  }};
  const island = {api: {}, island: {code: 'K7Q2M'}, visiting: null, economy: {mode: 'island_shared'},
    defenses: () => [], roomPlace: () => 'isle_k7q2m', joinRunningWave: vi.fn(join),
    refreshDefended: vi.fn(async () => {}), loadPoint() {}, setBattle() {}, setPointBattle() {}};
  const world = {current: {id: 'home_islet'}};
  const waves = wireWaves({island, world, on, emit, openRoom: () => room, loop: false});
  mounted.push(waves);
  const announce = id => {for (const handler of roomHandlers.get('wave_start') ?? []) handler({waveId: id});};
  return {island, waves, world, emit, announce};
}

it('leaves room for eight ordinary wave reads a minute under the actual 30/60 rolling allowance', async () => {
  let recent = [];
  const refusals = [], accepted = [], joins = [];
  function spend(kind) {
    const now = Date.now(); recent = recent.filter(at => at > now - 60000);
    if (recent.length >= 30) {
      refusals.push({kind, at: now});
      return {ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + 60000 - now) / 1000))};
    }
    recent.push(now); accepted.push({kind, at: now});
    return {ok: true, data: null};
  }
  const h = harness(async () => {joins.push(Date.now()); return spend('idle');});
  const ordinary = setInterval(() => spend('ordinary'), 7500);
  try {await vi.advanceTimersByTimeAsync(180000);} finally {clearInterval(ordinary);}
  expect(refusals).toEqual([]);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(60);
  expect(accepted.filter(row => row.kind === 'ordinary')).toHaveLength(24);
  expect(joins.slice(1).every((at, i) => at - joins[i] >= 3000)).toBe(true);
});

it.each(['returned', 'thrown'])('honors a %s 429 wait across idle ticks, arrivals and room messages', async kind => {
  const h = harness();
  if (kind === 'returned') h.island.joinRunningWave.mockResolvedValueOnce({ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 10});
  else h.island.joinRunningWave.mockRejectedValueOnce(Object.assign(new Error('Wait.'), {status: 429, code: 'too_many_requests', retryAfter: 10}));
  await vi.advanceTimersByTimeAsync(1000);
  for (let i = 0; i < 9; i++) {
    h.announce(`busy-${i}`); h.emit({type: 'arrived', place: 'home_islet'});
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(2);
});

it('keeps room and arrival joins prompt between ordinary idle checks', async () => {
  const h = harness();
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(200);
  h.announce('new-wave'); await vi.advanceTimersByTimeAsync(0);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(2);
  h.emit({type: 'arrived', place: 'home_islet'});
  await vi.advanceTimersByTimeAsync(800);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(3);
});

it('preserves one in-flight join, busy retries and disposal', async () => {
  let answer;
  const h = harness(() => new Promise(resolve => {answer = resolve;}));
  await vi.advanceTimersByTimeAsync(1000);
  for (let i = 0; i < 6; i++) h.announce(`wave-${i}`);
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(1);
  h.island.joinRunningWave.mockResolvedValue(null);
  answer({ok: false, code: 'busy'});
  await vi.advanceTimersByTimeAsync(1200);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(2);
  h.island.joinRunningWave.mockResolvedValue({ok: false, code: 'busy'});
  h.announce('later-wave'); await vi.advanceTimersByTimeAsync(0);
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(3);
  h.waves.dispose();
  await vi.advanceTimersByTimeAsync(60000); h.announce('after-disposal');
  expect(h.island.joinRunningWave).toHaveBeenCalledTimes(3);
});
