// Recovery-v1 journal input and event transport. Uses the island's authenticated get/post transport.

import { readSkills, readWeapon } from './captain-stats.js';
import { isParticipantToken } from './recovery-policy.js';

export const MAX_INPUT_BATCH = 32;
export const MAX_INPUT_BATCH_BYTES = 16 * 1024;
// Inputs: one write at a time, only while commands wait, at most every RECOVERY_FLUSH_MS.
export const RECOVERY_FLUSH_MS = 250;
// Events: one read at a time. A running wave reads again when its sealed ticks are about to run out under
// the playout buffer (the round trip plus RECOVERY_POLL_MARGIN_MS before the playout would starve, at
// least RECOVERY_POLL_LEAD_MS), never sooner than RECOVERY_POLL_MIN_MS after the last read started and
// never later than RECOVERY_POLL_MS. Measured production round trips are 130-450 ms; the T54 budget is
// 8 reads a second per participant (TokenBucket(8, 8) in backend/server/app.py).
export const RECOVERY_POLL_MS = 1000;
export const RECOVERY_POLL_MIN_MS = 400;
export const RECOVERY_POLL_LEAD_MS = 300;
export const RECOVERY_POLL_MARGIN_MS = 200;
const MAX_TICK = 18_000;

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isCoordinate = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 500;
const isWireId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);
const successData = answer => answer?.ok === true && isObject(answer.data) ? answer.data
  : answer?.ok === undefined && answer?.status === undefined && !answer?.error && isObject(answer) ? answer : null;

// One refusal policy for every recovery call (journal reads, inputs, health checkpoints, the finish):
// 'later'    no answer, a 5xx or 429 (or the wave is not over yet): the same request again after
//            Retry-After or a growing pause;
// 'refresh'  the server knows more than this client: read the journal again, then a new request;
// 'terminal' this request can never succeed: drop it (queued inputs) or end the wave on this screen.
const REFRESH_CODES = new Set(['health_sync_required', 'checkpoint_stale', 'page_incomplete', 'page_watermark_invalid',
  'input_counter_conflict']);
const LATER_CODES = new Set(['too_many_requests', 'wave_too_early', 'network_error', 'database_error', 'unreadable']);
/** The refusal of a failed answer: {refused: true, status, code, retryAfterSeconds}. */
export function recoveryRefusal(answer) {
  const nested = answer?.data?.error ?? answer?.error ?? null;
  const status = Number.isInteger(answer?.status) ? answer.status : 0;
  const code = (typeof answer?.code === 'string' && answer.code) || (typeof nested?.code === 'string' && nested.code)
    || (status === 0 ? 'network_error' : 'http_error');
  const wait = answer?.retryAfterSeconds ?? answer?.data?.retryAfterSeconds;
  return { refused: true, status, code, retryAfterSeconds: Number.isFinite(wait) && wait > 0 ? wait : null };
}
/** 'later', 'refresh' or 'terminal' for a refusal (see above). */
export function refusalKind(refusal) {
  const status = refusal?.status ?? 0, code = refusal?.code ?? '';
  if (status === 0 || status >= 500 || status === 429 || LATER_CODES.has(code)) return 'later';
  return REFRESH_CODES.has(code) ? 'refresh' : 'terminal';
}
/** How long to wait before the next try: Retry-After when given, else 0.25 s doubling up to 8 s. */
export function refusalDelayMs(refusal, attempt = 0) {
  if (Number.isFinite(refusal?.retryAfterSeconds) && refusal.retryAfterSeconds > 0) return refusal.retryAfterSeconds * 1000;
  return Math.min(8000, 250 * 2 ** Math.max(0, Math.min(5, attempt)));
}
// Success data, or the refusal of a failed or thrown request (a local argument error stays null: never sent).
const dataOrRefusal = answer => successData(answer) ?? recoveryRefusal(answer);
const thrownRefusal = () => recoveryRefusal(null);

