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

it('keeps every fleet silhouette and waterline consistent across its three painted bob frames', async () => {
  const dimensions = {
    sloop: [64, 64, 10], brig: [96, 80, 11], flagship: [128, 112, 13],
    warship: [160, 128, 14], gunboat: [56, 44, 8],
  };
  const painted = await browser(async families => {
    const {fleetFrames} = await window.g20Import('/src/art/fleet.js');
    const {paint} = await window.g20Import('/src/art/paint.js');
    const frames = fleetFrames();
    return Object.fromEntries(families.map(kind => [kind, [1.5, 2, 4].map(density => [1, 2, 3].map(index => {
      const [w, h, anchor, draw, options] = frames[`pirate-${kind}-${index}`];
      const surface = paint(draw, [w, h], density, options);
      const {width, height} = surface, data = surface.getContext('2d').getImageData(0, 0, width, height).data;
      const water = (h - anchor) * density;
      let top = height, topEdge = 0, clippedSide = false, atWaterline = false;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= 127) continue;
        top = Math.min(top, y);
        if (y === 0) topEdge++;
        if (y < water) clippedSide ||= x === 0 || x === width - 1;
        atWaterline ||= Math.abs(y - water) <= density;
      }
      return {box: [w, h, anchor], top: top / density, topEdge: topEdge / density, clippedSide, atWaterline};
    }))]));
  }, Object.keys(dimensions));

  for (const [kind, samples] of Object.entries(painted)) for (const frames of samples) {
    expect(frames.map(({box}) => box)).toEqual(Array(3).fill(dimensions[kind]));
    expect(frames.filter(({clippedSide, atWaterline}) => clippedSide || !atWaterline)).toEqual([]);
    for (const [index, {topEdge}] of frames.entries()) {
      // The original raised gunboat frame leaves only its narrow finial fringe on the top edge.
      expect(topEdge).toBeLessThanOrEqual(kind === 'gunboat' && index === 1 ? 3 : 0);
    }
    const tops = frames.map(({top}) => top);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2.5);
  }
});
