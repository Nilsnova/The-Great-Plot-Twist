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
//   await api.demolishQuote({spot, code?});      // GET  /api/island/demolish     (GAME-V3.md §4.2: half back to each payer)
//   await api.demolish({spot, actionUid, code?}); // POST /api/island/demolish    (between waves, any member; not the heart)
//   await api.move({spot, x, z, code?});           // POST /api/island/move        (T36: a spot to a grid cell, between waves, free)
//   await api.freshStart({confirmCode, actionUid}); // POST /api/island/fresh-start (T53: reset your own island, between waves)
//   await api.walls({code?});                    // GET  /api/island/walls        (D039, flag wall_recovery: health, timer, Repair price)
//   await api.repairWall({spot, actionUid, code?}); // POST /api/island/repair    (D039: Repair/Rebuild between waves, paid once)
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
// Waves (§1, §4): numbers to 100, every 5th a boss wave (`boss: true`, loot × 3, wave 40 × 5), houses pay by level, and the
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
//
// This file is the fake's entry point: the transport (createFakeIslandTransport and the shared world of several tabs)
// and the public exports. The fake server lives beside it, one job each:
//   fake-rules.js     the fixed rules, prices, views and loot; FakeApiError; createFakeWorld
//   fake-server.js    createFakeIslandApi: the setup every route shares, the island answer, the arsenal, fetch()
//   fake-island.js    island routes: build, upgrade, wreck, boat, demolish, fresh start, move, walls, Pirate Point
//   fake-research.js  crew, captain, skills, roles, respec, research, tower specs and trees
//   fake-waves.js     the friend invite, games, visits, waves (start, join, current, finish, revive), the weather
import { isRole } from './captain-ids.js';
import { ISLAND_RULES, kindOfSpot, createFakeWorld, FakeApiError, TD_RULES } from './fake-rules.js';
import { createFakeIslandApi } from './fake-server.js';

// The public API, unchanged.
export { ISLAND_RULES, CODE_ALPHABET, SIM_RULES, TD_RULES, unlocksAt, campaignAt, FakeApiError, readIslandCode,
  wantsFakeIslands, islandRoom, lootFor, bossMultiplierFor, DEFAULT_FRIEND, MAX_MEMBERS, createFakeWorld } from './fake-rules.js';
export { createFakeIslandApi };


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
  '/api/island/skill': ['skill', 'actionUid'],
  '/api/island/invite/join': ['code', 'actionUid'], '/api/pirate-point/build': ['spot', 'kind', 'actionUid'], '/api/pirate-point/upgrade': ['spot', 'actionUid'],
  '/api/waves/join': ['waveId'], '/api/waves/finish': ['waveId', 'survived', 'shipsSunk'], '/api/waves/revive': ['waveId', 'fallen', 'downAt', 'actionUid'],
  '/api/games': [], '/api/games/join': ['code', 'actionUid'], '/api/games/leave': ['code'],
  '/api/island/research': ['branch', 'actionUid'], '/api/island/tower-skill': ['spot', 'spec'], '/api/island/wreck': ['amount', 'actionUid'],
  '/api/island/tower-tree': ['spot', 'path', 'tier', 'actionUid'],
  '/api/island/demolish': ['spot', 'actionUid'], '/api/island/move': ['spot', 'x', 'z'], '/api/island/repair': ['spot', 'actionUid'],
  '/api/island/arsenal/buy': ['weapon', 'actionUid'], '/api/island/arsenal/take': ['copy', 'actionUid'], '/api/island/arsenal/return': ['actionUid'] });
