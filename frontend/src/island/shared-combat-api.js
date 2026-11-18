// Shared repair transport and receipt projection. Legacy dispatch belongs to the caller's explicit mode.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {displayIslandCode} from './codes.js';
import {isRepairEconomy, sameRepairOrigin} from './shared-combat-funds.js';
import {isSharedActor, isSharedRepairQuote, isSharedRepairReply, isSharedRecoveryState} from './shared-combat-receipts.js';
import {repairIntentKey, savedRepairIntent} from './shared-combat-intents.js';

const options = () => ({headers: ECONOMY_CAPABILITY_HEADERS});
const failure = (status, code, message) => ({ok: false, status, code, message});
const safeStore = () => {try {return globalThis.sessionStorage ?? null;} catch {return null;}};
const unknown = answer => !answer.status || answer.status >= 500 || answer.status === 429;
const clone = value => JSON.parse(JSON.stringify(value));
const frozenOrigin = value => Object.fromEntries(['mode', 'version', 'islandOwner', 'accountId', 'runEpoch']
  .map(key => [key, value[key]]));

async function request(send) {
  let answer;
  try {answer = await send();} catch {return failure(0, 'network_error', 'The request did not finish. Try again.');}
  if (answer?.ok) return answer;
  const error = answer?.data?.error ?? answer?.error;
  return {...answer, ok: false, status: Number.isInteger(answer?.status) ? answer.status : 0,
    code: answer?.code ?? error?.code ?? 'request_failed', message: answer?.message ?? error?.message ?? 'Try again.'};
}

/** The callbacks share existing authenticated transport and canonical account state. */
export function createSharedCombatApi({transport, getEconomy, onEconomy = () => {}, getActorId,
  makeUid = makeActionUid, pendingStore = safeStore()} = {}) {
  if (!transport || typeof transport.get !== 'function' || typeof transport.post !== 'function'
      || typeof getEconomy !== 'function' || typeof getActorId !== 'function') {
    throw new TypeError('Shared combat needs authenticated transport and current context callbacks.');
  }
  const current = () => {try {return getEconomy();} catch {return null;}};
  const actorNow = () => {try {return getActorId();} catch {return null;}};
  const update = (value, origin) => {
    const selected = current();
    if (isRepairEconomy(value) && isRepairEconomy(selected) && sameRepairOrigin(value, origin)
        && sameRepairOrigin(selected, origin) && BigInt(value.revision) >= BigInt(selected.revision)) {
      try {onEconomy(value, origin);} catch { /* The committed receipt remains successful. */ }
      return true;
    }
    return false;
  };
  return {
    async structureRecovery({code = null} = {}) {
      const selected = current(), actor = actorNow(), where = code === null ? '' : displayIslandCode(code);
      if (!isRepairEconomy(selected) || !isSharedActor(actor)) return failure(409, 'economy_context_required', 'Read the island first.');
      const origin = frozenOrigin(selected);
      if (code !== null && !where) return failure(422, 'validation_error', 'Use a valid island code.');
      const answer = await request(() => transport.get(`/api/island/structures${where ? `?code=${encodeURIComponent(where)}` : ''}`, options()));
      if (!answer.ok) return answer;
      if (!isSharedRecoveryState(answer.data) || !isRepairEconomy(answer.data.economy)
          || !sameRepairOrigin(answer.data.economy, origin)) return failure(502, 'unreadable', 'The building state could not be read.');
      if (!sameRepairOrigin(current(), origin) || actorNow() !== actor) return failure(409, 'economy_epoch_mismatch', 'The selected island changed.');
      update(answer.data.economy, origin);
      return answer;
    },
    async repairStructure({quote} = {}) {
      const selected = current(), actor = actorNow();
      if (!isRepairEconomy(selected) || !isSharedActor(actor)) return failure(409, 'economy_context_required', 'Read the island first.');
      if (!isSharedRepairQuote(quote)) return failure(422, 'validation_error', 'Refresh this repair offer.');
      const origin = frozenOrigin(selected);
      const key = repairIntentKey(actor, origin, quote.instanceId);
      let body;
      try {
        body = savedRepairIntent(pendingStore, key, actor, origin, quote.instanceId, () => ({
          spot: quote.spot, instanceId: quote.instanceId, actionUid: makeUid(), expectedEpoch: quote.expectedEpoch,
          expectedWindow: quote.expectedWindow, expectedWaveId: quote.expectedWaveId, expectedLevel: quote.expectedLevel,
          expectedRepairSeq: quote.expectedRepairSeq, quotedPrice: quote.quotedPrice, waveProtocol: 2,
          economy: {mode: origin.mode, version: origin.version, islandOwner: origin.islandOwner, runEpoch: origin.runEpoch},
        }));
      } catch {return failure(503, 'repair_retry_unavailable', 'Could not save this repair request. Try again.');}
      let answer = await request(() => transport.post('/api/island/structures/repair', clone(body), options()));
      if (answer.ok && !isSharedRepairReply(answer.data, body, actor, origin)) {
        answer = failure(502, 'unreadable', 'The repair receipt could not be verified.');
      }
      if (answer.ok || !unknown(answer)) {try {pendingStore.removeItem(key);} catch { /* A retained UID safely replays. */ }}
      if (!answer.ok) return answer;
      const data = {...answer.data};
      if (!sameRepairOrigin(current(), origin) || actorNow() !== actor) {
        delete data.economy; delete data.currentState;
      } else if (data.economy && !update(data.economy, origin)) delete data.economy;
      return {...answer, data};
    },
  };
}
