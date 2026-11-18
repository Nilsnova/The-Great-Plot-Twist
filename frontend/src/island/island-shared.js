// The island screen's module-level names (index.js): the bus events it emits, the storage keys it keeps, the sea
// chart's names and small answer helpers. index.js re-exports the public ones; import them from there.


export const ARRIVAL_KEY = 'plot_twist_island_arrival_v1';
// A build or upgrade went through: {place: 'own' | 'visit' | 'point', spot}. The wave wiring tells the
// room (island_changed), so every other defender reads the island again (co-op, TOWER-DEFENSE.md §6).
export const SPOTS_CHANGED = 'island_spots_changed';
// What this device has been told once: the unlock lines (§9) and the musket hint (§10).
export const NEWS_KEY = 'plot_twist_td_news_v1';
// GAME-V3.md §4: a won wave opened something on the island on screen.
export const CAMPAIGN_UNLOCKED = 'campaign_unlocked';
export const TOWER_SPECIALISED = 'tower_specialised';
// D055: a tier of a tower's upgrade tree was bought on this page: {spot, kind, path, tier}.
export const TOWER_TREE_BOUGHT = 'tower_tree_bought';
// A house picked a role (GAME-V3.md "Houses"): {spot, role, first} (first: the first role on this island seen by this page).
export const HOUSE_ROLE_PICKED = 'house_role_picked';
export const VISIT_NAMED = 'island_visit_named';
// T53: your own island was reset to a fresh start on this page: {code}. The narrator forgets what it told there.
export const ISLAND_RESET = 'island_reset';
export const CHART_NAMES = Object.freeze({home_islet: 'Your island', saltreach_harbor: 'The Harbor', lighthouse_isle: 'Pirate Point'});
export const notReady = () => Promise.resolve({ok: false, status: 503, code: 'not_ready',
  message: 'Sign in to build on your island. You can keep exploring.'});
// The break after a wave: everything is whole again (the server repaired it as the wave closed).
export const ALL_REPAIRED = 'All buildings repaired.';
export const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
// An island read that failed for a reason that may pass (no answer, 429, a 5xx): worth reading again.
export const mayPass = answer => !answer.ok && answer.code !== 'not_ready' && (answer.status === 0 || answer.status === 429 || answer.status >= 500);