// Keys a body may also carry: `code` builds, upgrades, researches, picks a skill or mends the wreck on a game's island.
const OPTIONAL_KEYS = Object.freeze({ '/api/waves/finish': ['bonuses', 'rescued', 'walls'], '/api/island/repair': ['code'], '/api/island/build': ['code'], '/api/island/upgrade': ['code'], '/api/games': ['actionUid'],
  '/api/waves/start': ['waveProtocol'], '/api/waves/join': ['waveProtocol'],
  '/api/island/research': ['code', 'tier', 'choice', 'change'], '/api/island/tower-skill': ['code', 'actionUid'], '/api/island/tower-tree': ['code'], '/api/island/wreck': ['code'], '/api/island/demolish': ['code'], '/api/island/move': ['code'],
  '/api/island/arsenal/buy': ['code'], '/api/island/arsenal/take': ['code'], '/api/island/arsenal/return': ['code'] });
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
// ?fakeflags=wall_recovery: the feature flags the fake server has on (its /api/config); none by default.
// The server's flag names: lower case, digits and _ (defenses_v2 has a digit).
const FLAG_NAME = /^[a-z][a-z0-9_]{0,31}$/;
export function fakeFlagsFor(search = '') {
  const listed = new URLSearchParams(typeof search === 'string' ? search : '').get('fakeflags') ?? '';
  return Object.freeze(Object.fromEntries(listed.split(',').filter(name => FLAG_NAME.test(name)).map(name => [name, true])));
}
const fromPage = fakePlayerFor(globalThis.location?.search ?? '');
export function createFakeIslandTransport({ coins = ISLAND_RULES.startingCoins, now = () => Date.now(), weather = 'calm',
  code = FAKE_OWN_CODE, ownerName = fromPage.ownerName ?? 'You', friends = [FAKE_FRIEND], seed = 7, unlocking = true,
  version = fakeVersionFor(globalThis.location?.search), playerId = fromPage.playerId, flags = fakeFlagsFor(globalThis.location?.search),
  shared = fromPage.shared ? createSharedFakeStore(fromPage.shared) : null } = {}) {
  let world, api, others = 0;
  const failures = [];
  // A shared world (fakeworld): the other tabs' writes first, ours after, all in one synchronous step.
  const pull = () => { const saved = shared?.load(); if (saved) Object.assign(world, saved); };
  function reset() {
    world = createFakeWorld({ seed, friends });
    pull();
    api = createFakeIslandApi({ world, playerId, ownerName, now, weather, code: playerId === 'me' ? code : null, unlocking, version, flags });
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
      if (['/api/waves/start', '/api/waves/join'].includes(pathname)
          && body?.waveProtocol !== undefined && body.waveProtocol !== 2) {
        return fail(422, 'validation_error', 'Version must be 2 when supplied.');
      }
    }
    try {
      if (method === 'GET' && pathname === '/api/island/leaderboard') return fail(503, 'offline', 'Leaderboard results need an online game. Return to the title and sign in to play online.');
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
      if (method === 'POST' && pathname === '/api/island/fresh-start') return ok(await api.freshStart(body));
      if (method === 'GET' && pathname === '/api/island/arsenal') return ok(await api.arsenal({ code: new URLSearchParams(query).get('code') }));
      if (method === 'POST' && pathname === '/api/island/arsenal/buy') return ok(await api.arsenalBuy(body));
      if (method === 'POST' && pathname === '/api/island/arsenal/take') return ok(await api.arsenalTake(body));
      if (method === 'POST' && pathname === '/api/island/arsenal/return') return ok(await api.arsenalReturn(body));
      if (method === 'POST' && pathname === '/api/island/research') return ok(await api.research(body));
      if (method === 'POST' && pathname === '/api/island/tower-skill') return ok(await api.specialise(body));
      if (method === 'POST' && pathname === '/api/island/tower-tree') return ok(await api.towerTree(body));
      if (method === 'POST' && pathname === '/api/island/wreck') return ok(await api.repairWreck(body));
      if (method === 'GET' && pathname === '/api/island/boat') return ok(await api.boatStatus({ code: new URLSearchParams(query).get('code') }));
      if (method === 'POST' && pathname === '/api/island/boat') return ok(await api.boatReward(body));
      if (method === 'GET' && pathname === '/api/island/demolish') {
        const asked = new URLSearchParams(query);
        return ok(await api.demolishQuote({ spot: asked.get('spot') ?? '', code: asked.get('code') }));
      }
      if (method === 'POST' && pathname === '/api/island/demolish') return ok(await api.demolish(body));
      if (method === 'POST' && pathname === '/api/island/move') return ok(await api.move(body));
      if (method === 'GET' && pathname === '/api/island/walls') return ok(await api.walls({ code: new URLSearchParams(query).get('code') }));
      if (method === 'POST' && pathname === '/api/island/repair') return ok(await api.repairWall(body));
      if (method === 'GET' && pathname === '/api/island/structures') return fail(404, 'feature_off', 'This view is available online only.');
      if (method === 'POST' && pathname === '/api/island/structures/repair') return fail(404, 'feature_off', 'This repair needs the online server.');
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
  // The dev helpers change the world too: in a shared world they read it first and write it after, under the
  // same lock as the requests. Outside it another tab's request could save its older copy over the change
  // (test:mp: setCaptain(3) lost, so the role pick was refused). They answer a promise then; a request made
  // right after (load()) waits for them, as the lock serves in order. read() only reads, at once.
  const synced = helpers => (shared ? Object.fromEntries(Object.entries(helpers).map(([name, helper]) => [name, name === 'read'
    ? (...args) => { pull(); return helper(...args); }
    : (...args) => shared.lock(async () => { pull(); try { return await helper(...args); } finally { shared.save(world); } })])) : helpers);
  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    get api() { return api; },
    get world() { return world; },
    // The flags this fake server has on (game.js reads wall_recovery from here in fake mode).
    get flags() { return { ...flags }; },
    dev: synced({
      setCoins(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('coins must be a whole number from 0 up.'); me().coins = value; },
      setWeather(kind) { api.setWeather(kind); },
      // Another captain rings the bell somewhere (a friend's island, so a visitor can join it).
      async startWaveAt(where) {
        const other = createFakeIslandApi({ world, playerId: `captain_${++others}`, ownerName: 'Another captain', now, weather, flags });
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
      // Pirate Point's best wave (the next bell there rings best + 1), to test a late flagship wave (T38: no rescue there).
      setPointBest(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('pointBest must be a whole number from 0 up.');
        world.pointBest = Math.min(TD_RULES.highestWave - 1, value);
      },
      // D039: the fake server's clock moves on by `ms` (the 10-minute wall timer); in a shared world for every tab.
      advanceClock(ms) {
        if (!Number.isSafeInteger(ms) || ms < 0) throw new TypeError('ms must be a whole number from 0 up.');
        world.clockShiftMs = (world.clockShiftMs ?? 0) + ms;
      },
      reset() { reset(); failures.length = 0; },
    }),
  };
}
