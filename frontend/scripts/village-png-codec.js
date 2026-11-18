// Offline, buffer-only lossless compression of bounded Canvas RGBA8 PNGs.
import {crc32, deflateSync, inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex'), ENCODED_LIMIT = 8 * 2 ** 20, DECODED_LIMIT = 12 * 2 ** 20;
function readPng(input) {
  if (!Buffer.isBuffer(input) || input.length < 57 || input.length > ENCODED_LIMIT || !input.subarray(0, 8).equals(SIGNATURE)) throw new Error('Invalid or oversized PNG input.');
  const chunks = [], idat = []; let width, height, ended = false, idatEnded = false, palette = false;
  for (let offset = 8; offset < input.length;) {
    if (offset + 12 > input.length) throw new Error('Truncated PNG chunk.');
    const length = input.readUInt32BE(offset), end = offset + length + 12, type = input.toString('latin1', offset + 4, offset + 8);
    if (end > input.length || !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) throw new Error('Invalid PNG chunk length/type.');
    if (crc32(input.subarray(offset + 4, end - 4)) !== input.readUInt32BE(end - 4)) throw new Error('PNG chunk CRC differs.');
    if (offset === 8 && type !== 'IHDR' || type === 'IHDR' && (offset !== 8 || length !== 13)) throw new Error('Invalid PNG header order/length.');
    if (type === 'IHDR') {
      width = input.readUInt32BE(offset + 8); height = input.readUInt32BE(offset + 12);
      if (!width || !height || width > 2048 || height > 2048 || width * height * 4 > DECODED_LIMIT || !input.subarray(offset + 16, offset + 21).equals(Buffer.from([8, 6, 0, 0, 0]))) throw new Error('PNG must be bounded noninterlaced RGBA8.');
    } else if (type === 'IDAT') {
      if (idatEnded) throw new Error('PNG IDAT chunks must be consecutive.'); idat.push(input.subarray(offset + 8, end - 4));
    } else {
      if (idat.length) idatEnded = true;
      if (type === 'PLTE') { if (palette || idat.length || !length || length % 3 || length > 768) throw new Error('Invalid PNG palette.'); palette = true; }
      else if (type !== 'IEND' && /^[A-Z]/.test(type)) throw new Error('Unsupported critical PNG chunk.');
    }
    chunks.push({type, bytes: input.subarray(offset, end)}); offset = end;
    if (type === 'IEND') { if (length || end !== input.length) throw new Error('Invalid PNG end/trailing data.'); ended = true; break; }
  }
  if (!ended || !idat.length) throw new Error('PNG needs IDAT and IEND.');
  const compressed = Buffer.concat(idat), stride = width * 4 + 1, expected = height * stride;
  const {buffer: filtered, engine} = inflateSync(compressed, {maxOutputLength: expected, info: true});
  if (filtered.length !== expected || engine.bytesWritten !== compressed.length) throw new Error('PNG scanline length/compressed stream differs.');
  for (let row = 0; row < height; row++) if (filtered[row * stride] > 4) throw new Error('Invalid PNG row filter.');
  return {width, height, filtered, chunks, metadata: Buffer.concat(chunks.filter(chunk => chunk.type !== 'IDAT').map(chunk => chunk.bytes)),
    beforeImageBytes: chunks.slice(0, chunks.findIndex(chunk => chunk.type === 'IDAT')).reduce((sum, chunk) => sum + chunk.bytes.length, 0)};
}
function idatChunk(data) {
  const chunk = Buffer.alloc(data.length + 12); chunk.writeUInt32BE(data.length); chunk.write('IDAT', 4); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4); return chunk;
}
export function verifyPngEquivalent(original, candidate) {
  const a = readPng(original), b = readPng(candidate);
  if (!a.metadata.equals(b.metadata) || a.beforeImageBytes !== b.beforeImageBytes || !a.filtered.equals(b.filtered)) throw new Error('PNG metadata or filtered scanlines changed.');
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  return {width: a.width, height: a.height, filteredBytes: a.filtered.length, filteredSha256: sha256(a.filtered), nonIdatSha256: sha256(a.metadata),
    originalBytes: original.length, encodedBytes: candidate.length, savedBytes: original.length - candidate.length};
}
export function recompressPng(input) {
  const png = readPng(input), image = idatChunk(deflateSync(png.filtered, {level: 9})); let inserted = false;
  const output = Buffer.concat([SIGNATURE, ...png.chunks.flatMap(chunk => chunk.type !== 'IDAT' ? [chunk.bytes] : inserted ? [] : (inserted = true, [image]))]);
  if (output.length >= input.length) return input;
  verifyPngEquivalent(input, output); return output;
}
