// Real existing service identities and unchanged geometry, checked against the authored PNG source.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/services.js';
import {islandFrame} from '../../src/art/registry.js';
import {ARSENAL, CAMPAIGN_BUILDINGS} from '../../src/island/spots.js';

const source = readFileSync(new URL('../../public/village/services-v1.png', import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-13-services/asset-report.json', import.meta.url)));
const fixed = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-05-hero/fixed-buildings-v2.json', import.meta.url)));
const fixedSource = readFileSync(new URL(`../../public/${sheets.villageArsenal.file}`, import.meta.url));

describe('approved service sources', () => {
  it('uses the exact inspected RGBA source with a transparent separator', () => {
    expect(source.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(source[25]).toBe(6);
    expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual([sheets.villageServices.width, sheets.villageServices.height]);
    expect(createHash('sha256').update(source).digest('hex')).toBe(report.sha256);
    expect(report.alpha.corners.every(alpha => alpha < report.alpha.meaningfulThreshold)).toBe(true);
    expect(report.alpha.separatorCenter).toBe(0);
    expect(fixedSource.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(fixedSource[25]).toBe(6);
    expect([fixedSource.readUInt32BE(16), fixedSource.readUInt32BE(20)]).toEqual([sheets.villageArsenal.width, sheets.villageArsenal.height]);
    expect(createHash('sha256').update(fixedSource).digest('hex')).toBe(fixed.sha256);
  });

  it('keeps real service frame names and all registered logical geometry', () => {
    expect(Object.keys(frames).sort()).toEqual(['island-arsenal', 'island-techhub']);
    for (const [id, frame] of Object.entries(frames)) {
      expect([...CAMPAIGN_BUILDINGS, ARSENAL].some(spot => spot.art === id)).toBe(true);
      expect(frame.logical).toEqual(islandFrame(id).slice(0, 3));
    }
  });

  it('retains complete measured signs/instruments and bounded, separate source feet', () => {
    const cells = [...report.cells.filter(cell => cell.id === 'island-techhub'), {id: 'island-arsenal', ...fixed.cells['island-arsenal']}];
    for (const cell of cells) {
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
    const [cabinLeft, , cabinWidth] = fixed.cells.cabin.rect;
    expect(cabinLeft + cabinWidth).toBeLessThanOrEqual(fixed.cells['island-arsenal'].rect[0]);
  });
});
