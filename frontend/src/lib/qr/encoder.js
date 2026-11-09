// Small dependency-free QR Code encoder (ISO/IEC 18004): byte mode, versions 1-10, levels L/M/Q/H.
// Written for the class-demo join code; enough capacity for a short URL.

export const MAX_VERSION = 10;
const LEVELS = {L: 1, M: 0, Q: 3, H: 2}; // two-bit format indicator per level
// Error-correction codewords per block and number of blocks, index = version (1-10).
const EC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) with the QR primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
export const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Generator polynomial coefficients (highest degree first, leading 1 dropped). */
function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** Reed-Solomon error-correction codewords for one block. */
export function reedSolomon(data, degree) {
  const gen = generator(degree), rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i], factor);
  }
  return rem;
}

export function totalCodewords(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    modules -= (25 * n - 10) * n - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}
export const dataCodewords = (version, ecc) => totalCodewords(version) - EC_PER_BLOCK[ecc][version] * BLOCKS[ecc][version];
const countBits = version => (version <= 9 ? 8 : 16);
/** Largest byte-mode payload (in bytes) for a version and level. */
export const byteCapacity = (version, ecc) => Math.floor((dataCodewords(version, ecc) * 8 - 4 - countBits(version)) / 8);

/** Format information: 5 data bits + BCH(15,5) remainder, XOR 0x5412. */
export function formatBits(ecc, mask) {
  const data = (LEVELS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
/** Version information (versions 7+): 6 data bits + BCH(18,6) remainder. */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function encodeData(bytes, version, ecc) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, countBits(version));
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords(version, ecc) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Split into blocks, append RS codewords and interleave. */
export function interleave(words, version, ecc) {
  const count = BLOCKS[ecc][version], degree = EC_PER_BLOCK[ecc][version], total = totalCodewords(version);
  const shortLength = Math.floor(total / count), shortBlocks = count - (total % count);
  const blocks = [];
  for (let i = 0, offset = 0; i < count; i++) {
    const length = shortLength - degree + (i < shortBlocks ? 0 : 1);
    const data = words.slice(offset, offset + length);
    offset += length;
    blocks.push({data, ec: reedSolomon(data, degree)});
  }
  const result = [];
  for (let i = 0; i <= shortLength - degree; i++) for (const block of blocks) if (i < block.data.length) result.push(block.data[i]);
  for (let i = 0; i < degree; i++) for (const block of blocks) result.push(block.ec[i]);
  return result;
}

class Grid {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.dark = Array.from({length: this.size}, () => new Uint8Array(this.size));
    this.fixed = Array.from({length: this.size}, () => new Uint8Array(this.size));
  }
  set(x, y, dark) { this.dark[y][x] = dark ? 1 : 0; this.fixed[y][x] = 1; }
  drawFunctionPatterns() {
    const {size, version} = this;
    for (let i = 0; i < size; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) this.set(x, y, d !== 2 && d !== 4);
      }
    }
    const positions = ALIGNMENT[version], last = positions.length - 1;
    for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        this.set(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    this.drawFormat(0); // reserve; overwritten after mask choice
    if (version >= 7) {
      const bits = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = (bits >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        this.set(a, b, bit); this.set(b, a, bit);
      }
    }
  }
  drawFormat(bits) {
    const {size} = this, bit = i => (bits >>> i) & 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6)); this.set(8, 8, bit(7)); this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, 1); // dark module
  }
  placeCodewords(words) {
    const {size} = this;
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step++) {
        for (let k = 0; k < 2; k++) {
          const x = right - k, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - step : step;
          if (this.fixed[y][x]) continue;
          const word = words[index >>> 3];
          this.dark[y][x] = word === undefined ? 0 : (word >>> (7 - (index & 7))) & 1;
          index++;
        }
      }
    }
  }
  applyMask(mask) {
    const test = MASKS[mask];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      if (!this.fixed[y][x] && test(x, y)) this.dark[y][x] ^= 1;
    }
  }
  penalty() {
    const {size, dark} = this;
    let score = 0, total = 0;
    const lines = [];
    for (let i = 0; i < size; i++) {
      lines.push(Array.from({length: size}, (_, j) => dark[i][j]));
      lines.push(Array.from({length: size}, (_, j) => dark[j][i]));
    }
    const finderLike = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
    for (const line of lines) {
      for (let i = 0, run = 1; i < size; i++) {
        if (i + 1 < size && line[i + 1] === line[i]) { run++; continue; }
        if (run >= 5) score += run - 2;
        run = 1;
      }
      for (let i = 0; i + 11 <= size; i++) {
        for (const pattern of finderLike) if (pattern.every((v, k) => line[i + k] === v)) score += 40;
      }
    }
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
      const c = dark[y][x];
      if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
    }
    for (const row of dark) for (const v of row) total += v;
    const k = Math.ceil(Math.abs(total * 20 - size * size * 10) / (size * size)) - 1;
    return score + Math.max(0, k) * 10;
  }
}

/**
 * Encode text (UTF-8, byte mode) as a QR Code.
 * @returns {{version:number, ecc:string, mask:number, size:number, modules:Uint8Array[]}}
 * modules[y][x] is 1 for a dark module.
 */
export function encodeQr(text, {ecc = 'M', minVersion = 1, maxVersion = MAX_VERSION, mask = null} = {}) {
  if (!(ecc in LEVELS)) throw new Error(`Unknown error-correction level ${ecc}`);
  if (mask !== null && !(Number.isInteger(mask) && mask >= 0 && mask < 8)) throw new Error('Mask must be 0-7');
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : Uint8Array.from(text);
  const top = Math.min(maxVersion, MAX_VERSION);
  let version = Math.max(1, minVersion);
  while (version <= top && bytes.length > byteCapacity(version, ecc)) version++;
  if (version > top) throw new Error(`Text too long for a version ${top} QR code (${bytes.length} bytes)`);
  const words = interleave(encodeData(bytes, version, ecc), version, ecc);
  const build = choice => {
    const grid = new Grid(version);
    grid.drawFunctionPatterns();
    grid.placeCodewords(words);
    grid.applyMask(choice);
    grid.drawFormat(formatBits(ecc, choice));
    return grid;
  };
  let best = null, bestMask = 0;
  for (const choice of mask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask]) {
    const grid = build(choice), score = mask === null ? grid.penalty() : 0;
    if (!best || score < best.score) { best = {grid, score}; bestMask = choice; }
  }
  return {version, ecc, mask: bestMask, size: best.grid.size, modules: best.grid.dark};
}
