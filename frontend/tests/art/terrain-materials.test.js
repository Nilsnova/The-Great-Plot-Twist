import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {TERRAIN_MATERIALS, TERRAIN_SHEET, TERRAIN_SOURCE_SHEET, materialCells, meadowScale} from '../../src/art/village/terrain-materials.js';
import {shippedTerrain} from '../../src/art/village/shipped.js';
import {sheetHeader} from '../../src/art/village-decode.js';
import {surfaces} from '../../src/world/places/surfaces.js';
import {cliffProfile} from '../../src/art/coast-cliffs.js';

describe('original terrain source mapping', () => {
  it.each([['authored PNG', TERRAIN_SOURCE_SHEET, 'png', Object.values(TERRAIN_MATERIALS).map(material => material.rect)],
    ['shipped WebP', TERRAIN_SHEET, 'webp', Object.keys(TERRAIN_MATERIALS).map(name => shippedTerrain.rects[name])]])('maps four separate inset regions inside the actual committed %s', (_label, sheet, type, regions) => {
    const data = readFileSync(`public/${sheet.file}`), header = sheetHeader(new DataView(data.buffer, data.byteOffset, data.byteLength));
    expect(header?.type).toBe(type);
    const {width, height} = header;
    expect([sheet.width, sheet.height]).toEqual([width, height]);
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
