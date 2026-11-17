// Local PNGs only. Validate their header before decoding; the cache owns timeout and late disposal.
export async function decodeRasterSheet(sheet, signal) {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}${sheet.file}`, {signal});
  if (!response.ok) throw new Error(`World art unavailable: ${sheet.file}`);
  const blob = await response.blob();
  if (blob.size > 8 * 2 ** 20) throw new Error('World art transfer exceeds 8MiB.');
  const header = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (header.byteLength !== 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a
      || header.getUint32(16) !== sheet.width || header.getUint32(20) !== sheet.height) throw new Error('World art PNG dimensions differ from the manifest.');
  if (signal.aborted) throw new Error('World art decode canceled.');
  if (globalThis.createImageBitmap) return createImageBitmap(blob, {premultiplyAlpha: 'none'});
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}
