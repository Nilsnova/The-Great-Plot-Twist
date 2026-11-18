// Cross-consumer guards ensure the review sheet cannot hide a missing tier or a combat-art fallback.
import {describe, expect, it} from 'vitest';
import {DEFENSES, LEVELS, defenseCases, buildingCases, wallCases} from '../../scripts/visual-matrix-cases.js';
import {getRasterFrame} from '../../src/art/village-raster.js';
import {buildingArt, LEVEL_ART} from '../../src/island/world.js';
import {wallTopology} from '../../src/island/wall-connections.js';

describe('complete existing village review cases', () => {
  it('selects all 100 real combat defense poses and agrees with the village for intact frames', () => {
    const ids = new Set();
    for (const kind of DEFENSES) for (const row of defenseCases(kind)) for (const [index, cell] of row.cells.entries()) {
      const level = index + 1, suffix = level === 1 ? '' : `-l${level}`;
      const expected = row.label === 'fire' ? `island-${kind}-fire${suffix}`
        : `island-${kind}${suffix}${row.label === 'intact' ? '' : `-${row.label}`}`;
      expect(cell.id).toBe(expected); ids.add(cell.id);
      expect(getRasterFrame(cell.id)?.sheet.file, cell.id).toMatch(/^village\/shipped\/.+\.webp$/);
      expect(getRasterFrame(cell.id)?.logical, cell.id).toEqual([56, 48, 7]);
      if (row.label === 'intact') expect(buildingArt(kind, level)).toBe(cell.id);
    }
    expect(ids.size).toBe(100);
    expect(() => defenseCases('watchtower')).toThrow('existing defense');
  });
  it('retains canonical house caps, role availability, watchtower aliases and all core health states', () => {
    const rows = buildingCases();
    expect(LEVEL_ART.house).toHaveLength(3);
    for (const row of rows.slice(0, 4)) {
      expect(row.cells).toHaveLength(3);
      expect(row.cells[0].id).toBe('island-house');
      expect(new Set(row.cells.map(cell => cell.id)).size).toBe(3);
    }
    expect(rows.find(row => row.label === 'watchtower').cells.map(cell => cell.id)).toEqual([
      'island-watchtower', 'island-watchtower', 'island-watchtower', 'island-watchtower-l4', 'island-watchtower-l5',
    ]);
    expect(rows.find(row => row.label === 'core').cells.map(cell => cell.id)).toEqual([
      'island_core', 'island_core_damaged', 'island_core_broken',
    ]);
    for (const {cells} of rows) for (const {id} of cells) expect(getRasterFrame(id), id).not.toBeNull();
  });
  it.each(LEVELS)('exercises an inner divider, straight selection, mixed joins and a real breach at level %s', level => {
    const rows = wallCases(level), byState = Object.fromEntries(rows.map(row => [row.label, row]));
    expect(rows.map(row => row.label)).toEqual(['intact', 'damaged', 'broken', 'selected', 'mixed']);
    const before = structuredClone(rows), intact = wallTopology(byState.intact.spots);
    expect(intact.links).toHaveLength(15);
    expect(intact.links.filter(link => [link.a, link.b].includes('wall_13'))).toHaveLength(3);
    expect(intact.links.filter(link => [link.a, link.b].includes(byState.selected.selected))).toHaveLength(2);
    expect(wallTopology(byState.damaged.spots).links).toEqual(intact.links);
    const breach = wallTopology(byState.broken.spots).links;
    expect(breach).toHaveLength(13);
    expect(breach.some(link => link.a === 'wall_3' || link.b === 'wall_3')).toBe(false);
    const mixed = byState.mixed.spots;
    for (const link of wallTopology(mixed).links) expect(link.level).toBe(Math.min(
      mixed.find(spot => spot.id === link.a).level, mixed.find(spot => spot.id === link.b).level,
    ));
    expect(rows).toEqual(before);
    expect(() => wallCases(6)).toThrow('1–5');
  });
});
