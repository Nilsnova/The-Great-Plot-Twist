import {afterEach, describe, expect, it, vi} from 'vitest';
import {collectRasterFrames, createRasterCache, DECODE_BUDGET, normalizeRasterFrame} from '../../src/art/village-raster.js';
const sheet = file => ({file: `village/${file}.png`, width: 2, height: 2});
const image = () => ({width: 2, height: 2, close: vi.fn()});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject}; };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('bounded world PNG leases', () => {
  it('performs no import/preparation request, coalesces leases and closes once on final idempotent release', async () => {
    const bitmap = image(), decode = vi.fn(async () => bitmap), cache = createRasterCache({decode});
    expect(decode).not.toHaveBeenCalled(); expect(DECODE_BUDGET).toBe(12 * 2 ** 20);
    const [a, b] = await Promise.all([cache.acquire(sheet('one')), cache.acquire(sheet('one'))]);
    expect(decode).toHaveBeenCalledOnce(); expect(a.image).toBe(b.image); expect(cache.stats().bytes).toBe(16);
    a.release(); a.release(); expect(bitmap.close).not.toHaveBeenCalled(); b.release();
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(cache.stats()).toEqual({bytes: 0, entries: 0, queued: 0, decodes: 0});
  });
  it('bounds peak decode concurrency and waits for released memory before a queued family', async () => {
    const work = [deferred(), deferred(), deferred()], decode = vi.fn(() => work[decode.mock.calls.length - 1].promise);
    const cache = createRasterCache({decode, budget: 32}), a = cache.acquire(sheet('a')), b = cache.acquire(sheet('b')), c = cache.acquire(sheet('c'));
    await flush(); expect(decode).toHaveBeenCalledTimes(2); expect(cache.stats()).toMatchObject({bytes: 32, queued: 1, decodes: 2});
    work[0].resolve(image()); const first = await a; await flush(); expect(decode).toHaveBeenCalledTimes(2);
    first.release(); await flush(); expect(decode).toHaveBeenCalledTimes(3); expect(cache.stats().bytes).toBe(32);
    work[1].resolve(image()); work[2].resolve(image()); (await b).release(); (await c).release(); expect(cache.stats().bytes).toBe(0);
  });
  it('retains timed-out decode reservations until late work settles and disposes the late image', async () => {
    vi.useFakeTimers(); const late = deferred(), bitmap = image(), decode = vi.fn(() => late.promise), cache = createRasterCache({decode, budget: 16, timeoutMs: 50});
    const failed = expect(cache.acquire(sheet('late'))).rejects.toThrow('timed out');
    await flush(); await vi.advanceTimersByTimeAsync(50); await failed;
    expect(cache.stats()).toMatchObject({bytes: 16, decodes: 1}); expect(bitmap.close).not.toHaveBeenCalled();
    late.resolve(bitmap); await flush(); expect(bitmap.close).toHaveBeenCalledOnce(); expect(cache.stats().bytes).toBe(0);
  });
  it('expires queued work without decoding it and releases rejected/incorrect decodes', async () => {
    vi.useFakeTimers(); const late = deferred(), decode = vi.fn(() => late.promise), cache = createRasterCache({decode, budget: 16, timeoutMs: 50});
    const a = expect(cache.acquire(sheet('a'))).rejects.toThrow('timed out'), b = expect(cache.acquire(sheet('b'))).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(50); await Promise.all([a, b]); expect(decode).toHaveBeenCalledOnce();
    late.reject(new Error('aborted')); await flush(); expect(cache.stats()).toEqual({bytes: 0, entries: 0, queued: 0, decodes: 0});
    const wrong = {...image(), width: 3}, next = createRasterCache({decode: async () => wrong});
    await expect(next.acquire(sheet('wrong'))).rejects.toThrow('dimensions'); expect(wrong.close).toHaveBeenCalledOnce(); expect(next.stats().bytes).toBe(0);
  });
  it.each([{file: 'https://outside.test/a.png'}, {file: 'village/../a.png'}, {width: 4096}, {width: 2048, height: 2048}])('refuses unbounded/untrusted sheet %j before decoding', async fields => {
    const decode = vi.fn(), cache = createRasterCache({decode}); await expect(cache.acquire({...sheet('a'), ...fields})).rejects.toThrow(); expect(decode).not.toHaveBeenCalled();
  });
});
describe('native-to-logical normalization', () => {
  it('copies/fixes metadata and keeps new frame IDs without mutating authored data', () => {
    const family = {sheets: {one: sheet('one')}, frames: {newFrame: {sheet: 'one', rect: [0, 0, 2, 2], logical: [48, 32, 5]}}};
    const frames = collectRasterFrames([family]); family.frames.newFrame.logical[0] = 99;
    expect(frames.newFrame.logical).toEqual([48, 32, 5]); expect(Object.isFrozen(frames.newFrame.sourceFoot)).toBe(true);
    expect(() => collectRasterFrames([family, family])).toThrow('Duplicate');
    expect(() => collectRasterFrames([{...family, frames: {bad: {...family.frames.newFrame, rect: [1, 1, 2, 2]}}}])).toThrow('frame');
  });
  it('preserves the complete hero cell/aspect and exact off-center foot at bounded density', () => {
    const context = {setTransform: vi.fn(), drawImage: vi.fn()}, canvas = {getContext: () => context}; vi.stubGlobal('document', {createElement: () => canvas});
    const img = {}, frame = {rect: [10, 20, 1254, 1254], logical: [96, 96, 12], sourceFoot: [627, 1124]};
    expect(normalizeRasterFrame(img, frame, 2)).toBe(canvas); expect([canvas.width, canvas.height]).toEqual([192, 192]);
    const args = context.drawImage.mock.calls[0], [dx, dy, dw, dh] = args.slice(5); expect(args.slice(0, 5)).toEqual([img, 10, 20, 1254, 1254]);
    expect(dw).toBeCloseTo(dh); expect(dx).toBeGreaterThanOrEqual(0); expect(dy).toBeCloseTo(0);
    expect(dx + dw).toBeLessThanOrEqual(96); expect(dy + dh).toBeLessThanOrEqual(96);
    expect(dx + dw / 2).toBeCloseTo(48); expect(dy + dh * 1124 / 1254).toBeCloseTo(84);
    expect(() => normalizeRasterFrame(img, frame, 5)).toThrow('fit');
  });
  it('keeps scale and feet identical across clean state crops with virtual transparent fit bounds', () => {
    const fitBounds = [50, 80, 50, 20], family = {sheets: {one: {file: 'village/states.png', width: 100, height: 200}}, frames: {
      intact: {sheet: 'one', rect: [0, 0, 100, 100], logical: [60, 60, 10], sourceFoot: [50, 80], fitBounds},
      broken: {sheet: 'one', rect: [0, 100, 100, 60], logical: [60, 60, 10], sourceFoot: [50, 40], fitBounds},
    }}, frames = collectRasterFrames([family]), draws = [];
    vi.stubGlobal('document', {createElement: () => ({getContext: () => ({setTransform() {}, drawImage: (...args) => draws.push(args)})})});
    for (const frame of Object.values(frames)) normalizeRasterFrame({}, frame, 2);
    for (const [i, frame] of Object.values(frames).entries()) {
      const [dx, dy, dw, dh] = draws[i].slice(5); expect(dw / frame.rect[2]).toBe(.5); expect(dh / frame.rect[3]).toBe(.5);
      expect(dx + frame.sourceFoot[0] * .5).toBe(30); expect(dy + frame.sourceFoot[1] * .5).toBe(50);
    }
    fitBounds[0] = 999; expect(frames.intact.fitBounds).toEqual([50, 80, 50, 20]); expect(Object.isFrozen(frames.intact.fitBounds)).toBe(true);
    for (const bad of [[49, 80, 50, 20], [50, 79, 50, 20], [50, 80, 49, 20], [50, 80, 50, 19], [50, Infinity, 50, 20], [50, 80, 50]]) {
      expect(() => collectRasterFrames([{...family, frames: {bad: {...family.frames.intact, fitBounds: bad}}}])).toThrow('fit bounds');
    }
  });
});
