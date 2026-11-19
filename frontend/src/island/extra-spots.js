// More tower spots over time (D060, owner's playtest of 16 Nov: "from time to time enable more slots for
// additional towers or cannons"). Plain data, no imports: src/island/spots.js and src/campaign/index.js both read it.
// [id, x, z, unlockWave]: the server's backend/content/islands.json extraTowerSpots (the waves) and
// backend/content/island_layout.json extraSpots (where they stand); tests/island/extra-spots.test.js keeps them equal.
// The server offers them only while its flag more_tower_spots is on: an island answer then lists them after the 22
// spots of before, and the browser shows an extra spot only when the answer lists it. Each takes every kind a tower
// spot takes (cannon, mortar, harpoon, swivel, culverin) and opens once the island has won its wave.
//   cannon_8   south-west, between the cabin and the south-west corner gun    after wave 10
//   cannon_9   north-east, between the east gun and the Tech hub              after wave 20
//   cannon_10  south of the heart, east of the main path, above the bench     after wave 30
//   cannon_11  north-west, off the central path                              after wave 40
export const EXTRA_SPOT_TABLE = Object.freeze([
  ['cannon_8', -8.5, 12, 10], ['cannon_9', 11.5, -8.5, 20], ['cannon_10', 5, 10, 30], ['cannon_11', -3.5, -7.5, 40],
].map(row => Object.freeze(row)));
export const EXTRA_SPOT_IDS = Object.freeze(EXTRA_SPOT_TABLE.map(([id]) => id));
const WAVES = new Map(EXTRA_SPOT_TABLE.map(([id, , , wave]) => [id, wave]));
export const isExtraSpot = id => WAVES.has(id);
/** The won wave an extra tower spot needs (0 for every other spot). */
export const extraSpotWave = id => WAVES.get(id) ?? 0;
/** The extra spots an island answer offers (the server's flag more_tower_spots on): their ids, in table order. */
export const offeredExtra = (spots = []) => {
  const listed = new Set((Array.isArray(spots) ? spots : []).map(item => item?.id));
  return EXTRA_SPOT_IDS.filter(id => listed.has(id));
};
/** The extra spots that opened when an island's best won wave went from `from` to `to`. */
export const extraOpenedBetween = (from, to, spots = []) => offeredExtra(spots).filter(id => WAVES.get(id) > from && WAVES.get(id) <= to);
