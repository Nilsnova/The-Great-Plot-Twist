import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {TERRAIN_MATERIALS, TERRAIN_SHEET, materialCells, meadowScale} from '../../src/art/village/terrain-materials.js';
import {surfaces} from '../../src/world/places/surfaces.js';
import {cliffProfile} from '../../src/art/coast-cliffs.js';

describe('original terrain source mapping', () => {
  it('maps four separate inset source regions inside the actual committed PNG', () => {
    const data = readFileSync(`public/${TERRAIN_SHEET.file}`);
    expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    expect([TERRAIN_SHEET.width, TERRAIN_SHEET.height]).toEqual([width, height]);
    const regions = Object.values(TERRAIN_MATERIALS).map(material => material.rect);
    for (const [x, y, w, h] of regions) {
      expect(x).toBeGreaterThan(0); expect(y).toBeGreaterThan(0);
      expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThan(width); expect(y + h).toBeLessThan(height);
    }
    for (let a = 0; a < regions.length; a++) for (let b = a + 1; b < regions.length; b++) {
      const [ax, ay, aw, ah] = regions[a], [bx, by, bw, bh] = regions[b];
      expect(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay).toBe(true);
    }
  });
  it('keeps visible cells identical when a different region or resolution is painted', () => {
    const large = materialCells('grass'), small = materialCells('grass', {left: -8, top: -5.76, right: 8, bottom: 5.76});
    expect(small.length).toBeGreaterThan(0);
    for (const cell of small) expect(large).toContainEqual(cell);
    for (const name of Object.keys(TERRAIN_MATERIALS)) {
      const cells = materialCells(name);
      expect(cells.length).toBeLessThan(400);
      expect(cells.some(cell => cell.x <= -32 && cell.x + cell.width > -32)).toBe(true);
      expect(cells.some(cell => cell.y <= -24 && cell.y + cell.height > -24)).toBe(true);
      expect(cells.some(cell => cell.x < 32 && cell.x + cell.width >= 32)).toBe(true);
      expect(cells.some(cell => cell.y < 24 && cell.y + cell.height >= 24)).toBe(true);
    }
  });
  it('keeps the richer meadow inside analytic land and the existing approaches sandy', () => {
    const before = structuredClone(surfaces), profile = cliffProfile(surfaces.home_islet);
    for (let i = 0; i < profile.length; i++) {
      const angle = i / 180 * Math.PI * 2, scale = meadowScale(angle);
      expect(scale).toBeGreaterThanOrEqual(.86);
      expect(scale * 1.012).toBeLessThan(1); // Includes the original meadow's maximum edge wobble.
    }
    for (const angle of [0, Math.PI / 2, Math.PI]) expect(meadowScale(angle)).toBeCloseTo(.86, 12);
    expect(meadowScale(Math.PI / 4)).toBeGreaterThan(.98);
    expect(surfaces).toEqual(before);
  });
});
