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
//   await api.upgrade({spot, actionUid});        // POST /api/island/upgrade      (TOWER-DEFENSE.md §7)
//   await api.hire({crew, actionUid});           // POST /api/island/hire
//   await api.captain({actionUid});              // POST /api/island/captain      (§10)
//   await api.piratePoint();                     // GET  /api/pirate-point        (§5)
//   await api.pointBuild({spot, kind, actionUid}) / api.pointUpgrade({spot, actionUid})
//   await api.inviteJoin({code, actionUid});     // POST /api/island/invite/join  (§6)
//   await api.fetch('/api/island', {method, body}); // the same as a fetch() Response
// A refusal rejects with FakeApiError {status, code, message, body, retryAfter}.
//
// The island lane's client (src/island/api.js) reads the same fake through createFakeIslandTransport():
// {get(path), post(path, body)} answering like online/api.js ({ok, status, data} or {ok: false, status,
// code, message, retryAfterSeconds}), plus dev helpers (setCoins, setWeather, startWaveAt, failNext,
// read, reset). It is the one fake behind ?islands=fake: your island ISLE-K7Q2M and a friend's island
// ISLE-FR3ND (Captain Gull) to visit.
import { createRandom } from './sim.js';
import { BUILDINGS, CREW, CAPTAIN, readUnlocks, unlockWave, SLOT_KINDS } from '../island/td-rules.js';

export const ISLAND_RULES = Object.freeze({
  startingCoins: 100,
  kinds: Object.freeze({ wall: ['Wall', 10], cannon: ['Cannon', 30], mortar: ['Mortar', 60], watchtower: ['Watchtower', 40], house: ['House', 50] }),
  // TOWER-DEFENSE.md §2: 16 spots; cannon_1…cannon_4 and tower_s5…tower_s7 take a cannon or a mortar.
  spots: Object.freeze(['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4',
    'tower_s5', 'tower_s6', 'tower_s7', 'tower_1', 'house_1', 'house_2']),
  pointSpots: Object.freeze(['pp_wall_1', 'pp_wall_2', 'pp_wall_3', 'pp_wall_4', 'pp_tower_1', 'pp_tower_2', 'pp_tower_3', 'pp_tower_4', 'pp_tower_5', 'pp_tower_6']),
  loot: Object.freeze({ base: 10, perWave: 5, perHouse: 5, piratePointBase: 20 }),
  waves: Object.freeze({ countdownSeconds: 10, minimumSeconds: 15, maximumSeconds: 900, highestWave: 50 }),
  weather: Object.freeze({
    storm: Object.freeze({ kind: 'storm', label: 'Storm: 50% more pirate ships', ships: 1.5, fog: 0 }),
    fog: Object.freeze({ kind: 'fog', label: 'Fog: the pirates appear later', ships: 1.0, fog: 0.4 }),
    rain: Object.freeze({ kind: 'rain', label: 'Rain: the pirates do not mind', ships: 1.0, fog: 0 }),
    calm: Object.freeze({ kind: 'calm', label: 'Calm sea', ships: 1.0, fog: 0 }),
  }),
});
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const kindOfSpot = spot => (/^(pp_)?wall_/.test(spot) ? 'wall' : /^(cannon_|tower_s|pp_tower_)/.test(spot) ? 'cannon' : spot === 'tower_1' ? 'watchtower' : 'house');
// The slot of a spot: a tower spot accepts a cannon or a mortar (§2).
const slotOfSpot = spot => (kindOfSpot(spot) === 'cannon' ? 'tower' : kindOfSpot(spot));
const PRICES = Object.freeze({ ...Object.fromEntries(Object.entries(BUILDINGS).map(([kind, info]) => [kind, [...info.price]])),
  crew: Object.fromEntries(Object.entries(CREW).map(([id, info]) => [id, info.price])), captain: [...CAPTAIN.price] });
// A spot as GET /api/island answers it (§7): kind is the building that stands (or the default), level 0 = empty.
function spotView(island, id) {
  const level = island.levels?.get(id) ?? (island.built.has(id) ? 1 : 0), kind = island.kinds?.get(id) ?? kindOfSpot(id);
  const prices = BUILDINGS[kind].price;
  return { id, kind, built: level > 0, level, cost: prices[0], upgradeCost: level > 0 ? prices[level] ?? null : null,
    ...(slotOfSpot(id) === 'tower' ? { kinds: [...SLOT_KINDS.tower] } : {}) };
}
const lockedMessage = wave => `Unlocks after wave ${wave}.`;

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
    pointBest: 0, pointFlags: 0, nextWave: 1,
    point: { built: new Set(), levels: new Map(), kinds: new Map() } };
  // Friends' islands to visit by code, with a few things built.
  if (neighbours) friends.forEach((friend, index) => {
    const owner = index === 0 ? 'friend' : `friend_${index + 1}`;
    world.islands.set(friend.code, { code: friend.code, owner, ownerName: friend.ownerName, waveBest: friend.waveBest ?? 0,
      flags: friend.waveBest ?? 0, built: new Set(friend.built ?? []), levels: new Map((friend.built ?? []).map(id => [id, 1])), kinds: new Map(),
      crew: { gunner: 0, carpenter: 0, lookout: 0 }, captain: 1 });
    world.players.set(owner, { coins: 40, ownerName: friend.ownerName, actions: new Map(), code: friend.code });
  });
  return world;
}

