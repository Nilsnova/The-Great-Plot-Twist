// A local stand-in for the island and wave routes of BUILD-PLAN 3.4, with the server's answers, error
// codes, messages and check order (backend/server/island/). Nothing is saved; nothing leaves the tab.
// Chosen with ?islands=fake in a dev build. It answers like online/api.js does: {ok, status, data} or
// {ok: false, status, code, message, retryAfterSeconds?}.
//
//   const transport = createFakeIslandTransport();          // {get, post, dev}
//   const api = createFakeIslandApi();                      // the same functions as createIslandApi
//
// Besides your own island (ISLE-K7Q2M) there is a friend's island to visit: ISLE-FR3ND (Captain Gull).
// lane P writes src/pirates/fake-api.js against the same contract; whichever stays, the function names
// and answer shapes of api.js are the interface.
import {createIslandApi} from './api.js';
import {islandCode, displayIslandCode} from './codes.js';

export const FAKE_OWN_CODE = 'K7Q2M';
export const FAKE_FRIEND_CODE = 'FR3ND';
const KINDS = Object.freeze({wall: {name: 'Wall', coins: 10}, cannon: {name: 'Cannon', coins: 30},
  watchtower: {name: 'Watchtower', coins: 40}, house: {name: 'House', coins: 50}});
export const FAKE_SPOTS = Object.freeze([
  ['wall_1', 'wall'], ['wall_2', 'wall'], ['wall_3', 'wall'], ['wall_4', 'wall'],
  ['cannon_1', 'cannon'], ['cannon_2', 'cannon'], ['cannon_3', 'cannon'], ['cannon_4', 'cannon'],
  ['tower_1', 'watchtower'], ['house_1', 'house'], ['house_2', 'house'],
].map(([id, kind]) => Object.freeze({id, kind})));
const WEATHER = Object.freeze({
  storm: {kind: 'storm', label: 'Storm: 50% more pirate ships', ships: 1.5, fog: 0},
  fog: {kind: 'fog', label: 'Fog: the pirates appear later', ships: 1.0, fog: 0.4},
  rain: {kind: 'rain', label: 'Rain: the pirates do not mind', ships: 1.0, fog: 0},
  calm: {kind: 'calm', label: 'Calm sea', ships: 1.0, fog: 0},
});
const TIMING = Object.freeze({countdown: 10, minimum: 15, maximum: 900, highest: 50});
const LOOT = Object.freeze({base: 10, perWave: 5, perHouse: 5, piratePoint: 20});
const UID = /^[A-Za-z0-9_-]{8,64}$/, ID = /^[a-z][a-z0-9_]{1,39}$/;
const FAILURES = {
  timeout: {applies: true, status: 0, code: 'timeout', message: 'The server took too long to answer. Try again.'},
  network: {applies: false, status: 0, code: 'network_error', message: 'No connection to the server. Check your internet and try again.'},
  server: {applies: false, status: 503, code: 'database_unavailable', message: 'The database could not be reached. Try again in a moment.'},
};

const ok = data => ({ok: true, status: 200, data});
const refuse = (status, code, message, extra = {}) => ({ok: false, status, code, message, ...extra});
const wholeSeconds = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const exactKeys = (body, keys) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).sort().join() === [...keys].sort().join();

function freshIsland(code, ownerName, built = [], waveBest = 0) {
  return {code, ownerName, built: new Set(built), waveBest, flags: waveBest};
}

