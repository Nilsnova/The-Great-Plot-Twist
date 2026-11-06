// Real weather state wired to a fake transport; no HTTP or provider dependency.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startLiveWeather } from '../src/net/weather.js';
import { getWeather, setWeather } from '../src/world/weather.js';
const answer = wind => ({ cloudCover: .4, rain: .2, fog: .3, wind });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let original;
beforeEach(() => { original = getWeather(); vi.useFakeTimers(); });
afterEach(() => { setWeather(original); vi.useRealTimers(); vi.restoreAllMocks(); });

it('wires finite values into game state, retains the last good answer and recovers', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const onUpdate = vi.fn(), fetchImpl = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => answer(.8) })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => answer(.1) });
  const stop = startLiveWeather({ setWeather, onUpdate, fetchImpl, intervalMs: 1000 });
  try {
    await vi.advanceTimersByTimeAsync(0); expect(getWeather()).toEqual(answer(.8));
    await vi.advanceTimersByTimeAsync(1000); expect(getWeather()).toEqual(answer(.8));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(getWeather()).toEqual(answer(.1));
    expect(onUpdate).toHaveBeenLastCalledWith(answer(.1));
  } finally { stop(); }
});

it('stopping while JSON is pending suppresses state updates, hooks and future refreshes', async () => {
  const body = deferred(), apply = vi.fn(), hook = vi.fn();
  const fetchImpl = vi.fn(async () => ({ ok: true, json: () => body.promise }));
  const stop = startLiveWeather({ setWeather: apply, onUpdate: hook, fetchImpl, intervalMs: 1000 });
  await vi.advanceTimersByTimeAsync(0); stop(); stop(); body.resolve(answer(.5));
  await vi.advanceTimersByTimeAsync(5000);
  expect(apply).not.toHaveBeenCalled(); expect(hook).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledOnce();
});

// G20-W1 regression: a late older answer must not replace a newer accepted sample.
it('G20-W1: preserves newer weather when an earlier refresh resolves last', async () => {
  const older = deferred(), newer = deferred();
  const fetchImpl = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const stop = startLiveWeather({ setWeather, fetchImpl, intervalMs: 1000 });
  try {
    await vi.advanceTimersByTimeAsync(1000);
    newer.resolve({ ok: true, json: async () => answer(.8) }); await vi.advanceTimersByTimeAsync(0);
    older.resolve({ ok: true, json: async () => answer(.1) }); await vi.advanceTimersByTimeAsync(0);
    expect(getWeather().wind).toBe(.8);
  } finally { stop(); }
});
