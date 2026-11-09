// QR encoder: ISO 18004 known answers, structural patterns and a round trip through an independent reader.
import {describe, expect, it} from 'vitest';
import {encodeQr, drawQr, byteCapacity} from '../../src/lib/qr/index.js';
import {formatBits, versionBits, reedSolomon, totalCodewords, dataCodewords} from '../../src/lib/qr/encoder.js';
import {FORMAT_WORDS, VERSION_WORDS, alignmentCentres, decodeMatrix, syndromes} from './reference-decoder.js';

const JOIN_URL = 'https://the-great-plot-twist.vercel.app/?join=harbor';

describe('Reed-Solomon known answers', () => {
  it('matches the ISO/IEC 18004 Annex I example (01234567, 1-M)', () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(reedSolomon(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });
  it('matches the widely published HELLO WORLD 1-M codewords', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
  it('produces blocks whose syndromes are all zero', () => {
    const data = Array.from({length: 43}, (_, i) => (i * 37 + 11) & 255);
    expect(syndromes([...data, ...reedSolomon(data, 24)], 24).every(s => s === 0)).toBe(true);
  });
});

describe('format, version and capacity tables', () => {
  it('produces all 32 published format words', () => {
    for (const [level, words] of Object.entries(FORMAT_WORDS)) {
      words.forEach((word, mask) => expect(formatBits(level, mask), `${level}-${mask}`).toBe(word));
    }
  });
  it('produces the published version words for versions 7-10', () => {
    for (const [version, word] of Object.entries(VERSION_WORDS)) expect(versionBits(Number(version))).toBe(word);
  });
  it('agrees with ISO codeword totals and byte capacities', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(totalCodewords)).toEqual([26, 44, 70, 100, 134, 172, 196, 242, 292, 346]);
    expect(dataCodewords(1, 'M')).toBe(16);
    expect(dataCodewords(4, 'Q')).toBe(48);
    // ISO Table 7 byte-mode capacities.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => byteCapacity(v, 'M'))).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => byteCapacity(v, 'Q'))).toEqual([11, 20, 32, 46, 60, 74, 86, 108, 130, 151]);
    expect(byteCapacity(1, 'L')).toBe(17);
    expect(byteCapacity(10, 'H')).toBe(119);
  });
});

describe('function patterns', () => {
  const finder = [
    '1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111',
  ];
  const window = (m, r, c, h, w) => Array.from({length: h}, (_, i) => Array.from(m[r + i].slice(c, c + w)).join(''));
  for (const version of [1, 4, 7, 10]) {
    it(`draws finders, separators, timing, alignment and the dark module (version ${version})`, () => {
      const text = 'x'.repeat(byteCapacity(version, 'M'));
      const code = encodeQr(text, {ecc: 'M'});
      expect(code.version).toBe(version);
      const m = code.modules, n = code.size;
      expect(n).toBe(version * 4 + 17);
      expect(window(m, 0, 0, 7, 7)).toEqual(finder);
      expect(window(m, 0, n - 7, 7, 7)).toEqual(finder);
      expect(window(m, n - 7, 0, 7, 7)).toEqual(finder);
      for (let i = 0; i < 8; i++) {
        expect([m[7][i], m[i][7], m[7][n - 1 - i], m[i][n - 8], m[n - 8][i], m[n - 1 - i][7]]).toEqual([0, 0, 0, 0, 0, 0]);
      }
      for (let i = 8; i < n - 8; i++) {
        expect(m[6][i], `row timing ${i}`).toBe(i % 2 === 0 ? 1 : 0);
        expect(m[i][6], `column timing ${i}`).toBe(i % 2 === 0 ? 1 : 0);
      }
      expect(m[n - 8][8]).toBe(1);
      const centres = alignmentCentres(version);
      for (const r of centres) for (const c of centres) {
        if ((r < 9 && c < 9) || (r < 9 && c > n - 9) || (r > n - 9 && c < 9)) continue;
        expect(window(m, r - 2, c - 2, 5, 5), `alignment ${r},${c}`).toEqual(['11111', '10001', '10101', '10001', '11111']);
      }
    });
  }
  it('uses the ISO alignment centres', () => {
    expect(alignmentCentres(4)).toEqual([6, 26]);
    expect(alignmentCentres(7)).toEqual([6, 22, 38]);
    expect(alignmentCentres(10)).toEqual([6, 28, 50]);
  });
});

