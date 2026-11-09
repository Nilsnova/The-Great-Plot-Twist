// G29 cutscene art: every registered file exists, matches its header and checksum, and the set stays in budget.
import {readFileSync, readdirSync} from 'node:fs';
import {crc32} from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {CUTSCENE_PIXEL_SCALE, cutsceneArt, cutscenePath, titleLampOrigin, titleLayers} from '../src/cutscenes/art.js';

const BUDGET = 1_500_000;
const manifest = JSON.parse(readFileSync('public/cutscenes/manifest.json', 'utf8'));
const entries = [...Object.entries(cutsceneArt), ...titleLayers.map(layer => [`title-${layer.id}`, layer])];

/** Width, height and alpha from a WebP header (VP8L lossless or VP8X extended). */
function webpInfo(bytes) {
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  const chunk = bytes.subarray(12, 16).toString();
  if (chunk === 'VP8L') {
    expect(bytes[20]).toBe(0x2f);
    const bits = bytes.readUInt32LE(21);
    return {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean((bits >>> 28) & 1), lossless: true};
  }
  expect(chunk).toBe('VP8X');
  return {width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1, alpha: Boolean(bytes[20] & 0x10), lossless: false};
}

describe('cutscene art registry', () => {
  it('registers the four cutscenes and five title planes, and nothing unregistered ships', () => {
    expect(Object.keys(cutsceneArt)).toEqual(['lore-intro', 'arrival', 'keepers-lock', 'lamps-relight']);
    expect(titleLayers.map(layer => layer.id)).toEqual(['sky', 'far-cliffs', 'sea', 'lighthouse', 'foreground']);
    const shipped = readdirSync('public/cutscenes').filter(name => name.endsWith('.webp')).sort();
    expect(shipped).toEqual(entries.map(([, item]) => item.file.replace('cutscenes/', '')).sort());
  });

  it('matches every file header, size and recorded CRC-32', () => {
    for (const [id, item] of entries) {
      const bytes = readFileSync(`public/${item.file}`);
      expect(bytes.length, id).toBe(item.bytes);
      expect(crc32(bytes), id).toBe(manifest.files[id].crc32);
      const info = webpInfo(bytes);
      expect([info.width, info.height], id).toEqual([item.width, item.height]);
      expect(info.lossless, id).toBe(true);
      expect(item.width % CUTSCENE_PIXEL_SCALE + item.height % CUTSCENE_PIXEL_SCALE, id).toBe(0);
    }
  });

  it('keeps the frames 16:9 and the title planes wide enough to drift', () => {
    for (const item of Object.values(cutsceneArt)) expect(item.width / item.height).toBeCloseTo(16 / 9, 5);
    for (const layer of titleLayers) {
      expect(layer.height).toBe(720);
      expect(layer.width).toBeGreaterThan(1280);
    }
    expect(titleLayers.map(layer => layer.depth)).toEqual([...titleLayers.map(layer => layer.depth)].sort((a, b) => a - b));
  });

  it('makes every title plane after the sky transparent', () => {
    const alpha = titleLayers.map(layer => webpInfo(readFileSync(`public/${layer.file}`)).alpha);
    expect(alpha).toEqual([false, true, true, true, true]);
  });

  it('stays inside the 1.5 MB lazy-load budget', () => {
    const total = entries.reduce((sum, [, item]) => sum + item.bytes, 0);
    expect(total).toBe(manifest.totalBytes);
    expect(total).toBeLessThanOrEqual(BUDGET);
  });

  it('resolves ids and refuses unknown ones', () => {
    expect(cutscenePath('arrival')).toBe('cutscenes/arrival.webp');
    expect(cutscenePath('sea')).toBe('cutscenes/title-sea.webp');
    expect(() => cutscenePath('toString')).toThrow('Unknown cutscene art');
    const lighthouse = titleLayers.find(layer => layer.id === 'lighthouse');
    expect(titleLampOrigin.x).toBeGreaterThan(0);
    expect(titleLampOrigin.x).toBeLessThan(lighthouse.width);
    expect(titleLampOrigin.y).toBeLessThan(lighthouse.height / 2);
  });

  it('is never part of the cold title: no index.html or eager shell code references it', () => {
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/cutscenes\//);
  });
});
