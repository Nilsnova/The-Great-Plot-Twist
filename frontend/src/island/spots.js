// Where things stand on your island (BUILD-PLAN 3.3), as plain data on the home_islet place: logical
// x/z on its coastline (src/world/places/surfaces.js, rx 20, rz 22) and its backdrop's paths (the main
// path runs north to south at x 0, two cross paths at z -5.5 and 7.5). No DOM, no Three.js.
//   walls   along the shore, west, north, east and south
//   cannons on the four corners, just inside the beach
//   tower   on the hill at the north end of the main path
//   houses  inland, at the ends of the north cross path
//   cabin   just north of the west end of the south cross path, standing from the start (not a build spot)
//   bell    the harbor bell on the south beach, next to where you land
// The ids, kinds and order are the server's (backend/content/islands.json).
import {surfaceClass} from '../world/places/surfaces.js';

export const ISLAND_PLACE = 'home_islet';
export const KINDS = Object.freeze({
  wall: Object.freeze({name: 'Wall', purpose: 'Holds the pirates back from your shore.', cost: 10}),
  cannon: Object.freeze({name: 'Cannon', purpose: 'Fires at pirate ships on its own.', cost: 30}),
  watchtower: Object.freeze({name: 'Watchtower', purpose: 'Spots ships earlier, so your cannons reach further.', cost: 40}),
  house: Object.freeze({name: 'House', purpose: 'Adds 🪙 5 loot for every wave you survive.', cost: 50}),
});
const spot = (id, kind, x, z, edge) => Object.freeze({id, kind, x, z, edge});
export const SPOTS = Object.freeze([
  spot('wall_1', 'wall', -18.5, -4, 'shore'), spot('wall_2', 'wall', 4, -19.5, 'shore'),
  spot('wall_3', 'wall', 18.5, -3, 'shore'), spot('wall_4', 'wall', -6, 18.5, 'shore'),
  spot('cannon_1', 'cannon', -12.5, -14.5, 'corner'), spot('cannon_2', 'cannon', 13, -15, 'corner'),
  spot('cannon_3', 'cannon', 15.5, 14, 'corner'), spot('cannon_4', 'cannon', -15.5, 14.5, 'corner'),
  spot('tower_1', 'watchtower', 0, -14, 'hill'),
  spot('house_1', 'house', 7, -6, 'inland'), spot('house_2', 'house', -8, -6, 'inland'),
]);
export const CABIN = Object.freeze({id: 'island_cabin', x: -8, z: 6});
export const BELL = Object.freeze({id: 'island_bell', x: 5, z: 14});
export const SPOT_IDS = Object.freeze(SPOTS.map(item => item.id));
const ZONE_Y = 1.03, SPOT_RADIUS = 2.2, ROUND_RADIUS = 1.8;

export const spotById = id => SPOTS.find(item => item.id === id) ?? null;
export const isSpotId = id => SPOT_IDS.includes(id);
export const isIslandZone = id => isSpotId(id) || id === BELL.id || id === CABIN.id;
// On the island's land (beach included), never in the sea.
export const onIsland = (x, z) => surfaceClass(ISLAND_PLACE, x, z) > 0;

// A zone's centre: one step from the spot towards the middle of the island, so it is always on land.
function landward({x, z}, step = 1) {
  const length = Math.hypot(x, z) || 1;
  return [x - x / length * step, z - z / length * step];
}
// The interaction zones of the island, in the shape of registry.js: walk up and press E (or tap Inspect).
export function islandZones({visitor = false} = {}) {
  const zone = (id, name, x, z, radius) => ({id, name, x, z, y: ZONE_Y, radius});
  return [
    ...SPOTS.map(item => { const [x, z] = landward(item); return zone(item.id, KINDS[item.kind].name, x, z, SPOT_RADIUS); }),
    zone(BELL.id, 'Harbor bell', BELL.x, BELL.z + .8, ROUND_RADIUS),
    ...(visitor ? [] : [zone(CABIN.id, 'Your cabin', CABIN.x + 2.5, CABIN.z + 1.2, ROUND_RADIUS)]),
  ];
}

// The defences of an island answer, with their place, for the wave simulation (BUILD-PLAN 3.5):
// [{id, kind, x, z}] of the built spots only.
export function defenses(spots = []) {
  return spots.filter(item => item?.built === true && spotById(item.id))
    .map(item => { const where = spotById(item.id); return {id: item.id, kind: item.kind, x: where.x, z: where.z}; });
}
