// Test-only QR reader written independently of src/lib/qr: its own tables (ISO 18004 Table 9 and the
// published format/version code words), its own alignment-position formula and its own GF(256) maths.
// It reads a module matrix (rows of 0/1), checks every structural rule and returns the decoded bytes.

// Published 15-bit format words (already XOR-masked), index = mask pattern 0-7.
export const FORMAT_WORDS = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
  H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
};
// Published 18-bit version words.
export const VERSION_WORDS = {7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3};
// ISO 18004 Table 9 rows as [blockCount, totalCodewords, dataCodewords].
const ISO_BLOCKS = {
  L: {1: [[1, 26, 19]], 2: [[1, 44, 34]], 3: [[1, 70, 55]], 4: [[1, 100, 80]], 5: [[1, 134, 108]],
    6: [[2, 86, 68]], 7: [[2, 98, 78]], 8: [[2, 121, 97]], 9: [[2, 146, 116]], 10: [[2, 86, 68], [2, 87, 69]]},
  M: {1: [[1, 26, 16]], 2: [[1, 44, 28]], 3: [[1, 70, 44]], 4: [[2, 50, 32]], 5: [[2, 67, 43]],
    6: [[4, 43, 27]], 7: [[4, 49, 31]], 8: [[2, 60, 38], [2, 61, 39]], 9: [[3, 58, 36], [2, 59, 37]],
    10: [[4, 69, 43], [1, 70, 44]]},
  Q: {1: [[1, 26, 13]], 2: [[1, 44, 22]], 3: [[2, 35, 17]], 4: [[2, 50, 24]], 5: [[2, 33, 15], [2, 34, 16]],
    6: [[4, 43, 19]], 7: [[2, 32, 14], [4, 33, 15]], 8: [[4, 40, 18], [2, 41, 19]], 9: [[4, 36, 16], [4, 37, 17]],
    10: [[6, 43, 19], [2, 44, 20]]},
  H: {1: [[1, 26, 9]], 2: [[1, 44, 16]], 3: [[2, 35, 13]], 4: [[4, 25, 9]], 5: [[2, 33, 11], [2, 34, 12]],
    6: [[4, 43, 15]], 7: [[4, 39, 13], [1, 40, 14]], 8: [[4, 40, 14], [2, 41, 15]], 9: [[4, 36, 12], [4, 37, 13]],
    10: [[6, 43, 15], [2, 44, 16]]},
};

const exp = [], log = [];
for (let i = 0, v = 1; i < 255; i++) { exp[i] = v; log[v] = i; v = (v * 2) ^ (v >= 128 ? 0x11d : 0); }
const mul = (a, b) => (a === 0 || b === 0 ? 0 : exp[(log[a] + log[b]) % 255]);
/** Evaluate the codeword polynomial at alpha^i; all zero means a valid, error-free RS block. */
export function syndromes(block, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let s = 0;
    for (const c of block) s = mul(s, exp[i]) ^ c;
    out.push(s);
  }
  return out;
}

export function alignmentCentres(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2, size = version * 4 + 17;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASK_TESTS = [
  (r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r * c) % 3) + ((r + c) % 2)) % 2 === 0,
];

