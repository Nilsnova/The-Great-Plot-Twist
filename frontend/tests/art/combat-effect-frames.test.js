import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('keeps combat effects inside their atlas frames and smoke clear enough to see past', async () => {
  const rasters = await browser(async () => {
    const {fleetFrames} = await window.g20Import('/src/art/fleet.js');
    const {paint} = await window.g20Import('/src/art/paint.js');
    const effects = Object.entries(fleetFrames()).filter(([id]) =>
      /^(?:fx-(?:smoke|explosion|musket-flash|gunboat-flash)|pirate-splash)/.test(id));
    return [1.5, 2, 4].map(density => effects.map(([id, [w, h, anchor, draw, options]]) => {
      const canvas = paint(draw, [w, h], density, options);
      const {width, height} = canvas, data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      let peak = 0, clipped = false, waterline = false;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        peak = Math.max(peak, alpha);
        if (alpha <= 32) continue;
        clipped ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
        waterline ||= Math.abs(y / density - (h - anchor)) <= 1.5;
      }
      return {id, peak, clipped, waterline};
    }));
  });

  for (const frames of rasters) {
    expect(frames).toHaveLength(12);
    expect(frames.filter(({clipped, peak}) => clipped || peak <= 32)).toEqual([]);
    expect(frames.filter(({id, waterline}) => id.startsWith('pirate-splash') && !waterline)).toEqual([]);
    const [first, second, third] = frames.filter(({id}) => id.startsWith('fx-smoke')).map(({peak}) => peak);
    expect(first).toBeLessThan(204);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  }
});
