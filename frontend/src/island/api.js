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
//   await api.reviveCaptain({waveId, fallen, downAt}); // POST /api/waves/revive   (GAME-V3.md §3, you pay)
//   await api.upgrade({spot});                        // POST /api/island/upgrade     (TOWER-DEFENSE.md §7)
//   await api.build({spot, kind, code: 'ISLE-FR3ND'}) // on a friend's island, paid with your coins
//   await api.hire({crew: 'gunner'});                 // POST /api/island/hire
//   await api.upgradeCaptain();                       // POST /api/island/captain     (§10)
//   await api.learnSkill({skill: 'steady_aim'});      // POST /api/island/skill       (§14)
//   await api.pickRole({role: 'medic'}); await api.respec(); // POST /api/island/role, /respec
//   await api.buyWeapon({weapon: 'pistols'});         // POST /api/island/weapon/buy  (§15)
//   await api.equipWeapon({weapon: 'pistols'});       // POST /api/island/weapon/equip
//   await api.demolishQuote({spot, code?});            // GET  /api/island/demolish   (GAME-V3.md §4.2: who gets what back)
//   await api.demolish({spot, code?});                 // POST /api/island/demolish   (between waves; half back to each payer)
//   await api.move({spot, x, z, code?});               // POST /api/island/move       (T36: a spot to a cell of the build grid, free)
//   await api.freshStart({confirmCode});               // POST /api/island/fresh-start (T53: reset your own island, between waves)
//   await api.piratePoint();                          // GET  /api/pirate-point       (§5)
//   await api.pointBuild({spot, kind}) / api.pointUpgrade({spot})   // POST /api/pirate-point/build|upgrade
//   await api.joinInvite('ISLE-K7Q2M');               // POST /api/island/invite/join (§6)
// The games of GAME-V3 §2 (a game is an island; its code is the game's code):
//   await api.createGame();                           // POST /api/games          your own game
//   await api.joinGame('ISLE-K7Q2M' | 'K7Q2M');       // POST /api/games/join     member for good
//   await api.games();                                // GET  /api/games          Continue
//   await api.lobby('ISLE-K7Q2M');                    // GET  /api/games/{code}   host and members
//   await api.leaveGame('ISLE-K7Q2M');                // POST /api/games/leave
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
import {SKILL_BY_ID, WEAPON_BY_ID, isRole} from '../pirates/captain-ids.js';
import {BRANCH_BY_ID, SPECS, optionsOf} from '../campaign/tech.js';
import {isRole as isHouseRole} from '../campaign/houses.js';
import {readRecoverySnapshot} from '../pirates/recovery-snapshot.js';
import {isParticipantToken} from '../pirates/recovery-policy.js';

export const PATHS = Object.freeze({
  leaderboard: '/api/island/leaderboard', island: '/api/island', build: '/api/island/build', visit: code => `/api/island/visit/${code}`,
  start: '/api/waves/start', join: '/api/waves/join', finish: '/api/waves/finish', revive: '/api/waves/revive',
  current: (where, waveProtocol = 1) => `/api/waves/current?where=${encodeURIComponent(where)}${waveProtocol === 2 ? '&waveProtocol=2' : ''}`,
  upgrade: '/api/island/upgrade', hire: '/api/island/hire', captain: '/api/island/captain', inviteJoin: '/api/island/invite/join',
  skill: '/api/island/skill', role: '/api/island/role', respec: '/api/island/respec', weaponBuy: '/api/island/weapon/buy', weaponEquip: '/api/island/weapon/equip',
  point: '/api/pirate-point', pointBuild: '/api/pirate-point/build', pointUpgrade: '/api/pirate-point/upgrade',
  games: '/api/games', gameJoin: '/api/games/join', gameLeave: '/api/games/leave', game: code => `/api/games/${code}`,
  research: '/api/island/research', specialise: '/api/island/tower-skill', towerTree: '/api/island/tower-tree', wreck: '/api/island/wreck',
  demolish: '/api/island/demolish', move: '/api/island/move',
  // D039 (flag wall_recovery): the walls' health and the paid Repair/Rebuild.
  walls: code => `/api/island/walls${code ? `?code=${encodeURIComponent(code)}` : ''}`, repair: '/api/island/repair',
  // T55/T56: canonical persistent health and the fixed-quote Repair now action.
  structures: code => `/api/island/structures${code ? `?code=${encodeURIComponent(code)}` : ''}`,
  structureRepair: '/api/island/structures/repair',
  demolishQuote: (spot, code) => `/api/island/demolish?spot=${encodeURIComponent(spot)}${code ? `&code=${encodeURIComponent(code)}` : ''}`,
  // D057: the island's own boat (after wave 30): whether she sails and which games paid, and one round's reward.
  boat: code => `/api/island/boat${code ? `?code=${encodeURIComponent(code)}` : ''}`, boatReward: '/api/island/boat',
  // T53: reset your own island to a fresh start (Settings).
  freshStart: '/api/island/fresh-start',
});
export const CREW_IDS = Object.freeze(['gunner', 'carpenter', 'lookout', 'guard']);
export const MESSAGES = Object.freeze({
  network: 'No connection to the server. Check your internet and try again.',
  unreadable: 'The answer could not be read. Try again.',
  unknown: 'Something went wrong. Try again.',
  badCode: 'Island codes look like ISLE-K7Q2M. Check the code and try again.',
  badGameCode: 'Game codes look like ISLE-K7Q2M or K7Q2M. Check the code and try again.',
  badWave: 'There is no such wave.',
  badCrew: 'Choose a gunner, a carpenter, a lookout or a guard.',
  badSkill: 'There is no such skill.',
  badRole: 'There is no such role.',
  badWeapon: 'There is no such weapon.',
  badResearch: 'There is no such research.',
  badSpec: 'There is no such tower skill.',
  badTree: 'There is no such step in a tower tree.',
  badGift: 'Pick one of the amounts shown.',
  badBoat: 'There is no such boat game.',
  badCell: 'Pick a square of the build grid.',
  badConfirm: "Type your island's code, like ISLE-K7Q2M.",
});
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isText = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

