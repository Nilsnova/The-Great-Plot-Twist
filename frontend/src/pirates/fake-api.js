// In-memory stand-in for the island and wave routes of BUILD-PLAN 3.4 (server: INTERFACES.md,
// "Your island and the pirate waves"), so the island and harbor lanes run without a server
// (?islands=fake). Same answers, same error shape {"error": {"code", "message"}}, same prices,
// loot and timing rules. Nothing is stored: a reload starts again.
//
//   const api = createFakeIslandApi();           // or {world, playerId, ownerName, now, seed, weather}
//   await api.island();                          // GET  /api/island
//   await api.build({spot, kind, actionUid});    // POST /api/island/build
//   await api.visit(code);                       // GET  /api/island/visit/{code}
//   await api.startWave({where, actionUid});     // POST /api/waves/start
//   await api.joinWave({waveId});                // POST /api/waves/join
//   await api.currentWave(where);                // GET  /api/waves/current?where=
//   await api.finishWave({waveId, survived, shipsSunk}); // POST /api/waves/finish
//   await api.reviveCaptain({waveId, fallen, downAt, actionUid}); // POST /api/waves/revive  (GAME-V3.md §3: you pay 20 + 5 × wave)
//   await api.upgrade({spot, actionUid});        // POST /api/island/upgrade      (TOWER-DEFENSE.md §7)
//   await api.hire({crew, actionUid});           // POST /api/island/hire
//   await api.captain({actionUid});              // POST /api/island/captain      (§10)
//   await api.learnSkill({skill, actionUid});    // POST /api/island/skill        (§14)
//   await api.pickRole({role}); await api.respec({actionUid}); // POST /api/island/role, /respec (GAME-V3.md, Captain tree and roles)
//   await api.buyWeapon({weapon, actionUid});    // POST /api/island/weapon/buy   (§15)
//   await api.equipWeapon({weapon});             // POST /api/island/weapon/equip
//   await api.demolishQuote({spot, code?});      // GET  /api/island/demolish     (GAME-V3.md §4.2: half back to each payer)
//   await api.demolish({spot, actionUid, code?}); // POST /api/island/demolish    (between waves, any member; not the heart)
//   await api.piratePoint();                     // GET  /api/pirate-point        (§5)
//   await api.pointBuild({spot, kind, actionUid}) / api.pointUpgrade({spot, actionUid})
//   await api.inviteJoin({code, actionUid});     // POST /api/island/invite/join  (§6, an alias of joinGame)
// The games of GAME-V3.md §2 (a game is an island; at most 10 players; members build, upgrade, ring, join its
// waves and visit it there):
//   await api.createGame();                      // POST /api/games
//   await api.joinGame({code, actionUid});       // POST /api/games/join           (409 game_full)
//   await api.games();                           // GET  /api/games                (Continue, newest first)
//   await api.lobby(code);                       // GET  /api/games/{code}         (403 not_member)
//   await api.leaveGame({code});                 // POST /api/games/leave          (409 host_cannot_leave)
// In a fresh world your captain ("me") is already a member of the friends' games (ISLE-FR3ND), so Continue
// shows two games; another captain joins first, as on the server.
// Waves (§1, §4): numbers to 100, every 5th a boss wave (`boss: true`, loot × 2), houses pay by level, and the
// next bell carries on after a win and restarts at best − 2 (at least 1) after a loss (`nextWave`).
// Spot ids: the island's tower spots are cannon_1…cannon_7; tower_s1…tower_s7 are accepted as the same spots.
// The locks of §9 (409 locked) follow your best wave (your island or a Pirate Point wave you fought in):
// on in the game's transport (?islands=fake) and with {version: 2}; off by default for older tests.
//   await api.fetch('/api/island', {method, body}); // the same as a fetch() Response
// A refusal rejects with FakeApiError {status, code, message, body, retryAfter}.
//
// The island lane's client (src/island/api.js) reads the same fake through createFakeIslandTransport():
// {get(path), post(path, body)} answering like online/api.js ({ok, status, data} or {ok: false, status,
// code, message, retryAfterSeconds}), plus dev helpers (setCoins, setWeather, startWaveAt, failNext,
// read, reset). It is the one fake behind ?islands=fake: your island ISLE-K7Q2M and a friend's island
// ISLE-FR3ND (Captain Gull) to visit.
import { bonusLoot, eventFor } from './wave-events.js';
import { createRandom, hasTavern, revivePrice } from './sim.js';
import { BUILDINGS, CREW, CAPTAIN, readUnlocks, unlockWave, SLOT_KINDS } from '../island/td-rules.js';
import { ROLES, ROLE_BY_ID, ROLE_LEVEL, SKILLS, SKILL_BY_ID, WEAPONS, WEAPON_BY_ID, isRole, respecPrice, pointsEarned, pointsSpent, readSkills, readWeapon, skillNeeds } from './captain-ids.js';
import { STEPS as CAMPAIGN_STEPS, spotWave, waveOf } from '../campaign/index.js';
import { BRANCHES, BRANCH_BY_ID, SPECS, TOP_TIER, isCapstone, optionName, optionsOf, readSpec } from '../campaign/tech.js';
import { ROLES as HOUSE_ROLES, ROLE_LEVEL as HOUSE_ROLE_LEVEL } from '../campaign/houses.js';

export const ISLAND_RULES = Object.freeze({
  startingCoins: 100,
  kinds: Object.freeze({ wall: ['Wall', 10], cannon: ['Cannon', 30], mortar: ['Mortar', 60], harpoon: ['Harpoon tower', 40], watchtower: ['Watchtower', 40], house: ['House', 50] }),
  // TOWER-DEFENSE.md §2: 22 spots; cannon_1…cannon_7 take a cannon, a mortar or (after wave 12) a harpoon tower, Pirate Point's tower spots the first two; wall_7…wall_12 are the inner ring (§12).
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']),
  pointSpots: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']),
  // lateFrom, latePerWave: from wave lateFrom on, each wave adds latePerWave instead of perWave (islands.json).
  loot: Object.freeze({ base: 10, perWave: 5, perHouse: 5, piratePointBase: 20, lateFrom: 30, latePerWave: 2 }),
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
export const TD_RULES = Object.freeze({ highestWave: 100, bossEvery: 5, restartBack: 2,
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'cannon_5', 'cannon_6', 'cannon_7', 'tower_1', 'house_1', 'house_2', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']),
  piratePoint: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']) });
const isBoss = run => !run.flagship && run.wave % TD_RULES.bossEvery === 0;
// tower_sN (the contract's name) and cannon_N (the island's) are one spot.
const canonicalSpot = spot => (typeof spot === 'string' ? spot.replace(/^tower_s([1-7])$/, 'cannon_$1') : spot);
const kindOfSpot = spot => (/^(pp_)?wall_/.test(spot) ? 'wall' : /^(cannon_|pp_tower_)/.test(spot) ? 'cannon' : spot === 'tower_1' ? 'watchtower' : 'house');
// The slot of a spot: a tower spot accepts a cannon or a mortar (§2), on the island also a harpoon tower (GAME-V3.md §5).
const slotOfSpot = spot => (kindOfSpot(spot) === 'cannon' ? 'tower' : kindOfSpot(spot));
const kindsOfSpot = spot => SLOT_KINDS[slotOfSpot(spot)].filter(kind => kind !== 'harpoon' || !/^pp_/.test(spot));
// The price lists of GET /api/island (indexed by level - 1; the captain's level 1 is free).
const PRICES = Object.freeze({ kinds: Object.fromEntries(Object.entries(BUILDINGS).map(([kind, info]) => [kind, [...info.price]])),
  crew: Object.fromEntries(Object.entries(CREW).map(([id, info]) => [id, { price: info.price, max: info.max }])), captain: [...CAPTAIN.price] });
// Every unlock id with the wave it needs (§9): "<kind>:<level>", "crew:<crew>", "captain:<level>".
const UNLOCK_IDS = Object.freeze([
  ...Object.entries(BUILDINGS).flatMap(([kind, info]) => info.price.map((_, index) => [`${kind}:${index + 1}`, unlockWave({ kind, level: index + 1 })])),
  ...Object.keys(CREW).map(id => [`crew:${id}`, unlockWave({ crew: id })]),
  ...CAPTAIN.price.map((_, index) => [`captain:${index + 1}`, index === 0 ? 0 : unlockWave({ captain: index + 1 })]),
]);
export function unlocksAt(wave) {
  return { wave, unlocked: UNLOCK_IDS.filter(([, needed]) => needed <= wave).map(([id]) => id),
    locked: Object.fromEntries(UNLOCK_IDS.filter(([, needed]) => needed > wave)) };
}
// A spot as GET /api/island answers it (§7): kind is the building that stands (or the default), level 0 = empty.
function spotView(island, id) {
  const level = island.levels?.get(id) ?? (island.built.has(id) ? 1 : 0), kind = island.kinds?.get(id) ?? kindOfSpot(id);
  const prices = BUILDINGS[kind].price;
  return { id, kind, kinds: [...kindsOfSpot(id)], built: level > 0, level, cost: prices[0], upgradeCost: level > 0 ? prices[level] ?? null : null,
    spec: level > 0 ? readSpec(kind, island.specs?.get(id)) : null };
}
const lockedMessage = wave => `Opens after wave ${wave}.`;
// The Tech hub's research of one branch on an island (GAME-V3.md §5.1): {tier 0-3, tier2, tier3}. island.research
// lists the branches at tier 1 or more; island.tiers holds {branch: {tier, tier2, tier3}} once a branch went higher.
function researchOf(island, branch) {
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
const refuse = (status, code, message, retryAfter) => { throw new FakeApiError(status, code, message, retryAfter); };
const invalid = message => refuse(422, 'validation_error', message);

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
  const { base, perWave, perHouse, piratePointBase, lateFrom, latePerWave } = ISLAND_RULES.loot;
  const waves = perWave * Math.min(wave, lateFrom) + latePerWave * Math.max(0, wave - lateFrom);
  return piratePoint ? piratePointBase + waves : base + waves + perHouse * houses;
}
const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export const DEFAULT_FRIEND = Object.freeze({ code: 'K7Q2M', ownerName: 'Captain Wren', waveBest: 2, built: Object.freeze(['wall_1', 'cannon_1', 'cannon_2']) });
// GAME-V3.md §2: the host plus up to 9 friends (the server's game_join cap).
export const MAX_MEMBERS = 10;
const GAME_FULL = `This game has ${MAX_MEMBERS} players already.`;

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
      crew: { gunner: 0, carpenter: 0, lookout: 0 }, captain: 1, nextWave: (friend.waveBest ?? 0) + 1 });
    world.players.set(owner, { coins: 40, ownerName: friend.ownerName, actions: new Map(), code: friend.code });
    // The friend hosts the game, and your captain ("me") is in it already.
    world.members.set(friend.code, new Map([[owner, { role: 'host', joined: 0, opened: 0, left: null }],
      ['me', { role: 'member', joined: 0, opened: 0, left: null }]]));
  });
  return world;
}

