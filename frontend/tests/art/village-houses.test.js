// Match original source cells to actual supported house/role identities and fixed logical feet.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/houses.js';
import {buildingArt} from '../../src/island/world.js';
import {ROLE_IDS} from '../../src/campaign/houses.js';
import {islandFrame} from '../../src/art/registry.js';

const source = readFileSync(new URL('../../public/village/houses-v1.png', import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-06-houses/asset-report.json', import.meta.url)));

describe('approved house family source', () => {
  it('uses the inspected RGBA sheet and exact declared dimensions', () => {
    expect(source.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(source[25]).toBe(6);
    expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual([sheets.villageHouses.width, sheets.villageHouses.height]);
    expect(createHash('sha256').update(source).digest('hex')).toBe(report.sha256);
    expect(report.alpha.corners.every(alpha => alpha < report.alpha.transparentNoiseThreshold)).toBe(true);
  });

  it('covers every actual supported neutral and role level without aliasing their cells', () => {
    const expected = [1, 2, 3].map(level => buildingArt('house', level));
    for (const role of ROLE_IDS) for (const level of [2, 3]) expected.push(buildingArt('house', level, role));
    expect(Object.keys(frames).sort()).toEqual(expected.sort());
    expect(new Set(Object.values(frames).map(frame => frame.rect.join(','))).size).toBe(expected.length);
    for (const [id, frame] of Object.entries(frames)) expect(frame.logical, id).toEqual(islandFrame(id).slice(0, 3));
  });

  it('keeps the measured foot and all solid source details inside each transparent cell', () => {
    for (const cell of report.cells) {
      const frame = frames[cell.id], sheet = sheets[frame.sheet];
      expect(frame.rect).toEqual(cell.rect);
      expect(frame.sourceFoot).toEqual(cell.sourceFoot);
      expect(frame.rect[0] + frame.rect[2]).toBeLessThanOrEqual(sheet.width);
      expect(frame.rect[1] + frame.rect[3]).toBeLessThanOrEqual(sheet.height);
      const [left, top, right, bottom] = cell.solidBounds;
      expect(Math.min(left, top)).toBeGreaterThanOrEqual(8);
      expect(Math.max(right, bottom)).toBeLessThanOrEqual(410);
      expect(frame.sourceFoot[0]).toBeGreaterThan(left);
      expect(frame.sourceFoot[0]).toBeLessThan(right);
      expect(frame.sourceFoot[1]).toBeGreaterThan(top);
      expect(frame.sourceFoot[1]).toBeLessThanOrEqual(bottom);
    }
  });
});
