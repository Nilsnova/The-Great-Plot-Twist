// Protect the native sprite files (kept for the pixel tools and the places not yet redrawn), the shared
// logical geometry the cartoon art reuses, and the bounded framebuffer.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pixelArt, pixelArtIds, pixelSizes, snapPixel } from '../src/pixel/catalog.js';
import { artSizes, loadArt, placeArt } from '../src/world/art.js';
import { islandSizes } from '../src/art/registry.js';
import { frames as registeredFrames } from '../src/art/village/baked.js';
import { compiledHomeFoliage } from '../src/art/village/home-foliage.js';
import { getRasterFrame } from '../src/art/village-raster.js';
import { pixelViewport } from '../src/pixel/display.js';

describe('active pixel artwork', () => {
  it('registers every native PNG once and agrees with each file header', () => {
    expect([...pixelArt.map(item => item.file), 'ground.png'].sort()).toEqual(readdirSync('public/pixel').filter(name => name.endsWith('.png')).sort());
    expect(new Set(pixelArt.map(item => item.id)).size).toBe(pixelArt.length);
    // Native files keep their catalogue dimensions; D063/D064 explicitly revise some rendered boxes.
    expect(pixelArt.every(item => Object.hasOwn(artSizes, item.id))).toBe(true);
    const declared = new Set([
      ...pixelArt.map(item => item.id), ...Object.keys(islandSizes()),
      ...Object.keys(registeredFrames), ...Object.keys(compiledHomeFoliage.frames),
    ]);
    expect(Object.keys(artSizes).sort()).toEqual([...declared].sort());
    for (const item of pixelArt) {
      const bytes = readFileSync(`public/pixel/${item.file}`);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(item.width); expect(bytes.readUInt32BE(20)).toBe(item.height);
      const raster = getRasterFrame(item.id);
      if (raster) {
        const [width, height, anchor] = raster.logical;
        expect(artSizes[item.id]).toEqual([width / 16, height / 16, anchor / height]);
      } else {
        expect(artSizes[item.id][0] * 16).toBe(item.width); expect(artSizes[item.id][1] * 16).toBe(item.height);
        expect(artSizes[item.id]).toEqual(pixelSizes[item.id]);
      }
    }
  });
  it('keeps future harbour/mystery art out of the default island preload', () => {
    const staged = pixelArt.filter(item => item.usage === 'library');
    expect(staged.length).toBeGreaterThan(0);
    expect(staged.every(item => !pixelArtIds.includes(item.id))).toBe(true);
    expect(pixelArtIds).toHaveLength(36);
  });
  it('refuses unknown or unloaded sprites instead of a white rectangle', async () => {
    await expect(loadArt(['no-such-drawing'])).rejects.toThrow('Unknown drawing');
    await expect(loadArt(['toString'])).rejects.toThrow('Unknown drawing');
    await expect(loadArt('crate')).rejects.toThrow('array');
    expect(() => placeArt(null, {}, 'crate', 0, 0)).toThrow('Load drawing before placing');
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
