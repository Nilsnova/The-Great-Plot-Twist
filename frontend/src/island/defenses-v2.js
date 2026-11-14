// What the island's cards will say about the second wave of defenses (T43, decision D048 proposed), and the
// one switch that hides them: the feature flag defenses_v2 that GET /api/config reports. The browser never
// decides a flag by itself; with the flag off (the default, and whenever the config is missing) every tower
// spot offers exactly what it offered before. Prices, waves and the line repeat backend/content/defenses_v2.json
// (tests/pirates/defenses-v2.test.js keeps them equal); the stats come from src/pirates/defenses-v2.js.
// No DOM here. specs/T43-new-defenses.md lists where the cards still need to read this (integration step).
import {DEFENSES_V2} from '../pirates/defenses-v2.js';
import {POINT_TOWER_KINDS, SLOT_KINDS} from './td-rules.js';

export const DEFENSES_V2_FLAG = 'defenses_v2';

// The build card of the culverin, in the shape of BUILDINGS in td-rules.js.
export const CULVERIN_CARD = Object.freeze({
  name: 'Culverin',
  line: 'A long gun: hits far ships hard but slowly. Hunts gunboats and siege barges first.',
  price: Object.freeze([80, 160, 320, 640, 1280]),
  levelWaves: Object.freeze([15, 15, 15, 20, 30]),
  stats: Object.freeze(DEFENSES_V2.culverin.levels.map(({damage, range}) => Object.freeze({damage, range}))),
});
export const DEFENSE_V2_CARDS = Object.freeze({culverin: CULVERIN_CARD});

/** True only when the server's flags say defenses_v2 is on (exactly true; anything else is off). */
export function defensesV2On(flags) {
  return flags?.[DEFENSES_V2_FLAG] === true;
}

/** The kinds an empty tower spot offers: the existing ones, plus the culverin on the island while the flag is on.
 *  Pirate Point never gets it. */
export function towerKinds({flags = null, point = false} = {}) {
  if (point) return POINT_TOWER_KINDS;
  return defensesV2On(flags) ? Object.freeze([...SLOT_KINDS.tower, ...Object.keys(DEFENSE_V2_CARDS)]) : SLOT_KINDS.tower;
}