// --- answer shapes -------------------------------------------------------------------------------
const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
// T7/T45 ranking row. `crew` (captains of the scoring run, at most 10) may be missing from a T7 server.
const isRankRow = row => !!row && isText(row.name) && Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 10 &&
  Number.isInteger(row.wave) && row.wave >= 1 && row.wave <= 1000 &&
  (row.crew === undefined || (Number.isInteger(row.crew) && row.crew >= 1 && row.crew <= 10));
// A weekly board has its week (and may omit `scope`, as T7 did); the all-time board has none.
function isLeaderboard(data, scope) {
  if (!data || !Array.isArray(data.entries) || data.entries.length > 10 || !data.entries.every(isRankRow)) return false;
  if (scope === 'all') return data.scope === 'all' && data.weekStart === null && data.weekEnd === null;
  return (data.scope === undefined || data.scope === 'week') && isDate(data.weekStart) && isDate(data.weekEnd);
}
export function isSpot(spot) {
  return !!spot && isText(spot.id) && isText(spot.kind) && typeof spot.built === 'boolean' && isCount(spot.cost);
}
export function isIsland(data) {
  return !!data && isText(data.code) && isCount(data.coins) && isCount(data.waveBest) && isCount(data.flags)
    && (data.recoveryVersion === undefined || data.recoveryVersion === 0 || data.recoveryVersion === 1)
    && Array.isArray(data.spots) && data.spots.every(isSpot);
}
export function isVisit(data) {
  return !!data && isText(data.code) && typeof data.ownerName === 'string' && isCount(data.waveBest)
    && Array.isArray(data.spots) && data.spots.every(isSpot);
}
// GET /api/pirate-point: {spots, waveBest, coins} (coins: your own balance).
export function isPoint(data) {
  return !!data && Array.isArray(data.spots) && data.spots.every(isSpot) && isCount(data.waveBest ?? 0) && (data.coins === undefined || isCount(data.coins));
}
// A build or upgrade on a friend's island answers that island (or yours): anything with its spots.
export const hasSpots = data => !!data && Array.isArray(data.spots) && data.spots.every(isSpot);
export function isInvite(data) {
  return !!data && data.admitted === true && !!data.island && isText(data.island.code) && typeof data.island.ownerName === 'string';
}
// A game (GAME-V3 §2): {code, hostName, role: host | member, waveBest, members, maxMembers}.
export function isGame(game) {
  return !!game && isText(game.code) && typeof game.hostName === 'string' && (game.role === 'host' || game.role === 'member')
    && isCount(game.waveBest) && isCount(game.members) && (game.maxMembers === undefined || isCount(game.maxMembers));
}
export const isCreated = data => !!data && isGame(data.game) && typeof data.created === 'boolean';
export const isJoined = data => !!data && data.admitted === true && isGame(data.game);
export const isGames = data => !!data && Array.isArray(data.games) && data.games.every(isGame);
const isMember = member => !!member && isText(member.id) && typeof member.name === 'string' && (member.role === 'host' || member.role === 'member')
  && (member.captainRole == null || isRole(member.captainRole));
