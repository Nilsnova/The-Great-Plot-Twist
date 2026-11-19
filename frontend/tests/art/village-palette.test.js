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

it('lights the same roof material from the upper left and preserves every alpha value', () => {
  const width = 9, height = 9;
  const paint = id => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([30, 44, 83, i === 0 ? 171 : 255], i);
    const context = {getImageData: () => ({data}), putImageData() {}};
    applyVillagePalette(id, {width, height, getContext: () => context});
    return data;
  };
  const roof = paint('island-house'), barrel = paint('island-cannon'), ruins = paint('island_core_broken');
  expect(roof[6]).toBeGreaterThan(roof[roof.length - 2] + 12);
  expect(barrel[6]).toBe(barrel[barrel.length - 2]);
  expect(ruins[6]).toBe(ruins[ruins.length - 2]);
  expect(roof.filter((_channel, index) => index % 4 === 3)).toEqual(barrel.filter((_channel, index) => index % 4 === 3));
});

it('keeps blue gunmetal above the limestone without changing ruined art or frame alpha', () => {
  const paint = id => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([106, 104, 101, 241], i);
    const context = {getImageData: () => ({data}), putImageData() {}};
    applyVillagePalette(id, {width: 4, height: 4, getContext: () => context});
    return data;
  };
  const cannon = paint('island-cannon-fire-l2'), ruin = paint('island-cannon-l2-broken');
  expect(cannon[2] - ruin[2]).toBeGreaterThan(20);
  expect(cannon.slice(-4)).toEqual(ruin.slice(-4));
  expect(cannon.filter((_channel, index) => index % 4 === 3)).toEqual(ruin.filter((_channel, index) => index % 4 === 3));
});
