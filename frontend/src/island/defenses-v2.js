// What the island's cards say about the second wave of defenses (T43, decision D048): the culverin. Its flag
// defenses_v2 is retired (always on). Prices, waves and the line repeat backend/content/defenses_v2.json
// (tests/pirates/defenses-v2.test.js keeps them equal); the stats come from src/pirates/defenses-v2.js.
// No DOM here. card-model.js builds a tower spot's choices from towerKinds({point}).
import {BUILDINGS, POINT_TOWER_KINDS, SLOT_KINDS} from './td-rules.js';

// The build card of the culverin: BUILDINGS.culverin of td-rules.js (name, line, price, levelWaves, stats).
export const CULVERIN_CARD = BUILDINGS.culverin;
export const DEFENSE_V2_CARDS = Object.freeze({culverin: CULVERIN_CARD});

const ISLAND_TOWER_KINDS = Object.freeze([...SLOT_KINDS.tower, ...Object.keys(DEFENSE_V2_CARDS)]);
/** The kinds an empty tower spot offers: the existing ones plus the culverin on the island. Pirate Point never gets it. */
export function towerKinds({point = false} = {}) {
  return point ? POINT_TOWER_KINDS : ISLAND_TOWER_KINDS;
}