/** Decode a matrix; throws with a reason on any structural or Reed-Solomon failure. */
export function decodeMatrix(matrix) {
  const size = matrix.length;
  if ((size - 17) % 4 !== 0 || size < 21) throw new Error(`Bad size ${size}`);
  const version = (size - 17) / 4, at = (r, c) => matrix[r][c];
  // Format copy 1: row 8 columns 0-5,7,8 then column 8 rows 7,5..0 (bit 14 first).
  const read = cells => cells.reduce((v, [r, c]) => (v << 1) | at(r, c), 0);
  const copy1 = read([[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]);
  const copy2Cells = [];
  for (let r = size - 1; r >= size - 7; r--) copy2Cells.push([r, 8]);
  for (let c = size - 8; c < size; c++) copy2Cells.push([8, c]);
  const copy2 = read(copy2Cells);
  let format = null;
  for (const [level, words] of Object.entries(FORMAT_WORDS)) words.forEach((word, mask) => {
    if (word === copy1) format = {level, mask};
  });
  if (!format) throw new Error(`Unknown format word ${copy1.toString(2)}`);
  if (copy2 !== copy1) throw new Error('Format copies differ');
  if (at(size - 8, 8) !== 1) throw new Error('Dark module missing');
  const reserved = Array.from({length: size}, () => new Array(size).fill(false));
  const mark = (r0, c0, h, w) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < size && c < size) reserved[r][c] = true; };
  mark(0, 0, 9, 9); mark(0, size - 8, 9, 8); mark(size - 8, 0, 8, 9);
  mark(6, 0, 1, size); mark(0, 6, size, 1);
  const centres = alignmentCentres(version);
  for (const r of centres) for (const c of centres) {
    if ((r < 9 && c < 9) || (r < 9 && c > size - 9) || (r > size - 9 && c < 9)) continue;
    mark(r - 2, c - 2, 5, 5);
  }
  if (version >= 7) {
    mark(0, size - 11, 6, 3); mark(size - 11, 0, 3, 6);
    let word = 0;
    for (let i = 17; i >= 0; i--) word = (word << 1) | at(Math.floor(i / 3), size - 11 + (i % 3));
    let other = 0;
    for (let i = 17; i >= 0; i--) other = (other << 1) | at(size - 11 + (i % 3), Math.floor(i / 3));
    if (word !== VERSION_WORDS[version] || other !== word) throw new Error(`Version word ${word.toString(16)} wrong`);
  }
  const bits = [], unmask = MASK_TESTS[format.mask];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) if (!reserved[r][c]) bits.push(at(r, c) ^ (unmask(r, c) ? 1 : 0));
    }
    upward = !upward;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  const groups = ISO_BLOCKS[format.level][version];
  const shapes = groups.flatMap(([n, total, data]) => Array.from({length: n}, () => ({total, data})));
  const expected = shapes.reduce((s, b) => s + b.total, 0);
  if (codewords.length !== expected) throw new Error(`Codeword count ${codewords.length} != ${expected}`);
  const blocks = shapes.map(() => []);
  let k = 0;
  const maxData = Math.max(...shapes.map(b => b.data));
  for (let i = 0; i < maxData; i++) shapes.forEach((b, j) => { if (i < b.data) blocks[j].push(codewords[k++]); });
  const ecCount = shapes[0].total - shapes[0].data;
  for (let i = 0; i < ecCount; i++) shapes.forEach((b, j) => blocks[j].push(codewords[k++]));
  blocks.forEach((block, j) => {
    if (syndromes(block, ecCount).some(Boolean)) throw new Error(`Reed-Solomon block ${j} has errors`);
  });
  const data = blocks.flatMap((block, j) => block.slice(0, shapes[j].data));
  const stream = data.flatMap(byte => Array.from({length: 8}, (_, i) => (byte >> (7 - i)) & 1));
  let pos = 0;
  const take = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | stream[pos++]; return v; };
  const mode = take(4);
  if (mode !== 0b0100) throw new Error(`Mode ${mode} is not byte mode`);
  const length = take(version <= 9 ? 8 : 16), bytes = [];
  for (let i = 0; i < length; i++) bytes.push(take(8));
  const rest = stream.length - pos;
  if (rest >= 4 && take(4) !== 0) throw new Error('Missing terminator');
  const padStart = Math.ceil(pos / 8);
  data.slice(padStart).forEach((byte, i) => {
    if (byte !== (i % 2 === 0 ? 0xec : 0x11)) throw new Error(`Bad pad byte ${byte} at ${i}`);
  });
  return {version, level: format.level, mask: format.mask, bytes: Uint8Array.from(bytes), text: new TextDecoder().decode(Uint8Array.from(bytes)), formatWord: copy1};
}
