// Failed and late static loads must settle and release allocations without a browser.
import { expect, it, vi } from 'vitest';
import { loadTexture } from '../src/world/texture.js';
it('rejects a stalled drawing and disposes its late texture once', async () => {
  vi.useFakeTimers();
  try {
    let finish; const texture = { dispose: vi.fn() };
    const loader = { loadAsync: () => new Promise(resolve => { finish = resolve; }) };
    const result = loadTexture('local.png', loader, 100);
    const rejected = expect(result).rejects.toThrow('Drawing timed out');
    await vi.advanceTimersByTimeAsync(100); await rejected;
    finish(texture); await Promise.resolve();
    expect(texture.dispose).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