export function createFakeIslandTransport({coins = 100, now = () => Date.now(), weather = 'calm',
  random = Math.random, code = FAKE_OWN_CODE, ownerName = 'You'} = {}) {
  let state;
  const failures = [];
  function reset() {
    state = {coins, islands: new Map(), waves: new Map(), starts: new Map(), builds: new Set(), weather, next: 1};
    state.islands.set(code, freshIsland(code, ownerName));
    state.islands.set(FAKE_FRIEND_CODE, freshIsland(FAKE_FRIEND_CODE, 'Captain Gull', ['wall_1', 'wall_2', 'cannon_1', 'tower_1'], 2));
    state.islands.set('pirate_point', freshIsland('pirate_point', 'Pirate Point'));
  }
  reset();
  const own = () => state.islands.get(code);
  const spotsOf = island => FAKE_SPOTS.map(spot => ({id: spot.id, kind: spot.kind, built: island.built.has(spot.id), cost: KINDS[spot.kind].coins}));
  const islandAnswer = () => ({code: displayIslandCode(code), coins: state.coins, waveBest: own().waveBest, flags: own().flags, spots: spotsOf(own())});

  function build(body) {
    if (!exactKeys(body, ['spot', 'kind', 'actionUid']) || !UID.test(String(body.actionUid))
      || !ID.test(String(body.spot)) || !ID.test(String(body.kind))) {
      return refuse(422, 'validation_error', 'The request must hold exactly spot, kind and actionUid.');
    }
    if (state.builds.has(body.actionUid)) return ok(islandAnswer());
    if (body.spot === 'cabin') return refuse(409, 'spot_taken', 'Your cabin already stands there.');
    const spot = FAKE_SPOTS.find(item => item.id === body.spot);
    if (!spot) return refuse(404, 'no_such_spot', 'There is no such build spot on your island.');
    if (body.kind !== spot.kind) return refuse(422, 'wrong_kind', `Only a ${KINDS[spot.kind].name.toLowerCase()} can stand on this spot.`);
    if (own().built.has(spot.id)) return refuse(409, 'spot_taken', `${KINDS[spot.kind].name} already stands on this spot.`);
    const price = KINDS[spot.kind].coins;
    if (state.coins < price) return refuse(409, 'insufficient_funds', `A ${KINDS[spot.kind].name.toLowerCase()} costs ${price} coins. You need more coins.`);
    state.coins -= price; own().built.add(spot.id); state.builds.add(body.actionUid);
    return ok(islandAnswer());
  }
  // "own", an island code or "pirate_point" -> the island key, or null.
  function placeOf(where) {
    if (where === 'own') return code;
    if (where === 'pirate_point') return where;
    const symbols = islandCode(String(where ?? ''));
    return symbols && state.islands.has(symbols) ? symbols : null;
  }
  const waveShape = wave => ({waveId: wave.waveId, wave: wave.wave, seed: wave.seed, startsAt: wave.startsAt,
    weather: {...WEATHER[wave.weather]}, flagship: wave.place === 'pirate_point'});
  const running = wave => !!wave && !wave.closed && now() <= Date.parse(wave.startsAt) + TIMING.maximum * 1000;
  const runningAt = place => [...state.waves.values()].find(wave => wave.place === place && running(wave)) ?? null;

  function start(body) {
    if (!exactKeys(body, ['where', 'actionUid']) || !UID.test(String(body.actionUid)) || typeof body.where !== 'string') {
      return refuse(422, 'validation_error', 'The request must hold exactly where and actionUid.');
    }
    const repeated = state.starts.get(body.actionUid);
    if (repeated) return ok(waveShape(state.waves.get(repeated)));
    const place = placeOf(body.where);
    if (!place) return refuse(404, 'no_such_island', 'There is no island with that code.');
    if (runningAt(place)) return refuse(409, 'wave_running', 'A wave is already under way on this island.');
    const island = state.islands.get(place);
    const waveId = `fake-wave-${state.next++}`;
    const wave = {waveId, place, wave: Math.min(TIMING.highest, island.waveBest + 1),
      seed: Math.floor(random() * 2147483647), startsAt: wholeSeconds(now() + TIMING.countdown * 1000),
      weather: Object.hasOwn(WEATHER, state.weather) ? state.weather : 'calm', closed: false,
      participants: new Set(['me']), loot: new Map()};
    state.waves.set(waveId, wave); state.starts.set(body.actionUid, waveId);
    return ok(waveShape(wave));
  }
  function join(body) {
    if (!exactKeys(body, ['waveId']) || typeof body.waveId !== 'string') return refuse(422, 'validation_error', 'The request is not valid.');
    const wave = state.waves.get(body.waveId);
    if (!wave) return refuse(404, 'no_such_wave', 'There is no such wave.');
    if (wave.participants.has('me')) return ok(waveShape(wave));
    if (!running(wave)) return refuse(409, 'wave_over', 'This wave is over. Ring the bell for the next one.');
    wave.participants.add('me');
    return ok(waveShape(wave));
  }
  function current(where) {
    const place = placeOf(where);
    if (!place) return refuse(404, 'no_such_island', 'There is no island with that code.');
    const wave = runningAt(place);
    return ok(wave ? waveShape(wave) : null);
  }
  function finish(body) {
    if (!exactKeys(body, ['waveId', 'survived', 'shipsSunk']) || typeof body.waveId !== 'string'
      || typeof body.survived !== 'boolean' || !Number.isSafeInteger(body.shipsSunk) || body.shipsSunk < 0 || body.shipsSunk > 1000) {
      return refuse(422, 'validation_error', 'The request is not valid.');
    }
    const wave = state.waves.get(body.waveId);
    if (!wave) return refuse(404, 'no_such_wave', 'There is no such wave.');
    if (!wave.participants.has('me')) return refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
    const island = state.islands.get(wave.place);
    const answer = loot => ({loot, coins: state.coins, waveBest: island.waveBest, flags: island.flags});
    if (wave.loot.has('me')) return ok(answer(wave.loot.get('me')));
    const since = (now() - Date.parse(wave.startsAt)) / 1000;
    if (since < TIMING.minimum) {
      const wait = Math.max(1, Math.ceil(TIMING.minimum - since));
      return refuse(409, 'wave_too_early', `The wave is not over yet. Try again in ${wait} seconds.`, {retryAfterSeconds: wait});
    }
    let loot = 0;
    if (body.survived && since <= TIMING.maximum) {
      const houses = FAKE_SPOTS.filter(spot => spot.kind === 'house' && island.built.has(spot.id)).length;
      loot = wave.place === 'pirate_point' ? LOOT.piratePoint + LOOT.perWave * wave.wave
        : LOOT.base + LOOT.perWave * wave.wave + LOOT.perHouse * houses;
    }
    if (!wave.closed && body.survived && wave.wave > island.waveBest) { island.waveBest = wave.wave; island.flags += 1; }
    wave.closed = true; wave.loot.set('me', loot); state.coins += loot;
    return ok(answer(loot));
  }
  function visit(path) {
    const symbols = islandCode(decodeURIComponent(path.slice('/api/island/visit/'.length)));
    const island = symbols ? state.islands.get(symbols) : null;
    if (!island) return refuse(404, 'no_such_island', 'There is no island with that code.');
    return ok({code: displayIslandCode(island.code), ownerName: island.ownerName, waveBest: island.waveBest, spots: spotsOf(island)});
  }

  function route(method, path, body) {
    const [pathname, query = ''] = String(path).split('?');
    if (method === 'GET' && pathname === '/api/island') return ok(islandAnswer());
    if (method === 'GET' && pathname.startsWith('/api/island/visit/')) return visit(pathname);
    if (method === 'GET' && pathname === '/api/waves/current') return current(new URLSearchParams(query).get('where') ?? '');
    if (method === 'POST' && pathname === '/api/island/build') return build(body);
    if (method === 'POST' && pathname === '/api/waves/start') return start(body);
    if (method === 'POST' && pathname === '/api/waves/join') return join(body);
    if (method === 'POST' && pathname === '/api/waves/finish') return finish(body);
    return refuse(404, 'not_found', 'Not Found');
  }
  // A queued failure hits the next request; a timeout still does the work (only the answer is lost).
  async function request(method, path, body) {
    const kind = failures.shift();
    if (kind === undefined) return route(method, path, body);
    const failure = FAILURES[kind];
    if (failure.applies) route(method, path, body);
    return refuse(failure.status, failure.code, failure.message);
  }
  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    dev: {
      setCoins(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('coins must be a whole number from 0 up.'); state.coins = value; },
      setWeather(kind) { state.weather = Object.hasOwn(WEATHER, kind) ? kind : 'calm'; },
      // Another captain rings the bell on an island (a friend's, so a visitor can join it).
      startWaveAt(where) {
        const place = placeOf(where); if (!place || runningAt(place)) return null;
        const answer = start({where, actionUid: `other-${state.next}-captain`});
        const wave = state.waves.get(answer.data.waveId); wave.participants.delete('me');
        return answer.data;
      },
      failNext(kind) {
        if (!Object.hasOwn(FAILURES, kind)) throw new TypeError(`failNext knows ${Object.keys(FAILURES).join(', ')}.`);
        failures.push(kind);
      },
      read: () => ({coins: state.coins, built: [...own().built], waves: state.waves.size}),
      reset() { reset(); failures.length = 0; },
    },
  };
}

export function createFakeIslandApi(options = {}) {
  const transport = createFakeIslandTransport(options);
  return Object.assign(createIslandApi({transport, makeUid: options.makeUid}), {dev: transport.dev});
}
