// Local PNG or WebP sheets only. Validate their header before decoding; the cache owns timeout and late disposal.
const ascii = (view, at, length) => String.fromCharCode(...Array.from({length}, (_, i) => view.getUint8(at + i)));
/** {type, width, height} from the first 30 bytes of a PNG or WebP (VP8, VP8L or VP8X), or null. */
export function sheetHeader(view) {
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a)
    return {type: 'png', width: view.getUint32(16), height: view.getUint32(20)};
  // The container's four-character codes, big-endian: RIFF at 0 and WEBP at 8.
  if (view.byteLength < 30 || view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) return null;
  const chunk = ascii(view, 12, 4), u24 = at => view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getUint8(at + 2) << 16;
  if (chunk === 'VP8X') return {type: 'webp', width: u24(24) + 1, height: u24(27) + 1};
  if (chunk === 'VP8 ' && view.getUint8(23) === 0x9d && view.getUint8(24) === 0x01 && view.getUint8(25) === 0x2a)
    return {type: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff};
  if (chunk === 'VP8L' && view.getUint8(20) === 0x2f) {
    const bits = view.getUint32(21, true);
    return {type: 'webp', width: (bits & 0x3fff) + 1, height: (bits >> 14 & 0x3fff) + 1};
  }
  return null;
}
export async function decodeRasterSheet(sheet, signal) {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}${sheet.file}`, {signal});
  if (!response.ok) throw new Error(`World art unavailable: ${sheet.file}`);
  const blob = await response.blob();
  if (blob.size > 8 * 2 ** 20) throw new Error('World art transfer exceeds 8MiB.');
  const header = sheetHeader(new DataView(await blob.slice(0, 30).arrayBuffer()));
  if (!header || header.type !== (/\.webp$/i.test(sheet.file) ? 'webp' : 'png') || header.width !== sheet.width || header.height !== sheet.height)
    throw new Error('World art PNG/WebP dimensions differ from the manifest.');
  if (signal.aborted) throw new Error('World art decode canceled.');
  if (globalThis.createImageBitmap) return createImageBitmap(blob, {premultiplyAlpha: 'none'});
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}
