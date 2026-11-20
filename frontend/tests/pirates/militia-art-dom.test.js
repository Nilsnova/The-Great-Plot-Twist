import { expect, it } from 'vitest';
import { browserHarness } from '../g20-browser.js';

const evaluate = browserHarness();

it('keeps the militia spear silhouette inside all five frames at both art densities', async () => {
  const samples = await evaluate(async () => {
    const { MILITIA_IDS } = await window.g20Import('/src/pirates/render.js');
    const { peopleFrames } = await window.g20Import('/src/art/people.js');
    const { paint } = await window.g20Import('/src/art/paint.js');
    const frames = peopleFrames();
    return [2, 4].flatMap(density => MILITIA_IDS.map(id => {
      const [width, height, anchor, draw] = frames[id];
      const canvas = paint(draw, [width, height], density);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let clipped = 0, point = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset + 3] < 220) continue;
          // The hurt pose leans the shield left. The spear reaches only the top or right edge.
          if (y === 0 || x === canvas.width - 1) clipped++;
          if (x >= 20 * density && y >= 16 * density && y <= 22 * density
            && pixels[offset] >= 170 && pixels[offset + 1] >= 170 && pixels[offset + 2] >= 170) point++;
        }
      }
      return {density, id, width, height, anchor, clipped, point};
    }));
  });
  expect(samples).toHaveLength(10);
  for (const sample of samples) {
    expect([sample.width, sample.height, sample.anchor]).toEqual([24, 32, 3]);
    expect(sample.clipped, sample.id + ' at ' + sample.density + '×').toBe(0);
    if (sample.id === 'militia-strike') expect(sample.point).toBeGreaterThan(sample.density ** 2);
  }
});