export const isLobby = data => !!data && isGame(data.game) && Array.isArray(data.members) && data.members.length > 0 && data.members.every(isMember);
export const isLeft = data => !!data && typeof data.left === 'boolean';
// D039: GET /api/island/walls: {coins, walls: [{spot, level, health, recoversAt, repairCost}]}.
const isWall = wall => !!wall && isText(wall.spot) && Number.isSafeInteger(wall.level) && Number.isInteger(wall.health)
  && wall.health >= 0 && wall.health <= 100 && (wall.recoversAt === null || typeof wall.recoversAt === 'string')
  && (wall.repairCost === null || isCount(wall.repairCost));
export const isWalls = data => !!data && isCount(data.coins) && Array.isArray(data.walls) && data.walls.length <= 50 && data.walls.every(isWall);
const localWalls = answer => (answer.ok ? {...answer, data: {...answer.data, walls: answer.data.walls.map(wall => ({...wall, spot: localSpotId(wall.spot)}))}} : answer);
const RECOVERY_KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const RECOVERY_PHASES = new Set(['between_waves', 'preparing', 'combat']);
const RECOVERY_WINDOWS = new Set(['between_waves', 'reserved_wave']);
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isRecoveryItem = row => !!row && isText(row.spot) && isUuid(row.instanceId) && RECOVERY_KINDS.has(row.kind)
  && Number.isSafeInteger(row.level) && row.level >= 1 && row.level <= 5
  && Number.isSafeInteger(row.hpUnits) && row.hpUnits >= 0 && row.hpUnits <= 1_000_000
  && Number.isFinite(row.maxHP) && row.maxHP > 0
  && Number.isFinite(row.rateUnitsPerSecond) && row.rateUnitsPerSecond >= 0
  && (row.estimatedFreeSeconds === null || (Number.isSafeInteger(row.estimatedFreeSeconds) && row.estimatedFreeSeconds >= 0))
  && isCount(row.fixedPrice) && Number.isSafeInteger(row.repairSeq) && row.repairSeq >= 0;
export function isStructureRecovery(data) {
  return !!data && isDate(data.serverNow) && isUuid(data.islandEpoch) && isCount(data.revision)
    && data.recoveryVersion === 1 && data.waveProtocol === 2 && RECOVERY_PHASES.has(data.displayPhase)
    && RECOVERY_WINDOWS.has(data.repairWindow) && (data.waveId === null || isUuid(data.waveId))
    && (data.remainingPaidUses === null || (Number.isSafeInteger(data.remainingPaidUses) && data.remainingPaidUses >= 0 && data.remainingPaidUses <= 3))
    && Array.isArray(data.structures) && data.structures.length <= 50 && data.structures.every(isRecoveryItem)
    && ((data.repairWindow === 'between_waves' && data.waveId === null)
      || (data.repairWindow === 'reserved_wave' && data.waveId !== null));
}
const localRecovery = (data, onSpot = () => {}) => ({...data, structures: data.structures.map(row => {
  const spot = localSpotId(row.spot);
  if (spot !== row.spot) onSpot(spot, row.spot);
  return {...row, spot};
})});
function isStructureRepair(data) {
  const receipt = data?.receipt;
  const waveReceiptFields = [receipt?.waveId, receipt?.useOrdinal, receipt?.eventSeq];
  const hasWaveReceipt = waveReceiptFields.every(value => value !== null && value !== undefined);
  const hasNoWaveReceipt = waveReceiptFields.every(value => value === null);
  return !!receipt && isText(receipt.actionUid) && isText(receipt.spot) && isUuid(receipt.instanceId)
    && RECOVERY_KINDS.has(receipt.kind) && Number.isSafeInteger(receipt.level) && receipt.level >= 1 && receipt.level <= 5
    && Number.isSafeInteger(receipt.chargedPrice) && receipt.chargedPrice > 0 && isCount(receipt.balanceAtCommit)
    && (receipt.waveId === null || isUuid(receipt.waveId))
    && (receipt.useOrdinal === null || (Number.isSafeInteger(receipt.useOrdinal) && receipt.useOrdinal >= 1 && receipt.useOrdinal <= 3))
    && (receipt.eventSeq === null || (Number.isSafeInteger(receipt.eventSeq) && receipt.eventSeq > 0))
    && Number.isSafeInteger(receipt.repairSeq) && receipt.repairSeq > 0 && (hasWaveReceipt || hasNoWaveReceipt)
    && isStructureRecovery(data.currentState) && isCount(data.coins);
}
// The walls part of a finish: wall_N -> a whole percent 0..100; null when there is nothing to send.
export function wallHealthBody(walls) {
  if (!walls || typeof walls !== 'object') return null;
  const out = {};
  for (const [id, value] of Object.entries(walls)) if (/^wall_[0-9]{1,2}$/.test(id) && Number.isInteger(value) && value >= 0 && value <= 100) out[id] = value;
  return Object.keys(out).length ? out : null;
}
const isWaveRow = data => !!data && isText(data.waveId) && Number.isSafeInteger(data.wave) && data.wave >= 1 && isCount(data.seed)
  && typeof data.startsAt === 'string' && Number.isFinite(Date.parse(data.startsAt))
  && !!data.weather && typeof data.weather.kind === 'string' && typeof data.flagship === 'boolean';
