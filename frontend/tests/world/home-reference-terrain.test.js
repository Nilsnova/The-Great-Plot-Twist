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
    const pixel = (x, z) => {
      const column = Math.floor(width * (x / 64 + .5)), row = Math.floor(height * (z * .72 / 48 + .5));
      const index = 4 * (row * width + column);
      return Array.from(pixels.subarray(index, index + 4));
    };
    const alpha = (x, z) => pixel(x, z)[3];
    const shore = cliffProfile(surfaces.home_islet);
    const dry = Math.min(...shore.flatMap(({x, z}) => [.35, .65, .95, .98].map(r => alpha(x * r, z * r))));
    const openSea = [[0, -31], [-29, 0], [29, 0], [0, 31]].map(([x, z]) => alpha(x, z));
    const northLanding = [-5.8, -4.82, -3.5].map(x => alpha(x, -23.71));
    const northApproaches = shore.slice(124, 147).map(({x, z}) => alpha(x * 1.037, z * 1.037));
    // First dry steps from the standard Wave 11 approaches on the matching offline seed.
    const beaches = [[20.08, 1.85], [-18.5, 2.72], [-1.51, 21.07], [-4.58, -22.52]].map(([x, z]) => pixel(x, z));
    texture.dispose();
    return {reference: texture.userData.homeReference, dry, openSea, northLanding, northApproaches, beaches};
  });
  expect(terrain.reference).toBe(true);
  expect(terrain.dry).toBeGreaterThanOrEqual(240);
  expect(terrain.openSea).toEqual([0, 0, 0, 0]);
  expect(Math.max(...terrain.northLanding)).toBeLessThan(20);
  expect(Math.max(...terrain.northApproaches)).toBeLessThan(20);
  for (const [r, g, b, opacity] of terrain.beaches) {
    expect(opacity).toBeGreaterThanOrEqual(230);
    expect(r - g).toBeGreaterThan(4);
    expect(g - b).toBeGreaterThan(24);
  }
});
