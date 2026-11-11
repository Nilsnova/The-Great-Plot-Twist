// The browser's client for the island and wave routes (BUILD-PLAN 3.4, docs/INTERFACES.md "Your island
// and the pirate waves"). It decides no rule: the server owns prices, coins, waves and loot.
//
//   const api = createIslandApi({transport});        // transport: {get(path), post(path, body)}
//   await api.getIsland();                            // GET  /api/island
//   await api.build({spot: 'cannon_1', kind: 'cannon'});   // POST /api/island/build
//   await api.visit('ISLE-K7Q2M');                    // GET  /api/island/visit/{code}
//   await api.startWave({where: 'own'});              // POST /api/waves/start
//   await api.joinWave({waveId});                     // POST /api/waves/join
//   await api.currentWave({where: 'own'});            // GET  /api/waves/current?where=
//   await api.finishWave({waveId, survived, shipsSunk});   // POST /api/waves/finish
//   await api.upgrade({spot});                        // POST /api/island/upgrade     (TOWER-DEFENSE.md §7)
//   await api.hire({crew: 'gunner'});                 // POST /api/island/hire
//   await api.upgradeCaptain();                       // POST /api/island/captain     (§10)
//   await api.piratePoint();                          // GET  /api/pirate-point       (§5)
//   await api.pointBuild({spot, kind}) / api.pointUpgrade({spot})   // POST /api/pirate-point/build|upgrade
//   await api.joinInvite('ISLE-K7Q2M');               // POST /api/island/invite/join (§6)
//
// Spot ids: answers are read through spots.js's one mapping table (localSpotId), so a backend that
// says tower_s1 for cannon_1 works unchanged; requests send back the id the server last used.
//
// Every call answers {ok: true, status, data} or {ok: false, status, code, message, retryAfterSeconds?}
// and never throws. The transport is online/api.js (through the panel services of the signed-in
// session) or the in-memory fake of src/pirates/fake-api.js (createFakeIslandTransport); both give that shape. The error code may
// also come nested, as the server writes it: {"error": {"code": "spot_taken", "message": "..."}}.
//
// actionUid: build and start carry one id per click. When the outcome is unknown (no answer, a timeout
// or a 5xx such as 503 database_unavailable) the id is kept, and the next try of the same spot (or the
// same bell) sends it again, so the server never charges or starts twice. Any clear answer drops it.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {islandCode, displayIslandCode} from './codes.js';
import {localSpotId} from './spots.js';

export const PATHS = Object.freeze({
  island: '/api/island', build: '/api/island/build', visit: code => `/api/island/visit/${code}`,
  start: '/api/waves/start', join: '/api/waves/join', finish: '/api/waves/finish',
  current: where => `/api/waves/current?where=${encodeURIComponent(where)}`,
  upgrade: '/api/island/upgrade', hire: '/api/island/hire', captain: '/api/island/captain', inviteJoin: '/api/island/invite/join',
  point: '/api/pirate-point', pointBuild: '/api/pirate-point/build', pointUpgrade: '/api/pirate-point/upgrade',
});
export const CREW_IDS = Object.freeze(['gunner', 'carpenter', 'lookout']);
export const MESSAGES = Object.freeze({
  network: 'No connection to the server. Check your internet and try again.',
  unreadable: 'The answer could not be read. Try again.',
  unknown: 'Something went wrong. Try again.',
  badCode: 'Island codes look like ISLE-K7Q2M. Check the code and try again.',
  badWave: 'There is no such wave.',
  badCrew: 'Choose a gunner, a carpenter or a lookout.',
});
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isText = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

// --- answer shapes -------------------------------------------------------------------------------
export function isSpot(spot) {
  return !!spot && isText(spot.id) && isText(spot.kind) && typeof spot.built === 'boolean' && isCount(spot.cost);
}
export function isIsland(data) {
  return !!data && isText(data.code) && isCount(data.coins) && isCount(data.waveBest) && isCount(data.flags)
    && Array.isArray(data.spots) && data.spots.every(isSpot);
}
export function isVisit(data) {
  return !!data && isText(data.code) && typeof data.ownerName === 'string' && isCount(data.waveBest)
    && Array.isArray(data.spots) && data.spots.every(isSpot);
}
export function isPoint(data) {
  return !!data && Array.isArray(data.spots) && data.spots.every(isSpot) && isCount(data.waveBest ?? 0);
}
export function isInvite(data) {
  return !!data && data.admitted === true && !!data.island && isText(data.island.code) && typeof data.island.ownerName === 'string';
}
export function isWave(data) {
  return !!data && isText(data.waveId) && Number.isSafeInteger(data.wave) && data.wave >= 1 && isCount(data.seed)
    && typeof data.startsAt === 'string' && Number.isFinite(Date.parse(data.startsAt))
    && !!data.weather && typeof data.weather.kind === 'string' && typeof data.flagship === 'boolean';
}
export function isFinish(data) {
  return !!data && isCount(data.loot) && isCount(data.coins) && isCount(data.waveBest) && isCount(data.flags);
}

// --- failures ------------------------------------------------------------------------------------
// One failure shape from whatever the transport gave: online/api.js already flattens the server's
// nested error; a raw answer still carries it under data.error (or error).
export function readFailure(result) {
  const nested = result?.data?.error ?? result?.error ?? null;
  const status = Number.isInteger(result?.status) ? result.status : 0;
  const code = (isText(result?.code) && result.code) || (isText(nested?.code) && nested.code)
    || (status === 0 ? 'network_error' : 'http_error');
  const message = (isText(result?.message) && result.message) || (isText(nested?.message) && nested.message)
    || (status === 0 ? MESSAGES.network : MESSAGES.unknown);
  const failure = {ok: false, status, code, message};
  if (isCount(result?.retryAfterSeconds) && result.retryAfterSeconds > 0) failure.retryAfterSeconds = result.retryAfterSeconds;
  return failure;
}
// No answer, a timeout or a server-side failure: the write may or may not have happened.
export const outcomeUnknown = failure => !failure.ok && (failure.status === 0 || failure.status >= 500);