// The tick the shooter saw (fix/playtest-1117): the sim checks a blow's reach and a shot's range there.
const seenOf = input => (Number.isInteger(input.seen) && input.seen >= 0 && input.seen <= MAX_TICK ? { seen: input.seen } : {});
/** Reduce a local simulation action to an intent; the server adds actor identity and Captain stats. */
export function commandForJournal(input) {
  if (!isObject(input) || typeof input.type !== 'string') return null;
  const { type } = input;
  if (type === 'repair' || type === 'rebuild') return null;
  if(type==='captain_revive_hold_cancel')return {type};
  if(type==='captain_revive_hold_start' && isParticipantToken(input.targetId) && isParticipantToken(input.fallId))return {type,targetId:input.targetId,fallId:input.fallId};
  if (type === 'fire' && isWireId(input.cannonId) && isWireId(input.targetId)) {
    return { type, cannonId: input.cannonId, targetId: input.targetId };
  }
  if (type === 'captain_shot' && (input.targetId == null || isWireId(input.targetId)) && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, targetId: input.targetId ?? null, x: input.x, z: input.z,
      ...(isCoordinate(input.ax) && isCoordinate(input.az) ? { ax: input.ax, az: input.az } : {}), ...seenOf(input) };
  }
  if (type === 'captain_strike' && isWireId(input.targetId) && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, targetId: input.targetId, x: input.x, z: input.z, ...seenOf(input) };
  }
  if (type === 'captain_move' && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, x: input.x, z: input.z,
      ...(Number.isInteger(input.colour) && input.colour >= 0 && input.colour <= 9 ? { colour: input.colour } : {}),
      ...(input.away === true ? { away: true } : {}) };
  }
  if (type === 'captain_revive' && isParticipantToken(input.targetId) && isCoordinate(input.x) && isCoordinate(input.z)) {
    if (input.downAt !== undefined && (!Number.isInteger(input.downAt) || input.downAt < 0 || input.downAt > MAX_TICK)) return null;
    return { type, targetId: input.targetId, x: input.x, z: input.z,
      ...(input.downAt !== undefined ? { downAt: input.downAt } : {}) };
  }
  if (type === 'finisher_ready' && isWireId(input.shipId)) return { type, shipId: input.shipId };
  if (type === 'finisher_input' && Number.isInteger(input.from) && Array.isArray(input.marks)
    && input.from >= 0 && input.from <= 3000 && input.marks.length > 0 && input.marks.length <= 24
    && input.marks.every(mark => Number.isInteger(mark) && mark >= -1 && mark <= 100)) {
    return { type, from: input.from, marks: [...input.marks], ...(input.easy === true ? { easy: true } : {}) };
  }
  return null;
}

/** Turn one fixed-head journal entry into the existing sim input without using private account ids. */
export function simulationInputFromJournal(event) {
  if (!isObject(event) || !Number.isInteger(event.serverSeq) || event.serverSeq < 1
    || !Number.isInteger(event.effectiveTick) || event.effectiveTick < 0 || event.effectiveTick > MAX_TICK
    || !isObject(event.payload)) return null;
  if (event.type === 'structure_repaired') return { type: 'structure_repaired', event };
  if(event.type==='captain_withdrawn'){
    const token=event.participantToken,payload=event.payload;
    return isParticipantToken(token) && payload.participantToken===token && Object.keys(payload).length===2
      && ['leave','disconnect_expired','membership_lost','account_deleted','reset'].includes(payload.reason)
      ? {type:'captain_withdrawn',by:token}:null;
  }
  if (event.type === 'participant_joined') return null;
  const command = event.payload.command;
  const token = event.participantToken;
  if (!isObject(command) || typeof command.type !== 'string' || !isParticipantToken(token)
    || (event.payload.participantToken !== undefined && event.payload.participantToken !== token)
    || (event.type !== 'captain_input' && event.type !== command.type)) return null;
  if (event.type === 'captain_input' && (!isParticipantToken(event.payload.participantToken)
    || typeof event.payload.inputUid !== 'string' || !event.payload.inputUid
    || !Number.isSafeInteger(event.payload.actorCounter) || event.payload.actorCounter < 1)) return null;
  const normalized = commandForJournal(command);
  if (!normalized) return null;
  const input = { ...normalized, by: token };
  if (['captain_shot', 'captain_strike', 'captain_revive'].includes(command.type)) {
    const captain = event.payload.captain;
    if (!isObject(captain) || !Number.isInteger(captain.level) || captain.level < 1 || captain.level > 5
      || !Array.isArray(captain.skills) || typeof captain.weapon !== 'string') return null;
    input.level = captain.level;
    input.skills = readSkills(captain.skills);
    if (command.type === 'captain_shot') input.weapon = readWeapon(captain.weapon);
  }
  return input;
}