export function isWave(data) {
  if (!isWaveRow(data)) return false;
  if (data.waveProtocol === undefined && (data.recoveryVersion === undefined || data.recoveryVersion === 0)) return true;
  if (data.waveProtocol === 1 && (data.recoveryVersion === undefined || data.recoveryVersion === 0)) return true;
  return data.waveProtocol === 2 && data.recoveryVersion === 1
    && readRecoverySnapshot(data.initialSnapshot, data.waveId) !== null && isParticipantToken(data.participantToken)
    && Number.isSafeInteger(data.lastActorCounter) && data.lastActorCounter >= 0;
}
// GET /api/waves/current of a recovery wave you may join but have not joined yet (a teammate's bell): the
// public wave (recoveryVersion 1, waveProtocol 2) without snapshot, participant token or counter. Only a
// join (POST /api/waves/join) answers those, so such a wave is shown and joined, never started from.
export const isJoinableWave = data => isWaveRow(data) && data.recoveryVersion === 1 && data.waveProtocol === 2
  && data.initialSnapshot == null && data.participantToken == null && data.lastActorCounter == null;
// The wave's clock (legacy waves run from startsAt on every screen): a wave answer carries the server's time
// (serverNow, ms). clockOffsetMs = server minus this browser, measured when the answer arrives, only when the
// browser's clock is off by more than CLOCK_SLACK_MS (an input stamped for tick n then still lands before
// tick n on a teammate's screen: the input lead is 200 ms). A clock off by seconds made the same wave
// diverge between browsers; a well-set clock keeps its own time (the answer's travel time is no better).
export const CLOCK_SLACK_MS = 250;
const DAY_MS = 86_400_000;
export function clockOffset(data, now) {
  const server = typeof data?.serverNow === 'string' ? Date.parse(data.serverNow) : NaN;
  if (!Number.isFinite(server)) return null;
  const offset = Math.round(server - now);
  return Math.abs(offset) >= CLOCK_SLACK_MS && Math.abs(offset) <= DAY_MS ? offset : null;
}
// Captain health (GAME-V3.md §3): what the revive cost you and your coins after it.
export const isRevive = data => !!data && isCount(data.price) && isCount(data.coins) && typeof data.repeat === 'boolean';
// A tear-down's quote (GAME-V3.md §4.2): {spot, kind, name, level, refunds: [{id, name, coins, you}]}.
const isRefund = item => !!item && isText(item.id) && typeof item.name === 'string' && isCount(item.coins) && typeof item.you === 'boolean';
export const isDemolishQuote = data => !!data && isText(data.spot) && isText(data.kind) && Number.isSafeInteger(data.level) && data.level >= 1
  && Array.isArray(data.refunds) && data.refunds.length <= 10 && data.refunds.every(isRefund);
// A tear-down answers the island (with your coins) and `demolished`, the quote's shape as paid.
export const isDemolished = data => hasSpots(data) && isCount(data.coins) && isDemolishQuote(data.demolished);
export function isFinish(data) {
  return !!data && isCount(data.loot) && isCount(data.coins) && isCount(data.waveBest) && isCount(data.flags);
}

// D057: GET /api/island/boat {open, reason, message, wave, unlockWave, wreck: {paid, goal}, games: [{id, paid, best}]}
// and POST's {game, stars, coins, paid, already, balance, wave}.
export const isBoatStatus = data => !!data && typeof data.open === 'boolean' && isCount(data.wave) && Array.isArray(data.games)
  && data.games.length <= 8 && data.games.every(item => !!item && isText(item.id) && typeof item.paid === 'boolean' && isCount(item.best));
export const isBoatReward = data => !!data && isText(data.game) && isCount(data.stars) && isCount(data.coins) && typeof data.paid === 'boolean'
  && typeof data.already === 'boolean' && (data.balance === null || isCount(data.balance)) && isCount(data.wave);