describe('round trip through the independent reader', () => {
  it('encodes the class-harbor join URL as a valid 4-M code', () => {
    const code = encodeQr(JOIN_URL);
    expect(code).toMatchObject({version: 4, ecc: 'M', size: 33});
    const decoded = decodeMatrix(code.modules);
    expect(decoded).toMatchObject({version: 4, level: 'M', mask: code.mask, text: JOIN_URL});
    expect(decoded.formatWord).toBe(FORMAT_WORDS.M[code.mask]);
  });
  it('encodes the join URL at level Q (version 5, two block sizes)', () => {
    const code = encodeQr(JOIN_URL, {ecc: 'Q'});
    expect(code.version).toBe(5);
    expect(decodeMatrix(code.modules).text).toBe(JOIN_URL);
  });
  it('decodes every level, version 1-10 and every forced mask', () => {
    for (const ecc of ['L', 'M', 'Q', 'H']) for (let version = 1; version <= 10; version++) {
      const text = Array.from({length: byteCapacity(version, ecc)}, (_, i) => String.fromCharCode(33 + ((i * 7 + version) % 90))).join('');
      const mask = (version + ecc.charCodeAt(0)) % 8;
      const code = encodeQr(text, {ecc, mask});
      expect([code.version, code.mask], `${version}-${ecc}`).toEqual([version, mask]);
      const decoded = decodeMatrix(code.modules);
      expect([decoded.text, decoded.level, decoded.mask], `${version}-${ecc}`).toEqual([text, ecc, mask]);
    }
  });
  it('round-trips UTF-8 and short payloads with every mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      expect(decodeMatrix(encodeQr('Café ⚓ harbor', {mask}).modules).text).toBe('Café ⚓ harbor');
      expect(decodeMatrix(encodeQr('', {mask}).modules).text).toBe('');
    }
  });
  it('is deterministic and chooses the same penalty-minimising mask every time', () => {
    expect(encodeQr(JOIN_URL)).toEqual(encodeQr(JOIN_URL));
  });
  it('refuses payloads beyond version 10 and bad options', () => {
    expect(() => encodeQr('y'.repeat(214))).toThrow('too long');
    expect(() => encodeQr('y'.repeat(213))).not.toThrow();
    expect(() => encodeQr('a', {ecc: 'X'})).toThrow('level');
    expect(() => encodeQr('a', {mask: 8})).toThrow('Mask');
  });
});

describe('drawQr on a canvas', () => {
  function fakeCanvas() {
    const calls = [];
    const context = {
      fillStyle: '', imageSmoothingEnabled: true,
      fillRect(x, y, w, h) { calls.push({fill: this.fillStyle, x, y, w, h}); },
    };
    return {canvas: {width: 0, height: 0, getContext: kind => (kind === '2d' ? context : null)}, calls, context};
  }
  it('sizes the canvas, paints the quiet zone and fills exactly the dark modules', () => {
    const {canvas, calls, context} = fakeCanvas();
    const result = drawQr(canvas, JOIN_URL, {scale: 6, margin: 4, colors: {dark: '#123', light: '#fed'}});
    expect(result).toMatchObject({version: 4, size: 33, pixels: (33 + 8) * 6});
    expect([canvas.width, canvas.height]).toEqual([246, 246]);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(calls[0]).toEqual({fill: '#fed', x: 0, y: 0, w: 246, h: 246});
    const painted = Array.from({length: 33}, () => new Uint8Array(33));
    for (const call of calls.slice(1)) {
      expect(call.fill).toBe('#123');
      expect(call.h).toBe(6);
      for (let x = call.x; x < call.x + call.w; x += 6) {
        const mx = x / 6 - 4, my = call.y / 6 - 4;
        expect(painted[my][mx]).toBe(0);
        painted[my][mx] = 1;
      }
    }
    expect(painted).toEqual(encodeQr(JOIN_URL).modules);
    expect(decodeMatrix(painted).text).toBe(JOIN_URL);
  });
  it('uses defaults and rejects a non-canvas', () => {
    const {canvas} = fakeCanvas();
    expect(drawQr(canvas, 'hi').pixels).toBe((21 + 8) * 8);
    expect(() => drawQr({}, 'hi')).toThrow('canvas');
  });
});
