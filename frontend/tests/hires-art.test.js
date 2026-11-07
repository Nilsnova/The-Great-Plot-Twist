// More texels must never enlarge the player, move doors, or change collision geometry.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DETAIL_DENSITY, pixelArtIds, pixelById, titleBackdrop } from '../src/pixel/catalog.js';
import { artSizes, loadArt, placeArt } from '../src/world/art.js';
import { loadTexture } from '../src/world/texture.js';

vi.mock('../src/world/texture.js', () => ({ loadTexture: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const manifest = JSON.parse(readFileSync('public/pixel/hd/manifest.json'));
const release = art => Object.values(art).forEach(material => { material.map.dispose(); material.dispose(); });

describe('detailed original artwork', () => {
  it('ships a complete four-density island kit with verified physical files', () => {
    expect(DETAIL_DENSITY).toBe(4);
    expect(Object.keys(manifest.assets).sort()).toEqual([...pixelArtIds].sort());
    expect(readdirSync('public/pixel/hd').filter(name => name.endsWith('.png')).sort())
      .toEqual([...pixelArtIds.map(id => `${id}.png`), 'ground.png'].sort());
    for (const id of pixelArtIds) {
      const item = pixelById[id], physical = item.detail, row = manifest.assets[id];
      const bytes = readFileSync(`public/pixel/${physical.file}`);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([physical.width, physical.height]);
      expect([physical.width, physical.height]).toEqual([item.width * 4, item.height * 4]);
      expect([physical.width / artSizes[id][0], physical.height / artSizes[id][1]]).toEqual([64, 64]);
      expect(bytes.length).toBe(row.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
    }
    const ground = readFileSync(`public/${manifest.ground.file}`);
    expect([ground.readUInt32BE(16), ground.readUInt32BE(20)]).toEqual([4096, 3072]);
    expect(createHash('sha256').update(ground).digest('hex')).toBe(manifest.ground.sha256);
    // Limits defend both transfer and decoded GPU memory, not just compressed file size.
    const rows = [...Object.values(manifest.assets), manifest.ground];
    expect(rows.reduce((total, item) => total + item.bytes, 0)).toBeLessThan(550_000);
    expect(rows.reduce((total, item) => total + item.width * item.height * 4, 0)).toBeLessThan(64 * 1024 * 1024);
    expect(titleBackdrop.file).toBe('places/title.webp');
    expect(readFileSync(`public/${titleBackdrop.file}`).length).toBeLessThan(350_000);
  });

  it('selects detail sources while preserving ordinary library art and the legacy option', async () => {
    loadTexture.mockImplementation(async () => new THREE.Texture());
    const art = await loadArt(['explorer', 'cottage', 'market-hall', 'explorer']);
    expect(loadTexture.mock.calls.map(([url]) => url)).toEqual([
      '/pixel/hd/explorer.png', '/pixel/hd/cottage.png', '/pixel/market-hall.png',
    ]);
    expect(Object.keys(art)).toHaveLength(3);
    release(art);
    loadTexture.mockClear();
    const legacy = await loadArt(['explorer'], { detail: false });
    expect(loadTexture).toHaveBeenCalledWith('/pixel/explorer.png', expect.any(THREE.TextureLoader));
    release(legacy);
  });

  it('keeps every detailed sprite at the original size and foot anchor', async () => {
    loadTexture.mockImplementation(async () => new THREE.Texture());
    const art = await loadArt();
    const scene = new THREE.Scene();
    for (const id of pixelArtIds) {
      const mesh = placeArt(scene, art, id, 0, 0), [width, height, anchor] = artSizes[id];
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(width);
      expect(bounds.max.y - bounds.min.y).toBeCloseTo(height);
      expect(bounds.min.y).toBeCloseTo(-height * anchor);
      mesh.geometry.dispose();
    }
    release(art);
  });

  it('releases loaded detailed textures when a sibling load fails', async () => {
    const texture = new THREE.Texture(), dispose = vi.spyOn(texture, 'dispose');
    loadTexture.mockImplementation(async url => {
      if (url.endsWith('/cottage.png')) throw new Error('test missing drawing');
      return texture;
    });
    await expect(loadArt(['explorer', 'cottage'])).rejects.toThrow('test missing drawing');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
