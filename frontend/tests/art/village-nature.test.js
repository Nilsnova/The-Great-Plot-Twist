import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {frames, sheets} from '../../src/art/village/nature.js';
import {islandFrame} from '../../src/art/registry.js';

const audit = JSON.parse(readFileSync('../docs/evidence/VIS-21-nature/asset-audit.json'));
const ids = ['oak', 'pine', 'birch', 'birch-tall', 'rock', 'shrub', 'flowers', 'grass-tuft'];
const image = readFileSync(`public/${sheets.nature.file}`);

describe('the original shaded nature sheet', () => {
  it('keeps the complete existing nature family and each logical foot', () => {
    expect(Object.keys(frames).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(frames[id].logical, id).toEqual(islandFrame(id).slice(0, 3));
  });

  it('binds real RGBA source pixels and the inspected alpha audit', () => {
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image[24]).toBe(8); // Eight-bit source channels.
    expect(image[25]).toBe(6); // True RGBA, not an opaque RGB image.
    expect([image.readUInt32BE(16), image.readUInt32BE(20)])
      .toEqual([sheets.nature.width, sheets.nature.height]);
    expect(createHash('sha256').update(image).digest('hex')).toBe(audit.sha256);
    expect(audit.alphaZeroPixels).toBeGreaterThan(sheets.nature.width * sheets.nature.height / 2);
    expect(audit.cornerAlpha).toEqual([0, 0, 0, 0]);
    expect(image.length).toBeLessThan(2_500_000);
    expect(sheets.nature.width * sheets.nature.height * 4).toBeLessThanOrEqual(6 * 1024 ** 2);
  });

  it.each(ids)('%s has a complete contained crop and an explicit root/contact point', id => {
    const {rect: [x, y, w, h], sourceFoot: [fx, fy], sheet} = frames[id];
    expect(sheet).toBe('nature');
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(sheets.nature.width);
    expect(y + h).toBeLessThanOrEqual(sheets.nature.height);
    expect(fx).toBeGreaterThan(0); expect(fx).toBeLessThan(w);
    expect(fy).toBeGreaterThan(0); expect(fy).toBeLessThan(h);
    expect(audit.frames[id].edgeAlphaMaximum).toBeLessThanOrEqual(4);
    expect(audit.frames[id].solidPixels).toBeGreaterThan(20_000);
  });

  it('never shares source pixels between neighboring authored objects', () => {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const [x, y, w, h] = frames[ids[a]].rect, [u, v, sw, sh] = frames[ids[b]].rect;
      expect(x + w <= u || u + sw <= x || y + h <= v || v + sh <= y,
        `${ids[a]} / ${ids[b]}`).toBe(true);
    }
  });
});
