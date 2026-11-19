// createFakeIslandApi (fake-api.js): one captain's view of a fake world: the setup every route shares (the player, the
// views, the games, the building rules, the walls and the wave shapes), the island answer, the arsenal, fetch() and
// the route groups beside it (fake-island.js, fake-research.js, fake-waves.js), all closures over `srv`, this setup.
import { EXTRA_SPOT_IDS, isExtraSpot } from '../island/extra-spots.js';
import { readUnlocks, CAPTAIN, unlockWave, BUILDINGS } from '../island/td-rules.js';
import { SKILLS, skillNeeds, ROLES, readSkills, isRole, pointsSpent, pointsEarned, ROLE_LEVEL, respecPrice, WEAPONS,
  readWeapon } from './captain-ids.js';
import { spotWave } from '../campaign/index.js';
import { createFakeArsenal } from '../island/arsenal-fake.js';
import { checkMove, footprintOf, positionsOf } from '../island/placement.js';
import { placedSpot } from '../island/spots.js';
import { WALL_PERIMETER_CELLS, WALL_PERIMETER_DEFAULTS } from '../island/wall-perimeter.js';
import { createFakeWorld, ISLAND_RULES, readIslandCode, CODE_ALPHABET, spotView, refuse, MAX_MEMBERS, GAME_FULL,
  unlocksAt, PRICES_V2, campaignAt, layoutOf, invalid, slotOfSpot, kindsOfSpot, kindOfSpot, lockedMessage,
  WALL_RECOVERY_MS, iso, restorePrice, rebuildPrice, SIM_RULES, isBoss, FakeApiError } from './fake-rules.js';
import { createIslandRoutes } from './fake-island.js';
import { createResearchRoutes } from './fake-research.js';
import { createWaveRoutes } from './fake-waves.js';

// Mirror the server's empty marker assignment. Paid walls retain their own positions.
function perimeterSpots(rows) {
  const emptyWall = row => !row.built && Object.hasOwn(WALL_PERIMETER_DEFAULTS, row.id);
  const occupied = rows.filter(row => !emptyWall(row)).map(row => {
    const {x, z} = placedSpot(row.id, [row]);
    return {x, z, size: footprintOf(row.id)};
  });
  const free = WALL_PERIMETER_CELLS.filter(cell => occupied.every(({x, z, size}) => {
    const separation = 1 + size / 2;
    return Math.abs(cell.x - x) >= separation || Math.abs(cell.z - z) >= separation;
  }));
  const vacant = rows.filter(emptyWall), assigned = new Map();
  function assign(id, index) {
    const [cell] = free.splice(index, 1);
    assigned.set(id, cell);
  }
  for (const row of vacant) {
    const index = free.findIndex(cell => cell.x === row.x && cell.z === row.z);
    if (index >= 0) assign(row.id, index);
  }
  for (const row of vacant) {
    if (assigned.has(row.id) || !free.length) continue;
    const origin = WALL_PERIMETER_DEFAULTS[row.id];
    const distance = cell => (cell.x - origin.x) ** 2 + (cell.z - origin.z) ** 2;
    const index = free.reduce((best, cell, i) => distance(cell) < distance(free[best]) ? i : best, 0);
    assign(row.id, index);
  }
  return rows.map(row => {
    if (!emptyWall(row)) return row;
    const cell = assigned.get(row.id);
    return {...row, x: cell?.x ?? null, z: cell?.z ?? null};
  });
}

