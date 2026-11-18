// Shared, original world-art metadata and bounded decoded leases; no request occurs at import time.
import {villageFamilies} from './village-families.js';
import {decodeRasterSheet} from './village-decode.js';
export const DECODE_BUDGET = 12 * 2 ** 20;
const positive = n => Number.isInteger(n) && n > 0;
function validateSheet(sheet) {
  if (!sheet || !/^village\/[a-z0-9][a-z0-9._/-]*\.(?:png|webp)$/i.test(sheet.file ?? '') || sheet.file.split('/').includes('..')
      || !positive(sheet.width) || !positive(sheet.height) || Math.max(sheet.width, sheet.height) > 2048) throw new Error('Invalid local world-art sheet.');
  return sheet.width * sheet.height * 4;
}
const closeImage = image => { if (image?.close) image.close(); else if (image?.removeAttribute) image.removeAttribute('src'); };
/** Reservations include decodes that timed out but have not settled, preventing runaway late work. */
export function createRasterCache({decode = decodeRasterSheet, budget = DECODE_BUDGET, timeoutMs = 15000, concurrency = 2} = {}) {
  const entries = new Map(), queue = []; let bytes = 0, decodes = 0;
  function drop(entry) {
    if (entry.dropped) return; entry.dropped = true; clearTimeout(entry.timer);
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    if (entry.started) bytes -= entry.bytes;
    if (entry.decoding) { entry.decoding = false; decodes--; }
    closeImage(entry.image); pump();
  }
  function pump() {
    while (queue.length && decodes < concurrency && bytes + queue[0].bytes <= budget) {
      const entry = queue.shift(); if (entry.dropped) continue;
      entry.started = entry.decoding = true; bytes += entry.bytes; decodes++;
      Promise.resolve().then(() => decode(entry.sheet, entry.abort.signal)).then(image => {
        if (entry.expired) { entry.image = image; drop(entry); return; }
        if (image?.width !== entry.sheet.width || image?.height !== entry.sheet.height) { closeImage(image); throw new Error('Decoded world-art dimensions differ.'); }
        entry.decoding = false; decodes--; entry.image = image; clearTimeout(entry.timer); entry.resolve(image); pump();
      }).catch(error => { entry.reject(error); drop(entry); });
    }
  }
  async function acquire(sheet) {
    const size = validateSheet(sheet); if (size > budget) throw new Error('World-art sheet exceeds decoded memory budget.');
    const key = `${sheet.file}:${sheet.width}x${sheet.height}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {key, sheet: {...sheet}, bytes: size, refs: 0, abort: new AbortController()};
      entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      entry.timer = setTimeout(() => {
        entry.expired = true; entry.abort.abort(); entry.reject(new Error('World-art decode timed out.'));
        if (entries.get(key) === entry) entries.delete(key);
        if (!entry.started) { queue.splice(queue.indexOf(entry), 1); drop(entry); }
      }, timeoutMs);
      entries.set(key, entry); queue.push(entry); pump();
    }
    entry.refs++; const image = await entry.promise; let released = false;
    return {image, release() { if (released) return; released = true; if (--entry.refs === 0) drop(entry); }};
  }
  return {acquire, stats: () => ({bytes, entries: entries.size, queued: queue.length, decodes})};
}
const cache = createRasterCache();
export const acquireRasterSheet = sheet => cache.acquire(sheet);
export function collectRasterFrames(families) {
  const result = {};
  for (const family of families) for (const [id, frame] of Object.entries(family.frames ?? {})) {
    if (result[id]) throw new Error(`Duplicate world-art frame: ${id}`);
    const sheet = family.sheets?.[frame.sheet]; validateSheet(sheet);
    const [x, y, w, h] = frame.rect ?? [], [lw, lh, anchor] = frame.logical ?? [];
    if (![x, y].every(n => Number.isInteger(n) && n >= 0) || ![w, h, lw, lh].every(positive)
        || lw > 256 || lh > 256 || !Number.isFinite(anchor) || anchor < 0 || anchor > lh
        || x + w > sheet.width || y + h > sheet.height) throw new Error(`Invalid world-art frame: ${id}`);
    const foot = frame.sourceFoot ?? [w / 2, h * (1 - anchor / lh)];
    if (!foot.every(Number.isFinite) || foot.length !== 2 || foot[0] < 0 || foot[0] > w || foot[1] < 0 || foot[1] > h) throw new Error(`Invalid world-art foot: ${id}`);
    const extents = [foot[0], foot[1], w - foot[0], h - foot[1]], bounds = frame.fitBounds ?? extents;
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((n, i) => Number.isFinite(n) && n >= extents[i])) throw new Error(`Invalid world-art fit bounds: ${id}`);
    result[id] = Object.freeze({...frame, rect: Object.freeze([...frame.rect]), logical: Object.freeze([...frame.logical]), sourceFoot: Object.freeze([...foot]), fitBounds: Object.freeze([...bounds]), sheet: Object.freeze({...sheet})});
  }
  return Object.freeze(result);
}
const frames = collectRasterFrames(villageFamilies);
export const getRasterFrame = id => frames[id] ?? null;
export const rasterFrameSizes = () => Object.fromEntries(Object.entries(frames).map(([id, {logical: [w, h, anchor]}]) => [id, [w / 16, h / 16, anchor / h]]));
/** Fit every side around the ground foot, including transparent margins, without aspect distortion. */
export function normalizeRasterFrame(image, frame, density = 2) {
  const [x, y, w, h] = frame.rect, [lw, lh, anchor] = frame.logical, [fx, fy] = frame.sourceFoot ?? [w / 2, h * (1 - anchor / lh)];
  const [left, top, right, bottom] = frame.fitBounds ?? [fx, fy, w - fx, h - fy];
  const limit = (space, extent) => extent > 0 ? space / extent : Infinity;
  const scale = Math.min(limit(lw / 2, left), limit(lw / 2, right), limit(lh - anchor, top), limit(anchor, bottom));
  if (!(scale > 0) || !Number.isFinite(scale) || !(density >= 1 && density <= 4)) throw new Error('World-art frame cannot fit its logical ground foot.');
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(lw * density); canvas.height = Math.ceil(lh * density);
  const context = canvas.getContext('2d'); context.setTransform(density, 0, 0, density, 0, 0); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, x, y, w, h, lw / 2 - fx * scale, lh - anchor - fy * scale, w * scale, h * scale);
  return canvas;
}