export function createFakeIslandApi({ world = createFakeWorld(), playerId = 'me', ownerName = 'You',
  now = () => Date.now(), weather = 'calm', code: wantedCode = null, unlocking = false } = {}) {
  // unlocking: the server's §9 locks (409 locked). Off by default here; the game's transport turns it on.
  let weatherKind = weather;
  const me = () => {
    let player = world.players.get(playerId);
    if (!player) world.players.set(playerId, player = { coins: 0, ownerName, actions: new Map(), code: null });
    if (!player.code) {
      let code = readIslandCode(wantedCode ?? '');
      if (code && world.islands.has(code)) code = null;
      while (!code || world.islands.has(code)) code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(world.random() * CODE_ALPHABET.length)]).join('');
      world.islands.set(code, { code, owner: playerId, ownerName: player.ownerName, waveBest: 0, flags: 0, built: new Set(),
        levels: new Map(), kinds: new Map(), crew: { gunner: 0, carpenter: 0, lookout: 0 }, captain: 1 });
      player.code = code; player.coins = ISLAND_RULES.startingCoins; // a brand-new captain is paid once
    }
    return player;
  };
  const spots = island => ISLAND_RULES.spots.map(id => spotView(island, id));
  const unlocksOf = island => {
    const read = readUnlocks({ waveBest: unlocking ? island.waveBest : 99 });
    return { wonWave: read.wonWave, levels: read.levels, crew: read.crew, captain: read.captain, next: read.next };
  };
  const view = () => {
    const player = me(), island = world.islands.get(player.code), captain = island.captain ?? 1;
    return { code: `ISLE-${island.code}`, coins: player.coins, waveBest: island.waveBest, flags: island.flags, spots: spots(island),
      crew: { ...island.crew }, prices: PRICES, nextWave: island.waveBest + 1,
      captain: { level: captain, nextPrice: CAPTAIN.price[captain] ?? null }, unlocks: unlocksOf(island) };
  };
  const pointView = () => ({ spots: ISLAND_RULES.pointSpots.map(id => spotView(world.point, id)), waveBest: world.pointBest });
  // Building and upgrading, shared by your island and Pirate Point (§5: same prices, same refusals).
  const once = (player, key, answer) => { if (player.actions.has(key)) return true; player.actions.set(key, true); return answer; };
  function buildOn(place, ids, { spot, kind, actionUid }, unlocks) {
    if (typeof spot !== 'string' || typeof kind !== 'string' || !uid(actionUid)) invalid('Send the spot, the kind and an action id.');
    const player = me();
    if (player.actions.has(`build:${actionUid}`)) return;
    if (spot === 'cabin') refuse(409, 'spot_taken', 'Your cabin already stands there.');
    if (!ids.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
    const slot = slotOfSpot(spot), allowed = SLOT_KINDS[slot];
    if (!allowed.includes(kind)) refuse(422, 'wrong_kind', slot === 'tower' ? 'Only a cannon or a mortar can stand on this spot.'
      : `Only a ${ISLAND_RULES.kinds[allowed[0]][0].toLowerCase()} can stand on this spot.`);
    const [name, price] = ISLAND_RULES.kinds[kind];
    if (place.built.has(spot)) refuse(409, 'spot_taken', `${ISLAND_RULES.kinds[place.kinds.get(spot) ?? kindOfSpot(spot)][0]} already stands on this spot.`);
    if (unlocks && (unlocks.levels[kind] ?? 0) < 1) refuse(409, 'locked', lockedMessage(unlockWave({ kind, level: 1 })));
    if (player.coins < price) refuse(409, 'insufficient_funds', `A ${name.toLowerCase()} costs ${price} coins. You need more coins.`);
    player.coins -= price; place.built.add(spot); place.levels.set(spot, 1); place.kinds.set(spot, kind); once(player, `build:${actionUid}`);
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
  }
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
    weather: { ...run.weather }, flagship: run.flagship });
  const uid = value => typeof value === 'string' && value.length > 0 && value.length <= 64;

  const api = {
    get playerId() { return playerId; },
    setWeather(kind) { weatherKind = Object.hasOwn(ISLAND_RULES.weather, kind) ? kind : 'calm'; },
    async island() { return view(); },

    async build(body = {}) {
      const island = world.islands.get(me().code);
      buildOn(island, ISLAND_RULES.spots, body, unlocksOf(island));
      return view();
    },
    async upgrade(body = {}) {
      const island = world.islands.get(me().code);
      upgradeOn(island, ISLAND_RULES.spots, body, unlocksOf(island));
      return view();
    },
    async hire({ crew, actionUid } = {}) {
      if (!Object.hasOwn(CREW, crew ?? '') || !uid(actionUid)) invalid('Send gunner, carpenter or lookout and an action id.');
      const player = me(), island = world.islands.get(player.code), info = CREW[crew];
      if (player.actions.has(`hire:${actionUid}`)) return view();
      if (!unlocksOf(island).crew[crew]) refuse(409, 'locked', lockedMessage(unlockWave({ crew })));
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
      if (unlocksOf(island).captain < level + 1) refuse(409, 'locked', lockedMessage(unlockWave({ captain: level + 1 })));
      if (player.coins < CAPTAIN.price[level]) refuse(409, 'insufficient_funds', `Level ${level + 1} costs ${CAPTAIN.price[level]} coins. You need more coins.`);
      player.coins -= CAPTAIN.price[level]; island.captain = level + 1; player.actions.set(`captain:${actionUid}`, true);
      return view();
    },
    async piratePoint() { me(); return pointView(); },
    async pointBuild(body = {}) { buildOn(world.point, ISLAND_RULES.pointSpots, body, null); return pointView(); },
    async pointUpgrade(body = {}) { upgradeOn(world.point, ISLAND_RULES.pointSpots, body, null); return pointView(); },
    async inviteJoin({ code, actionUid } = {}) {
      if (typeof code !== 'string' || !uid(actionUid)) invalid('Send the island code and an action id.');
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code. Ask your friend for the link again.');
      return { admitted: true, island: { code: `ISLE-${island.code}`, ownerName: island.ownerName } };
    },

    async visit(code) {
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
      return { code: `ISLE-${island.code}`, ownerName: island.ownerName, waveBest: island.waveBest, spots: spots(island) };
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
      const run = { waveId: `fake-wave-${world.nextWave++}`, place: place.key, island: place.island,
        wave: Math.min(best + 1, ISLAND_RULES.waves.highestWave), seed: Math.floor(world.random() * 2 ** 31),
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
      const loot = survived && !late ? lootFor(run.wave, houses, !run.island) : 0;
      if (!run.finishedAt) { run.finishedAt = nowMs(); run.expired = late; }
      if (survived && !late && !run.counted) {
        run.counted = true;
        if (run.island) { run.island.waveBest = Math.max(run.island.waveBest, run.wave); run.island.flags++; }
        else { world.pointBest = Math.max(world.pointBest, run.wave); world.pointFlags++; }
      }
      player.coins += loot; run.results.set(playerId, loot);
      return { loot, coins: player.coins, ...placeBest() };
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
        if (route === 'POST /api/pirate-point/build') return reply(200, await api.pointBuild(body));
        if (route === 'POST /api/pirate-point/upgrade') return reply(200, await api.pointUpgrade(body));
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
  '/api/island/invite/join': ['code', 'actionUid'], '/api/pirate-point/build': ['spot', 'kind', 'actionUid'], '/api/pirate-point/upgrade': ['spot', 'actionUid'],
  '/api/waves/join': ['waveId'], '/api/waves/finish': ['waveId', 'survived', 'shipsSunk'] });
const ACTION_UID = /^[A-Za-z0-9_-]{8,64}$/;
const exactKeys = (body, keys) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).sort().join() === [...keys].sort().join();

