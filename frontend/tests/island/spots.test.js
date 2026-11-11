// The 11 build spots, the cabin and the bell stand on the island, apart, in the server's order.
import {describe, expect, it} from 'vitest';
import {SPOTS, SPOT_IDS, CABIN, BELL, KINDS, islandZones, defenses, onIsland, isIslandZone, spotById} from '../../src/island/spots.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {edgeTrees} from '../../src/world/places/layouts.js';
import {places} from '../../src/world/places/registry.js';
import {FAKE_SPOTS} from '../../src/island/fake-api.js';

describe('island spots', () => {
  it('has 11 unique ids in the order and kinds of the server', () => {
    expect(SPOT_IDS).toEqual(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'tower_1', 'house_1', 'house_2']);
    expect(new Set(SPOT_IDS).size).toBe(11);
    expect(SPOTS.map(spot => [spot.id, spot.kind])).toEqual(FAKE_SPOTS.map(spot => [spot.id, spot.kind]));
    expect(Object.fromEntries(Object.entries(KINDS).map(([kind, info]) => [kind, info.cost]))).toEqual({wall: 10, cannon: 30, watchtower: 40, house: 50});
  });
  it('puts every spot, the cabin and the bell inside the island bounds', () => {
    const {rx, rz} = surfaces.home_islet;
    for (const item of [...SPOTS, CABIN, BELL]) {
      expect(onIsland(item.x, item.z), item.id).toBe(true);
      expect(Math.abs(item.x)).toBeLessThan(rx);
      expect(Math.abs(item.z)).toBeLessThan(rz);
    }
  });
  it('walls stand on the shore, cannons on four corners, houses and the tower inland', () => {
    for (const wall of SPOTS.filter(spot => spot.kind === 'wall')) expect(surfaceClass('home_islet', wall.x, wall.z), wall.id).toBe(1);
    const corners = SPOTS.filter(spot => spot.kind === 'cannon').map(spot => [Math.sign(spot.x), Math.sign(spot.z)].join());
    expect(new Set(corners).size).toBe(4);
    for (const spot of SPOTS.filter(spot => ['house', 'watchtower'].includes(spot.kind))) expect(surfaceClass('home_islet', spot.x, spot.z)).toBe(2);
    expect(spotById('tower_1').z).toBeLessThan(-10); // the hill at the north end of the path
  });
  it('keeps spots apart from each other, the trees and the landing', () => {
    const all = [...SPOTS, CABIN, BELL];
    for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} ${b.id}`).toBeGreaterThan(3);
    for (const item of all) for (const [x, z] of edgeTrees.home_islet) expect(Math.hypot(item.x - x, item.z - z), item.id).toBeGreaterThan(2.5);
    const [sx, sz] = places.home_islet.spawn;
    for (const item of all) expect(Math.hypot(item.x - sx, item.z - sz), item.id).toBeGreaterThan(2);
  });
  it('gives each spot a reachable zone; a visitor gets no cabin', () => {
    const zones = islandZones();
    expect(zones.map(zone => zone.id)).toEqual([...SPOT_IDS, BELL.id, CABIN.id]);
    for (const zone of zones) expect(onIsland(zone.x, zone.z), zone.id).toBe(true);
    expect(islandZones({visitor: true}).some(zone => zone.id === CABIN.id)).toBe(false);
    expect(isIslandZone('cannon_1') && isIslandZone(BELL.id) && !isIslandZone('market_hall')).toBe(true);
  });
  it('lists the built defences with their place for the wave simulation', () => {
    expect(defenses([{id: 'cannon_1', kind: 'cannon', built: true, cost: 30}, {id: 'wall_1', kind: 'wall', built: false, cost: 10},
      {id: 'moat', kind: 'wall', built: true, cost: 10}])).toEqual([{id: 'cannon_1', kind: 'cannon', x: -12.5, z: -14.5}]);
  });
});
