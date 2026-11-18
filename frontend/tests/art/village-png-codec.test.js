import {expect, it} from 'vitest';
import {crc32, deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {recompressPng, verifyPngEquivalent} from '../../scripts/village-png-codec.js';
import {sheets} from '../../src/art/village/baked.js';
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8); bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4); return bytes;
}
function png({width = 64, height = 32, filtered = Buffer.alloc(height * (width * 4 + 1)), level = 0, middle = [], color = 6, interlace = 0, packed} = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header.set([8, color, 0, 0, interlace], 8);
  const compressed = packed ?? deflateSync(filtered, {level}), split = Math.floor(compressed.length / 2);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('tEXt', Buffer.from('Author\0Johannes')), ...middle,
    chunk('IDAT', compressed.subarray(0, split)), chunk('IDAT', compressed.subarray(split)), chunk('tIME', Buffer.from([7, 234, 11, 17, 1, 2, 3])), chunk('IEND')]);
}
it('shrinks only IDAT encoding, preserves every metadata byte/order and exact filtered scanlines without mutating input', () => {
  const input = png(), before = Buffer.from(input), output = recompressPng(input);
  expect(output.length).toBeLessThan(input.length); expect(input.equals(before)).toBe(true);
  expect(verifyPngEquivalent(input, output)).toMatchObject({width: 64, height: 32, filteredBytes: 8224, savedBytes: input.length - output.length});
  const same = verifyPngEquivalent(input, input), proof = verifyPngEquivalent(input, output);
  for (const key of ['filteredSha256', 'nonIdatSha256']) { expect(proof[key]).toMatch(/^[a-f0-9]{64}$/); expect(proof[key]).toBe(same[key]); }
  expect(output.includes(chunk('tEXt', Buffer.from('Author\0Johannes')))).toBe(true); expect(output.includes(chunk('tIME', Buffer.from([7, 234, 11, 17, 1, 2, 3])))).toBe(true);
  expect(recompressPng(output)).toBe(output);
});
it('rejects valid-CRC metadata or filtered-byte changes rather than calling them equivalent', () => {
  const input = png(), changed = Buffer.alloc(8224); changed[1] = 1;
  expect(() => verifyPngEquivalent(input, png({filtered: changed}))).toThrow('scanlines');
  expect(() => verifyPngEquivalent(input, png({middle: [chunk('tEXt', Buffer.from('extra'))]}))).toThrow('metadata');
  const textEnd = 33 + input.readUInt32BE(33) + 12, moved = Buffer.concat([input.subarray(0, 33), input.subarray(textEnd, -31), input.subarray(33, textEnd), input.subarray(-31)]);
  expect(() => verifyPngEquivalent(input, moved)).toThrow('metadata');
});
it('rejects CRC damage, truncation, invalid signature/end/order and nonconsecutive image chunks', () => {
  const input = png(), corrupt = Buffer.from(input); corrupt[45] ^= 1;
  const idat = input.indexOf(Buffer.from('IDAT')) - 4, length = input.readUInt32BE(idat) + 12;
  const badType = Buffer.from(input); badType[idat + 4] |= 128; badType.writeUInt32BE(crc32(badType.subarray(idat + 4, idat + length - 4)), idat + length - 4);
  for (const broken of [corrupt, input.subarray(0, -1), Buffer.concat([Buffer.from([0]), input.subarray(1)]), Buffer.concat([input, Buffer.from([0])]),
    badType, png({middle: [chunk('ABCD')]}), Buffer.concat([input.subarray(0, idat + length), chunk('tEXt', Buffer.from('between')), input.subarray(idat + length)])]) expect(() => recompressPng(broken)).toThrow();
});
it('bounds encoded size, decoded allocation and inflated scanlines before accepting unsupported/corrupt images', () => {
  for (const input of [Buffer.alloc(8 * 2 ** 20 + 1), png({width: 2048, height: 2048, filtered: Buffer.alloc(1)}), png({width: 2049, height: 1}), png({color: 2}), png({interlace: 1}),
    png({filtered: Buffer.alloc(2 ** 20), level: 9}),
    png({filtered: Buffer.alloc(8223)}), png({filtered: Buffer.alloc(8225)}), png({packed: Buffer.concat([deflateSync(Buffer.alloc(8224)), Buffer.from([1])])}),
    png({filtered: Buffer.from([5, ...Array(8223).fill(0)])})]) expect(() => recompressPng(input)).toThrow();
});
it('accepts an actual generated sheet and preserves its filtered bytes and metadata exactly', () => {
  const input = readFileSync(new URL(`../../public/${sheets.buildingsBaked1.file}`, import.meta.url));
  const output = recompressPng(input), result = verifyPngEquivalent(input, output);
  expect(result.width).toBeGreaterThan(0); expect(result.savedBytes).toBeGreaterThanOrEqual(0); expect(result.filteredBytes).toBe(result.height * (result.width * 4 + 1));
});