/** Build a thin adapter over the app's signed-in transport; it never creates its own auth client. */
export function createRecoveryTransport({ get, post } = {}) {
  if (typeof get !== 'function' || typeof post !== 'function') return null;
  return {
    readEvents({ waveId, after = 0, through, sealedThroughTick } = {}) {
      if (typeof waveId !== 'string' || !Number.isInteger(after) || after < 0) return Promise.resolve(null);
      const hasHead = through !== undefined, hasSeal = sealedThroughTick !== undefined;
      const fixedHead = Number.isInteger(through) && through >= 0;
      const fixedSeal = Number.isInteger(sealedThroughTick) && sealedThroughTick >= -1;
      if (hasHead !== hasSeal || hasHead && (!fixedHead || !fixedSeal)) return Promise.resolve(null);
      const query = new URLSearchParams({ after: String(after) });
      if (fixedHead) {
        query.set('through', String(through));
        query.set('sealedThroughTick', String(sealedThroughTick));
      }
      return Promise.resolve(get(`/api/waves/${encodeURIComponent(waveId)}/events?${query}`))
        .then(dataOrRefusal, thrownRefusal);
    },
    sendInputs({ waveId, inputs } = {}) {
      if (typeof waveId !== 'string' || !validBatch(inputs)) return Promise.resolve(null);
      const body = { waveProtocol: 2, inputs };
      if (byteLength(JSON.stringify(body)) > MAX_INPUT_BATCH_BYTES) return Promise.resolve(null);
      return Promise.resolve(post(`/api/waves/${encodeURIComponent(waveId)}/inputs`, body))
        .then(dataOrRefusal, thrownRefusal);
    },
    checkpoint({ waveId, checkpoint } = {}) {
      if (typeof waveId !== 'string' || !waveId || !validCheckpoint(checkpoint)) return Promise.resolve(null);
      const body = { waveProtocol: 2, ...checkpoint };
      return Promise.resolve(post(`/api/waves/${encodeURIComponent(waveId)}/health`, body))
        .then(dataOrRefusal, thrownRefusal);
    },
    finishWave(body) {
      if (!validRecoveryFinishBody(body)) return Promise.resolve(null);
      return Promise.resolve(post('/api/waves/finish', body)).then(answer => {
        if (answer?.ok === true || answer?.ok === false) return answer;
        if (isObject(answer?.error)) return { ok: false, status: answer.status ?? 0, code: answer.error.code, error: answer.error };
        return isObject(answer) ? { ok: true, data: answer } : null;
      }).catch(() => null);
    },
  };
}

function validRecoveryFinishBody(body) {
  const checkpoint = body?.checkpoint;
  if (!isObject(body) || body.waveProtocol !== 2 || typeof body.waveId !== 'string' || !body.waveId
    || !validCheckpoint(checkpoint)) return false;
  return true;
}

export function validCheckpoint(checkpoint) {
  if (!isObject(checkpoint) || typeof checkpoint.islandEpoch !== 'string' || !checkpoint.islandEpoch
    || typeof checkpoint.checkpointUid !== 'string' || checkpoint.checkpointUid.length < 8
    || !Number.isInteger(checkpoint.throughTick) || checkpoint.throughTick < 0 || checkpoint.throughTick > MAX_TICK
    || !Number.isSafeInteger(checkpoint.inputHeadSeq) || checkpoint.inputHeadSeq < 0
    || !Number.isSafeInteger(checkpoint.lastRepairSeq) || checkpoint.lastRepairSeq < 0
    || !isObject(checkpoint.basisRepairSeq) || !isObject(checkpoint.hpUnits)) return false;
  const ids = Object.keys(checkpoint.hpUnits);
  return ids.length === Object.keys(checkpoint.basisRepairSeq).length
    && ids.every(id => Object.hasOwn(checkpoint.basisRepairSeq, id)
      && Number.isInteger(checkpoint.hpUnits[id]) && checkpoint.hpUnits[id] >= 0 && checkpoint.hpUnits[id] <= 1_000_000
      && Number.isSafeInteger(checkpoint.basisRepairSeq[id]) && checkpoint.basisRepairSeq[id] >= 0);
}

function validBatch(inputs) {
  return Array.isArray(inputs) && inputs.length > 0 && inputs.length <= MAX_INPUT_BATCH
    && inputs.every(input => isObject(input) && typeof input.inputUid === 'string' && input.inputUid.length > 0 && input.inputUid.length <= 64
      && Number.isSafeInteger(input.actorCounter) && input.actorCounter > 0 && Number.isInteger(input.tick) && input.tick >= 0 && input.tick <= MAX_TICK
      && isObject(input.command) && commandForJournal(input.command) !== null);
}

function byteLength(value) {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : value.length;
}
