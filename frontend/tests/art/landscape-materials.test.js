// Presentation changes retain the authored source regions and canonical ground boundaries.
import {createHash} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {cliffProfile} from '../../src/art/coast-cliffs.js';
import {surfaces} from '../../src/world/places/surfaces.js';
import {TERRAIN_MATERIALS, materialCells, pathMaterialMask} from '../../src/art/village/terrain-materials.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('landscape material follow-up', () => {
  it('keeps the exact original four inset source crops without shipping a new texture', () => {
    expect(Object.fromEntries(Object.entries(TERRAIN_MATERIALS).map(([name, row]) => [name, row.rect])))
      .toEqual({grass: [1, 1, 625, 625], path: [628, 1, 625, 625],
        rock: [1, 628, 625, 625], sand: [628, 628, 625, 625]});
  });

  it('uses modestly larger pavers at stable world anchors, independent of the clipped region', () => {
    const expected = {x: 0, y: 0, width: 5.5, height: 3.96, flipX: false, flipY: false};
    const whole = materialCells('path'), detail = materialCells('path', {left: 0, top: 0, right: 5, bottom: 3});
    expect(detail).toEqual([expected]);
    expect(whole).toContainEqual(expected);
    expect(materialCells('path', {left: -5.5, top: -3.96, right: 0, bottom: 0}))
      .toEqual([{...expected, x: -5.5, y: -3.96}]);
  });

  it('retains every original cliff point and logical land value from the pinned base', () => {
    // Independent source-6c87b8dc receipts; changing the paint must not alter either boundary.
    expect(hash(cliffProfile(surfaces.home_islet)))
      .toBe('ae9f508e33801919cd8d7a9adc9587a226c6a9e04910ad747c5082cade395e65');
    expect(hash(surfaces)).toBe('3daf6aa373417ebedbf0c032584e25c9bee8386b4e11324d61a4b02d529c36a5');
  });

  it('changes paver sampling without widening the existing path or its clearing', () => {
    class RecordingPath {
      calls = [];
      moveTo(...p) { this.calls.push(['move', ...p]); }
      lineTo(...p) { this.calls.push(['line', ...p]); }
      closePath() { this.calls.push(['close']); }
      arc(...p) { this.calls.push(['arc', ...p]); }
      ellipse(...p) { this.calls.push(['ellipse', ...p]); }
    }
    vi.stubGlobal('Path2D', RecordingPath);
    try {
      const mask = pathMaterialMask({lines: [[[0, 0], [2, 0]]], clearings: [[5, 4, 3]]});
      expect(mask.calls).toEqual([
        ['move', 0, 1.02], ['line', 0, -1.02], ['line', 2, -1.02], ['line', 2, 1.02], ['close'],
        ['move', 1.02, 0], ['arc', 0, 0, 1.02, 0, Math.PI * 2],
        ['move', 3.02, 0], ['arc', 2, 0, 1.02, 0, Math.PI * 2],
        ['move', 8, 2.88], ['ellipse', 5, 2.88, 3, 2.16, 0, 0, Math.PI * 2],
      ]);
    } finally { vi.unstubAllGlobals(); }
  });
});
