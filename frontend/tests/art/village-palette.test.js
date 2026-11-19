import {expect, it, vi} from 'vitest';
import {applyVillagePalette} from '../../src/art/village-palette.js';

it.each(['cabin', 'island_core_damaged', 'island-house-tavern-l3', 'island-cannon-fire-l4'])(
  'grades %s while preserving opaque, soft, and transparent edges',
  id => {
    const pixels = new Uint8ClampedArray([24, 38, 83, 255, 141, 75, 38, 127, 29, 31, 35, 0]);
    const image = {data: pixels};
    const context = {getImageData: vi.fn(() => image), putImageData: vi.fn()};
    applyVillagePalette(id, {width: 3, height: 1, getContext: () => context});
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 3, 1);
    expect(context.putImageData).toHaveBeenCalledWith(image, 0, 0);
    expect(pixels[2]).toBeGreaterThan(83);
    expect(pixels[4]).toBeGreaterThan(141);
    expect([pixels[3], pixels[7], ...pixels.slice(8)]).toEqual([255, 127, 29, 31, 35, 0]);
  },
);

it('leaves other scenery out of the building palette', () => {
  const getContext = vi.fn();
  for (const id of ['oak', 'island-wreck', 'pirate-ship', 'village-wall-front-l1']) applyVillagePalette(id, {getContext});
  expect(getContext).not.toHaveBeenCalled();
});
