import {afterEach, expect, it, vi} from 'vitest';
import {decodeRasterSheet, sheetHeader} from '../../src/art/village-decode.js';
afterEach(() => vi.unstubAllGlobals());
function header(width, height) {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a); view.setUint32(16, width); view.setUint32(20, height); return new Blob([bytes]);
}
it('checks PNG dimensions before decoding and forwards cancellation without leaking an image', async () => {
  const bitmap = {}, decode = vi.fn(async () => bitmap), fetcher = vi.fn(async () => ({ok: true, blob: async () => header(2, 2)}));
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('createImageBitmap', decode); const abort = new AbortController();
  await expect(decodeRasterSheet({file: 'village/one.png', width: 2, height: 2}, abort.signal)).resolves.toBe(bitmap);
  expect(fetcher).toHaveBeenCalledWith('/village/one.png', {signal: abort.signal}); expect(decode).toHaveBeenCalledOnce();
  decode.mockClear(); await expect(decodeRasterSheet({file: 'village/one.png', width: 3, height: 2}, abort.signal)).rejects.toThrow('dimensions');
  expect(decode).not.toHaveBeenCalled(); abort.abort(); await expect(decodeRasterSheet({file: 'village/one.png', width: 2, height: 2}, abort.signal)).rejects.toThrow('canceled');
  expect(decode).not.toHaveBeenCalled();
});
it('rejects unavailable and non-PNG resources before bitmap allocation', async () => {
  const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('fetch', async () => ({ok: false})); await expect(decodeRasterSheet({file: 'village/missing.png'}, new AbortController().signal)).rejects.toThrow('unavailable');
  vi.stubGlobal('fetch', async () => ({ok: true, blob: async () => new Blob(['not a PNG'])}));
  await expect(decodeRasterSheet({file: 'village/missing.png'}, new AbortController().signal)).rejects.toThrow('dimensions'); expect(decode).not.toHaveBeenCalled();
});
function riff(chunk, fill) {
  const bytes = new Uint8Array(30), view = new DataView(bytes.buffer), put = (text, at) => [...text].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
  put('RIFF', 0); put('WEBP', 8); put(chunk, 12); fill(bytes, view); return bytes;
}
it('reads WebP (VP8X, VP8, VP8L) dimensions and refuses a WebP named as PNG', async () => {
  const extended = riff('VP8X', (bytes, view) => { view.setUint16(24, 927, true); view.setUint16(27, 999, true); });
  expect(sheetHeader(new DataView(extended.buffer))).toEqual({type: 'webp', width: 928, height: 1000});
  const lossy = riff('VP8 ', (bytes, view) => { bytes.set([0x9d, 0x01, 0x2a], 23); view.setUint16(26, 628, true); view.setUint16(28, 628, true); });
  expect(sheetHeader(new DataView(lossy.buffer))).toEqual({type: 'webp', width: 628, height: 628});
  const lossless = riff('VP8L', (bytes, view) => { bytes[20] = 0x2f; view.setUint32(21, 391 | 391 << 14, true); });
  expect(sheetHeader(new DataView(lossless.buffer))).toEqual({type: 'webp', width: 392, height: 392});
  const decode = vi.fn(async () => ({})); vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('fetch', async () => ({ok: true, blob: async () => new Blob([extended])}));
  await expect(decodeRasterSheet({file: 'village/one.webp', width: 928, height: 1000}, new AbortController().signal)).resolves.toEqual({});
  await expect(decodeRasterSheet({file: 'village/one.png', width: 928, height: 1000}, new AbortController().signal)).rejects.toThrow('dimensions');
  expect(decode).toHaveBeenCalledOnce();
});
