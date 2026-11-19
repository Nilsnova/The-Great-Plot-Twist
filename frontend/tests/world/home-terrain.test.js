import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('paints the original paths and four landing beaches inside the canonical shore', async () => {
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
    const northApproaches = shore.slice(124, 147).map(({x, z}) => alpha(x * 1.05, z * 1.05));
    // First dry steps from the standard Wave 11 approaches on the matching offline seed.
    const beaches = [[20.08, 1.85], [-18.5, 2.72], [-1.51, 21.07], [-4.58, -22.52]].map(([x, z]) => pixel(x, z));
    const paths = [[-12, -5.5], [12, -5.5], [-10, 7.5], [11, 7.5], [4, 11.75]].map(([x, z]) => pixel(x, z));
    const meadow = [[-6, -11.8], [6, -11.8], [-8, 12.5]].map(([x, z]) => pixel(x, z));
    texture.dispose();
    return {dry, openSea, northLanding, northApproaches, beaches, paths, meadow};
  });
  expect(terrain.dry).toBeGreaterThanOrEqual(240);
  expect(terrain.openSea).toEqual([0, 0, 0, 0]);
  // The outer wet-sand glaze remains water at the same alpha cutoff used by the shoreline checks.
  expect(Math.max(...terrain.northLanding)).toBeLessThan(128);
  expect(Math.max(...terrain.northApproaches)).toBeLessThan(20);
  for (const [r, g, b, opacity] of terrain.beaches) {
    expect(opacity).toBeGreaterThanOrEqual(230);
    expect(r - g).toBeGreaterThan(4);
    expect(g - b).toBeGreaterThan(24);
  }
  for (const [r, g] of terrain.paths) expect(r - g).toBeGreaterThan(6);
  for (const [r, g] of terrain.meadow) expect(g - r).toBeGreaterThan(8);
});