export function createIslandApi({transport, makeUid = makeActionUid} = {}) {
  if (!transport || typeof transport.get !== 'function' || typeof transport.post !== 'function') {
    throw new TypeError('createIslandApi needs a transport with get and post.');
  }
  const held = new Map(); // 'build:cannon_1' or 'start:own' -> the click id of an unknown outcome

  async function ask(send, accept) {
    let result;
    try { result = await send(); } catch { result = {ok: false, status: 0, code: 'network_error', message: MESSAGES.network}; }
    if (!result?.ok) return readFailure(result);
    const data = result.data ?? null;
    if (!accept(data)) return {ok: false, status: 502, code: 'unreadable', message: MESSAGES.unreadable};
    return {ok: true, status: result.status ?? 200, data};
  }
  // A write with a click id: reuse the held id after an unknown outcome, drop it after a clear answer.
  async function write(key, send, accept) {
    const actionUid = held.get(key) ?? makeUid();
    held.set(key, actionUid);
    const answer = await ask(() => send(actionUid), accept);
    if (answer.ok || !outcomeUnknown(answer)) held.delete(key);
    return answer;
  }
  // The server's own spelling of each spot id, learnt from its answers (spots.js SPOT_ALIASES).
  const serverIds = new Map();
  function readSpots(data) {
    if (!data || !Array.isArray(data.spots)) return data;
    return {...data, spots: data.spots.map(spot => {
      if (!spot || typeof spot.id !== 'string') return spot;
      const id = localSpotId(spot.id);
      if (id !== spot.id) serverIds.set(id, spot.id);
      return id === spot.id ? spot : {...spot, id};
    })};
  }
  const sent = id => serverIds.get(id) ?? id;
  const askSpots = (send, accept) => ask(send, accept).then(answer => (answer.ok ? {...answer, data: readSpots(answer.data)} : answer));
  const writeSpots = (key, send, accept) => write(key, send, accept).then(answer => (answer.ok ? {...answer, data: readSpots(answer.data)} : answer));
  const where = value => (value === 'own' || value === 'pirate_point' ? value : displayIslandCode(value) || null);
  const refuse = (status, code, message) => Promise.resolve({ok: false, status, code, message});

  return {
    getIsland: () => askSpots(() => transport.get(PATHS.island), isIsland),
    build({spot, kind} = {}) {
      return writeSpots(`build:${spot}`, actionUid => transport.post(PATHS.build, {spot: sent(spot), kind, actionUid}), isIsland);
    },
    upgrade({spot} = {}) {
      return writeSpots(`upgrade:${spot}`, actionUid => transport.post(PATHS.upgrade, {spot: sent(spot), actionUid}), isIsland);
    },
    hire({crew} = {}) {
      if (!CREW_IDS.includes(crew)) return refuse(422, 'validation_error', MESSAGES.badCrew);
      return writeSpots(`hire:${crew}`, actionUid => transport.post(PATHS.hire, {crew, actionUid}), isIsland);
    },
    upgradeCaptain() {
      return writeSpots('captain', actionUid => transport.post(PATHS.captain, {actionUid}), isIsland);
    },
    piratePoint: () => askSpots(() => transport.get(PATHS.point), isPoint),
    pointBuild({spot, kind} = {}) {
      return writeSpots(`point-build:${spot}`, actionUid => transport.post(PATHS.pointBuild, {spot, kind, actionUid}), isPoint);
    },
    pointUpgrade({spot} = {}) {
      return writeSpots(`point-upgrade:${spot}`, actionUid => transport.post(PATHS.pointUpgrade, {spot, actionUid}), isPoint);
    },
    joinInvite(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badCode);
      return write(`invite:${symbols}`, actionUid => transport.post(PATHS.inviteJoin, {code: displayIslandCode(symbols), actionUid}), isInvite);
    },
    visit(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badCode);
      return askSpots(() => transport.get(PATHS.visit(displayIslandCode(symbols))), isVisit);
    },
    startWave({where: place = 'own'} = {}) {
      const target = where(place);
      if (!target) return refuse(422, 'validation_error', MESSAGES.badCode);
      return write(`start:${target}`, actionUid => transport.post(PATHS.start, {where: target, actionUid}), isWave);
    },
    joinWave({waveId} = {}) {
      if (!isText(waveId)) return refuse(404, 'no_such_wave', MESSAGES.badWave);
      return ask(() => transport.post(PATHS.join, {waveId}), isWave);
    },
    currentWave({where: place = 'own'} = {}) {
      const target = where(place);
      if (!target) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.get(PATHS.current(target)), data => data === null || isWave(data));
    },
    finishWave({waveId, survived, shipsSunk = 0} = {}) {
      if (!isText(waveId)) return refuse(404, 'no_such_wave', MESSAGES.badWave);
      const body = {waveId, survived: survived === true, shipsSunk: isCount(shipsSunk) ? Math.min(shipsSunk, 1000) : 0};
      return ask(() => transport.post(PATHS.finish, body), isFinish);
    },
    // For tests and the console: the click id kept for an unknown outcome, if any.
    heldActionUid: key => held.get(key) ?? null,
  };
}
