// Source integrity, independent crops and invariant shared feet for the harpoon asset family.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {frames, sheets} from '../../src/art/village/harpoons.js';
import {islandFrame} from '../../src/art/registry.js';
import {collectRasterFrames, normalizeRasterFrame} from '../../src/art/village-raster.js';

const groups = Array.from({length: 5}, (_, index) => {
  const suffix = index ? `-l${index + 1}` : '';
  return [`island-harpoon${suffix}`, `island-harpoon-fire${suffix}`,
    `island-harpoon${suffix}-damaged`, `island-harpoon${suffix}-broken`];
});
const ids = groups.flat(), audit = JSON.parse(readFileSync('../docs/evidence/VIS-09-harpoons/asset-audit.json'));
const image = readFileSync(`public/${sheets.harpoons.file}`);
afterEach(() => vi.unstubAllGlobals());

describe('original shaded harpoon family', () => {
  it('covers exactly the existing five levels and four states with the coordinated visual revision', () => {
    expect(Object.keys(frames).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(islandFrame(id)?.slice(0, 3), id).toEqual([48, 32, 5]);
      expect(frames[id].logical, id).toEqual([56, 48, 7]);
    }
    expect(Object.keys(collectRasterFrames([{sheets, frames}])).sort()).toEqual([...ids].sort());
  });

  it('binds the inspected original RGBA bytes and bounded native source', () => {
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([image[24], image[25]]).toEqual([8, 6]);
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1536, 1024]);
    expect(createHash('sha256').update(image).digest('hex')).toBe(audit.sha256);
    expect(image.length).toBe(audit.encodedBytes); expect(image.length).toBeLessThan(2_600_000);
    expect(sheets.harpoons.width * sheets.harpoons.height * 4).toBeLessThanOrEqual(6 * 1024 ** 2);
    expect(audit.alphaZeroPixels).toBeGreaterThan(1536 * 1024 / 2);
    expect(audit.cornerAlpha).toEqual([0, 0, 0, 0]);
  });

  it.each(ids)('%s contains its complete native crop, foot and clear edge inside one state band', id => {
    const {rect: [x, y, w, h], sourceFoot: [fx, fy], fitBounds} = frames[id], measured = audit.frames[id];
    expect(frames[id].rect).toEqual(measured.nativeBounds);
    expect(frames[id].sourceFoot).toEqual(measured.sourceFoot);
    expect(x).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(1536);
    expect(y).toBeGreaterThanOrEqual(measured.band[0]); expect(y + h).toBeLessThanOrEqual(measured.band[1]);
    expect(fx).toBeGreaterThan(0); expect(fx).toBeLessThan(w);
    expect(fy).toBeGreaterThan(0); expect(fy).toBeLessThan(h);
    [fx, fy, w - fx, h - fy].forEach((extent, index) => expect(fitBounds[index]).toBeGreaterThanOrEqual(extent));
    expect(measured.edgeAlphaMaximum).toBeLessThanOrEqual(4);
    expect(measured.solidPixels).toBeGreaterThan(5_000);
  });

  it('never samples a neighboring tier or state', () => {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const [x, y, w, h] = frames[ids[a]].rect, [u, v, sw, sh] = frames[ids[b]].rect;
      expect(x + w <= u || u + sw <= x || y + h <= v || v + sh <= y,
        `${ids[a]} / ${ids[b]}`).toBe(true);
    }
  });

  it.each([1.5, 2, 4])('normalizes every state to the same tier scale and exact foot at density%s', density => {
    const draws = [];
    vi.stubGlobal('document', {createElement: () => ({getContext: () => ({setTransform() {},
      drawImage: (...args) => draws.push(args)})})});
    const source = {};
    for (const group of groups) {
      const scales = [];
      for (const id of group) {
        const frame = frames[id], canvas = normalizeRasterFrame(source, frame, density);
        expect([canvas.width, canvas.height]).toEqual([Math.ceil(56 * density), Math.ceil(48 * density)]);
        const [img, sx, sy, sw, sh, dx, dy, dw, dh] = draws.at(-1);
        expect(img).toBe(source); expect([sx, sy, sw, sh]).toEqual(frame.rect);
        const scale = dw / sw; scales.push(scale); expect(dh / sh).toBeCloseTo(scale);
        expect(dx + frame.sourceFoot[0] * scale).toBeCloseTo(28);
        expect(dy + frame.sourceFoot[1] * scale).toBeCloseTo(41);
        expect(dx).toBeGreaterThanOrEqual(0); expect(dy).toBeGreaterThanOrEqual(0);
        expect(dx + dw).toBeLessThanOrEqual(56); expect(dy + dh).toBeLessThanOrEqual(48);
      }
      for (const scale of scales) expect(scale).toBeCloseTo(scales[0], 12);
    }
  });
});
