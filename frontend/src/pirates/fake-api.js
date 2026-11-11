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
//   await api.fetch('/api/island', {method, body}); // the same as a fetch() Response
// A refusal rejects with FakeApiError {status, code, message, body, retryAfter}.
//
// The island lane's client (src/island/api.js) reads the same fake through createFakeIslandTransport():
// {get(path), post(path, body)} answering like online/api.js ({ok, status, data} or {ok: false, status,
// code, message, retryAfterSeconds}), plus dev helpers (setCoins, setWeather, startWaveAt, failNext,
// read, reset). It is the one fake behind ?islands=fake: your island ISLE-K7Q2M and a friend's island
// ISLE-FR3ND (Captain Gull) to visit.
//
// Tower defense v2 (TOWER-DEFENSE.md §7, §9, §10) with {version: 2}: 16 spots with levels (tower spots take
// a cannon or a mortar), prices, crew, the captain, unlocks by wave, Pirate Point builds, the friend's
// invite, boss waves to 100 and the restart rule (a lost wave restarts at best − 2). In the browser the
// transport behind ?islands=fake answers version 2 (add &td=1 for the old shapes); without a page (the
// tests) it keeps the old shapes unless asked, so old callers keep working.
//   await api.upgrade({spot, actionUid}); api.hire({crew, actionUid}); api.captain({actionUid});
//   api.piratePoint(); api.piratePointBuild({spot, kind, actionUid}); api.piratePointUpgrade({spot, actionUid});
//   api.inviteJoin({code, actionUid});
import { createRandom } from './sim.js';

export const ISLAND_RULES = Object.freeze({
  startingCoins: 100,
  kinds: Object.freeze({ wall: ['Wall', 10], cannon: ['Cannon', 30], watchtower: ['Watchtower', 40], house: ['House', 50] }),
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'tower_1', 'house_1', 'house_2']),
  loot: Object.freeze({ base: 10, perWave: 5, perHouse: 5, piratePointBase: 20 }),
  waves: Object.freeze({ countdownSeconds: 10, minimumSeconds: 15, maximumSeconds: 900, highestWave: 50 }),
  weather: Object.freeze({
    storm: Object.freeze({ kind: 'storm', label: 'Storm: 50% more pirate ships', ships: 1.5, fog: 0 }),
    fog: Object.freeze({ kind: 'fog', label: 'Fog: the pirates appear later', ships: 1.0, fog: 0.4 }),
    rain: Object.freeze({ kind: 'rain', label: 'Rain: the pirates do not mind', ships: 1.0, fog: 0 }),
    calm: Object.freeze({ kind: 'calm', label: 'Calm sea', ships: 1.0, fog: 0 }),
  }),
});
// Version 2: what each kind costs per level (index 0 = build), crew, captain, unlocks (§2, §3, §9, §10).
export const TD_RULES = Object.freeze({
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'tower_s5', 'tower_s6', 'tower_s7', 'tower_1', 'house_1', 'house_2']),
  prices: Object.freeze({ wall: [10, 20, 40], cannon: [30, 60, 120], mortar: [60, 120, 240], watchtower: [40, 80], house: [50, 100] }),
  names: Object.freeze({ wall: 'Wall', cannon: 'Cannon', mortar: 'Mortar', watchtower: 'Watchtower', house: 'House' }),
  crew: Object.freeze({ gunner: Object.freeze({ price: 40, max: 2 }), carpenter: Object.freeze({ price: 30, max: 2 }), lookout: Object.freeze({ price: 25, max: 1 }) }),
  captain: Object.freeze([null, 20, 40, 80, 160]), // the price of level n + 1 at index n
  houseLoot: Object.freeze([5, 10]),
  // What unlocks after winning wave N (0: from the start).
  unlocks: Object.freeze({ wall: 0, cannon: 0, captain_upgrade: 1, level_2: 2, house: 2, mortar: 3, watchtower: 3,
    gunner: 5, carpenter: 5, level_3: 5, lookout: 8, captain_4: 8 }),
  highestWave: 100, bossEvery: 5, restartBack: 2,
  piratePoint: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']),
});
const towerSpot = spot => /^(cannon_\d|tower_s\d|pp_tower_\d)$/.test(spot);
const spotKinds = spot => (towerSpot(spot) ? ['cannon', 'mortar'] : spot.startsWith('wall_') || spot.startsWith('pp_wall_') ? ['wall']
  : spot === 'tower_1' ? ['watchtower'] : ['house']);
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const kindOfSpot = spot => (spot.startsWith('wall_') ? 'wall' : spot.startsWith('cannon_') ? 'cannon' : spot === 'tower_1' ? 'watchtower' : 'house');

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
  const { base, perWave, perHouse, piratePointBase } = ISLAND_RULES.loot;
  return piratePoint ? piratePointBase + perWave * wave : base + perWave * wave + perHouse * houses;
}
const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export const DEFAULT_FRIEND = Object.freeze({ code: 'K7Q2M', ownerName: 'Captain Wren', waveBest: 2, built: Object.freeze(['wall_1', 'cannon_1', 'cannon_2']) });

