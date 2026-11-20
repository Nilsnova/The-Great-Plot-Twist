// Match original source cells to actual supported house/role identities and fixed logical feet.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/houses.js';
import {buildingArt} from '../../src/island/world.js';
import {ROLE_IDS} from '../../src/campaign/houses.js';
import {islandFrame} from '../../src/art/registry.js';

const source = readFileSync(new URL(`../../public/${sheets.villageHouses.file}`, import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-06-houses/asset-report-v2.json', import.meta.url)));

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
    for (const [id, frame] of Object.entries(frames)) {
      const role = ROLE_IDS.some(role => id.includes(`-${role}`));
      expect(frame.logical, id).toEqual(role ? [96, 88, 8] : [80, 80, 8]);
      expect(islandFrame(id).slice(0, 3)).toEqual(role ? [80, 72, 8] : [64, 64, 8]);
    }
  });

  it('keeps the measured foot and all solid source details inside each transparent cell', () => {
    for (const cell of report.cells) {
      const frame = frames[cell.id], sheet = sheets[frame.sheet];
      expect(frame.rect).toEqual(cell.rect);
      expect(frame.sourceFoot).toEqual(cell.sourceFoot);
      expect([frame.rect[0] + frame.sourceFoot[0], frame.rect[1] + frame.sourceFoot[1]]).toEqual(cell.nativeGroundFoot);
      expect(frame.rect[0] + frame.rect[2]).toBeLessThanOrEqual(sheet.width);
      expect(frame.rect[1] + frame.rect[3]).toBeLessThanOrEqual(sheet.height);
      const [left, top, right, bottom] = cell.solidBounds;
      expect(Math.min(left, top)).toBeGreaterThanOrEqual(12);
      expect(frame.rect[2] - right).toBeGreaterThanOrEqual(12);
      expect(frame.rect[3] - bottom).toBeGreaterThanOrEqual(12);
      expect(frame.sourceFoot[0]).toBeGreaterThan(left);
      expect(frame.sourceFoot[0]).toBeLessThan(right);
      expect(frame.sourceFoot[1]).toBeGreaterThan(top);
      expect(frame.sourceFoot[1]).toBeLessThanOrEqual(bottom);
    }
  });

  it('keeps the normalized silhouettes within the original cottage scale as their levels grow', () => {
    const presentedHeight = {};
    // Limits are logical pixels around the unchanged ground anchor.
    const maxHeight = {
      'island-house': 54, 'island-house-l2': 59, 'island-house-l3': 70,
      'island-house-barracks': 62, 'island-house-tavern': 62, 'island-house-workshop': 63,
      'island-house-barracks-l3': 78, 'island-house-tavern-l3': 78, 'island-house-workshop-l3': 79,
    };
    for (const cell of report.cells) {
      const {rect, sourceFoot: [x, y], fitBounds, logical: [width, height, anchor]} = frames[cell.id];
      [x, y, rect[2] - x, rect[3] - y].forEach((extent, i) => expect(fitBounds[i]).toBeGreaterThanOrEqual(extent));
      const [left, top, right, bottom] = cell.solidBounds;
      const scale = Math.min(width / 2 / fitBounds[0], (height - anchor) / fitBounds[1],
        width / 2 / fitBounds[2], anchor / fitBounds[3]);
      presentedHeight[cell.id] = (bottom - top) * scale;
      expect(presentedHeight[cell.id]).toBeLessThanOrEqual(maxHeight[cell.id]);
      expect((right - left) * scale).toBeLessThan(78);
    }
    expect(presentedHeight['island-house-l2']).toBeGreaterThan(presentedHeight['island-house']);
    expect(presentedHeight['island-house-l3']).toBeGreaterThan(presentedHeight['island-house-l2']);
    for (const role of ROLE_IDS) expect(presentedHeight[`island-house-${role}-l3`]).toBeGreaterThan(presentedHeight[`island-house-${role}`]);
  });
});
