// The 22 build spots (TOWER-DEFENSE.md §2, the inner ring of §12), the cabin and the bell stand on the island, apart, in the server's order.
import {describe, expect, it} from 'vitest';
import {SPOTS, SPOT_IDS, SPOT_TABLE, SPOT_ALIASES, PP_SPOTS, CABIN, BELL, KINDS, islandZones, pointZones, defenses, onIsland, isIslandZone, spotById, localSpotId} from '../../src/island/spots.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {edgeTrees} from '../../src/world/places/layouts.js';
import {places} from '../../src/world/places/registry.js';
import {FAKE_SPOTS} from './fake.js';
import {CONFIG} from '../../src/pirates/sim.js';

describe('island spots', () => {
  it('has 22 unique ids from one mapping table, in the order and kinds of the server', () => {
    expect(SPOT_IDS).toEqual(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
      'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']);
    expect(new Set(SPOT_IDS).size).toBe(22);
    expect(SPOT_TABLE.map(row => row[0])).toEqual(SPOT_IDS);
    expect(SPOTS.filter(spot => spot.slot === 'wall')).toHaveLength(12);
    expect(SPOTS.filter(spot => spot.edge === 'ring').map(spot => spot.id)).toEqual(['wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']);
    expect(SPOTS.filter(spot => spot.slot === 'tower')).toHaveLength(7);
    expect(SPOTS.map(spot => [spot.id, spot.kind])).toEqual(FAKE_SPOTS.map(spot => [spot.id, spot.kind]));
    expect(Object.fromEntries(Object.entries(KINDS).map(([kind, info]) => [kind, info.cost]))).toEqual({wall: 10, cannon: 30, mortar: 60, watchtower: 40, house: 50});
    // The backend's ids are the table's own; only old draft names go through the alias table.
    for (const id of SPOT_IDS) expect(localSpotId(id)).toBe(id);
    expect(Object.values(SPOT_ALIASES).every(id => SPOT_IDS.includes(id))).toBe(true);
    expect(spotById('tower_s2').id).toBe('cannon_2');
  });
  it('lists the ten Pirate Point spots with unique ids and zones', () => {
    expect(PP_SPOTS.map(spot => spot.id)).toEqual(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4',
      'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']);
    expect(pointZones().map(zone => zone.id)).toEqual(PP_SPOTS.map(spot => spot.id));
    for (const a of PP_SPOTS) for (const b of PP_SPOTS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} ${b.id}`).toBeGreaterThan(3);
    expect(isIslandZone('pp_tower_5')).toBe(true);
  });
  it('spreads the towers so every side of the island is covered', () => {
    const towers = SPOTS.filter(spot => spot.slot === 'tower');
    const sides = new Set(towers.map(spot => Math.round(Math.atan2(spot.z, spot.x) / (Math.PI / 4))));
    expect(sides.size).toBeGreaterThanOrEqual(6);
  });
  it('puts every spot, the cabin and the bell inside the island bounds', () => {
    const {rx, rz} = surfaces.home_islet;
    for (const item of [...SPOTS, CABIN, BELL]) {
      expect(onIsland(item.x, item.z), item.id).toBe(true);
      expect(Math.abs(item.x)).toBeLessThan(rx);
      expect(Math.abs(item.z)).toBeLessThan(rz);
    }
  });
  it('walls stand on the shore, towers on the four corners and the sides, houses and the watchtower inland', () => {
    for (const wall of SPOTS.filter(spot => spot.edge === 'shore')) expect(surfaceClass('home_islet', wall.x, wall.z), wall.id).toBe(1);
    const corners = SPOTS.filter(spot => spot.edge === 'corner').map(spot => [Math.sign(spot.x), Math.sign(spot.z)].join());
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
  it('rings the island\'s heart with wall_7…wall_12: inland, within the sim\'s ring, one on every side', () => {
    const {heart} = CONFIG.boarding, ring = SPOTS.filter(spot => spot.edge === 'ring');
    for (const wall of ring) {
      expect(surfaceClass('home_islet', wall.x, wall.z), wall.id).toBe(2);
      expect(Math.hypot(wall.x - heart.x, wall.z - heart.z), wall.id).toBeLessThanOrEqual(heart.ring);
    }
    for (const wall of SPOTS.filter(spot => spot.edge === 'shore')) expect(Math.hypot(wall.x - heart.x, wall.z - heart.z), wall.id).toBeGreaterThan(heart.ring);
    // Every heading towards the heart is within the sim's gate angle of one ring wall: a full ring closes it.
    const bearings = ring.map(wall => Math.atan2(wall.z - heart.z, wall.x - heart.x));
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 36) {
      const gap = Math.min(...bearings.map(b => Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)));
      expect(gap * 180 / Math.PI).toBeLessThanOrEqual(CONFIG.boarding.gateAngle);
    }
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
      {id: 'moat', kind: 'wall', built: true, cost: 10}, {id: 'cannon_5', kind: 'mortar', built: true, level: 2, cost: 30}]))
      .toEqual([{id: 'cannon_1', kind: 'cannon', level: 1, x: -12.5, z: -14.5}, {id: 'cannon_5', kind: 'mortar', level: 2, x: -15, z: -6}]);
  });
});