/**
 * {get(path), post(path, body), dev, api}: the fake behind ?islands=fake, answering like online/api.js.
 * Your island is ISLE-K7Q2M with `coins` starting coins; ISLE-FR3ND (Captain Gull) is a friend's island.
 */
export function createFakeIslandTransport({ coins = ISLAND_RULES.startingCoins, now = () => Date.now(), weather = 'calm',
  code = FAKE_OWN_CODE, ownerName = 'You', friends = [FAKE_FRIEND], seed = 7, unlocking = true } = {}) {
  let world, api, others = 0;
  const failures = [];
  function reset() {
    world = createFakeWorld({ seed, friends });
    api = createFakeIslandApi({ world, playerId: 'me', ownerName, now, weather, code, unlocking });
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
      if (method === 'POST' && pathname === '/api/island/upgrade') return ok(await api.upgrade(body));
      if (method === 'POST' && pathname === '/api/island/hire') return ok(await api.hire(body));
      if (method === 'POST' && pathname === '/api/island/captain') return ok(await api.captain(body));
      if (method === 'POST' && pathname === '/api/island/invite/join') return ok(await api.inviteJoin(body));
      if (method === 'GET' && pathname === '/api/pirate-point') return ok(await api.piratePoint());
      if (method === 'POST' && pathname === '/api/pirate-point/build') return ok(await api.pointBuild(body));
      if (method === 'POST' && pathname === '/api/pirate-point/upgrade') return ok(await api.pointUpgrade(body));
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
      // The best won wave on your island (the unlocks of §9 follow it).
      setWaveBest(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('waveBest must be a whole number from 0 up.'); world.islands.get(me().code).waveBest = value; },
      reset() { reset(); failures.length = 0; },
    },
  };
}
