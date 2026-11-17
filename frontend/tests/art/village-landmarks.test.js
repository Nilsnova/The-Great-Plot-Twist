// Authored landmark identities, inspected source cells and the one approved presentation override.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/landmarks.js';
import {buildingArt} from '../../src/island/world.js';
import {islandFrame} from '../../src/art/registry.js';

const source = readFileSync(new URL('../../public/village/landmarks-v1.png', import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-12-landmarks/asset-report.json', import.meta.url)));

describe('approved landmark sources', () => {
  it('loads the exact inspected RGBA sheet without an opaque backdrop', () => {
    expect(source.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(source[25]).toBe(6);
    expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual([sheets.villageLandmarks.width, sheets.villageLandmarks.height]);
    expect(createHash('sha256').update(source).digest('hex')).toBe(report.sha256);
    expect(report.alpha.corners.every(alpha => alpha < report.alpha.meaningfulThreshold)).toBe(true);
  });

  it('preserves every actual watchtower selection and only the approved bell presentation change', () => {
    const expected = ['island-bell', ...new Set([1, 2, 3, 4, 5].map(level => buildingArt('watchtower', level)))];
    expect(Object.keys(frames).sort()).toEqual(expected.sort());
    expect(frames['island-bell'].logical).toEqual([56, 72, 8]);
    expect(islandFrame('island-bell').slice(0, 3)).toEqual([24, 40, 0]); // legacy painter remains independently defined.
    for (const id of expected.filter(id => id !== 'island-bell')) expect(frames[id].logical).toEqual(islandFrame(id).slice(0, 3));
  });

  it('contains complete measured objects, exact feet and non-overlapping source rectangles', () => {
    const entries = Object.values(frames);
    for (const cell of report.cells) {
      const frame = frames[cell.id], sheet = sheets[frame.sheet];
      expect(frame.rect).toEqual(cell.rect);
      expect(frame.sourceFoot).toEqual(cell.sourceFoot);
      expect(frame.rect[0] + frame.rect[2]).toBeLessThanOrEqual(sheet.width);
      expect(frame.rect[1] + frame.rect[3]).toBeLessThanOrEqual(sheet.height);
      const [left, top, right, bottom] = cell.meaningfulAlphaBounds;
      expect(Math.min(left, top)).toBeGreaterThanOrEqual(12);
      expect(frame.rect[2] - right).toBeGreaterThanOrEqual(12);
      expect(frame.rect[3] - bottom).toBeGreaterThanOrEqual(12);
      expect(frame.sourceFoot[0]).toBeGreaterThan(left);
      expect(frame.sourceFoot[0]).toBeLessThan(right);
      expect(frame.sourceFoot[1]).toBeLessThan(bottom);
    }
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const [x, y, w, h] = entries[i].rect, [a, b, c, d] = entries[j].rect;
      expect(x + w <= a || a + c <= x || y + h <= b || b + d <= y).toBe(true);
    }
  });
});
