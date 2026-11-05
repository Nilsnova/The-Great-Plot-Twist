// Protect native sprite files, one pixel density and integer display magnification.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pixelArt, pixelArtIds, snapPixel } from '../src/pixel/catalog.js';
import { artSizes } from '../src/world/art.js';
import { pixelViewport } from '../src/pixel/display.js';

describe('active pixel artwork', () => {
  it('registers every native PNG once and agrees with each file header', () => {
    expect([...pixelArt.map(item => item.file), 'ground.png'].sort()).toEqual(readdirSync('public/pixel').filter(name => name.endsWith('.png')).sort());
    expect(new Set(pixelArtIds).size).toBe(pixelArt.length);
    expect(Object.keys(artSizes).sort()).toEqual([...pixelArtIds].sort());
    for (const item of pixelArt) {
      const bytes = readFileSync(`public/pixel/${item.file}`);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(item.width); expect(bytes.readUInt32BE(20)).toBe(item.height);
      expect(artSizes[item.id][0] * 16).toBe(item.width); expect(artSizes[item.id][1] * 16).toBe(item.height);
    }
  });
  it('uses whole CSS scale factors with at most a one-scale-unit edge gap', () => {
    for (const [width, height] of [[1440, 900], [1600, 1000], [1920, 1080], [1365, 768]]) {
      const view = pixelViewport(width, height);
      expect(Number.isInteger(view.scale)).toBe(true); expect(view.scale).toBeGreaterThan(0);
      expect(width - view.width * view.scale).toBeLessThan(view.scale);
      expect(height - view.height * view.scale).toBeLessThan(view.scale);
    }
  });
  it('snaps motion to the same grid while keeping less than half a pixel error', () => {
    for (const value of [-7.213, -.02, 0, 3.14, 16.79]) {
      expect(Number.isInteger(snapPixel(value) * 16)).toBe(true);
      expect(Math.abs(snapPixel(value) - value)).toBeLessThanOrEqual(1 / 32);
    }
  });
});
