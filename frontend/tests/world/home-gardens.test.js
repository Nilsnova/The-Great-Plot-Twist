import {expect, it} from 'vitest';
import {defenseDisplayAnchors, TOWER_PAD} from '../../src/island/defense-display.js';
import {ISLAND_PLACE, SPOTS} from '../../src/island/spots.js';
import {sideBeachPlanting} from '../../src/world/places/home-gardens.js';
import {naturalSurfaceClass} from '../../src/world/places/surfaces.js';

it('keeps side-beach garden roots on grass beyond the landing mouths and cannon pads', () => {
  const {plants, shadows} = sideBeachPlanting();
  const towers = SPOTS.filter(({slot}) => slot === 'tower');
  const displayed = defenseDisplayAnchors(ISLAND_PLACE, towers);
  const shoulders = new Set();
  let southeastBench = 0;
  for (const plant of plants) {
    const {x, z, scale} = plant;
    shoulders.add(`${Math.sign(x)},${Math.sign(z)}`);
    const surface = naturalSurfaceClass(ISLAND_PLACE, x, z);
    expect(surface).toBeGreaterThan(0);
    if (surface === 1) {
      expect(x).toBeGreaterThan(13);
      expect(z).toBeGreaterThan(9.8);
      southeastBench++;
    }
    expect(Math.abs(z) - scale * .35).toBeGreaterThan(4.5);
    for (const spot of towers) {
      const gun = displayed.get(spot.id) ?? spot;
      const across = Math.abs(x - gun.x) - TOWER_PAD.width;
      const front = Math.abs(z - gun.z + TOWER_PAD.rear) - TOWER_PAD.depth;
      expect(Math.max(across, front)).toBeGreaterThan(scale * .15);
    }
  }
  expect(shoulders.size).toBe(4);
  expect(plants.length).toBeGreaterThan(25);
  expect(southeastBench).toBeGreaterThan(3);
  for (const {x, z} of shadows) expect(plants.some(plant => plant.x === x && plant.z === z)).toBe(true);
});
