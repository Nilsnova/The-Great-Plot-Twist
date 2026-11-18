import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/cannons.js';
import {islandFrame} from '../../src/art/registry.js';

const families = [
  ['island-cannon', 'island-cannon-fire', 'island-cannon-damaged', 'island-cannon-broken'],
  ['island-cannon-l2', 'island-cannon-fire-l2', 'island-cannon-l2-damaged', 'island-cannon-l2-broken'],
  ['island-cannon-l3', 'island-cannon-fire-l3', 'island-cannon-l3-damaged', 'island-cannon-l3-broken'],
  ['island-cannon-l4', 'island-cannon-fire-l4', 'island-cannon-l4-damaged', 'island-cannon-l4-broken'],
  ['island-cannon-l5', 'island-cannon-fire-l5', 'island-cannon-l5-damaged', 'island-cannon-l5-broken'],
];
const ids = families.flat(), audit = JSON.parse(readFileSync('../docs/evidence/VIS-07-cannons/asset-audit.json'));
const image = readFileSync(`public/${sheets.cannons.file}`);

describe('the original shaded cannon family', () => {
  it('covers all actual level/state names and only the approved visual metrics', () => {
    expect(Object.keys(frames).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(islandFrame(id), id).not.toBeNull();
      expect(islandFrame(id).slice(0, 3), id).toEqual([48, 32, 5]);
      expect(frames[id].logical, id).toEqual([56, 48, 7]);
    }
  });

  it('binds an inspected RGBA source within the declared native transfer/memory bounds', () => {
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([image[24], image[25]]).toEqual([8, 6]);
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1536, 1024]);
    expect(createHash('sha256').update(image).digest('hex')).toBe(audit.sha256);
    expect(image.length).toBeLessThan(2_600_000);
    expect(sheets.cannons.width * sheets.cannons.height * 4).toBeLessThanOrEqual(6 * 1024 ** 2);
    expect(audit.alphaZeroPixels).toBeGreaterThan(sheets.cannons.width * sheets.cannons.height / 2);
    expect(Math.max(...audit.cornerAlpha)).toBeLessThanOrEqual(2);
  });

  it.each(ids)('%s has a complete crop, clear edge and a contained virtual fit', id => {
    const {rect: [x, y, w, h], sourceFoot: [fx, fy], fitBounds, sheet} = frames[id];
    expect(sheet).toBe('cannons');
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(sheets.cannons.width);
    expect(y + h).toBeLessThanOrEqual(sheets.cannons.height);
    expect(fx).toBeGreaterThan(0); expect(fx).toBeLessThan(w);
    expect(fy).toBeGreaterThan(0); expect(fy).toBeLessThan(h);
    [fx, fy, w - fx, h - fy].forEach((extent, index) => expect(fitBounds[index]).toBeGreaterThanOrEqual(extent));
    expect(audit.frames[id].edgeAlphaMaximum).toBeLessThanOrEqual(4);
    expect(audit.frames[id].solidPixels).toBeGreaterThan(10_000);
  });

  it.each(families)('keeps every pose of %s at one authored level scale', (...group) => {
    for (const id of group) expect(frames[id].fitBounds).toEqual(frames[group[0]].fitBounds);
  });

  it('keeps each semantic state in its own inspected source band', () => {
    const bands = [[0, 270], [270, 535], [535, 800], [800, 1024]];
    for (const group of families) group.forEach((id, state) => {
      const [, y, , h] = frames[id].rect;
      expect(y, id).toBeGreaterThanOrEqual(bands[state][0]);
      expect(y + h, id).toBeLessThanOrEqual(bands[state][1]);
    });
  });

  it('never reuses neighboring source pixels across levels or states', () => {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const [x, y, w, h] = frames[ids[a]].rect, [u, v, sw, sh] = frames[ids[b]].rect;
      expect(x + w <= u || u + sw <= x || y + h <= v || v + sh <= y,
        `${ids[a]} / ${ids[b]}`).toBe(true);
    }
  });
});
