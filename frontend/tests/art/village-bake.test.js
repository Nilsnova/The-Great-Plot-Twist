import {expect, it} from 'vitest';
import {collectRasterFrames} from '../../src/art/village-raster.js';
import {BAKE_DENSITY, GUTTER, MAX_HEIGHT, MAX_WIDTH, planFamily, pixelDifference, rawFamilyNames} from '../../scripts/village-bake-plan.js';
const frame = (width = 96, height = 96) => ({sheet: {file: 'village/source.png', width: 1254, height: 1254}, rect: [0, 0, 1254, 1254], logical: [width, height, 12], sourceFoot: [627, 1124], fitBounds: [627, 1124, 627, 130]});
it('requires explicit raw names, rejects recursive/unsafe/duplicate inputs, and accepts a future raw core', () => {
  expect(rawFamilyNames('buildings,core')).toEqual(['buildings', 'core']);
  for (const input of [[], ['baked'], ['compiled-core'], ['../core'], ['core', 'core']]) expect(() => rawFamilyNames(input)).toThrow('raw family');
});
it('preserves every ID/logical/foot while packing multiple bounded transparent-gutter pages', () => {
  const input = Object.fromEntries(Array.from({length: 40}, (_, i) => [`frame${i}`, {...frame(96, 128), rect: [i, 0, 1200, 1254]}]));
  const before = JSON.stringify(input), plan = planFamily('core', input); expect(plan.pages.length).toBeGreaterThan(1); expect(JSON.stringify(input)).toBe(before);
  expect(Object.keys(plan.frames)).toEqual(Object.keys(input));
  for (const [id, baked] of Object.entries(plan.frames)) {
    expect(baked.logical).toEqual(input[id].logical); expect(baked.sourceFoot).toEqual([192, 464]); expect(baked.rect.slice(2)).toEqual([384, 512]);
  }
  for (const page of plan.pages) {
    expect(page.width).toBeLessThanOrEqual(MAX_WIDTH); expect(page.height).toBeLessThanOrEqual(MAX_HEIGHT); expect(page.width * page.height * 4).toBeLessThanOrEqual(12 * 2 ** 20);
    for (const {rect: [x, y, w, h]} of page.items) { expect(x).toBeGreaterThanOrEqual(GUTTER); expect(y).toBeGreaterThanOrEqual(GUTTER); expect(x + w + GUTTER).toBeLessThanOrEqual(page.width); expect(y + h + GUTTER).toBeLessThanOrEqual(page.height); }
    for (const [i, a] of page.items.entries()) for (const b of page.items.slice(i + 1)) expect(a.rect[0] + a.rect[2] + GUTTER <= b.rect[0] || b.rect[0] + b.rect[2] + GUTTER <= a.rect[0] || a.rect[1] + a.rect[3] + GUTTER <= b.rect[1] || b.rect[1] + b.rect[3] + GUTTER <= a.rect[1]).toBe(true);
  }
});
it('shares only exact authored aliases and never copies raw native fitting extents into normalized metadata', () => {
  const raw = {intact: frame(), alias: frame(), broken: {...frame(), rect: [0, 0, 1254, 900], sourceFoot: [627, 770]}};
  const plan = planFamily('states', raw); expect(plan.pages.flatMap(page => page.items)).toHaveLength(2); expect(plan.frames.alias).toEqual(plan.frames.intact);
  const normalized = collectRasterFrames([plan]); expect(normalized.intact.sourceFoot).toEqual([192, 336]); expect(normalized.intact.fitBounds).toEqual([192, 336, 192, 48]); expect(BAKE_DENSITY).toBe(4);
  expect(() => planFamily('too-wide', {bad: frame(256)})).toThrow('does not fit');
});
it('reports lower-density differences, preserving alpha and ignoring invisible RGB rather than hiding visible error', () => {
  expect(pixelDifference([255, 0, 0, 0], [0, 255, 0, 0])).toMatchObject({differingPixels: 0, maxVisibleDelta: 0});
  expect(pixelDifference([20, 30, 40, 255], [24, 30, 40, 254])).toMatchObject({differingPixels: 1, maxVisibleDelta: 4, maxAlphaDelta: 1});
  expect(() => pixelDifference([0], [0])).toThrow('dimensions');
});
