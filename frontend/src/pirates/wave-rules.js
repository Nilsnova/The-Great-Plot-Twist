// The simulation rules a wave plays with ("rules" on the wave answers of backend/server/routes/waves.py),
// as options of createWave() in sim.js. The server switches each one on with the feature flag of the same
// name and hands the list to every client of the wave, so every screen in a wave plays the same rules,
// whatever its own /api/config says. A wave without "rules" (every flag off, an older server) plays
// exactly as before. No DOM, no Three.js. Used by controller.js.
//
//   readRules(list)   {towerHealth, pathing, rescue}: true only for the names the list holds

// The name on the wave answer -> the option of createWave().
export const RULE_OPTIONS = Object.freeze({
  tower_health: 'towerHealth', // T33 (D049, proposed): towers have hp, break and are repaired in the wave
  pathing: 'pathing',          // T34/T35 (D040, proposed): boarders walk round or through the real walls
  rescue: 'rescue',            // T38 (D044, proposed): a lost wave first offers the last-chance rescue
});

/** The wave's rules as createWave() options, each true or false; anything that is not a known name is ignored. */
export function readRules(list) {
  const names = Array.isArray(list) ? list : [];
  const out = {};
  for (const [name, option] of Object.entries(RULE_OPTIONS)) out[option] = names.includes(name);
  return out;
}