export function createFakeIslandApi({ world = createFakeWorld(), playerId = 'me', ownerName = 'You',
  now = () => Date.now(), weather = 'calm', code: wantedCode = null, version = 1, unlocking = version === 2 } = {}) {
  // unlocking: the server's §9 locks (409 locked). Off by default here; the game's transport and version 2 turn it on.
  let weatherKind = weather;
  const v2 = version === 2; // the answers' tower defense extras (boss, nextWave on finish), as the real server sends them
  const me = () => {
    let player = world.players.get(playerId);
    if (!player) world.players.set(playerId, player = { coins: 0, ownerName, actions: new Map(), code: null });
    if (!player.code) {
      let code = readIslandCode(wantedCode ?? '');
      if (code && world.islands.has(code)) code = null;
      while (!code || world.islands.has(code)) code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(world.random() * CODE_ALPHABET.length)]).join('');
      world.islands.set(code, { code, owner: playerId, ownerName: player.ownerName, waveBest: 0, flags: 0, built: new Set(),
        levels: new Map(), kinds: new Map(), crew: { gunner: 0, carpenter: 0, lookout: 0 }, captain: 1, nextWave: 1 });
      player.code = code; player.coins = ISLAND_RULES.startingCoins; // a brand-new captain is paid once
    }
    return player;
  };
  const spots = island => ISLAND_RULES.spots.map(id => spotView(island, id));
  // --- the games (GAME-V3.md §2): the SQL rules of game_join and game_leave, in memory ---
  const membersOf = code => {
    if (!(world.members instanceof Map)) world.members = new Map();
    let rows = world.members.get(code);
    if (!(rows instanceof Map)) world.members.set(code, rows = new Map());
    return rows;
  };
  const stamp = () => { world.clock = (world.clock ?? 0) + 1; return world.clock; };
  const activeOf = island => 1 + [...membersOf(island.code)].filter(([id, row]) => id !== island.owner && !row.left).length;
  const isMember = (island, id = playerId) => island.owner === id || (!!membersOf(island.code).get(id) && !membersOf(island.code).get(id).left);
  const mustBeMember = island => { if (!isMember(island)) refuse(403, 'not_member', 'Join this game first: open its link or type its code.'); };
  const nameOf = id => world.players.get(id)?.ownerName ?? world.islands.get(world.players.get(id)?.code ?? '')?.ownerName ?? 'A captain';
  const gameView = (island, role) => ({ code: `ISLE-${island.code}`, hostName: island.ownerName, role, waveBest: island.waveBest,
    members: activeOf(island), maxMembers: MAX_MEMBERS });
  function enterGame(island) {
    const rows = membersOf(island.code), row = rows.get(playerId), at = stamp();
    if (island.owner === playerId) { rows.set(playerId, { role: 'host', joined: row?.joined ?? at, opened: at, left: null }); return 'host'; }
    if (row && !row.left) { row.opened = at; return 'member'; }
    if (activeOf(island) >= MAX_MEMBERS) refuse(409, 'game_full', GAME_FULL);
    rows.set(playerId, { role: 'member', joined: at, opened: at, left: null });
    return 'member';
  }
  const gameByCode = (code, missing = 'no_such_game') => {
    const found = readIslandCode(code ?? ''), island = found && world.islands.get(found);
    if (!island) refuse(404, missing, missing === 'no_such_game' ? 'There is no game with that code. Check the code.'
      : 'There is no island with that code. Ask your friend for the link again.');
    return island;
  };
  // The answer's unlocks (the backend's shape); the checks below read them back through readUnlocks.
  const unlocksOf = island => unlocksAt(unlocking ? Math.max(island.waveBest, island.owner === playerId ? me().pointBest ?? 0 : 0) : 99);
  const allowed = island => readUnlocks({ unlocks: unlocksOf(island) });
  // GAME-V3.md §4: what may be built on an island follows that island's own best won wave, whoever pays.
  const islandAllowed = island => readUnlocks({ unlocks: unlocksAt(unlocking ? island.waveBest : 99) });
  const answerUnlocks = island => {
    const mine = unlocksOf(island), there = unlocksAt(unlocking ? island.waveBest : 99);
    const personal = id => id.startsWith('crew:') || id.startsWith('captain:');
    return { wave: mine.wave, unlocked: [...mine.unlocked.filter(personal), ...there.unlocked.filter(id => !personal(id))],
      locked: Object.fromEntries([...Object.entries(mine.locked).filter(([id]) => personal(id)), ...Object.entries(there.locked).filter(([id]) => !personal(id))]) };
  };
  const view = () => {
    const player = me(), island = world.islands.get(player.code), captain = island.captain ?? 1;
    return { code: `ISLE-${island.code}`, coins: player.coins, waveBest: island.waveBest, flags: island.flags, spots: spots(island),
      crew: { ...island.crew }, prices: PRICES, nextWave: island.nextWave ?? island.waveBest + 1,
      captain: { level: captain, nextPrice: CAPTAIN.price[captain] ?? null }, unlocks: answerUnlocks(island),
      skills: skillsOf(player, island), weapons: weaponsOf(island), campaign: campaignAt(island) };
  };
  // §14: skill points from the best wave you won anywhere (won_wave_best on the server), one per two waves.
  const wonOf = (player, island) => Math.max(player.wonBest ?? 0, island.waveBest ?? 0, player.pointBest ?? 0);
  const SKILL_TREE = SKILLS.map(skill => ({ id: skill.id, name: skill.name, branch: skill.branch, tier: skill.tier, cost: skill.cost,
    needs: [...skillNeeds(skill.id)], excludes: skill.excludes, role: skill.role }));
  const ROLE_LIST = ROLES.map(role => ({ id: role.id, name: role.name, branch: role.branch }));
  // docs/GAME-V3.md "Captain tree and roles": the skills never hold the role (it has its own field).
  const learnt = island => readSkills(island.skills ?? []).filter(id => !isRole(id));
  const skillsOf = (player, island) => {
    const known = learnt(island), spent = pointsSpent(known);
    return { points: Math.max(0, pointsEarned(wonOf(player, island)) - spent), spent, known, tree: SKILL_TREE,
      role: island.role ?? null, roleLevel: ROLE_LEVEL, roles: ROLE_LIST, respecPrice: respecPrice(island.captain ?? 1) };
  };
  // §15: the weapons you own, the one you carry and the shop (price, the wave it unlocks after).
  const SHOP = WEAPONS.map(weapon => ({ id: weapon.id, name: weapon.name, price: weapon.price, unlockWave: weapon.unlockWave }));
  const weaponsOf = island => ({ owned: WEAPONS.map(weapon => weapon.id).filter(id => id === 'musket' || (island.weapons ?? []).includes(id)),
    equipped: readWeapon(island.equipped), shop: SHOP });
  const pointView = () => ({ spots: ISLAND_RULES.pointSpots.map(id => spotView(world.point, id)), waveBest: world.pointBest, coins: me().coins });
  // A build or upgrade with `code`: on that island (a friend's), paid with your coins; answers that island.
  const visited = code => {
    const found = readIslandCode(code ?? ''), island = found && world.islands.get(found);
    if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
    if (island.owner !== playerId) mustBeMember(island); // GAME-V3.md §2: members build and upgrade there
    return island;
  };
  const visitedView = island => ({ code: `ISLE-${island.code}`, ownerName: island.ownerName, waveBest: island.waveBest, spots: spots(island), coins: me().coins,
    campaign: campaignAt(island) });
  // Building and upgrading, shared by your island and Pirate Point (§5: same prices, same refusals).
  const once = (player, key, answer) => { if (player.actions.has(key)) return true; player.actions.set(key, true); return answer; };
  function buildOn(place, ids, { spot, kind, actionUid }, unlocks) {
    if (typeof spot !== 'string' || typeof kind !== 'string' || !uid(actionUid)) invalid('Send the spot, the kind and an action id.');
    const player = me();
    if (player.actions.has(`build:${actionUid}`)) return;
    if (spot === 'cabin') refuse(409, 'spot_taken', 'Your cabin already stands there.');
    if (!ids.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    const slot = slotOfSpot(spot), allowed = kindsOfSpot(spot);
    if (!allowed.includes(kind)) refuse(422, 'wrong_kind', slot === 'tower' ? `Only ${allowed.includes('harpoon') ? 'a cannon, a mortar or a harpoon tower' : 'a cannon or a mortar'} can stand on this spot.`
      : `Only a ${ISLAND_RULES.kinds[allowed[0]][0].toLowerCase()} can stand on this spot.`);
    const [name, price] = ISLAND_RULES.kinds[kind];
    if (place.built.has(spot)) refuse(409, 'spot_taken', `${ISLAND_RULES.kinds[place.kinds.get(spot) ?? kindOfSpot(spot)][0]} already stands on this spot.`);
    if (unlocks && (unlocks.levels[kind] ?? 0) < 1) refuse(409, 'locked', lockedMessage(unlockWave({ kind, level: 1 })));
    // A spot of a later campaign step (the inner wall ring after wave 5), on an island only.
    if (unlocking && place.waveBest !== undefined && spotWave(spot) > place.waveBest) refuse(409, 'locked', lockedMessage(spotWave(spot)));
    if (player.coins < price) refuse(409, 'insufficient_funds', `A ${name.toLowerCase()} costs ${price} coins. You need more coins.`);
    player.coins -= price; place.built.add(spot); place.levels.set(spot, 1); place.kinds.set(spot, kind); once(player, `build:${actionUid}`);
    paidFor(place, spot, 1, price);
  }
  function upgradeOn(place, ids, { spot, actionUid }, unlocks) {
    if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
    const player = me();
    if (player.actions.has(`upgrade:${actionUid}`)) return;
    if (!ids.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    if (!place.built.has(spot)) refuse(409, 'not_built', 'Build here first, then upgrade.');
    const kind = place.kinds.get(spot) ?? kindOfSpot(spot), level = place.levels.get(spot) ?? 1, prices = BUILDINGS[kind].price;
    if (level >= prices.length) refuse(409, 'max_level', 'This building is at its highest level.');
    if (unlocks && (unlocks.levels[kind] ?? 0) < level + 1) refuse(409, 'locked', lockedMessage(unlockWave({ kind, level: level + 1 })));
    if (player.coins < prices[level]) refuse(409, 'insufficient_funds', `Level ${level + 1} costs ${prices[level]} coins. You need more coins.`);
    player.coins -= prices[level]; place.levels.set(spot, level + 1); once(player, `upgrade:${actionUid}`);
    paidFor(place, spot, level + 1, prices[level]);
  }
  // GAME-V3.md §4.2 (building_payments on the server): who paid for each level of the building on a spot.
  function paidFor(place, spot, level, coins) {
    if (!(place.payments instanceof Map)) place.payments = new Map();
    const rows = level === 1 ? [] : place.payments.get(spot) ?? [];
    place.payments.set(spot, [...rows, { level, payer: playerId, coins }]);
  }
  // Half of what each payer paid for the building on `spot`, rounded down; a level nobody has a row for
  // (built before the payment rows, as the friends' islands here) counts as the host's at its price.
  function refundsOf(island, spot) {
    const kind = island.kinds?.get(spot) ?? kindOfSpot(spot), level = island.levels?.get(spot) ?? 1, prices = BUILDINGS[kind].price;
    const rows = (island.payments instanceof Map ? island.payments.get(spot) : null) ?? [], paid = new Map();
    for (let step = 1; step <= level; step++) {
      const row = rows.find(item => item.level === step), who = row ? row.payer : island.owner;
      paid.set(who, (paid.get(who) ?? 0) + (row ? row.coins : prices[step - 1]));
    }
    return [...paid].map(([id, coins]) => ({ id, paid: coins, coins: Math.floor(coins / 2) })).filter(item => item.paid > 0)
      .sort((a, b) => b.paid - a.paid || (a.id < b.id ? -1 : 1));
  }
  // No tear-down, research step or respec while a wave runs on the island (the server's wave_running).
  function waveGuard(island, message) {
    for (const run of world.waves.values()) {
      if (run.place === island.code && running(run)) refuse(409, 'wave_running', message);
    }
  }
  const BETWEEN_WAVES = 'A wave is under way. Research and respec between waves.';
  const PROTECTED = new Set(['cabin', 'heart', 'island_cabin', 'island_bell', 'island_harbor', 'island_techhub', 'island_wreck']);
  function demolishable(island, spot) {
    if (PROTECTED.has(spot)) refuse(409, 'protected', 'The heart of the island stays. Only walls, towers and houses come down.');
    if (!ISLAND_RULES.spots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    if (!island.built.has(spot)) refuse(409, 'not_built', 'Nothing stands on this spot now.');
    waveGuard(island, 'A wave is under way. Tear it down between waves.');
    const kind = island.kinds?.get(spot) ?? kindOfSpot(spot);
    return { spot, kind, name: ISLAND_RULES.kinds[kind][0], level: island.levels?.get(spot) ?? 1,
      refunds: refundsOf(island, spot).map(item => ({ id: item.id, name: nameOf(item.id), coins: item.coins, you: item.id === playerId })) };
  }
  const placeOf = where => {
    if (where === 'pirate_point') return { key: 'pirate_point', island: null };
    if (where === 'own') { const code = me().code; return { key: code, island: world.islands.get(code) }; }
    const code = readIslandCode(where), island = code && world.islands.get(code);
    if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
    return { key: code, island, member: isMember(island) };
  };
  const nowMs = () => { const value = now(); return value instanceof Date ? value.getTime() : Number(value); };
  const running = run => !run.finishedAt && nowMs() <= run.startsAtMs + ISLAND_RULES.waves.maximumSeconds * 1000;
  const shape = run => ({ waveId: run.waveId, wave: run.wave, seed: run.seed, startsAt: iso(run.startsAtMs),
    weather: { ...run.weather }, flagship: run.flagship, ...(v2 ? { boss: isBoss(run) } : {}) });
  const uid = value => typeof value === 'string' && value.length > 0 && value.length <= 64;

  const api = {
    get playerId() { return playerId; },
    setWeather(kind) { weatherKind = Object.hasOwn(ISLAND_RULES.weather, kind) ? kind : 'calm'; },
    async island() { return view(); },

    async build({ code, ...body } = {}) {
      body.spot = canonicalSpot(body.spot);
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code);
      buildOn(island, ISLAND_RULES.spots, body, islandAllowed(island));
      return island === mine ? view() : visitedView(island);
    },
    async upgrade({ code, ...body } = {}) {
      body.spot = canonicalSpot(body.spot);
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code);
      upgradeOn(island, ISLAND_RULES.spots, body, islandAllowed(island));
      return island === mine ? view() : visitedView(island);
    },
    async hire({ crew, actionUid } = {}) {
      if (!Object.hasOwn(CREW, crew ?? '') || !uid(actionUid)) invalid('Send gunner, carpenter or lookout and an action id.');
      const player = me(), island = world.islands.get(player.code), info = CREW[crew];
      if (player.actions.has(`hire:${actionUid}`)) return view();
      if (!allowed(island).crew[crew]) refuse(409, 'locked', lockedMessage(unlockWave({ crew })));
      if (island.crew[crew] >= info.max) refuse(409, 'crew_full', `You already have ${info.max === 1 ? 'a' : info.max} ${info.name.toLowerCase()}${info.max === 1 ? '' : 's'}.`);
      if (player.coins < info.price) refuse(409, 'insufficient_funds', `A ${info.name.toLowerCase()} costs ${info.price} coins. You need more coins.`);
      player.coins -= info.price; island.crew[crew]++; player.actions.set(`hire:${actionUid}`, true);
      return view();
    },
    async captain({ actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send an action id.');
      const player = me(), island = world.islands.get(player.code), level = island.captain ?? 1;
      if (player.actions.has(`captain:${actionUid}`)) return view();
      if (level >= CAPTAIN.price.length) refuse(409, 'max_level', 'Your captain is at the highest level.');
      if (allowed(island).captain < level + 1) refuse(409, 'locked', lockedMessage(unlockWave({ captain: level + 1 })));
      if (player.coins < CAPTAIN.price[level]) refuse(409, 'insufficient_funds', `Level ${level + 1} costs ${CAPTAIN.price[level]} coins. You need more coins.`);
      player.coins -= CAPTAIN.price[level]; island.captain = level + 1; player.actions.set(`captain:${actionUid}`, true);
      return view();
    },
    async learnSkill({ skill, actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send the skill and an action id.');
      if (!Object.hasOwn(SKILL_BY_ID, skill ?? '')) refuse(400, 'bad_skill', 'There is no such skill.');
      const player = me(), island = world.islands.get(player.code), known = learnt(island), entry = SKILL_BY_ID[skill];
      if (player.actions.has(`skill:${actionUid}`)) return view();
      if (known.includes(skill)) refuse(409, 'known', `You know ${entry.name} already.`);
      if (entry.excludes && known.includes(entry.excludes)) refuse(409, 'closed', `You chose ${SKILL_BY_ID[entry.excludes].name}, so ${entry.name} is closed. Respec to change.`);
      if (entry.needs.length && !entry.needs.some(id => known.includes(id))) refuse(409, 'locked', `Learn ${entry.needs.map(id => SKILL_BY_ID[id].name).join(' or ')} first.`);
      if (entry.role && island.role !== entry.role) refuse(409, 'wrong_role', island.role ? `Only a ${ROLE_BY_ID[entry.role].name} can learn ${entry.name}.` : `Pick the ${ROLE_BY_ID[entry.role].name} role first.`);
      if (skillsOf(player, island).points < entry.cost) refuse(409, 'no_points', 'Win new waves to earn skill points.');
      island.skills = readSkills([...known, skill]); player.actions.set(`skill:${actionUid}`, true);
      return view();
    },
    async pickRole({ role } = {}) {
      if (!isRole(role)) refuse(400, 'bad_role', 'There is no such role.');
      const island = world.islands.get(me().code);
      if (island.role === role) return view();
      if (island.role) refuse(409, 'role_known', 'You have a role already. Respec to change it.');
      if ((island.captain ?? 1) < ROLE_LEVEL) refuse(409, 'locked', `Reach captain level ${ROLE_LEVEL} first.`);
      island.role = role;
      return view();
    },
    async respec({ actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send an action id.');
      const player = me(), island = world.islands.get(player.code), price = respecPrice(island.captain ?? 1);
      if (player.actions.has(`respec:${actionUid}`)) return view();
      if (!learnt(island).length && !island.role) refuse(409, 'nothing_to_reset', 'You have no skills or role to reset.');
      waveGuard(island, BETWEEN_WAVES);
      if (player.coins < price) refuse(409, 'insufficient_funds', `A respec costs ${price} coins. You need more coins.`);
      player.coins -= price; island.skills = []; island.role = null; player.actions.set(`respec:${actionUid}`, true);
      return view();
    },
    async buyWeapon({ weapon, actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send the weapon and an action id.');
      if (!Object.hasOwn(WEAPON_BY_ID, weapon ?? '')) refuse(400, 'bad_weapon', 'There is no such weapon.');
      const player = me(), island = world.islands.get(player.code), info = WEAPON_BY_ID[weapon];
      if (player.actions.has(`weapon:${actionUid}`)) return view();
      if (weaponsOf(island).owned.includes(weapon)) refuse(409, 'owned', `You own the ${info.name.toLowerCase()} already.`);
      const wave = unlocking ? Math.max(island.waveBest, player.pointBest ?? 0) : 99;
      if (wave < info.unlockWave) refuse(409, 'locked', lockedMessage(info.unlockWave));
      if (player.coins < info.price) refuse(409, 'insufficient_funds', `The ${info.name.toLowerCase()} costs ${info.price} coins. You need more coins.`);
      player.coins -= info.price; island.weapons = [...(island.weapons ?? []), weapon]; island.equipped = weapon;
      player.actions.set(`weapon:${actionUid}`, true);
      return view();
    },
    async equipWeapon({ weapon } = {}) {
      if (!Object.hasOwn(WEAPON_BY_ID, weapon ?? '')) refuse(400, 'bad_weapon', 'There is no such weapon.');
      const player = me(), island = world.islands.get(player.code);
      if (!weaponsOf(island).owned.includes(weapon)) refuse(409, 'not_owned', `Buy the ${WEAPON_BY_ID[weapon].name.toLowerCase()} first.`);
      island.equipped = weapon;
      return view();
    },
    // GAME-V3.md §5, §5.1: one research step for the island (yours, or the game of `code`), with coins: tier 1 of
    // a branch, or one of the two options of tier 2 or 3 (change: true switches from the other one, at the tier's
    // price again; switching tier 3 takes the old capstone off every tower that picked it).
    async research({ branch, actionUid, code, tier = 1, choice = null, change = false } = {}) {
      if (typeof branch !== 'string' || !uid(actionUid)) invalid('Send the research and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      const entry = BRANCH_BY_ID[branch];
      if (!entry) refuse(400, 'bad_research', 'There is no such research.');
      if (!Number.isSafeInteger(tier) || tier < 1) refuse(400, 'bad_research', 'There is no such research.');
      if (tier > TOP_TIER) refuse(409, 'top_tier', `${entry.name} have ${TOP_TIER} tiers.`);
      if (tier === 1 ? choice !== null : !optionsOf(branch, tier).includes(choice)) refuse(400, 'bad_research', 'Pick one of the two options.');
      if (player.actions.has(`research:${actionUid}`)) return island === mine ? view() : visitedView(island);
      waveGuard(island, BETWEEN_WAVES);
      const item = tier === 1 ? 'tech_hub' : `research_${tier}`;
      if (unlocking && island.waveBest < waveOf(item)) refuse(409, 'locked', lockedMessage(waveOf(item)));
      island.research = island.research ?? [];
      const now = researchOf(island, branch), key = `tier${tier}`, price = entry.prices[tier - 1];
      if (tier === 1 && now.tier >= 1) refuse(409, 'known', `${entry.name} are researched on this island already.`);
      if (tier > 1 && now.tier < tier - 1) refuse(409, 'needs_tier', `Research tier ${tier - 1} of ${entry.name.toLowerCase()} first.`);
      if (tier > 1 && now[key] === choice) refuse(409, 'known', `Your crew chose ${optionName(choice)} already.`);
      if (tier > 1 && now[key] && !change) refuse(409, 'closed', `Closed: your crew chose ${optionName(now[key])}.`);
      if (player.coins < price) refuse(409, 'insufficient_funds', `This costs ${price} coins. You need more coins.`);
      player.coins -= price; player.actions.set(`research:${actionUid}`, true);
      if (tier === 1) island.research.push(branch);
      else {
        island.tiers = { ...(island.tiers ?? {}), [branch]: { ...now, tier: Math.max(now.tier, tier), [key]: choice } };
        if (tier === 3 && now.tier3 && island.specs instanceof Map) for (const [spot, spec] of island.specs) if (spec === now.tier3) island.specs.delete(spot);
      }
      return island === mine ? view() : visitedView(island);
    },
    // A tower picks one skill of its researched kind (free; picking again changes it). A house of level 2 or
    // more picks a role the same way (GAME-V3.md "Houses"), with no research.
    async specialise({ spot, spec, code } = {}) {
      if (typeof spot !== 'string' || typeof spec !== 'string') invalid('Send the spot and the skill.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code);
      spot = canonicalSpot(spot);
      if (!ISLAND_RULES.spots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
      if (!island.built.has(spot)) refuse(409, 'not_built', 'Build something on this spot first.');
      const info = SPECS[spec], kind = island.kinds?.get(spot) ?? kindOfSpot(spot);
      if (Object.hasOwn(HOUSE_ROLES, spec)) {
        if (kind !== 'house') refuse(422, 'wrong_kind', `A ${ISLAND_RULES.kinds[kind][0].toLowerCase()} cannot take a house role.`);
        if ((island.levels?.get(spot) ?? 1) < HOUSE_ROLE_LEVEL) refuse(409, 'house_level', 'Raise this house to level 2 first.');
        if (!(island.specs instanceof Map)) island.specs = new Map();
        island.specs.set(spot, spec);
        return island === mine ? view() : visitedView(island);
      }
      if (!info) refuse(400, 'bad_spec', 'There is no such tower skill.');
      if (info.branch !== kind) refuse(422, 'wrong_kind', `A ${ISLAND_RULES.kinds[kind][0].toLowerCase()} cannot learn that skill.`);
      if (!(island.research ?? []).includes(kind)) refuse(409, 'not_researched', `Research ${BRANCH_BY_ID[kind].name.toLowerCase()} at the Tech hub first.`);
      if (isCapstone(spec) && researchOf(island, kind).tier3 !== spec) refuse(409, 'not_researched', `Pick ${SPECS[spec].name} at tier 3 of the Tech hub first.`);
      if (!(island.specs instanceof Map)) island.specs = new Map();
      island.specs.set(spot, spec);
      return island === mine ? view() : visitedView(island);
    },
    // GAME-V3.md §4: coins into the island's wreck, never past the goal.
    async repairWreck({ amount, actionUid, code } = {}) {
      if (!Number.isSafeInteger(amount) || !uid(actionUid)) invalid('Send the amount and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      if (!ISLAND_RULES.wreck.gifts.includes(amount)) refuse(400, 'bad_gift', 'Pick one of the amounts shown.');
      if (player.actions.has(`wreck:${actionUid}`)) return island === mine ? view() : visitedView(island);
      if (unlocking && island.waveBest < waveOf('wreck')) refuse(409, 'locked', lockedMessage(waveOf('wreck')));
      const paid = island.wreck ?? 0, goal = ISLAND_RULES.wreck.goal;
      if (paid >= goal) refuse(409, 'repaired', 'The wreck is repaired. Sailing opens later.');
      const gift = Math.min(amount, goal - paid);
      if (player.coins < gift) refuse(409, 'insufficient_funds', `That costs ${gift} coins. You need more coins.`);
      player.coins -= gift; island.wreck = paid + gift; player.actions.set(`wreck:${actionUid}`, true);
      return island === mine ? view() : visitedView(island);
    },
    // GAME-V3.md §4.2: what a tear-down gives back, and the tear-down (any member, between waves only).
    async demolishQuote({ spot, code } = {}) {
      if (typeof spot !== 'string') invalid('Send the spot.');
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code);
      return { ...demolishable(island, canonicalSpot(spot)), repeat: false };
    },
    async demolish({ spot, actionUid, code } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code), player = me();
      const answer = () => (island === mine ? view() : visitedView(island));
      const done = player.actions.get(`demolish:${actionUid}`);
      if (done) return { ...answer(), demolished: { ...done, repeat: true } };
      spot = canonicalSpot(spot);
      const quote = demolishable(island, spot);
      for (const refund of quote.refunds) { const payer = world.players.get(refund.id); if (payer) payer.coins += refund.coins; }
      island.built.delete(spot); island.levels?.delete(spot); island.kinds?.delete(spot);
      if (island.specs instanceof Map) island.specs.delete(spot);
      if (island.payments instanceof Map) island.payments.delete(spot);
      player.actions.set(`demolish:${actionUid}`, quote);
      return { ...answer(), demolished: { ...quote, refunds: quote.refunds.map(item => ({ ...item, you: item.id === playerId })), repeat: false } };
    },
    async piratePoint() { me(); return pointView(); },
    async pointBuild(body = {}) { buildOn(world.point, ISLAND_RULES.pointSpots, body, allowed(world.islands.get(me().code))); return pointView(); },
    async pointUpgrade(body = {}) { upgradeOn(world.point, ISLAND_RULES.pointSpots, body, allowed(world.islands.get(me().code))); return pointView(); },
    piratePointBuild(body) { return api.pointBuild(body); },
    piratePointUpgrade(body) { return api.pointUpgrade(body); },
    // The friend invite (§6) is an alias of joinGame (GAME-V3.md §2); only its 404 code differs.
    async inviteJoin({ code, actionUid } = {}) {
      if (typeof code !== 'string' || !uid(actionUid)) invalid('Send the island code and an action id.');
      return api.joinGame({ code, actionUid }, 'no_such_island');
    },
    async createGame() {
      const created = !world.players.get(playerId)?.code, island = world.islands.get(me().code);
      enterGame(island);
      return { game: gameView(island, 'host'), created };
    },
    async joinGame({ code, actionUid } = {}, missing = 'no_such_game') {
      if (typeof code !== 'string' || !uid(actionUid)) invalid('Send the game code and an action id.');
      const island = gameByCode(code, missing);
      me();
      const role = enterGame(island);
      return { admitted: true, game: gameView(island, role), island: { code: `ISLE-${island.code}`, ownerName: island.ownerName } };
    },
    async games() {
      me();
      // Your own island counts once it was opened as a game or played on (the server lists it once
      // island_open made it, which the fake does at once for every captain).
      const played = island => membersOf(island.code).has(playerId) || island.waveBest > 0 || island.built.size > 0;
      const mine = [...world.islands.values()].filter(island => isMember(island) && (island.owner !== playerId || played(island)))
        .map(island => ({ island, opened: membersOf(island.code).get(playerId)?.opened ?? 0 }))
        .sort((a, b) => b.opened - a.opened);
      return { games: mine.slice(0, 20).map(({ island }) => gameView(island, island.owner === playerId ? 'host' : 'member')) };
    },
    async lobby(code) {
      const island = gameByCode(code);
      mustBeMember(island);
      const rows = [...membersOf(island.code)].filter(([id, row]) => id !== island.owner && !row.left).sort((a, b) => a[1].joined - b[1].joined);
      const roleOfPlayer = id => world.roles?.get(id) ?? [...world.islands.values()].find(item => item.owner === id)?.role ?? null;
      const members = [{ id: island.owner, name: island.ownerName, role: 'host', you: island.owner === playerId, captainRole: roleOfPlayer(island.owner) },
        ...rows.map(([id]) => ({ id, name: nameOf(id), role: 'member', you: id === playerId, captainRole: roleOfPlayer(id) }))];
      return { game: gameView(island, island.owner === playerId ? 'host' : 'member'), members };
    },
    async leaveGame({ code } = {}) {
      if (typeof code !== 'string') invalid('Send the game code.');
      const island = gameByCode(code);
      if (island.owner === playerId) refuse(409, 'host_cannot_leave', 'You host this game, so you cannot leave it.');
      const row = membersOf(island.code).get(playerId);
      if (!row || row.left) return { left: false };
      row.left = stamp();
      return { left: true };
    },

    async visit(code) {
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
      mustBeMember(island); // GAME-V3.md §2: join the game first (the owner always gets in)
      // The crew and the captain too, so host and visitors run the same wave (§8).
      return { code: `ISLE-${island.code}`, ownerName: island.ownerName, waveBest: island.waveBest, spots: spots(island),
        crew: { ...island.crew }, captain: { level: island.captain ?? 1 }, campaign: campaignAt(island) };
    },

    async startWave({ where, actionUid } = {}) {
      if (typeof where !== 'string' || !uid(actionUid)) invalid('Send where the wave starts and an action id.');
      const player = me(), repeat = player.actions.get(`start:${actionUid}`);
      if (repeat) return shape(world.waves.get(repeat));
      const place = placeOf(where);
      if (place.island && place.member === false) mustBeMember(place.island); // only members ring the bell there
      for (const run of world.waves.values()) {
        if (run.place === place.key && !run.finishedAt && !running(run)) { run.finishedAt = nowMs(); run.expired = true; }
        if (run.place === place.key && running(run)) refuse(409, 'wave_running', 'A wave is already under way on this island.');
      }
      const next = place.island ? place.island.nextWave ?? place.island.waveBest + 1 : world.pointBest + 1;
      const run = { waveId: `fake-wave-${world.nextWave++}`, place: place.key, island: place.island,
        wave: Math.min(next, TD_RULES.highestWave), seed: Math.floor(world.random() * 2 ** 31),
        startsAtMs: Math.floor(nowMs() / 1000) * 1000 + ISLAND_RULES.waves.countdownSeconds * 1000,
        weather: { ...(ISLAND_RULES.weather[weatherKind] ?? ISLAND_RULES.weather.calm) }, flagship: place.key === 'pirate_point',
        participants: new Set([playerId]), results: new Map(), finishedAt: null, counted: false, expired: false };
      world.waves.set(run.waveId, run); player.actions.set(`start:${actionUid}`, run.waveId);
      return shape(run);
    },

    async joinWave({ waveId } = {}) {
      if (typeof waveId !== 'string') invalid('Say which wave.');
      const run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (run.island) mustBeMember(run.island); // a wave on a game's island: its members (Pirate Point: anybody)
      if (!running(run)) refuse(409, 'wave_over', 'This wave is over. Ring the bell for the next one.');
      run.participants.add(playerId); me();
      return shape(run);
    },

    async currentWave(where) {
      if (typeof where !== 'string') invalid('Say where.');
      const place = placeOf(where);
      for (const run of world.waves.values()) if (run.place === place.key && running(run)) return shape(run);
      return null;
    },

    async finishWave({ waveId, survived, shipsSunk, bonuses } = {}) {
      if (typeof waveId !== 'string' || typeof survived !== 'boolean' || !Number.isInteger(shipsSunk) || shipsSunk < 0 || shipsSunk > 1000
        || (bonuses !== undefined && !(Array.isArray(bonuses) && bonuses.length <= 2 && bonuses.every(kind => kind === 'galleon' || kind === 'finisher')))) {
        invalid('Send the wave, whether the island held and the ships sunk (0 to 1000).');
      }
      const player = me(), run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (!run.participants.has(playerId)) refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
      const placeBest = () => (run.island ? { waveBest: run.island.waveBest, flags: run.island.flags } : { waveBest: world.pointBest, flags: world.pointFlags });
      const stored = run.results.get(playerId);
      const runInfo = () => (v2 && run.island ? { nextWave: run.island.nextWave, boss: isBoss(run) } : {});
      if (stored !== undefined) return { loot: stored, coins: player.coins, ...placeBest(), ...runInfo() };
      const elapsed = (nowMs() - run.startsAtMs) / 1000;
      if (elapsed < ISLAND_RULES.waves.minimumSeconds) {
        const wait = Math.max(1, Math.ceil(ISLAND_RULES.waves.minimumSeconds - elapsed));
        refuse(409, 'wave_too_early', `The wave is not over yet. Try again in ${wait} seconds.`, wait);
      }
      const late = elapsed > ISLAND_RULES.waves.maximumSeconds;
      // §4: houses pay 5 a level (5, 10, 15), a boss wave pays double.
      const houseBonus = run.island ? [...run.island.built].filter(id => id.startsWith('house_'))
        .reduce((sum, id) => sum + 5 * (run.island.levels?.get(id) ?? 1), 0) : 0;
      // v3 waves: the bonuses the wave allows (wave_events.py): the galleon on a galleon wave, a finisher on a boss wave.
      const allowed = run.island ? [...new Set(bonuses ?? [])].filter(kind => (kind === 'galleon' ? eventFor(run.wave, run.seed) === 'treasure_galleon' : isBoss(run))) : [];
      const extra = allowed.reduce((sum, kind) => sum + bonusLoot(kind, run.wave), 0);
      const loot = survived && !late ? (lootFor(run.wave, 0, !run.island) + houseBonus + extra) * (isBoss(run) ? 2 : 1) : 0;
      if (survived && !late && !run.island) player.pointBest = Math.max(player.pointBest ?? 0, run.wave);
      if (survived && !late) player.wonBest = Math.max(player.wonBest ?? 0, run.wave); // won_wave_best: any wave you fought and won
      if (!run.finishedAt) { run.finishedAt = nowMs(); run.expired = late; }
      if (run.island && !run.nextSet) {
        run.nextSet = true;
        // §1: carry on after a win; after a loss the next bell restarts at best − 2 (at least 1).
        run.island.nextWave = survived && !late ? Math.min(run.wave + 1, TD_RULES.highestWave)
          : Math.max(1, run.island.waveBest - TD_RULES.restartBack);
      }
      if (survived && !late && !run.counted) {
        run.counted = true;
        if (run.island) { run.island.waveBest = Math.max(run.island.waveBest, run.wave); run.island.flags++; }
        else { world.pointBest = Math.max(world.pointBest, run.wave); world.pointFlags++; }
      }
      player.coins += loot; run.results.set(playerId, loot);
      return { loot, coins: player.coins, ...placeBest(), ...runInfo() };
    },

    // Captain health (GAME-V3.md §3): the reviver pays 20 + 5 × wave, once per actionUid; only a member of
    // the game who is in this wave and has not finished it yet (the rules of wave_revive()). One fall (the
    // fallen captain at the tick downAt) is paid for once: a second helper is refused already_up.
    async reviveCaptain({ waveId, fallen, downAt, actionUid } = {}) {
      if (typeof waveId !== 'string' || typeof fallen !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(fallen) || !uid(actionUid)
        || !Number.isSafeInteger(downAt) || downAt < 0 || downAt > 100000) {
        invalid('Send the wave, the fallen captain, when they fell and an action id.');
      }
      const player = me(), repeat = player.actions.get(`revive:${actionUid}`);
      if (repeat) return { price: repeat, coins: player.coins, repeat: true };
      const run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (run.island) mustBeMember(run.island);
      if (!run.participants.has(playerId)) refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
      const elapsed = (nowMs() - run.startsAtMs) / 1000;
      if (run.results.has(playerId) || elapsed < 0 || elapsed > ISLAND_RULES.waves.maximumSeconds) refuse(409, 'wave_over', 'This wave is over.');
      // A Tavern on the island (level 2 or more) takes 25% off, as wave_revive() checks the island's buildings.
      const tavern = !!run.island && hasTavern([...run.island.built].map(id => ({ ...spotView(run.island, id), x: 0, z: 0 })));
      const price = revivePrice(run.wave, { tavern });
      if (player.coins < price) refuse(409, 'insufficient_funds', `Helping a captain up costs ${price} coins. You need more coins.`);
      run.revived ??= new Set();
      const fall = `${fallen}@${downAt}`;
      if (run.revived.has(fall)) refuse(409, 'already_up', 'Already up: a teammate helped them first.');
      run.revived.add(fall);
      player.coins -= price; player.actions.set(`revive:${actionUid}`, price);
      return { price, coins: player.coins, repeat: false };
    },

    /** fetch()-shaped access: the same routes and JSON as the real server. */
    async fetch(url, init = {}) {
      const { pathname, searchParams } = new URL(String(url), 'http://fake.local');
      const method = (init.method ?? 'GET').toUpperCase();
      let body = {};
      try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = null; }
      const reply = (status, data, headers = {}) => new Response(JSON.stringify(data), { status,
        headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...headers } });
      try {
        if (body === null || typeof body !== 'object' || Array.isArray(body)) invalid('The body must be a JSON object.');
        const route = `${method} ${pathname}`;
        if (route === 'GET /api/island') return reply(200, await api.island());
        if (route === 'POST /api/island/build') return reply(200, await api.build(body));
        if (route === 'POST /api/island/upgrade') return reply(200, await api.upgrade(body));
        if (route === 'POST /api/island/hire') return reply(200, await api.hire(body));
        if (route === 'POST /api/island/captain') return reply(200, await api.captain(body));
        if (route === 'POST /api/island/skill') return reply(200, await api.learnSkill(body));
        if (route === 'POST /api/island/role') return reply(200, await api.pickRole(body));
        if (route === 'POST /api/island/respec') return reply(200, await api.respec(body));
        if (route === 'POST /api/island/weapon/buy') return reply(200, await api.buyWeapon(body));
        if (route === 'POST /api/island/weapon/equip') return reply(200, await api.equipWeapon(body));
        if (route === 'POST /api/island/research') return reply(200, await api.research(body));
        if (route === 'POST /api/island/tower-skill') return reply(200, await api.specialise(body));
        if (route === 'POST /api/island/wreck') return reply(200, await api.repairWreck(body));
        if (route === 'GET /api/island/demolish') return reply(200, await api.demolishQuote({ spot: searchParams.get('spot'), code: searchParams.get('code') }));
        if (route === 'POST /api/island/demolish') return reply(200, await api.demolish(body));
        if (route === 'POST /api/island/invite/join') return reply(200, await api.inviteJoin(body));
        if (route === 'POST /api/games') return reply(200, await api.createGame(body));
        if (route === 'POST /api/games/join') return reply(200, await api.joinGame(body));
        if (route === 'GET /api/games') return reply(200, await api.games());
        if (route === 'POST /api/games/leave') return reply(200, await api.leaveGame(body));
        if (method === 'GET' && pathname.startsWith('/api/games/')) return reply(200, await api.lobby(decodeURIComponent(pathname.slice(11))));
        if (route === 'GET /api/pirate-point') return reply(200, await api.piratePoint());
        if (route === 'POST /api/pirate-point/build') return reply(200, await api.pointBuild(body));
        if (route === 'POST /api/pirate-point/upgrade') return reply(200, await api.pointUpgrade(body));
        if (method === 'GET' && pathname.startsWith('/api/island/visit/')) return reply(200, await api.visit(decodeURIComponent(pathname.slice(18))));
        if (route === 'POST /api/waves/start') return reply(200, await api.startWave(body));
        if (route === 'POST /api/waves/join') return reply(200, await api.joinWave(body));
        if (route === 'GET /api/waves/current') return reply(200, await api.currentWave(searchParams.get('where')));
        if (route === 'POST /api/waves/finish') return reply(200, await api.finishWave(body));
        if (route === 'POST /api/waves/revive') return reply(200, await api.reviveCaptain(body));
        return reply(404, { error: { code: 'not_found', message: 'There is no such route.' } });
      } catch (error) {
        if (!(error instanceof FakeApiError)) throw error;
        return reply(error.status, error.body, error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {});
      }
    },
  };
  return api;
}

// --- the island lane's transport over the same fake ---------------------------------------------
export const FAKE_OWN_CODE = 'K7Q2M';
export const FAKE_FRIEND = Object.freeze({ code: 'FR3ND', ownerName: 'Captain Gull', waveBest: 2, built: Object.freeze(['wall_1', 'wall_2', 'cannon_1', 'tower_1']) });
export const FAKE_SPOTS = Object.freeze(ISLAND_RULES.spots.map(id => Object.freeze({ id, kind: kindOfSpot(id) })));
// Failures a test or the console can queue for the next request; a timeout still does the work.
const FAILURES = Object.freeze({
  timeout: { applies: true, status: 0, code: 'timeout', message: 'The server took too long to answer. Try again.' },
  network: { applies: false, status: 0, code: 'network_error', message: 'No connection to the server. Check your internet and try again.' },
  server: { applies: false, status: 503, code: 'database_unavailable', message: 'The database could not be reached. Try again in a moment.' },
});
const BODY_KEYS = Object.freeze({ '/api/island/build': ['spot', 'kind', 'actionUid'], '/api/waves/start': ['where', 'actionUid'],
  '/api/island/upgrade': ['spot', 'actionUid'], '/api/island/hire': ['crew', 'actionUid'], '/api/island/captain': ['actionUid'],
  '/api/island/skill': ['skill', 'actionUid'], '/api/island/weapon/buy': ['weapon', 'actionUid'], '/api/island/weapon/equip': ['weapon'],
  '/api/island/invite/join': ['code', 'actionUid'], '/api/pirate-point/build': ['spot', 'kind', 'actionUid'], '/api/pirate-point/upgrade': ['spot', 'actionUid'],
  '/api/waves/join': ['waveId'], '/api/waves/finish': ['waveId', 'survived', 'shipsSunk'], '/api/waves/revive': ['waveId', 'fallen', 'downAt', 'actionUid'],
  '/api/games': [], '/api/games/join': ['code', 'actionUid'], '/api/games/leave': ['code'],
  '/api/island/research': ['branch', 'actionUid'], '/api/island/tower-skill': ['spot', 'spec'], '/api/island/wreck': ['amount', 'actionUid'],
  '/api/island/demolish': ['spot', 'actionUid'] });
// Keys a body may also carry: `code` builds, upgrades, researches, picks a skill or mends the wreck on a game's island.
const OPTIONAL_KEYS = Object.freeze({ '/api/waves/finish': ['bonuses'], '/api/island/build': ['code'], '/api/island/upgrade': ['code'], '/api/games': ['actionUid'],
  '/api/island/research': ['code', 'tier', 'choice', 'change'], '/api/island/tower-skill': ['code'], '/api/island/wreck': ['code'], '/api/island/demolish': ['code'] });
const ACTION_UID = /^[A-Za-z0-9_-]{8,64}$/;
const exactKeys = (body, keys, optional = []) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).filter(key => !optional.includes(key)).sort().join() === [...keys].sort().join();

/**
 * {get(path), post(path, body), dev, api}: the fake behind ?islands=fake, answering like online/api.js.
 * Your island is ISLE-K7Q2M with `coins` starting coins; ISLE-FR3ND (Captain Gull) is a friend's island.
 */
// --- one fake world for several tabs (scripts/check-multiplayer.js) ------------------------------
// ?islands=fake&fakeworld=<name>&fakeplayer=<id>&fakename=<name>: every tab of this browser with the
// same fakeworld plays in one world kept in localStorage (read before and written after every request,
// under a Web Lock), each tab as its own captain. fakeplayer "me" (the default) owns ISLE-K7Q2M;
// any other id gets an island of its own. Without fakeworld nothing changes: one tab, one world.
const SHARED_PREFIX = 'tgpt:fake-world:';
const PLAYER_ID = /^[a-z0-9_]{1,24}$/i;
export function fakePlayerFor(search = '') {
  const query = new URLSearchParams(typeof search === 'string' ? search : '');
  const name = query.get('fakeworld'), id = query.get('fakeplayer'), owner = query.get('fakename');
  return { shared: name && PLAYER_ID.test(name) ? name : null, playerId: id && PLAYER_ID.test(id) ? id : 'me',
    ownerName: owner && owner.length <= 24 ? owner : null };
}
const pack = value => JSON.stringify(value, (key, item) => {
  if (item instanceof Map) return { $map: [...item] };
  if (item instanceof Set) return { $set: [...item] };
  if (key === 'island' && item && typeof item === 'object' && typeof item.code === 'string') return { $island: item.code };
  if (key === 'random') return undefined;
  return item;
});
function unpack(text) {
  const data = JSON.parse(text, (key, item) => (item && typeof item === 'object' && Array.isArray(item.$map) ? new Map(item.$map)
    : item && typeof item === 'object' && Array.isArray(item.$set) ? new Set(item.$set) : item));
  for (const run of data.waves?.values?.() ?? []) if (run.island?.$island) run.island = data.islands.get(run.island.$island) ?? null;
  return data;
}
/** {load(), save(world), lock(task)}: the world of one ?fakeworld name in localStorage. */
export function createSharedFakeStore(name, { storage = globalThis.localStorage, locks = globalThis.navigator?.locks } = {}) {
  const key = `${SHARED_PREFIX}${name}`;
  return {
    load() { try { const text = storage?.getItem(key); return text ? unpack(text) : null; } catch { return null; } },
    save(world) { try { storage?.setItem(key, pack(world)); } catch { /* A full storage: this tab only. */ } },
    // The next tab pulls only after our write reached it: localStorage reaches other tabs' processes a
    // moment later, so the lock is held SETTLE_MS longer (two pages pressing Next wave at once would
    // otherwise both make "the" next wave from a stale copy, test:mp).
    lock: task => (locks?.request ? locks.request(key, async () => { try { return await task(); } finally { await settle(); } }) : task()),
  };
}
const SHARED_SETTLE_MS = 60;
const settle = () => new Promise(resolve => setTimeout(resolve, SHARED_SETTLE_MS));
/** The answers' version for a page: 2 (the tower defense extras) in the browser, 1 without a page (the older tests). */
export const fakeVersionFor = search => (typeof search !== 'string' ? 1 : new URLSearchParams(search).get('td') === '1' ? 1 : 2);
const fromPage = fakePlayerFor(globalThis.location?.search ?? '');
export function createFakeIslandTransport({ coins = ISLAND_RULES.startingCoins, now = () => Date.now(), weather = 'calm',
  code = FAKE_OWN_CODE, ownerName = fromPage.ownerName ?? 'You', friends = [FAKE_FRIEND], seed = 7, unlocking = true,
  version = fakeVersionFor(globalThis.location?.search), playerId = fromPage.playerId,
  shared = fromPage.shared ? createSharedFakeStore(fromPage.shared) : null } = {}) {
  let world, api, others = 0;
  const failures = [];
  // A shared world (fakeworld): the other tabs' writes first, ours after, all in one synchronous step.
  const pull = () => { const saved = shared?.load(); if (saved) Object.assign(world, saved); };
  function reset() {
    world = createFakeWorld({ seed, friends });
    pull();
    api = createFakeIslandApi({ world, playerId, ownerName, now, weather, code: playerId === 'me' ? code : null, unlocking, version });
    if (!world.players.has(playerId)) {
      world.players.set(playerId, { coins: 0, ownerName, actions: new Map(), code: null });
      void api.island(); world.players.get(playerId).coins = coins;
    }
    shared?.save(world);
  }
  reset();
  const ok = data => ({ ok: true, status: 200, data });
  const fail = (status, code, message, retryAfter) => {
    const answer = { ok: false, status, code, message };
    if (Number.isSafeInteger(retryAfter) && retryAfter > 0) answer.retryAfterSeconds = retryAfter;
    return answer;
  };
  async function route(method, path, body) {
    const [pathname, query = ''] = String(path).split('?');
    if (method === 'POST') {
      const keys = BODY_KEYS[pathname];
      if (keys && (!exactKeys(body, keys, OPTIONAL_KEYS[pathname]) || (keys.includes('actionUid') && !ACTION_UID.test(String(body.actionUid))))) {
        return fail(422, 'validation_error', `The request must hold exactly ${keys.join(', ')}.`);
      }
    }
    try {
      if (method === 'GET' && pathname === '/api/island/leaderboard') return fail(503, 'offline', 'Weekly results need an online game. Return to the title and sign in to play online.');
      if (method === 'GET' && pathname === '/api/island') return ok(await api.island());
      if (method === 'GET' && pathname.startsWith('/api/island/visit/')) return ok(await api.visit(decodeURIComponent(pathname.slice(18))));
      if (method === 'GET' && pathname === '/api/waves/current') return ok(await api.currentWave(new URLSearchParams(query).get('where') ?? ''));
      if (method === 'POST' && pathname === '/api/island/build') return ok(await api.build(body));
      if (method === 'POST' && pathname === '/api/island/upgrade') return ok(await api.upgrade(body));
      if (method === 'POST' && pathname === '/api/island/hire') return ok(await api.hire(body));
      if (method === 'POST' && pathname === '/api/island/captain') return ok(await api.captain(body));
      if (method === 'POST' && pathname === '/api/island/skill') return ok(await api.learnSkill(body));
      if (method === 'POST' && pathname === '/api/island/role') return ok(await api.pickRole(body));
      if (method === 'POST' && pathname === '/api/island/respec') return ok(await api.respec(body));
      if (method === 'POST' && pathname === '/api/island/weapon/buy') return ok(await api.buyWeapon(body));
      if (method === 'POST' && pathname === '/api/island/weapon/equip') return ok(await api.equipWeapon(body));
      if (method === 'POST' && pathname === '/api/island/research') return ok(await api.research(body));
      if (method === 'POST' && pathname === '/api/island/tower-skill') return ok(await api.specialise(body));
      if (method === 'POST' && pathname === '/api/island/wreck') return ok(await api.repairWreck(body));
      if (method === 'GET' && pathname === '/api/island/demolish') {
        const asked = new URLSearchParams(query);
        return ok(await api.demolishQuote({ spot: asked.get('spot') ?? '', code: asked.get('code') }));
      }
      if (method === 'POST' && pathname === '/api/island/demolish') return ok(await api.demolish(body));
      if (method === 'POST' && pathname === '/api/island/invite/join') return ok(await api.inviteJoin(body));
      if (method === 'POST' && pathname === '/api/games') return ok(await api.createGame(body));
      if (method === 'POST' && pathname === '/api/games/join') return ok(await api.joinGame(body));
      if (method === 'GET' && pathname === '/api/games') return ok(await api.games());
      if (method === 'POST' && pathname === '/api/games/leave') return ok(await api.leaveGame(body));
      if (method === 'GET' && pathname.startsWith('/api/games/')) return ok(await api.lobby(decodeURIComponent(pathname.slice(11))));
      if (method === 'GET' && pathname === '/api/pirate-point') return ok(await api.piratePoint());
      if (method === 'POST' && pathname === '/api/pirate-point/build') return ok(await api.pointBuild(body));
      if (method === 'POST' && pathname === '/api/pirate-point/upgrade') return ok(await api.pointUpgrade(body));
      if (method === 'POST' && pathname === '/api/waves/start') return ok(await api.startWave(body));
      if (method === 'POST' && pathname === '/api/waves/join') return ok(await api.joinWave(body));
      if (method === 'POST' && pathname === '/api/waves/finish') return ok(await api.finishWave(body));
      if (method === 'POST' && pathname === '/api/waves/revive') return ok(await api.reviveCaptain(body));
      return fail(404, 'not_found', 'Not Found');
    } catch (error) {
      if (!(error instanceof FakeApiError)) throw error;
      return fail(error.status, error.code, error.message, error.retryAfter);
    }
  }
  async function request(method, path, body) {
    if (shared) return shared.lock(async () => { pull(); const answer = route(method, path, body); shared.save(world); return answer; });
    const kind = failures.shift();
    if (kind === undefined) return route(method, path, body);
    const failure = FAILURES[kind];
    if (failure.applies) await route(method, path, body);
    return fail(failure.status, failure.code, failure.message);
  }
  const me = () => world.players.get(playerId);
  // The dev helpers change the world too: in a shared world they read it first and write it after.
  const synced = helpers => (shared ? Object.fromEntries(Object.entries(helpers).map(([name, helper]) => [name, (...args) => {
    pull(); const answer = helper(...args); shared.save(world);
    return answer instanceof Promise ? answer.finally(() => shared.save(world)) : answer;
  }])) : helpers);
  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    get api() { return api; },
    get world() { return world; },
    dev: synced({
      setCoins(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('coins must be a whole number from 0 up.'); me().coins = value; },
      setWeather(kind) { api.setWeather(kind); },
      // Another captain rings the bell somewhere (a friend's island, so a visitor can join it).
      async startWaveAt(where) {
        const other = createFakeIslandApi({ world, playerId: `captain_${++others}`, ownerName: 'Another captain', now, weather });
        try {
          if (where !== 'pirate_point') await other.joinGame({ code: where, actionUid: `other-${others}-join` });
          return await other.startWave({ where, actionUid: `other-${others}-captain` });
        } catch { return null; }
      },
      failNext(kind) {
        if (!Object.hasOwn(FAILURES, kind)) throw new TypeError(`failNext knows ${Object.keys(FAILURES).join(', ')}.`);
        failures.push(kind);
      },
      read: () => ({ coins: me().coins, built: [...world.islands.get(me().code).built], waves: world.waves.size, playerId }),
      // The best won wave on your island (the unlocks of §9 follow it).
      // The captain's level (1-5), to test what opens at level 3 (the role choice).
      // A crew mate in your game with a captain role (for screenshots): joins the game of your island.
      addCrew(id, name, role = null) {
        world.players.set(id, { coins: 0, ownerName: name, actions: new Map(), code: null });
        (world.roles ??= new Map()).set(id, isRole(role) ? role : null);
        const code = world.players.get(playerId).code;
        if (!(world.members.get(code) instanceof Map)) world.members.set(code, new Map());
        world.members.get(code).set(id, { role: 'member', joined: world.players.size, opened: 0, left: null });
      },
      setCaptain(level) { world.islands.get(me().code).captain = Math.min(5, Math.max(1, level)); },
      setWaveBest(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('waveBest must be a whole number from 0 up.');
        const island = world.islands.get(me().code); island.waveBest = value; island.nextWave = Math.min(TD_RULES.highestWave, value + 1);
        me().wonBest = Math.max(me().wonBest ?? 0, value); // you won those waves yourself: skill points follow (§14)
      },
      reset() { reset(); failures.length = 0; },
    }),
  };
}