export function createFakeIslandApi({ world = createFakeWorld(), playerId = 'me', ownerName = 'You',
  now = () => Date.now(), weather = 'calm', code: wantedCode = null, version = 1, unlocking = version === 2, flags = {} } = {}) {
  // unlocking: the server's §9 locks (409 locked). Off by default here; the game's transport and version 2 turn it on.
  // flags: the server's feature flags this fake follows (none changes an answer any more; game.js reads structure_recovery).
  // D060: the extra tower spots (cannon_8..cannon_11) join the island, as the real server's runtime_catalogue() (the flag
  // more_tower_spots is retired, always on); each opens after its won wave.
  const islandSpots = Object.freeze([...ISLAND_RULES.spots, ...EXTRA_SPOT_IDS]);
  const v2 = version === 2; // the answers' tower defense extras (boss, nextWave on finish), as the real server sends them
  // A new island, as island_open() makes it (and as a reset leaves it, T53).
  const newIsland = (code, owner, name) => ({ code, owner, ownerName: name, waveBest: 0, flags: 0, built: new Set(),
    levels: new Map(), kinds: new Map(), crew: { gunner: 0, carpenter: 0, lookout: 0, guard: 0 }, captain: 1, nextWave: 1 });
  const me = () => {
    let player = world.players.get(playerId);
    if (!player) world.players.set(playerId, player = { coins: 0, ownerName, actions: new Map(), code: null });
    if (!player.code) {
      let code = readIslandCode(wantedCode ?? '');
      if (code && world.islands.has(code)) code = null;
      while (!code || world.islands.has(code)) code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(world.random() * CODE_ALPHABET.length)]).join('');
      world.islands.set(code, newIsland(code, playerId, player.ownerName));
      player.code = code; player.coins = ISLAND_RULES.startingCoins; // a brand-new captain is paid once
    }
    return player;
  };
  const spots = island => perimeterSpots(islandSpots.map(id => spotView(island, id, true)));
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
  const unlocksOf = island => unlocksAt(unlocking ? Math.max(island.waveBest, island.owner === playerId ? me().pointBest ?? 0 : 0) : 99, { culverin: true });
  const allowed = island => readUnlocks({ unlocks: unlocksOf(island) });
  // GAME-V3.md §4: what may be built on an island follows that island's own best won wave, whoever pays.
  const islandAllowed = island => readUnlocks({ unlocks: unlocksAt(unlocking ? island.waveBest : 99, { culverin: true }) });
  const answerUnlocks = island => {
    const mine = unlocksOf(island), there = unlocksAt(unlocking ? island.waveBest : 99, { culverin: true });
    const personal = id => id.startsWith('crew:') || id.startsWith('captain:');
    return { wave: mine.wave, unlocked: [...mine.unlocked.filter(personal), ...there.unlocked.filter(id => !personal(id))],
      locked: Object.fromEntries([...Object.entries(mine.locked).filter(([id]) => personal(id)), ...Object.entries(there.locked).filter(([id]) => !personal(id))]) };
  };
  const view = () => {
    const player = me(), island = world.islands.get(player.code), captain = island.captain ?? 1;
    return { code: `ISLE-${island.code}`, coins: player.coins, waveBest: island.waveBest, flags: island.flags, spots: spots(island),
      crew: { ...island.crew }, prices: PRICES_V2, nextWave: island.nextWave ?? island.waveBest + 1,
      captain: { level: captain, nextPrice: CAPTAIN.price[captain] ?? null }, unlocks: answerUnlocks(island),
      skills: skillsOf(player, island), weapons: weaponsOf(island), campaign: campaignAt(island), layout: layoutOf(island) };
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
    campaign: campaignAt(island), layout: layoutOf(island) });
  // Building and upgrading, shared by your island and Pirate Point (§5: same prices, same refusals).
  const once = (player, key, answer) => { if (player.actions.has(key)) return true; player.actions.set(key, true); return answer; };
  function buildOn(place, ids, { spot, kind, actionUid }, unlocks) {
    if (typeof spot !== 'string' || typeof kind !== 'string' || !uid(actionUid)) invalid('Send the spot, the kind and an action id.');
    const player = me();
    if (player.actions.has(`build:${actionUid}`)) return;
    if (spot === 'cabin') refuse(409, 'spot_taken', 'Your cabin already stands there.');
    if (!ids.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    const slot = slotOfSpot(spot), allowed = kindsOfSpot(spot, ids === islandSpots);
    if (!allowed.includes(kind)) refuse(422, 'wrong_kind', slot === 'tower' ? `Only ${allowed.includes('harpoon') ? 'a cannon, a mortar or a harpoon tower' : 'a cannon or a mortar'} can stand on this spot.`
      : `Only a ${ISLAND_RULES.kinds[allowed[0]][0].toLowerCase()} can stand on this spot.`);
    const [name, price] = ISLAND_RULES.kinds[kind];
    if (place.built.has(spot)) refuse(409, 'spot_taken', `${ISLAND_RULES.kinds[place.kinds.get(spot) ?? kindOfSpot(spot)][0]} already stands on this spot.`);
    if (unlocks && (unlocks.levels[kind] ?? 0) < 1) refuse(409, 'locked', lockedMessage(unlockWave({ kind, level: 1 })));
    // A spot of a later campaign step, on an island only.
    if ((unlocking || isExtraSpot(spot)) && place.waveBest !== undefined && spotWave(spot) > place.waveBest) refuse(409, 'locked', lockedMessage(spotWave(spot)));
    if (player.coins < price) refuse(409, 'insufficient_funds', `A ${name.toLowerCase()} costs ${price} coins. You need more coins.`);
    if (kind === 'wall' && ids === islandSpots) {
      const rows = spots(place), {x, z} = rows.find(row => row.id === spot);
      if (!Number.isFinite(x) || !Number.isFinite(z)) refuse(409, 'place_taken', 'The grass edge has no free wall space.');
      const verdict = checkMove(spot, x, z, positionsOf(rows));
      if (!verdict.ok) refuse(409, verdict.code, verdict.message);
      const saved = place.positions?.get(spot);
      if (saved?.x !== x || saved?.z !== z) {
        waveGuard(place, 'A wave is under way. Build walls between waves.');
        place.positions ??= new Map();
        place.positions.set(spot, {x, z});
      }
    }
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
    if (!islandSpots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
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
  // world.clockShiftMs: the dev helper advanceClock() moves the fake server's clock (every tab of a shared world).
  const nowMs = () => { const value = now(); return (value instanceof Date ? value.getTime() : Number(value)) + (world.clockShiftMs ?? 0); };
  // D039 (flag wall_recovery; backend/server/island/wall_health.py, wall_repair.py): a wall's health after its last
  // recorded wave (island.walls: spot -> {health 0-100, damagedAt ms}); no row is a whole wall. It counts as whole
  // 10 minutes after the wave that left it damaged; Repair/Rebuild costs 30% of its levels' prices x the missing share.
  const builtWalls = island => islandSpots.filter(id => kindOfSpot(id) === 'wall' && island.built.has(id));
  const healthAt = (island, spot, at) => {
    const wall = island.walls instanceof Map ? island.walls.get(spot) : null;
    if (!wall || wall.health >= 100) return 100;
    if (wall.damagedAt !== null && wall.damagedAt + WALL_RECOVERY_MS <= at) return 100;
    return Math.max(0, wall.health);
  };
  const wallsView = island => ({ coins: me().coins, walls: builtWalls(island).map(spot => {
    const level = island.levels?.get(spot) ?? 1, health = healthAt(island, spot, nowMs());
    const damagedAt = island.walls instanceof Map ? island.walls.get(spot)?.damagedAt ?? null : null;
    return { spot, level, health, recoversAt: health < 100 && damagedAt !== null ? iso(damagedAt + WALL_RECOVERY_MS) : null,
      repairCost: health < 100 ? restorePrice(rebuildPrice(level), health) : null };
  }) });
  // The walls a wave starts with, worked out at its startsAt (the same for every client); none on Pirate Point.
  const waveWalls = run => (run.island
    ? Object.fromEntries(builtWalls(run.island).sort().map(id => [id, healthAt(run.island, id, run.startsAtMs)])) : null);
  // The server's wall record (wall_repair.record, D039): the first finish of the wave keeps the walls, each capped
  // at the health it started the wave with (wall_health.cap_to_start), so a finish can only damage a wall.
  function recordWalls(run, walls) {
    if (!run.island || !walls || run.wallsRecorded) return;
    const start = waveWalls(run) ?? {}; // read before anything changes: each wall's health at the wave's start
    run.wallsRecorded = true;
    if (!(run.island.walls instanceof Map)) run.island.walls = new Map();
    for (const [spot, reported] of Object.entries(walls)) {
      if (!run.island.built.has(spot) || kindOfSpot(spot) !== 'wall' || !(spot in start)) continue;
      const health = Math.min(start[spot], reported);
      run.island.walls.set(spot, { health, damagedAt: health < 100 ? nowMs() : null });
    }
  }
  const running = run => !run.finishedAt && nowMs() <= run.startsAtMs + ISLAND_RULES.waves.maximumSeconds * 1000;
  // The wave's sim rules (backend/server/island/wave_rules.py): every rule of SIM_RULES (their flags are retired, always
  // on); the first answer keeps its set for the wave (wave_rules_keep), every later one serves the kept set.
  const rulesOf = run => {
    if (!Array.isArray(run.rules)) run.rules = [...SIM_RULES];
    return SIM_RULES.filter(name => run.rules.includes(name));
  };
  const shape = run => {
    const walls = waveWalls(run); // D039: only while the flag is on, as the server
    const rules = rulesOf(run);
    return { waveId: run.waveId, wave: run.wave, seed: run.seed, startsAt: iso(run.startsAtMs),
      weather: { ...run.weather }, flagship: run.flagship, ...(v2 ? { boss: isBoss(run) } : {}), ...(walls ? { walls } : {}),
      rules };
  };
  const uid = value => typeof value === 'string' && value.length > 0 && value.length <= 64;
  // The shared island arsenal (T40, D042): copies of an island, stored (20 at most) or carried by one captain.
  const arsenal = createFakeArsenal({ world, playerId, ownCode: () => me().code,
    islandOf: code => (code === me().code ? world.islands.get(code) : gameByCode(code, 'no_such_island')),
    isMember: (island, id) => isMember(island, id), nameOf,
    unlockWave: () => { const player = me(); return unlocking ? wonOf(player, world.islands.get(player.code)) : 99; },
    coins: () => me().coins, pay: price => { me().coins -= price; },
    waveRunning: island => [...world.waves.values()].some(run => run.place === island.code && running(run)), refuse });

  // What the route groups share (fake-island.js, fake-research.js, fake-waves.js).
  const srv = { world, me, visited, buildOn, islandSpots, islandAllowed, view, visitedView, healthAt, nowMs,
    upgradeOn, uid, unlocking, demolishable, playerId, waveGuard, activeOf, newIsland, spots, wallsView, pointView,
    allowed, learnt, skillsOf, BETWEEN_WAVES, weather, enterGame, gameView, gameByCode, membersOf, isMember,
    mustBeMember, nameOf, stamp, shape, placeOf, running, v2, recordWalls };
  const api = {
    arsenal: async ({ code = null } = {}) => arsenal.state(code ? readIslandCode(code) : null),
    arsenalBuy: async ({ weapon, actionUid, code = null } = {}) => arsenal.buy({ weapon, actionUid, code: code ? readIslandCode(code) : null }),
    arsenalTake: async ({ copy, actionUid, code = null } = {}) => arsenal.take({ copy, actionUid, code: code ? readIslandCode(code) : null }),
    arsenalReturn: async ({ actionUid, code = null } = {}) => arsenal.giveBack({ actionUid, code: code ? readIslandCode(code) : null }),
    get playerId() { return playerId; },
    async island() { return view(); },

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
        if (route === 'POST /api/island/fresh-start') return reply(200, await api.freshStart(body));
        if (route === 'GET /api/island/arsenal') return reply(200, await api.arsenal({ code: searchParams.get('code') }));
        if (route === 'POST /api/island/arsenal/buy') return reply(200, await api.arsenalBuy(body));
        if (route === 'POST /api/island/arsenal/take') return reply(200, await api.arsenalTake(body));
        if (route === 'POST /api/island/arsenal/return') return reply(200, await api.arsenalReturn(body));
        if (route === 'POST /api/island/research') return reply(200, await api.research(body));
        if (route === 'POST /api/island/tower-skill') return reply(200, await api.specialise(body));
        if (route === 'POST /api/island/tower-tree') return reply(200, await api.towerTree(body));
        if (route === 'POST /api/island/wreck') return reply(200, await api.repairWreck(body));
        if (route === 'GET /api/island/boat') return reply(200, await api.boatStatus({ code: searchParams.get('code') }));
        if (route === 'POST /api/island/boat') return reply(200, await api.boatReward(body));
        if (route === 'GET /api/island/demolish') return reply(200, await api.demolishQuote({ spot: searchParams.get('spot'), code: searchParams.get('code') }));
        if (route === 'POST /api/island/demolish') return reply(200, await api.demolish(body));
        if (route === 'POST /api/island/move') return reply(200, await api.move(body));
        if (route === 'GET /api/island/walls') return reply(200, await api.walls({ code: searchParams.get('code') }));
        if (route === 'POST /api/island/repair') return reply(200, await api.repairWall(body));
        if (route === 'GET /api/island/structures') return reply(404, {error: {code: 'feature_off', message: 'This view is available online only.'}});
        if (route === 'POST /api/island/structures/repair') return reply(404, {error: {code: 'feature_off', message: 'This repair needs the online server.'}});
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
  Object.assign(api, createIslandRoutes(srv, api), createResearchRoutes(srv, api), createWaveRoutes(srv, api));
  return api;
}