// --- failures ------------------------------------------------------------------------------------
// One failure shape from whatever the transport gave: online/api.js already flattens the server's
// nested error; a raw answer still carries it under data.error (or error).
// T53: the answer of a reset, {reset: true, repeat, balance, counts: {buildings, waves, ...}}.
const FRESH_COUNTS = ['saves', 'buildings', 'research', 'layout', 'arsenalMoves', 'arsenalCopies', 'wallRecords', 'waveRules', 'waves', 'membersKept'];
export function isFreshStart(data) {
  return !!data && data.reset === true && typeof data.repeat === 'boolean' && isCount(data.balance) && !!data.counts &&
    Number.isSafeInteger(data.counts.coins) && FRESH_COUNTS.every(key => isCount(data.counts[key]));
}
export function readFailure(result) {
  const nested = result?.data?.error ?? result?.error ?? null;
  const status = Number.isInteger(result?.status) ? result.status : 0;
  const code = (isText(result?.code) && result.code) || (isText(nested?.code) && nested.code)
    || (status === 0 ? 'network_error' : 'http_error');
  const message = (isText(result?.message) && result.message) || (isText(nested?.message) && nested.message)
    || (status === 0 ? MESSAGES.network : MESSAGES.unknown);
  const failure = {ok: false, status, code, message};
  if (isCount(result?.retryAfterSeconds) && result.retryAfterSeconds > 0) failure.retryAfterSeconds = result.retryAfterSeconds;
  if (isStructureRecovery(result?.data?.currentState)) failure.currentState = localRecovery(result.data.currentState);
  if (isCount(result?.data?.coins)) failure.coins = result.data.coins;
  return failure;
}
// No answer, a timeout or a server-side failure: the write may or may not have happened.
export const outcomeUnknown = failure => !failure.ok && (failure.status === 0 || failure.status >= 500);

