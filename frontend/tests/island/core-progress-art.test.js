import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as core from '../../src/art/village/core.js';
import * as progress from '../../src/art/village/progress.js';
import {collectRasterFrames, normalizeRasterFrame} from '../../src/art/village-raster.js';

const frames = collectRasterFrames([core, progress]);
const source = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-05-hero/heart-bell-v2.json', import.meta.url)));
describe('core and progress native source contract', () => {
  it.each([
    [core.sheets.core.file.split('/').at(-1), ...source.nativeSize, source.bytes, source.sha256],
    ['progress-v1.png', 1774, 887, 1200780, 'e1bb8a1679dd6e0d53ff50b515f6e849f6f2cb93637d775827b4ebe023183636'],
  ])('uses the documented RGBA source %s', (file, width, height, bytes, digest) => {
    const png = readFileSync(new URL(`../../public/village/${file}`, import.meta.url));
    expect(png.length).toBe(bytes); expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(height);
    expect(png[25]).toBe(6); // PNG color type: RGBA.
    expect(createHash('sha256').update(png).digest('hex')).toBe(digest);
  });
  it('keeps all core states at one native scale and ground foot, including low rubble', () => {
    const calls = [], context = {setTransform() {}, drawImage: (...args) => calls.push(args)};
    vi.stubGlobal('document', {createElement: () => ({getContext: () => context})});
    try {
      for (const id of ['island_core', 'island_core_damaged', 'island_core_broken']) {
        const f = frames[id]; normalizeRasterFrame({}, f, 2);
        expect(f.rect).toEqual(source.cells[id].rect);
        expect(f.sourceFoot).toEqual(source.cells[id].sourceFoot);
        if (source.cells[id].frontOpening) expect(source.cells[id].frontOpening.alphaBelow16Fraction).toBeGreaterThan(.92);
        const args = calls.at(-1), scale = args[7] / f.rect[2];
        expect(args[5] + f.sourceFoot[0] * scale).toBeCloseTo(64);
        expect(args[6] + f.sourceFoot[1] * scale).toBeCloseTo(116);
      }
      const scales = calls.map(args => args[7] / args[3]);
      expect(scales[0]).toBeCloseTo(scales[1]); expect(scales[1]).toBeCloseTo(scales[2]);
      expect(calls[2][8]).toBeLessThan(calls[0][8] / 2); // rubble never grows to roof height.
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps related statue stages at one presentation scale and uses only blank local plaques', () => {
    expect(Object.keys(frames)).toHaveLength(8);
    for (let stage = 1; stage <= 4; stage++) {
      expect(frames[`island_statue_${stage}`].logical).toEqual([40, 56, 4]);
      expect(frames[`island_statue_${stage}`].fitBounds).toEqual(frames.island_statue_1.fitBounds);
    }
    expect(frames.island_record.logical).toEqual([40, 48, 4]);
    for (const frame of Object.values(frames)) expect(frame.sheet.file).toMatch(/^village\/.+\.png$/);
  });
});