/** Shared state, so several fake players (two tabs in one test) can meet on one island. */
export function createFakeWorld({ seed = 7, neighbours = true, friends = [DEFAULT_FRIEND] } = {}) {
  const world = { random: createRandom(seed), islands: new Map(), players: new Map(), waves: new Map(),
    pointBest: 0, pointFlags: 0, nextWave: 1, point: { levels: new Map(), kinds: new Map() } };
  // Friends' islands to visit by code, with a few things built.
  if (neighbours) friends.forEach((friend, index) => {
    const owner = index === 0 ? 'friend' : `friend_${index + 1}`;
    world.islands.set(friend.code, { code: friend.code, owner, ownerName: friend.ownerName, waveBest: friend.waveBest ?? 0,
      flags: friend.waveBest ?? 0, built: new Set(friend.built ?? []), ...islandExtras((friend.waveBest ?? 0) + 1) });
    world.players.set(owner, { coins: 40, ownerName: friend.ownerName, actions: new Map(), code: friend.code });
  });
  return world;
}

const islandExtras = nextWave => ({ levels: new Map(), kinds: new Map(), crew: { gunner: 0, carpenter: 0, lookout: 0 }, nextWave });

export function createFakeIslandApi({ world = createFakeWorld(), playerId = 'me', ownerName = 'You',
  now = () => Date.now(), weather = 'calm', code: wantedCode = null, version = 1 } = {}) {
  let weatherKind = weather;
  const v2 = version === 2;
  const me = () => {
    let player = world.players.get(playerId);
    if (!player) world.players.set(playerId, player = { coins: 0, ownerName, actions: new Map(), code: null });
    if (!player.code) {
      let code = readIslandCode(wantedCode ?? '');
      if (code && world.islands.has(code)) code = null;
      while (!code || world.islands.has(code)) code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(world.random() * CODE_ALPHABET.length)]).join('');
      world.islands.set(code, { code, owner: playerId, ownerName: player.ownerName, waveBest: 0, flags: 0, built: new Set(), ...islandExtras(1) });
      player.code = code; player.coins = ISLAND_RULES.startingCoins; // a brand-new captain is paid once
      player.captain = 1; player.pointBest = 0;
    }
    return player;
  };
  // --- version 2 helpers -----------------------------------------------------------------------
  const levelOf = (place, id) => (place.built ? (place.built.has(id) ? place.levels.get(id) ?? 1 : 0) : place.levels.get(id) ?? 0);
  const kindOf = (place, id) => place.kinds.get(id) ?? spotKinds(id)[0];
  const maxLevel = kind => TD_RULES.prices[kind].length;
  const v2Spot = (place, id) => {
    const kind = kindOf(place, id), level = levelOf(place, id), prices = TD_RULES.prices[kind];
    return { id, kind, kinds: spotKinds(id), built: level > 0, level, maxLevel: maxLevel(kind), cost: prices[0],
      upgradeCost: level > 0 && level < prices.length ? prices[level] : null };
  };
  const bestFor = player => Math.max(world.islands.get(player.code)?.waveBest ?? 0, player.pointBest ?? 0);
  const unlocked = (player, key) => bestFor(player) >= TD_RULES.unlocks[key];
  const lockedCheck = (player, key) => {
    if (!unlocked(player, key)) refuse(409, 'locked', `Unlocks after wave ${TD_RULES.unlocks[key]}.`);
  };
  const unlocksView = player => ({ best: bestFor(player), unlocked: Object.keys(TD_RULES.unlocks).filter(key => unlocked(player, key)),
    at: { ...TD_RULES.unlocks } });
  const pricesView = () => ({ build: Object.fromEntries(Object.entries(TD_RULES.prices).map(([kind, list]) => [kind, list[0]])),
    upgrade: Object.fromEntries(Object.entries(TD_RULES.prices).map(([kind, list]) => [kind, list.slice(1)])),
    levels: { ...TD_RULES.prices }, crew: Object.fromEntries(Object.entries(TD_RULES.crew).map(([kind, item]) => [kind, item.price])),
    captain: [...TD_RULES.captain] });
  const captainView = player => ({ level: player.captain ?? 1, nextPrice: TD_RULES.captain[player.captain ?? 1] ?? null });
  const spots = island => (v2 ? TD_RULES.spots.map(id => v2Spot(island, id)) : ISLAND_RULES.spots.map(id => {
    const kind = kindOfSpot(id);
    return { id, kind, built: island.built.has(id), cost: ISLAND_RULES.kinds[kind][1] };
  }));
  const view = () => {
    const player = me(), island = world.islands.get(player.code);
    const base = { code: `ISLE-${island.code}`, coins: player.coins, waveBest: island.waveBest, flags: island.flags, spots: spots(island) };
    return v2 ? { ...base, crew: { ...island.crew }, prices: pricesView(), nextWave: island.nextWave, captain: captainView(player),
      unlocks: unlocksView(player) } : base;
  };
  // Build or upgrade on a place ({levels, kinds} and, on an island, built); checks kind, unlocks, coins.
  function place2(place, list, { spot, kind, actionUid }, upgrade, answer) {
    const player = me(), key = `${upgrade ? 'upgrade' : 'build'}:${list === TD_RULES.piratePoint ? 'pp:' : ''}${actionUid}`;
    if (player.actions.has(key)) return answer();
    if (!list.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    const level = levelOf(place, spot);
    if (upgrade) {
      if (level === 0) refuse(409, 'not_built', 'Build something on this spot first.');
      const built = kindOf(place, spot), prices = TD_RULES.prices[built];
      if (level >= prices.length) refuse(409, 'max_level', `This ${TD_RULES.names[built].toLowerCase()} is at its highest level.`);
      lockedCheck(player, `level_${level + 1}`);
      const price = prices[level];
      if (player.coins < price) refuse(409, 'insufficient_funds', `The upgrade costs ${price} coins. You need more coins.`);
      player.coins -= price; place.levels.set(spot, level + 1);
    } else {
      if (!spotKinds(spot).includes(kind)) refuse(422, 'wrong_kind', `Only a ${spotKinds(spot).map(item => TD_RULES.names[item].toLowerCase()).join(' or a ')} can stand on this spot.`);
      if (level > 0) refuse(409, 'spot_taken', `${TD_RULES.names[kindOf(place, spot)]} already stands on this spot.`);
      lockedCheck(player, kind);
      const price = TD_RULES.prices[kind][0];
      if (player.coins < price) refuse(409, 'insufficient_funds', `A ${TD_RULES.names[kind].toLowerCase()} costs ${price} coins. You need more coins.`);
      player.coins -= price; place.kinds.set(spot, kind); place.levels.set(spot, 1); place.built?.add(spot);
    }
    player.actions.set(key, true);
    return answer();
  }
  const pointView = () => ({ spots: TD_RULES.piratePoint.map(id => v2Spot(world.point, id)), waveBest: world.pointBest });
  const placeOf = where => {
    if (where === 'pirate_point') return { key: 'pirate_point', island: null };
    if (where === 'own') { const code = me().code; return { key: code, island: world.islands.get(code) }; }
    const code = readIslandCode(where), island = code && world.islands.get(code);
    if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
    return { key: code, island };
  };
  const nowMs = () => { const value = now(); return value instanceof Date ? value.getTime() : Number(value); };
  const running = run => !run.finishedAt && nowMs() <= run.startsAtMs + ISLAND_RULES.waves.maximumSeconds * 1000;
  const shape = run => ({ waveId: run.waveId, wave: run.wave, seed: run.seed, startsAt: iso(run.startsAtMs),
    weather: { ...run.weather }, flagship: run.flagship, ...(v2 ? { boss: !run.flagship && run.wave % TD_RULES.bossEvery === 0 } : {}) });
  const uid = value => typeof value === 'string' && value.length > 0 && value.length <= 64;

  const api = {
    get playerId() { return playerId; },
    setWeather(kind) { weatherKind = Object.hasOwn(ISLAND_RULES.weather, kind) ? kind : 'calm'; },
    async island() { return view(); },

    async build({ spot, kind, actionUid } = {}) {
      if (typeof spot !== 'string' || typeof kind !== 'string' || !uid(actionUid)) invalid('Send the spot, the kind and an action id.');
      const player = me(), island = world.islands.get(player.code);
      if (spot === 'cabin') refuse(409, 'spot_taken', 'Your cabin already stands there.');
      if (v2) return place2(island, TD_RULES.spots, { spot, kind, actionUid }, false, view);
      if (player.actions.has(`build:${actionUid}`)) return view();
      if (!ISLAND_RULES.spots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot on your island.');
      const wanted = kindOfSpot(spot), [name, price] = ISLAND_RULES.kinds[wanted];
      if (kind !== wanted) refuse(422, 'wrong_kind', `Only a ${name.toLowerCase()} can stand on this spot.`);
      if (island.built.has(spot)) refuse(409, 'spot_taken', `${name} already stands on this spot.`);
      if (player.coins < price) refuse(409, 'insufficient_funds', `A ${name.toLowerCase()} costs ${price} coins. You need more coins.`);
      player.coins -= price; island.built.add(spot); player.actions.set(`build:${actionUid}`, true);
      return view();
    },

    async upgrade({ spot, actionUid } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
      return place2(world.islands.get(me().code), TD_RULES.spots, { spot, actionUid }, true, view);
    },
    async hire({ crew, actionUid } = {}) {
      if (!Object.hasOwn(TD_RULES.crew, crew ?? '') || !uid(actionUid)) invalid('Send gunner, carpenter or lookout and an action id.');
      const player = me(), island = world.islands.get(player.code), rule = TD_RULES.crew[crew];
      if (player.actions.has(`hire:${actionUid}`)) return view();
      if (island.crew[crew] >= rule.max) refuse(409, 'crew_full', `You already have ${rule.max === 1 ? 'a' : rule.max} ${crew}${rule.max === 1 ? '' : 's'}.`);
      lockedCheck(player, crew);
      if (player.coins < rule.price) refuse(409, 'insufficient_funds', `A ${crew} costs ${rule.price} coins. You need more coins.`);
      player.coins -= rule.price; island.crew[crew]++; player.actions.set(`hire:${actionUid}`, true);
      return view();
    },
    async captain({ actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send an action id.');
      const player = me(), level = player.captain ?? 1;
      if (player.actions.has(`captain:${actionUid}`)) return view();
      if (level >= TD_RULES.captain.length) refuse(409, 'max_level', 'Your captain is at the highest level.');
      lockedCheck(player, level + 1 >= 4 ? 'captain_4' : 'captain_upgrade');
      const price = TD_RULES.captain[level];
      if (player.coins < price) refuse(409, 'insufficient_funds', `The next captain level costs ${price} coins. You need more coins.`);
      player.coins -= price; player.captain = level + 1; player.actions.set(`captain:${actionUid}`, true);
      return view();
    },
    async piratePoint() { me(); return pointView(); },
    async piratePointBuild({ spot, kind, actionUid } = {}) {
      if (typeof spot !== 'string' || typeof kind !== 'string' || !uid(actionUid)) invalid('Send the spot, the kind and an action id.');
      return place2(world.point, TD_RULES.piratePoint, { spot, kind, actionUid }, false, pointView);
    },
    async piratePointUpgrade({ spot, actionUid } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
      return place2(world.point, TD_RULES.piratePoint, { spot, actionUid }, true, pointView);
    },
    async inviteJoin({ code, actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send the island code and an action id.');
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
      me();
      return { admitted: true, island: { code: `ISLE-${island.code}`, ownerName: island.ownerName } };
    },

    async visit(code) {
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
      const base = { code: `ISLE-${island.code}`, ownerName: island.ownerName, waveBest: island.waveBest, spots: spots(island) };
      return v2 ? { ...base, crew: { ...island.crew } } : base; // the crew too, so host and visitor run the same wave
    },

    async startWave({ where, actionUid } = {}) {
      if (typeof where !== 'string' || !uid(actionUid)) invalid('Send where the wave starts and an action id.');
      const player = me(), repeat = player.actions.get(`start:${actionUid}`);
      if (repeat) return shape(world.waves.get(repeat));
      const place = placeOf(where);
      for (const run of world.waves.values()) {
        if (run.place === place.key && !run.finishedAt && !running(run)) { run.finishedAt = nowMs(); run.expired = true; }
        if (run.place === place.key && running(run)) refuse(409, 'wave_running', 'A wave is already under way on this island.');
      }
      const best = place.island ? place.island.waveBest : world.pointBest;
      const number = v2 ? Math.min(place.island ? place.island.nextWave : best + 1, TD_RULES.highestWave) : Math.min(best + 1, ISLAND_RULES.waves.highestWave);
      const run = { waveId: `fake-wave-${world.nextWave++}`, place: place.key, island: place.island,
        wave: number, seed: Math.floor(world.random() * 2 ** 31),
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

    async finishWave({ waveId, survived, shipsSunk } = {}) {
      if (typeof waveId !== 'string' || typeof survived !== 'boolean' || !Number.isInteger(shipsSunk) || shipsSunk < 0 || shipsSunk > 1000) {
        invalid('Send the wave, whether the island held and the ships sunk (0 to 1000).');
      }
      const player = me(), run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (!run.participants.has(playerId)) refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
      const placeBest = () => (run.island ? { waveBest: run.island.waveBest, flags: run.island.flags } : { waveBest: world.pointBest, flags: world.pointFlags });
      const stored = run.results.get(playerId);
      if (stored) return { loot: stored, coins: player.coins, ...placeBest() };
      const elapsed = (nowMs() - run.startsAtMs) / 1000;
      if (elapsed < ISLAND_RULES.waves.minimumSeconds) {
        const wait = Math.max(1, Math.ceil(ISLAND_RULES.waves.minimumSeconds - elapsed));
        refuse(409, 'wave_too_early', `The wave is not over yet. Try again in ${wait} seconds.`, wait);
      }
      const late = elapsed > ISLAND_RULES.waves.maximumSeconds;
      const houses = run.island ? [...run.island.built].filter(id => id.startsWith('house_')).length : 0;
      let loot = survived && !late ? lootFor(run.wave, houses, !run.island) : 0;
      if (v2 && loot) {
        // §4: houses pay by level, a boss wave pays double.
        const bonus = run.island ? [...run.island.built].filter(id => id.startsWith('house_'))
          .reduce((sum, id) => sum + TD_RULES.houseLoot[(run.island.levels.get(id) ?? 1) - 1], 0) : 0;
        loot = (lootFor(run.wave, 0, !run.island) + bonus) * (!run.flagship && run.wave % TD_RULES.bossEvery === 0 ? 2 : 1);
        if (!run.island) player.pointBest = Math.max(player.pointBest ?? 0, run.wave);
      }
      if (!run.finishedAt) { run.finishedAt = nowMs(); run.expired = late; }
      if (v2 && !run.nextSet && run.island) {
        run.nextSet = true;
        // §1: the next bell carries on after a win and restarts at best − 2 (at least 1) after a loss.
        run.island.nextWave = survived && !late ? Math.min(run.wave + 1, TD_RULES.highestWave)
          : Math.max(1, run.island.waveBest - TD_RULES.restartBack);
      }
      if (survived && !late && !run.counted) {
        run.counted = true;
        if (run.island) { run.island.waveBest = Math.max(run.island.waveBest, run.wave); run.island.flags++; }
        else { world.pointBest = Math.max(world.pointBest, run.wave); world.pointFlags++; }
      }
      player.coins += loot; run.results.set(playerId, loot);
      return { loot, coins: player.coins, ...placeBest(), ...(v2 && run.island ? { nextWave: run.island.nextWave, boss: run.wave % TD_RULES.bossEvery === 0 } : {}) };
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
        if (route === 'POST /api/island/invite/join') return reply(200, await api.inviteJoin(body));
        if (route === 'GET /api/pirate-point') return reply(200, await api.piratePoint());
        if (route === 'POST /api/pirate-point/build') return reply(200, await api.piratePointBuild(body));
        if (route === 'POST /api/pirate-point/upgrade') return reply(200, await api.piratePointUpgrade(body));
        if (method === 'GET' && pathname.startsWith('/api/island/visit/')) return reply(200, await api.visit(decodeURIComponent(pathname.slice(18))));
        if (route === 'POST /api/waves/start') return reply(200, await api.startWave(body));
        if (route === 'POST /api/waves/join') return reply(200, await api.joinWave(body));
        if (route === 'GET /api/waves/current') return reply(200, await api.currentWave(searchParams.get('where')));
        if (route === 'POST /api/waves/finish') return reply(200, await api.finishWave(body));
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
  '/api/island/invite/join': ['code', 'actionUid'], '/api/pirate-point/upgrade': ['spot', 'actionUid'],
  '/api/pirate-point/build': ['spot', 'kind', 'actionUid'],
  '/api/waves/join': ['waveId'], '/api/waves/finish': ['waveId', 'survived', 'shipsSunk'] });
const ACTION_UID = /^[A-Za-z0-9_-]{8,64}$/;
const exactKeys = (body, keys) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).sort().join() === [...keys].sort().join();

/**
 * {get(path), post(path, body), dev, api}: the fake behind ?islands=fake, answering like online/api.js.
 * Your island is ISLE-K7Q2M with `coins` starting coins; ISLE-FR3ND (Captain Gull) is a friend's island.
 */
/** The fake's version for a page: 2 (TOWER-DEFENSE.md §7) unless &td=1; 1 without a page (the old tests). */
export const fakeVersionFor = search => (typeof search !== 'string' ? 1 : new URLSearchParams(search).get('td') === '1' ? 1 : 2);
export function createFakeIslandTransport({ coins = ISLAND_RULES.startingCoins, now = () => Date.now(), weather = 'calm',
  code = FAKE_OWN_CODE, ownerName = 'You', friends = [FAKE_FRIEND], seed = 7, version = fakeVersionFor(globalThis.location?.search) } = {}) {
  let world, api, others = 0;
  const failures = [];
  function reset() {
    world = createFakeWorld({ seed, friends });
    api = createFakeIslandApi({ world, playerId: 'me', ownerName, now, weather, code, version });
    world.players.set('me', { coins: 0, ownerName, actions: new Map(), code: null });
    void api.island(); world.players.get('me').coins = coins;
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
      if (keys && (!exactKeys(body, keys) || (keys.includes('actionUid') && !ACTION_UID.test(String(body.actionUid))))) {
        return fail(422, 'validation_error', `The request must hold exactly ${keys.join(', ')}.`);
      }
    }
    try {
      if (method === 'GET' && pathname === '/api/island') return ok(await api.island());
      if (method === 'GET' && pathname.startsWith('/api/island/visit/')) return ok(await api.visit(decodeURIComponent(pathname.slice(18))));
      if (method === 'GET' && pathname === '/api/waves/current') return ok(await api.currentWave(new URLSearchParams(query).get('where') ?? ''));
      if (method === 'POST' && pathname === '/api/island/build') return ok(await api.build(body));
      const v2 = { 'POST /api/island/upgrade': 'upgrade', 'POST /api/island/hire': 'hire', 'POST /api/island/captain': 'captain',
        'POST /api/island/invite/join': 'inviteJoin', 'GET /api/pirate-point': 'piratePoint', 'POST /api/pirate-point/build': 'piratePointBuild',
        'POST /api/pirate-point/upgrade': 'piratePointUpgrade' }[`${method} ${pathname}`];
      if (v2 && version === 2) return ok(await api[v2](body));
      if (method === 'POST' && pathname === '/api/waves/start') return ok(await api.startWave(body));
      if (method === 'POST' && pathname === '/api/waves/join') return ok(await api.joinWave(body));
      if (method === 'POST' && pathname === '/api/waves/finish') return ok(await api.finishWave(body));
      return fail(404, 'not_found', 'Not Found');
    } catch (error) {
      if (!(error instanceof FakeApiError)) throw error;
      return fail(error.status, error.code, error.message, error.retryAfter);
    }
  }
  async function request(method, path, body) {
    const kind = failures.shift();
    if (kind === undefined) return route(method, path, body);
    const failure = FAILURES[kind];
    if (failure.applies) await route(method, path, body);
    return fail(failure.status, failure.code, failure.message);
  }
  const me = () => world.players.get('me');
  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    get api() { return api; },
    get world() { return world; },
    dev: {
      setCoins(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('coins must be a whole number from 0 up.'); me().coins = value; },
      setWeather(kind) { api.setWeather(kind); },
      // Another captain rings the bell somewhere (a friend's island, so a visitor can join it).
      async startWaveAt(where) {
        const other = createFakeIslandApi({ world, playerId: `captain_${++others}`, ownerName: 'Another captain', now, weather });
        try { return await other.startWave({ where, actionUid: `other-${others}-captain` }); } catch { return null; }
      },
      failNext(kind) {
        if (!Object.hasOwn(FAILURES, kind)) throw new TypeError(`failNext knows ${Object.keys(FAILURES).join(', ')}.`);
        failures.push(kind);
      },
      read: () => ({ coins: me().coins, built: [...world.islands.get(me().code).built], waves: world.waves.size }),
      // Version 2 helpers: skip the unlocks, jump to a wave.
      setWaveBest(value) { const island = world.islands.get(me().code); island.waveBest = value; island.nextWave = Math.min(100, value + 1); },
      reset() { reset(); failures.length = 0; },
    },
  };
}
