// Activation must ship every configured source while preserving unused authoring originals.
import {readFileSync, existsSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import * as baked from '../../src/art/village/baked.js';
import {collectRasterFrames, getRasterFrame} from '../../src/art/village-raster.js';
import {UNSHIPPED, unshipped} from '../../scripts/unshipped-art.js';
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-30-world-art/bake-report.json', import.meta.url)));
const raw = collectRasterFrames(await Promise.all(report.families.map(name => import(`../../src/art/village/${name}.js`))));

describe('compiled world art production activation', () => {
  it('activates exactly the proved authoring IDs and their compiled rects, feet and logical dimensions', () => {
    expect(Object.keys(baked.frames).sort()).toEqual(Object.keys(raw).sort());
    for (const [id, frame] of Object.entries(baked.frames)) {
      const active = getRasterFrame(id);
      expect(active, id).toMatchObject({rect: frame.rect, sourceFoot: frame.sourceFoot, logical: raw[id].logical,
        sheet: baked.sheets[frame.sheet]});
    }
  });

  it('preserves every original source on disk and excludes exactly those inactive originals from downloads', () => {
    const originals = report.original.files.map(row => row.file).sort();
    expect(UNSHIPPED.filter(file => file.startsWith('village/')).sort()).toEqual(originals);
    for (const file of originals) {
      expect(existsSync(new URL(`../../public/${file}`, import.meta.url)), file).toBe(true);
      expect(unshipped(file), file).toBe(true);
    }
    for (const {file} of Object.values(baked.sheets)) {
      expect(existsSync(new URL(`../../public/${file}`, import.meta.url)), file).toBe(true);
      expect(unshipped(file), file).toBe(false);
      expect(report.compiled.files.some(row => row.file === file), file).toBe(true);
    }
    expect(unshipped('village/terrain-materials-v1.png')).toBe(false);
  });
});
