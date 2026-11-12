// Where things stand on your island (BUILD-PLAN 3.3), as plain data on the home_islet place: logical
// x/z on its coastline (src/world/places/surfaces.js, rx 20, rz 22) and its backdrop's paths (the main
// path runs north to south at x 0, two cross paths at z -5.5 and 7.5). No DOM, no Three.js.
//   spots   SPOT_TABLE below (22, docs/TOWER-DEFENSE.md §2), and Pirate Point's PP_SPOT_TABLE (§5)
//   cabin   just north of the west end of the south cross path, standing from the start (not a build spot)
//   bell    the harbor bell on the south beach, next to where you land
import {surfaceClass} from '../world/places/surfaces.js';
import {isCapstone, readBonus, readSpec} from '../campaign/tech.js';

export const ISLAND_PLACE = 'home_islet';
export const KINDS = Object.freeze({
  wall: Object.freeze({name: 'Wall', purpose: 'Stops boarders until they break it.', cost: 10}),
  cannon: Object.freeze({name: 'Cannon', purpose: 'Fires at one ship at a time.', cost: 30}),
  mortar: Object.freeze({name: 'Mortar', purpose: 'Hits every ship near the impact.', cost: 60}),
  watchtower: Object.freeze({name: 'Watchtower', purpose: 'Gives all your towers more range.', cost: 40}),
  house: Object.freeze({name: 'House', purpose: 'Adds 🪙 5 loot for every wave you win.', cost: 50}),
});
// THE spot table (docs/TOWER-DEFENSE.md §2, 22 spots): [id, slot, x, z, edge]. slot is what may stand
// there: wall, tower (a cannon or a mortar, chosen at the first build), watchtower or house. The
// server's ids are the first column (the backend's ids as built, 11 Nov); if the backend renames a
// spot, change it here (or add the old name to SPOT_ALIASES) and nothing else.
//   walls   six along the shore (west, north twice, east, south twice), and the inner ring wall_7…wall_12
//           around the island's heart (§12; the sim's CONFIG.boarding.heart, 0,2), on the paths the
//           boarders take: east, the south cross path twice, west (north of the cabin), the north cross path twice
//   towers  cannon_1…cannon_7 (a cannon or a mortar): the four corners, west, east and the south beach
//   tower   the watchtower on the hill at the north end of the main path
//   houses  inland, at the ends of the north cross path
export const SPOT_TABLE = Object.freeze([
  ['wall_1', 'wall', -18.5, -4, 'shore'], ['wall_2', 'wall', 4, -19.5, 'shore'],
  ['wall_3', 'wall', 18.5, -3, 'shore'], ['wall_4', 'wall', -6, 18.5, 'shore'],
  ['wall_5', 'wall', 12, 18, 'shore'], ['wall_6', 'wall', -5, -19.5, 'shore'],
  ['cannon_1', 'tower', -12.5, -14.5, 'corner'], ['cannon_2', 'tower', 13, -15, 'corner'],
  ['cannon_3', 'tower', 15.5, 14, 'corner'], ['cannon_4', 'tower', -15.5, 14.5, 'corner'],
  ['cannon_5', 'tower', -15, -6, 'side'], ['cannon_6', 'tower', 14.5, -3, 'side'], ['cannon_7', 'tower', 4.5, 16.5, 'side'],
  ['tower_1', 'watchtower', 0, -14, 'hill'],
  ['house_1', 'house', 7, -6, 'inland'], ['house_2', 'house', -8, -6, 'inland'],
  ['wall_7', 'wall', 8.5, 2, 'ring'], ['wall_8', 'wall', 4.5, 9, 'ring'], ['wall_9', 'wall', -4, 9.5, 'ring'],
  ['wall_10', 'wall', -9.5, -1, 'ring'], ['wall_11', 'wall', -4, -5.5, 'ring'], ['wall_12', 'wall', 4, -5.5, 'ring'],
].map(row => Object.freeze(row)));
// Other names an answer may use for the same spots (old drafts of §2). The backend's ids need none.
export const SPOT_ALIASES = Object.freeze(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [`tower_s${n}`, `cannon_${n}`])));
export const localSpotId = id => SPOT_ALIASES[id] ?? id;
const DEFAULT_KIND = {wall: 'wall', tower: 'cannon', watchtower: 'watchtower', house: 'house'};
const spot = ([id, slot, x, z, edge]) => Object.freeze({id, slot, kind: DEFAULT_KIND[slot], x, z, edge});
export const SPOTS = Object.freeze(SPOT_TABLE.map(spot));
export const isTowerSlot = id => spotById(id)?.slot === 'tower' || ppSpotById(id)?.slot === 'tower';

