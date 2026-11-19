// Protect the authored source/normalization boundary; runtime provider parity is covered by VIS-32.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/buildings.js';
import {islandFrame} from '../../src/art/registry.js';

const source = readFileSync(new URL(`../../public/${sheets.buildingsHero.file}`, import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-05-hero/fixed-buildings-v2.json', import.meta.url)));
const cabin = report.cells.cabin;

describe('approved cabin source', () => {
  it('is the inspected transparent PNG with its declared native dimensions', () => {
    expect(source.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(source[25]).toBe(6); // RGBA, not an opaque RGB matte.
    expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual([sheets.buildingsHero.width, sheets.buildingsHero.height]);
    expect(createHash('sha256').update(source).digest('hex')).toBe(report.sha256);
    expect(report.alpha.corners).toEqual([0, 0, 0, 0]);
  });

  it('keeps the real cabin geometry while selecting a bounded native source', () => {
    const {rect, sourceFoot, logical, fitBounds} = frames.cabin;
    expect(logical).toEqual(islandFrame('cabin').slice(0, 3));
    expect(frames.cabin.sheet in sheets).toBe(true);
    expect(rect[0] + rect[2]).toBeLessThanOrEqual(sheets.buildingsHero.width);
    expect(rect[1] + rect[3]).toBeLessThanOrEqual(sheets.buildingsHero.height);
    expect(sourceFoot[0]).toBeGreaterThan(0);
    expect(sourceFoot[0]).toBeLessThan(rect[2]);
    expect(sourceFoot[1]).toBeGreaterThan(0);
    expect(sourceFoot[1]).toBeLessThan(rect[3]);
    expect([rect[0] + sourceFoot[0], rect[1] + sourceFoot[1]]).toEqual(cabin.nativeGroundFoot);
    const [leftSpace, topSpace, rightSpace, bottomSpace] = fitBounds;
    const scale = Math.min(logical[0] / 2 / leftSpace, (logical[1] - logical[2]) / topSpace,
      logical[0] / 2 / rightSpace, logical[2] / bottomSpace);
    const shift = [logical[0] / 2 - sourceFoot[0] * scale, logical[1] - logical[2] - sourceFoot[1] * scale];
    const [left, top, right, bottom] = cabin.solidBounds;
    expect((left - rect[0]) * scale + shift[0]).toBeGreaterThanOrEqual(0);
    expect((top - rect[1]) * scale + shift[1]).toBeGreaterThanOrEqual(0);
    expect((right - rect[0]) * scale + shift[0]).toBeLessThanOrEqual(logical[0]);
    expect((bottom - rect[1]) * scale + shift[1]).toBeLessThanOrEqual(logical[1]);
  });
});
