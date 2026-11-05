// Protect the art catalogue, selective loading and collision-safe island additions.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { catalog, assetById, islandArtIds, categories, roadmapFeatures } from '../src/assets/catalog.js';
import { loadArt, placeArt } from '../src/world/art.js';
import { decorationPlacements } from '../src/world/decorations.js';
import { zones } from '../src/world/zones.js';
import { canStand } from '../src/player/collision.js';
import { getBuildingColliders } from '../src/world/buildings.js';

describe('asset library contract', () => {
  it('registers every SVG once with safe filenames and usable dimensions/anchors', () => {
    const files = readdirSync('public/art').filter(name => name.endsWith('.svg')).sort();
    expect(catalog.map(item => item.file).sort()).toEqual(files);
    expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
    for (const item of catalog) {
      expect(item.id).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
      expect(item.label.length).toBeGreaterThan(3);
      expect(categories[item.category]).toBeTruthy();
      expect(['island', 'library', 'css']).toContain(item.usage);
      expect(item.size[0]).toBeGreaterThan(0); expect(item.size[1]).toBeGreaterThan(0);
      expect(item.size[2]).toBeGreaterThanOrEqual(0); expect(item.size[2]).toBeLessThanOrEqual(1);
      expect(item.roadmap.length).toBeGreaterThan(0);
      item.roadmap.forEach(feature => expect(roadmapFeatures[feature]).toBeTruthy());
      const svg = readFileSync(`public/art/${item.file}`, 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/<(script|foreignObject|image|iframe)\b|\bon[a-z]+\s*=/i);
      expect(svg).not.toMatch(/(?:href|xlink:href)\s*=\s*["'](?!#)|data:image/i);
    }
  });
  it('covers every roadmap area while keeping all staged artwork out of island preload', () => {
    for (const feature of Object.keys(roadmapFeatures)) expect(catalog.some(item => item.roadmap.includes(feature))).toBe(true);
    expect(catalog.filter(item => item.usage === 'library').every(item => !islandArtIds.includes(item.id))).toBe(true);
    expect(islandArtIds.length).toBeLessThan(catalog.length / 2);
    for (const item of decorationPlacements) expect(assetById[item.id].usage).toBe('island');
  });
  it('refuses unknown or unloaded drawings instead of silently drawing a white rectangle', async () => {
    await expect(loadArt(['no-such-drawing'])).rejects.toThrow('Unknown drawing');
    await expect(loadArt(['toString'])).rejects.toThrow('Unknown drawing');
    await expect(loadArt('crate')).rejects.toThrow('array');
    expect(() => placeArt(null, {}, 'crate', 0, 0)).toThrow('Load drawing before placing');
  });
  it('keeps the original story stand points clear after placing coastal props', () => {
    const extra = decorationPlacements.filter(item => item.collider).map(item => ({ x: item.x, z: item.z, ...item.collider }));
    const colliders = [...getBuildingColliders(), ...extra];
    for (const zone of zones) expect(canStand(zone.x, zone.z, colliders), zone.id).toBe(true);
  });
});
