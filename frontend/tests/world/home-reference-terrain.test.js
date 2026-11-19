import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('keeps the illustrated backdrop opaque along the playable shore and transparent over open water', async () => {
  const terrain = await browser(async () => {
    const {loadBackdrop} = await window.g20Import('/src/world/places/resources.js');
    const {cliffProfile} = await window.g20Import('/src/art/coast-cliffs.js');
    const {surfaces} = await window.g20Import('/src/world/places/surfaces.js');
    const texture = await loadBackdrop('places/home_islet.png');
    const canvas = texture.image, context = canvas.getContext('2d');
    const {width, height} = canvas, pixels = context.getImageData(0, 0, width, height).data;
    const alpha = (x, z) => {
      const column = Math.floor(width * (x / 64 + .5)), row = Math.floor(height * (z * .72 / 48 + .5));
      return pixels[4 * (row * width + column) + 3];
    };
    const shore = cliffProfile(surfaces.home_islet);
    const dry = Math.min(...shore.flatMap(({x, z}) => [.35, .65, .95, .98].map(r => alpha(x * r, z * r))));
    const openSea = [[0, -31], [-29, 0], [29, 0], [0, 31]].map(([x, z]) => alpha(x, z));
    texture.dispose();
    return {reference: texture.userData.homeReference, dry, openSea};
  });
  expect(terrain.reference).toBe(true);
  expect(terrain.dry).toBeGreaterThanOrEqual(240);
  expect(terrain.openSea).toEqual([0, 0, 0, 0]);
});
