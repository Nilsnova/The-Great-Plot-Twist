// Recovery-v1 journal input and event transport. Uses the island's authenticated get/post transport.

import { readSkills, readWeapon } from './captain-stats.js';
import { isParticipantToken } from './recovery-policy.js';

export const MAX_INPUT_BATCH = 32;
export const MAX_INPUT_BATCH_BYTES = 16 * 1024;
export const RECOVERY_FLUSH_MS = 250;
export const RECOVERY_POLL_MS = 250;
const MAX_TICK = 18_000;

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isCoordinate = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 500;
const successData = answer => answer?.ok === true && isObject(answer.data) ? answer.data
  : answer?.ok === undefined && answer?.status === undefined && !answer?.error && isObject(answer) ? answer : null;

/** Reduce a local simulation action to an intent; the server adds actor identity and Captain stats. */
export function commandForJournal(input) {
  if (!isObject(input) || typeof input.type !== 'string') return null;
  const { type } = input;
  if (type === 'repair' || type === 'rebuild') return null;
  if (type === 'fire' && typeof input.cannonId === 'string' && typeof input.targetId === 'string') {
    return { type, cannonId: input.cannonId, targetId: input.targetId };
  }
  if (type === 'lamps_lit') return { type };
  if (type === 'captain_shot' && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, targetId: typeof input.targetId === 'string' ? input.targetId : null, x: input.x, z: input.z,
      ...(isCoordinate(input.ax) && isCoordinate(input.az) ? { ax: input.ax, az: input.az } : {}) };
  }
  if (type === 'captain_strike' && typeof input.targetId === 'string' && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, targetId: input.targetId, x: input.x, z: input.z };
  }
  if (type === 'captain_move' && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, x: input.x, z: input.z,
      ...(Number.isInteger(input.colour) && input.colour >= 0 && input.colour <= 9 ? { colour: input.colour } : {}),
      ...(input.away === true ? { away: true } : {}) };
  }
  if (type === 'captain_revive' && typeof input.targetId === 'string' && isCoordinate(input.x) && isCoordinate(input.z)) {
    return { type, targetId: input.targetId, x: input.x, z: input.z };
  }
  if (type === 'finisher_ready' && typeof input.shipId === 'string') return { type, shipId: input.shipId };
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
  if (event.type === 'participant_joined') return null;
  const command = event.payload.command;
  const token = event.participantToken ?? event.payload.participantToken;
  if (!isObject(command) || typeof command.type !== 'string' || !isParticipantToken(token)
    || (event.participantToken && event.payload.participantToken && event.participantToken !== event.payload.participantToken)
    || (event.type !== 'captain_input' && event.type !== command.type)) return null;
  if (event.type === 'captain_input' && (typeof event.payload.inputUid !== 'string' || !event.payload.inputUid
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
    readEvents({ waveId, after = 0, through } = {}) {
      if (typeof waveId !== 'string' || !Number.isInteger(after) || after < 0) return Promise.resolve(null);
      const query = new URLSearchParams({ after: String(after) });
      if (Number.isInteger(through) && through >= 0) query.set('through', String(through));
      return Promise.resolve(get(`/api/waves/${encodeURIComponent(waveId)}/events?${query}`))
        .then(successData, () => null);
    },
    sendInputs({ waveId, inputs } = {}) {
      if (typeof waveId !== 'string' || !validBatch(inputs)) return Promise.resolve(null);
      const body = { waveProtocol: 2, inputs };
      if (byteLength(JSON.stringify(body)) > MAX_INPUT_BATCH_BYTES) return Promise.resolve(null);
      return Promise.resolve(post(`/api/waves/${encodeURIComponent(waveId)}/inputs`, body))
        .then(successData, () => null);
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
    || !isObject(checkpoint) || typeof checkpoint.islandEpoch !== 'string' || !checkpoint.islandEpoch
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
