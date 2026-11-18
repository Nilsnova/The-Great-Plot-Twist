// The fake server's fixed rules and pure helpers (fake-api.js): the island rules and sim rules it answers with, the
// spot kinds and prices, the unlocks, research and campaign views, the loot, the error type, the wall prices and
// createFakeWorld (the world every fake island API of one page shares). No server state.
import { SLOT_KINDS, BUILDINGS, CREW, CAPTAIN, unlockWave } from '../island/td-rules.js';
import { BRANCHES, readSpec, SPECS, optionName } from '../campaign/tech.js';
import { TOWER_TREES, TREE_STEPS, TREE_LEVEL } from './tower-trees.js';
import { waveOf, STEPS as CAMPAIGN_STEPS } from '../campaign/index.js';
import { GRID as LAYOUT_GRID } from '../island/placement.js';
import { createRandom } from './sim.js';

export const ISLAND_RULES = Object.freeze({
  startingCoins: 100,
  kinds: Object.freeze({ wall: ['Wall', 10], cannon: ['Cannon', 30], mortar: ['Mortar', 60], harpoon: ['Harpoon tower', 40], swivel: ['Swivel-gun nest', 50], culverin: ['Culverin', 80], watchtower: ['Watchtower', 40], house: ['House', 50] }),
  // TOWER-DEFENSE.md §2: 22 spots; cannon_1…cannon_7 take a cannon, a mortar or (after wave 12) a harpoon tower, Pirate Point's tower spots the first two; wall_7…wall_12 are the inner ring (§12).
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']),
  pointSpots: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']),
  // lateFrom, latePerWave: from wave lateFrom on, each wave adds latePerWave instead of perWave (islands.json).
  // bossMultiplier, bossMultiplierByWave, raiseFrom, raiseTimes: the server's named loot values (islands.json,
  // fix/playtest-1117): a boss wave 3 times, the boss wave 40 5 times, island waves above 40 half again.
  loot: Object.freeze({ base: 10, perWave: 5, perHouse: 5, piratePointBase: 20, lateFrom: 30, latePerWave: 2,
    bossMultiplier: 3, bossMultiplierByWave: Object.freeze({ 40: 5 }), raiseFrom: 40, raiseTimes: 1.5 }),
  waves: Object.freeze({ countdownSeconds: 10, minimumSeconds: 10, maximumSeconds: 900, highestWave: 100 }),
  // GAME-V3.md §4 and §5: the wreck's repair and the Tech hub's research (the server's numbers, islands.json).
  wreck: Object.freeze({ goal: 500, gifts: Object.freeze([25, 100]) }),
  weather: Object.freeze({
    storm: Object.freeze({ kind: 'storm', label: 'Storm: 50% more pirate ships', ships: 1.5, fog: 0 }),
    fog: Object.freeze({ kind: 'fog', label: 'Fog: the pirates appear later', ships: 1.0, fog: 0.4 }),
    rain: Object.freeze({ kind: 'rain', label: 'Rain: the pirates do not mind', ships: 1.0, fog: 0 }),
    calm: Object.freeze({ kind: 'calm', label: 'Calm sea', ships: 1.0, fog: 0 }),
  }),
});
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// The run of TOWER-DEFENSE.md §1: waves to 100, a boss every 5th, a lost run restarts 2 waves back.
// The simulation rules of the wave answers, in their fixed order (SIM_RULES in backend/server/island/wave_rules.py).
export const SIM_RULES = Object.freeze(['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2', 'ship_fire']);
// The rules every new wave plays whatever the flags say: their flags are retired (ALWAYS_ON in wave_rules.py).
export const ALWAYS_ON_RULES = Object.freeze(['tower_health', 'pathing', 'tower_obstacles', 'ship_fire']);
export const TD_RULES = Object.freeze({ highestWave: 100, bossEvery: 5, restartBack: 2,
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']),
  piratePoint: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']) });
export const isBoss = run => !run.flagship && run.wave % TD_RULES.bossEvery === 0;
// tower_sN (the contract's name) and cannon_N (the island's) are one spot.
export const canonicalSpot = spot => (typeof spot === 'string' ? spot.replace(/^tower_s([1-7])$/, 'cannon_$1') : spot);
export const kindOfSpot = spot => (/^(pp_)?wall_/.test(spot) ? 'wall' : /^(cannon_|pp_tower_)/.test(spot) ? 'cannon' : spot === 'tower_1' ? 'watchtower' : 'house');
// The slot of a spot: a tower spot accepts a cannon or a mortar (§2), on the island also a harpoon tower (GAME-V3.md §5).
export const slotOfSpot = spot => (kindOfSpot(spot) === 'cannon' ? 'tower' : kindOfSpot(spot));
// T43 (D048 proposed): the culverin joins the island's tower spots, prices and unlocks only while the fake's flag
// defenses_v2 is on (?fakeflags=defenses_v2), as the real server's catalogue_for_flags(); off, every answer is as before.
export const V2_KINDS = Object.freeze(['culverin']);
export const kindsOfSpot = (spot, culverin = false) => [...SLOT_KINDS[slotOfSpot(spot)].filter(kind => (kind !== 'harpoon' && kind !== 'swivel') || !/^pp_/.test(spot)),
  ...(culverin && slotOfSpot(spot) === 'tower' && !/^pp_/.test(spot) ? V2_KINDS : [])];
export const KINDS_V1 = Object.entries(BUILDINGS).filter(([kind]) => !V2_KINDS.includes(kind));
// The price lists of GET /api/island (indexed by level - 1; the captain's level 1 is free).
export const pricesOf = kinds => Object.freeze({ kinds: Object.fromEntries(kinds.map(([kind, info]) => [kind, [...info.price]])),
  crew: Object.fromEntries(Object.entries(CREW).map(([id, info]) => [id, { price: info.price, max: info.max }])), captain: [...CAPTAIN.price],
  // D051: what one tower's skill costs, per research branch (islands.json skillCoins).
  towerSkills: Object.fromEntries(BRANCHES.map(item => [item.branch, { ...item.skillCoins }])),
  // D055: the upgrade trees of the tower kinds on the island (tower_trees.json), the culverin's only with its flag.
  towerTrees: Object.fromEntries(Object.entries(TOWER_TREES).filter(([kind]) => kinds.some(([name]) => name === kind)).map(([kind, tree]) => [kind,
    { prices: [...tree.prices], waves: TREE_STEPS.map(id => waveOf(id)), level: TREE_LEVEL, a: { id: tree.a.id, name: tree.a.name }, b: { id: tree.b.id, name: tree.b.name } }])) });
export const PRICES = pricesOf(KINDS_V1), PRICES_V2 = pricesOf(Object.entries(BUILDINGS));
// Every unlock id with the wave it needs (§9): "<kind>:<level>", "crew:<crew>", "captain:<level>".
export const unlockIds = kinds => Object.freeze([
  ...kinds.flatMap(([kind, info]) => info.price.map((_, index) => [`${kind}:${index + 1}`, unlockWave({ kind, level: index + 1 })])),
  ...Object.keys(CREW).map(id => [`crew:${id}`, unlockWave({ crew: id })]),
  ...CAPTAIN.price.map((_, index) => [`captain:${index + 1}`, index === 0 ? 0 : unlockWave({ captain: index + 1 })]),
]);
export const UNLOCK_IDS = unlockIds(KINDS_V1), UNLOCK_IDS_V2 = unlockIds(Object.entries(BUILDINGS));
export function unlocksAt(wave, { culverin = false } = {}) {
  const ids = culverin ? UNLOCK_IDS_V2 : UNLOCK_IDS;
  return { wave, unlocked: ids.filter(([, needed]) => needed <= wave).map(([id]) => id),
    locked: Object.fromEntries(ids.filter(([, needed]) => needed > wave)) };
}
// A spot as GET /api/island answers it (§7): kind is the building that stands (or the default), level 0 = empty.
export function spotView(island, id, culverin = false) {
  const level = island.levels?.get(id) ?? (island.built.has(id) ? 1 : 0), kind = island.kinds?.get(id) ?? kindOfSpot(id);
  const prices = BUILDINGS[kind].price;
  return { id, kind, kinds: [...kindsOfSpot(id, culverin)], built: level > 0, level, cost: prices[0], upgradeCost: level > 0 ? prices[level] ?? null : null,
    spec: level > 0 ? readSpec(kind, island.specs?.get(id)) : null,
    // D055: a built tower of a kind with a tree carries its tiers ({a, b}, 0 to 3 each).
    tree: level > 0 && TOWER_TREES[kind] ? { a: island.trees?.get(id)?.a ?? 0, b: island.trees?.get(id)?.b ?? 0 } : null,
    // T36: a spot moved on the build grid carries its cell (the real server sends every spot's place).
    ...(island.positions?.has(id) ? { x: island.positions.get(id).x, z: island.positions.get(id).z } : {}) };
}
// T36: the answer's layout ({version 1: the fixed spots, 2: something moved; the fake can always move}).
export const layoutOf = island => ({ version: island.positions?.size ? 2 : 1, grid: LAYOUT_GRID, movable: true });
export const lockedMessage = wave => `Opens after wave ${wave}.`;
// The Tech hub's research of one branch on an island (GAME-V3.md §5.1): {tier 0-3, tier2, tier3}. island.research
// lists the branches at tier 1 or more; island.tiers holds {branch: {tier, tier2, tier3}} once a branch went higher.
export function researchOf(island, branch) {
  if (!(island.research ?? []).includes(branch)) return { tier: 0, tier2: null, tier3: null };
  const sent = island.tiers?.[branch];
  return { tier: Math.max(1, sent?.tier ?? 1), tier2: sent?.tier2 ?? null, tier3: sent?.tier3 ?? null };
}
// The campaign of an island (GAME-V3.md §4), in the shape of GET /api/island's `campaign`.
export function campaignAt(island) {
  const wave = island.waveBest ?? 0, open = [], locked = {}, later = [];
  for (const step of CAMPAIGN_STEPS) for (const id of step.opens) {
    if (step.later) later.push(id); else if (step.wave <= wave) open.push(id); else locked[id] = step.wave;
  }
  return { wave, open, locked, later,
    research: { done: BRANCHES.map(item => item.branch).filter(branch => (island.research ?? []).includes(branch)),
      tiers: Object.fromEntries(BRANCHES.map(item => [item.branch, researchOf(island, item.branch)])),
      branches: BRANCHES.map(item => ({ branch: item.branch, name: item.name, price: item.price, prices: [...item.prices],
        specs: item.specs.map(id => ({ id, name: SPECS[id].name })),
        tier2: item.tier2.map(id => ({ id, name: optionName(id) })), tier3: item.tier3.map(id => ({ id, name: optionName(id) })) })),
      tierWaves: [1, 2, 3].map(tier => waveOf(tier === 1 ? 'tech_hub' : `research_${tier}`)) },
    wreck: { paid: Math.min(ISLAND_RULES.wreck.goal, island.wreck ?? 0), goal: ISLAND_RULES.wreck.goal, gifts: [...ISLAND_RULES.wreck.gifts] } };
}

export class FakeApiError extends Error {
  constructor(status, code, message, retryAfter = null) {
    super(message);
    Object.assign(this, { name: new.target.name, status, code, retryAfter, body: { error: { code, message } } });
  }
}
export const refuse = (status, code, message, retryAfter) => { throw new FakeApiError(status, code, message, retryAfter); };
export const invalid = message => refuse(422, 'validation_error', message);

/** The 5 symbols inside what a player typed ("ISLE-K7Q2M", "isle k7q2m", "K7Q2M"), or null. */
export function readIslandCode(text) {
  if (typeof text !== 'string' || text.length > 32) return null;
  let compact = text.replace(/[\s-]/g, '').toUpperCase();
  if (compact.length === 9 && compact.startsWith('ISLE')) compact = compact.slice(4);
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(compact) ? compact : null;
}
export const wantsFakeIslands = (search = '') => new URLSearchParams(search).get('islands') === 'fake';
export const islandRoom = code => `live:place:isle_${readIslandCode(code)?.toLowerCase()}:1`;
export function lootFor(wave, houses, piratePoint = false) {
  const { base, perWave, perHouse, piratePointBase, lateFrom, latePerWave, raiseFrom, raiseTimes } = ISLAND_RULES.loot;
  const waves = perWave * Math.min(wave, lateFrom) + latePerWave * Math.max(0, wave - lateFrom);
  if (piratePoint) return piratePointBase + waves;
  const normal = base + waves + perHouse * houses;
  return wave > raiseFrom ? Math.floor(normal * raiseTimes) : normal;
}
export const bossMultiplierFor = wave => ISLAND_RULES.loot.bossMultiplierByWave[wave] ?? ISLAND_RULES.loot.bossMultiplier;
// D039 (wall_health.py): the price of a whole rebuild (30% of the wall's levels, rounded up: 3, 9, 21, 45, 93) and of a
// Repair (the missing share of it, rounded up, at least 1); the finish's walls body ({wall_N: 0..100}, at most 50).
export const WALL_RECOVERY_MS = 600 * 1000;
export const rebuildPrice = level => Math.max(1, Math.ceil(BUILDINGS.wall.price.slice(0, Math.max(1, level)).reduce((sum, price) => sum + price, 0) * 30 / 100));
export const restorePrice = (full, health) => Math.max(1, Math.ceil(full * (100 - Math.max(0, Math.min(100, health))) / 100));
export const isWallReport = walls => !!walls && typeof walls === 'object' && !Array.isArray(walls) && Object.keys(walls).length <= 50
  && Object.entries(walls).every(([id, value]) => /^wall_[0-9]{1,2}$/.test(id) && Number.isInteger(value) && value >= 0 && value <= 100);
export const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export const DEFAULT_FRIEND = Object.freeze({ code: 'K7Q2M', ownerName: 'Captain Wren', waveBest: 2, built: Object.freeze(['wall_1', 'cannon_1', 'cannon_2']) });
// GAME-V3.md §2: the host plus up to 9 friends (the server's game_join cap).
export const MAX_MEMBERS = 10;
export const GAME_FULL = `This game has ${MAX_MEMBERS} players already.`;

/** Shared state, so several fake players (two tabs in one test) can meet on one island. */
export function createFakeWorld({ seed = 7, neighbours = true, friends = [DEFAULT_FRIEND] } = {}) {
  const world = { random: createRandom(seed), islands: new Map(), players: new Map(), waves: new Map(),
    pointBest: 0, pointFlags: 0, nextWave: 1, clock: 0,
    // The games (island_members): code -> player -> {role, joined, opened, left}.
    members: new Map(),
    point: { built: new Set(), levels: new Map(), kinds: new Map() } };
  // Friends' islands to visit by code, with a few things built.
  if (neighbours) friends.forEach((friend, index) => {
    const owner = index === 0 ? 'friend' : `friend_${index + 1}`;
    world.islands.set(friend.code, { code: friend.code, owner, ownerName: friend.ownerName, waveBest: friend.waveBest ?? 0,
      flags: friend.waveBest ?? 0, built: new Set(friend.built ?? []), levels: new Map((friend.built ?? []).map(id => [id, 1])), kinds: new Map(),
      crew: { gunner: 0, carpenter: 0, lookout: 0, guard: 0 }, captain: 1, nextWave: (friend.waveBest ?? 0) + 1 });
    world.players.set(owner, { coins: 40, ownerName: friend.ownerName, actions: new Map(), code: friend.code });
    // The friend hosts the game, and your captain ("me") is in it already.
    world.members.set(friend.code, new Map([[owner, { role: 'host', joined: 0, opened: 0, left: null }],
      ['me', { role: 'member', joined: 0, opened: 0, left: null }]]));
  });
  return world;
}