// Pirate Point's shared spots (§5) on lighthouse_isle: [id, slot, x, z]. pp_wall_1…4 and pp_tower_1…4
// stand where its fixed defenses stood (src/pirates/pirate-point.js), pp_tower_5…6 are new.
export const POINT_PLACE = 'lighthouse_isle';
export const PP_SPOT_TABLE = Object.freeze([
  ['pp_wall_1', 'wall', 20, -1], ['pp_wall_2', 'wall', 15.5, 11], ['pp_wall_3', 'wall', 12, -15.5], ['pp_wall_4', 'wall', 19.5, 5],
  ['pp_tower_1', 'tower', 12, -12], ['pp_tower_2', 'tower', 11, 12.5], ['pp_tower_3', 'tower', 12.5, -3], ['pp_tower_4', 'tower', 3, 12.5],
  ['pp_tower_5', 'tower', 17.5, -6.5], ['pp_tower_6', 'tower', 7, 8.5],
].map(row => Object.freeze(row)));
export const PP_SPOTS = Object.freeze(PP_SPOT_TABLE.map(([id, slot, x, z]) => spot([id, slot, x, z, 'point'])));
export const ppSpotById = id => PP_SPOTS.find(item => item.id === id) ?? null;
export const isPointSpot = id => !!ppSpotById(id);
export const CABIN = Object.freeze({id: 'island_cabin', x: -8, z: 6});
export const BELL = Object.freeze({id: 'island_bell', x: 8.5, z: 12});
// The campaign's buildings (docs/GAME-V3.md §4 and §5): they stand from the start as a building site with a
// sign "opens after wave N" and become the building once the island has won that wave. item: the campaign id
// that opens it (src/campaign/campaign.json); art: its cartoon frame (src/art/campaign.js), mended: the frame
// once the wreck is repaired. Places on free ground: the Harbor east of the bell's beach, the Tech hub north-east
// between the watchtower hill and the corner cannon, the wreck on the west beach.
export const CAMPAIGN_BUILDINGS = Object.freeze([
  Object.freeze({id: 'island_harbor', item: 'harbor', name: 'The Harbor', x: 13, z: 7.5, art: 'island-harbor', w: 4.4, h: 4.2}),
  Object.freeze({id: 'island_techhub', item: 'tech_hub', name: 'Tech hub', x: 8.5, z: -12.5, art: 'island-techhub', w: 4.4, h: 5.4}),
  Object.freeze({id: 'island_wreck', item: 'wreck', name: 'The wreck', x: -16.5, z: 5, art: 'island-wreck', mended: 'island-wreck-mended', w: 5.2, h: 3.6}),
]);
export const campaignBuilding = id => CAMPAIGN_BUILDINGS.find(item => item.id === id) ?? null;
export const SPOT_IDS = Object.freeze(SPOTS.map(item => item.id));
// Walk-up range (owner, 12 Nov: open a card only when you stand close). Each zone's centre sits one step in
// front of the building (so it is always on land); with these radii you reach it from about 3.5 units
// from the building's foot. The campaign buildings are wider, so their reach is a little longer.
export const REACH = 2.6, BIG_REACH = 3.2;
const ZONE_Y = 1.03, SPOT_RADIUS = REACH, ROUND_RADIUS = 2.2;

export const spotById = id => SPOTS.find(item => item.id === localSpotId(id)) ?? null;
export const isSpotId = id => SPOT_IDS.includes(localSpotId(id));
export const isIslandZone = id => isSpotId(id) || id === BELL.id || id === CABIN.id || isPointSpot(id) || !!campaignBuilding(id);
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
    ...SPOTS.map(item => { const [x, z] = landward(item); return zone(item.id, slotName(item.slot), x, z, SPOT_RADIUS); }),
    zone(BELL.id, 'Harbor bell', BELL.x, BELL.z + .8, ROUND_RADIUS),
    ...CAMPAIGN_BUILDINGS.map(item => { const [x, z] = landward(item, 1.6); return zone(item.id, item.name, x, z + .6, BIG_REACH); }),
    ...(visitor ? [] : [zone(CABIN.id, 'Your cabin', CABIN.x + 2.5, CABIN.z + 1.2, ROUND_RADIUS)]),
  ];
}

// Pirate Point's build zones, added to lighthouse_isle's own (its bell and lamps stay its own).
export function pointZones() {
  return PP_SPOTS.map(item => { const [x, z] = landward(item); return {id: item.id, name: slotName(item.slot), x, z, y: ZONE_Y, radius: SPOT_RADIUS}; });
}
export const slotName = slot => (slot === 'tower' ? 'Tower spot' : KINDS[DEFAULT_KIND[slot]]?.name ?? 'Build spot');

// The defences of an island answer, with their place, for the wave simulation (BUILD-PLAN 3.5):
// [{id, kind, level, x, z, spec?, bonus?}] of the built spots only (TOWER-DEFENSE.md §8); spec is the tower
// skill it picked at the Tech hub (GAME-V3.md §5), bonus the island's tier-2 pick for its kind (§5.1, from
// `tiers`: campaignOf(answer).research.tiers). The sim reads both, so every screen fights the same island.
export function defenses(spots = [], tiers = null) {
  return spots.filter(item => item?.built === true && (spotById(item.id) || ppSpotById(item.id)))
    .map(item => { const where = spotById(item.id) ?? ppSpotById(item.id), spec = readSpec(item.kind, item.spec);
      const bonus = readBonus(item.kind, tiers?.[item.kind]?.tier2);
      // A capstone counts only while its island's tier-3 pick is that capstone.
      const kept = spec && isCapstone(spec) && tiers?.[item.kind]?.tier3 !== spec ? null : spec;
      return {id: item.id, kind: item.kind, level: Number.isSafeInteger(item.level) && item.level > 0 ? item.level : 1, x: where.x, z: where.z,
        ...(kept ? {spec: kept} : {}), ...(bonus ? {bonus} : {})}; });
}