export function createIslandApi({transport, makeUid = makeActionUid, waveProtocol = () => 1, now = () => Date.now()} = {}) {
  if (!transport || typeof transport.get !== 'function' || typeof transport.post !== 'function') {
    throw new TypeError('createIslandApi needs a transport with get and post.');
  }
  const held = new Map(); // 'build:cannon_1' or 'start:own' -> the click id of an unknown outcome
  const protocolFor = where => {
    try {
      const value = typeof waveProtocol === 'function' ? waveProtocol(where) : waveProtocol;
      return value === 2 ? 2 : 1;
    } catch { return 1; }
  };

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
    const answer = await ask(() => send(actionUid), data => accept(data, actionUid));
    if (answer.ok || !outcomeUnknown(answer)) held.delete(key);
    return answer;
  }
  // The server's own spelling of each spot id, learnt from its answers (spots.js SPOT_ALIASES).
  const serverIds = new Map();
  const recoverySpots = data => localRecovery(data, (local, server) => serverIds.set(local, server));
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
  // A wave answer with the browser's clock offset (clockOffset above), stamped as it arrives.
  const timed = answer => {
    if (!answer.ok || !answer.data) return answer;
    const offset = clockOffset(answer.data, now());
    return offset === null ? answer : {...answer, data: {...answer.data, clockOffsetMs: offset}};
  };

  return {
    // scope 'week' (T7) or 'all' (T45, all time). The answer must be the board that was asked for.
    leaderboard: (scope = 'week') => ask(() => transport.get(scope === 'all' ? `${PATHS.leaderboard}?scope=all` : PATHS.leaderboard),
      data => isLeaderboard(data, scope)),
    getIsland: () => askSpots(() => transport.get(PATHS.island), isIsland),
    // code: a friend's island (ISLE-XXXXX) to build on with your own coins; without it your own island.
    build({spot, kind, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(where ? `build:${where}:${spot}` : `build:${spot}`, actionUid => transport.post(PATHS.build, {spot: sent(spot), kind, actionUid, ...(where ? {code: where} : {})}),
        where ? hasSpots : isIsland);
    },
    upgrade({spot, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(where ? `upgrade:${where}:${spot}` : `upgrade:${spot}`, actionUid => transport.post(PATHS.upgrade, {spot: sent(spot), actionUid, ...(where ? {code: where} : {})}),
        where ? hasSpots : isIsland);
    },
    hire({crew} = {}) {
      if (!CREW_IDS.includes(crew)) return refuse(422, 'validation_error', MESSAGES.badCrew);
      return writeSpots(`hire:${crew}`, actionUid => transport.post(PATHS.hire, {crew, actionUid}), isIsland);
    },
    upgradeCaptain() {
      return writeSpots('captain', actionUid => transport.post(PATHS.captain, {actionUid}), isIsland);
    },
    // §14: learn one skill (no coins: skill points). The click id makes a repeat safe.
    learnSkill({skill} = {}) {
      if (!Object.hasOwn(SKILL_BY_ID, skill ?? '')) return refuse(400, 'bad_skill', MESSAGES.badSkill);
      return writeSpots(`skill:${skill}`, actionUid => transport.post(PATHS.skill, {skill, actionUid}), isIsland);
    },
    // The role choice (medic, engineer or gunner) at captain level 3, once; a respec (coins, scaled by your captain
    // level) clears every skill and the role (GAME-V3.md, Captain tree and roles).
    pickRole({role} = {}) {
      if (!isRole(role)) return refuse(400, 'bad_role', MESSAGES.badRole);
      return askSpots(() => transport.post(PATHS.role, {role}), isIsland);
    },
    respec() {
      return writeSpots('respec', actionUid => transport.post(PATHS.respec, {actionUid}), isIsland);
    },
    // §15: buy a weapon once with coins, then equip it (equipping again changes nothing, so no click id).
    buyWeapon({weapon} = {}) {
      if (!Object.hasOwn(WEAPON_BY_ID, weapon ?? '')) return refuse(400, 'bad_weapon', MESSAGES.badWeapon);
      return writeSpots(`weapon:${weapon}`, actionUid => transport.post(PATHS.weaponBuy, {weapon, actionUid}), isIsland);
    },
    equipWeapon({weapon} = {}) {
      if (!Object.hasOwn(WEAPON_BY_ID, weapon ?? '')) return refuse(400, 'bad_weapon', MESSAGES.badWeapon);
      return askSpots(() => transport.post(PATHS.weaponEquip, {weapon}), isIsland);
    },
    // GAME-V3.md §5, §5.1: one research step at the Tech hub of the island (yours, or the game of `code`):
    // tier 1 of a branch, or one option of tier 2 or 3 (`change`: switch from the option the crew chose before).
    research({branch, tier = 1, choice = null, change = false, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (!Object.hasOwn(BRANCH_BY_ID, branch ?? '')) return refuse(400, 'bad_research', MESSAGES.badResearch);
      if (![1, 2, 3].includes(tier) || (tier === 1 ? choice !== null : !optionsOf(branch, tier).includes(choice))) return refuse(400, 'bad_research', MESSAGES.badResearch);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      const body = {branch, ...(tier > 1 ? {tier, choice, ...(change ? {change: true} : {})} : {}), ...(where ? {code: where} : {})};
      return writeSpots(`research:${where}:${branch}:${tier}:${choice ?? ''}:${change ? 'change' : 'pick'}`, actionUid => transport.post(PATHS.research, {...body, actionUid}),
        where ? hasSpots : isIsland);
    },
    // A tower picks one skill of its researched kind, paid with the clicker's coins (D051), so it carries a click
    // id: a retry after an unknown outcome reuses it and is never charged twice. A house role is free (same route).
    specialise({spot, spec, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (!Object.hasOwn(SPECS, spec ?? '') && !isHouseRole(spec)) return refuse(400, 'bad_spec', MESSAGES.badSpec);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(`spec:${where}:${spot}:${spec}`, actionUid => transport.post(PATHS.specialise, {spot: sent(spot), spec, actionUid, ...(where ? {code: where} : {})}),
        where ? hasSpots : isIsland);
    },
    // D055: one tier of a level-5 tower's upgrade tree (path a or b, tier 1 to 3), paid with the clicker's coins, so
    // it carries a click id: a retry after an unknown outcome reuses it and is never charged twice.
    towerTree({spot, path, tier, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (!['a', 'b'].includes(path) || ![1, 2, 3].includes(tier)) return refuse(400, 'bad_tree', MESSAGES.badTree);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(`tree:${where}:${spot}:${path}:${tier}`, actionUid => transport.post(PATHS.towerTree, {spot: sent(spot), path, tier, actionUid, ...(where ? {code: where} : {})}),
        where ? hasSpots : isIsland);
    },
    // GAME-V3.md §4: coins into the island's wreck (one of the gifts the answer lists).
    repairWreck({amount, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (!Number.isSafeInteger(amount) || amount < 1) return refuse(400, 'bad_gift', MESSAGES.badGift);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(`wreck:${where}:${amount}`, actionUid => transport.post(PATHS.wreck, {amount, actionUid, ...(where ? {code: where} : {})}),
        where ? hasSpots : isIsland);
    },
    // D057: the island's boat (code: the game's island, without it your own). A round's claim carries no click id: the
    // server pays each game once per player, island and best wave, so a retry can never be paid twice.
    boatStatus({code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.get(PATHS.boat(where)), isBoatStatus);
    },
    boatReward({game, stars, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (typeof game !== 'string' || !Number.isSafeInteger(stars) || stars < 0 || stars > 3) return refuse(400, 'bad_game', MESSAGES.badBoat);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.post(PATHS.boatReward, {game, stars, ...(where ? {code: where} : {})}), isBoatReward);
    },
    // GAME-V3.md §4.2: what tearing a building down gives back (the server works it out), then the tear-down
    // itself, between waves only; code: the game's island (ISLE-XXXXX), without it your own.
    demolishQuote({spot, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.get(PATHS.demolishQuote(sent(spot), where)), isDemolishQuote)
        .then(answer => (answer.ok ? {...answer, data: {...answer.data, spot: localSpotId(answer.data.spot)}} : answer));
    },
    demolish({spot, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return writeSpots(`demolish:${where}:${spot}`, actionUid => transport.post(PATHS.demolish, {spot: sent(spot), actionUid, ...(where ? {code: where} : {})}),
        isDemolished);
    },
    // T36: move a spot (built or empty) to a cell of the build grid, between waves, free. Moving it to where it
    // stands is harmless, so a repeat needs no click id. code: the game's island, without it your own.
    move({spot, x, z, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (![x, z].every(value => Number.isFinite(value) && Number.isInteger(value * 2))) return refuse(422, 'off_grid', MESSAGES.badCell);
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return askSpots(() => transport.post(PATHS.move, {spot: sent(spot), x, z, ...(where ? {code: where} : {})}), where ? hasSpots : isIsland);
    },
    // T53: reset your own island (Settings), between waves, after typing its code. The click id makes a
    // retry after an unknown outcome safe: the server answers the first reset and never resets twice.
    freshStart({confirmCode} = {}) {
      if (!islandCode(confirmCode ?? '')) return refuse(400, 'wrong_code', MESSAGES.badConfirm);
      return write('fresh-start', actionUid => transport.post(PATHS.freshStart, {confirmCode: displayIslandCode(confirmCode), actionUid}), isFreshStart);
    },
    // D039 (flag wall_recovery): every built wall's health, timer and Repair price; a Repair or Rebuild.
    walls({code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.get(PATHS.walls(where)), isWalls).then(localWalls);
    },
    repairWall({spot, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return write(`repair:${where}:${spot}`, actionUid => transport.post(PATHS.repair, {spot: sent(spot), actionUid, ...(where ? {code: where} : {})}), isWalls)
        .then(localWalls);
    },
    // T55/T56: read canonical HP and quote context, then submit exactly that quote. The server owns
    // all HP, price, quota and wallet decisions; unknown outcomes keep the same click UID for retry.
    structureRecovery({code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      return ask(() => transport.get(PATHS.structures(where)), isStructureRecovery)
        .then(answer => answer.ok ? {...answer, data: recoverySpots(answer.data)} : answer);
    },
    repairStructure({quote, code = null} = {}) {
      const where = code ? displayIslandCode(code) : '';
      if (code && !where) return refuse(422, 'validation_error', MESSAGES.badCode);
      if (!quote || !isText(quote.spot) || !isUuid(quote.instanceId) || !isUuid(quote.expectedEpoch)
          || !RECOVERY_WINDOWS.has(quote.expectedWindow) || (quote.expectedWindow === 'reserved_wave' ? !isUuid(quote.expectedWaveId) : quote.expectedWaveId != null)
          || !Number.isSafeInteger(quote.expectedLevel) || quote.expectedLevel < 1 || quote.expectedLevel > 5
          || !Number.isSafeInteger(quote.expectedRepairSeq) || quote.expectedRepairSeq < 0
          || !Number.isSafeInteger(quote.quotedPrice) || quote.quotedPrice <= 0 || quote.waveProtocol !== 2) {
        return refuse(422, 'validation_error', MESSAGES.unknown);
      }
      const key = `structure-repair:${where}:${quote.instanceId}`;
      return write(key, actionUid => transport.post(PATHS.structureRepair, {
        spot: sent(quote.spot), instanceId: quote.instanceId, actionUid, expectedEpoch: quote.expectedEpoch,
        expectedWindow: quote.expectedWindow, ...(quote.expectedWindow === 'reserved_wave' ? {expectedWaveId: quote.expectedWaveId} : {}),
        expectedLevel: quote.expectedLevel, expectedRepairSeq: quote.expectedRepairSeq, quotedPrice: quote.quotedPrice,
        waveProtocol: quote.waveProtocol, ...(where ? {code: where} : {}),
      }), (data, actionUid) => isStructureRepair(data) && data.receipt.actionUid === actionUid).then(answer => answer.ok
        ? {...answer, data: {...answer.data, receipt: {...answer.data.receipt, spot: localSpotId(answer.data.receipt.spot)}, currentState: recoverySpots(answer.data.currentState)}}
        : answer);
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
    createGame() {
      return write('game:create', actionUid => transport.post(PATHS.games, {actionUid}), isCreated);
    },
    joinGame(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badGameCode);
      return write(`game:join:${symbols}`, actionUid => transport.post(PATHS.gameJoin, {code: displayIslandCode(symbols), actionUid}), isJoined);
    },
    games: () => ask(() => transport.get(PATHS.games), isGames),
    lobby(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badGameCode);
      return ask(() => transport.get(PATHS.game(displayIslandCode(symbols))), isLobby);
    },
    leaveGame(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badGameCode);
      return ask(() => transport.post(PATHS.gameLeave, {code: displayIslandCode(symbols)}), isLeft);
    },
    visit(code) {
      const symbols = islandCode(code);
      if (!symbols) return refuse(422, 'validation_error', MESSAGES.badCode);
      return askSpots(() => transport.get(PATHS.visit(displayIslandCode(symbols))), isVisit);
    },
    startWave({where: place = 'own', waveProtocol: askedProtocol = null} = {}) {
      const target = where(place);
      if (!target) return refuse(422, 'validation_error', MESSAGES.badCode);
      const version = askedProtocol === 2 ? 2 : protocolFor(target);
      return write(`start:${target}`, actionUid => transport.post(PATHS.start,
        {where: target, actionUid, ...(version === 2 ? {waveProtocol: 2} : {})}), isWave).then(timed);
    },
    joinWave({waveId, waveProtocol: askedProtocol = null} = {}) {
      if (!isText(waveId)) return refuse(404, 'no_such_wave', MESSAGES.badWave);
      const version = askedProtocol === 2 ? 2 : protocolFor();
      return ask(() => transport.post(PATHS.join, {waveId, ...(version === 2 ? {waveProtocol: 2} : {})}), isWave).then(timed);
    },
    currentWave({where: place = 'own', waveProtocol: askedProtocol = null} = {}) {
      const target = where(place);
      if (!target) return refuse(422, 'validation_error', MESSAGES.badCode);
      const version = askedProtocol === 2 ? 2 : protocolFor(target);
      return ask(() => transport.get(PATHS.current(target, version)), data => data === null || isWave(data) || isJoinableWave(data)).then(timed);
    },
    finishWave({waveId, survived, shipsSunk = 0, bonuses, rescued, walls} = {}) {
      if (!isText(waveId)) return refuse(404, 'no_such_wave', MESSAGES.badWave);
      // v3 waves: the galleon sunk, a finisher won (known kinds only, each once; the server checks the wave).
      const asked = Array.isArray(bonuses) ? [...new Set(bonuses.filter(kind => kind === 'galleon' || kind === 'finisher'))] : [];
      // D039: each wall's health in percent (wall_N: 0..100), only when the wave came with walls.
      const health = wallHealthBody(walls);
      // T38: a won last-chance rescue is sent only as rescued: true (the server decides what it changes).
      const body = {waveId, survived: survived === true, shipsSunk: isCount(shipsSunk) ? Math.min(shipsSunk, 1000) : 0, ...(asked.length ? {bonuses: asked} : {}),
        ...(rescued === true ? {rescued: true} : {}), ...(health ? {walls: health} : {})};
      return ask(() => transport.post(PATHS.finish, body), isFinish);
    },
    // A fallen teammate stood up (captain health): you pay 20 + 5 × wave; fallen is their id in the wave's sim,
    // downAt the tick of their fall (one fall is paid once: a second helper is refused 409 already_up).
    reviveCaptain({waveId, fallen, downAt} = {}) {
      if (!isText(waveId)) return refuse(404, 'no_such_wave', MESSAGES.badWave);
      if (typeof fallen !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(fallen)) return refuse(422, 'validation_error', MESSAGES.unknown);
      if (!Number.isSafeInteger(downAt) || downAt < 0 || downAt > 100000) return refuse(422, 'validation_error', MESSAGES.unknown);
      return write(`revive:${waveId}:${fallen}:${downAt}`, actionUid => transport.post(PATHS.revive, {waveId, fallen, downAt, actionUid}), isRevive);
    },
    // For tests and the console: the click id kept for an unknown outcome, if any.
    heldActionUid: key => held.get(key) ?? null,
  };
}
