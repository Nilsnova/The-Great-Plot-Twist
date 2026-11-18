// Dedicated shared Harbor transport. Failed shared requests never select personal endpoints.
import {api as defaultApi, ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {makeActionUid} from '../screens/market/uid.js';
import {coinInteger, isUuid, originMatches, validEconomy} from './shared-stakes.js';

const HEADERS = ECONOMY_CAPABILITY_HEADERS;
const failure = (code, message, unknown = false) => ({ok: false, code, message, unknown});
const scopeChanged = () => failure('economy_scope_changed', 'The island or sign-in changed. Refresh this stall.');
const storage = () => { try { return globalThis.sessionStorage; } catch { return null; } };
const uidOkay = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(uid) && !/^(fx_|sys_)/.test(uid);

export function createSharedWagersHttp({api = defaultApi, getEconomy, getActorId,
  product, pendingStore = storage(), makeUid = makeActionUid} = {}) {
  if (!['market_call', 'football'].includes(product)) throw new TypeError('Unsupported shared wager product.');
  const memory = new Map();
  function scope() {
    const economy = getEconomy?.(), actorId = getActorId?.();
    if (!validEconomy(economy) || !isUuid(actorId)) return null;
    return {economy: structuredClone(economy), actorId,
      key: `shared-wager:${actorId}:${economy.accountId}:${economy.runEpoch}:${product}`};
  }
  const current = saved => saved && scope()?.key === saved.key;
  function pending(saved) {
    if (!saved) return null;
    try {
      const record = memory.get(saved.key) ?? JSON.parse(pendingStore?.getItem(saved.key) ?? 'null');
      if (!record) return null;
      const body = record.body;
      if (record.key !== saved.key || record.actorId !== saved.actorId || !uidOkay(body?.actionUid)
        || body.economy?.islandOwner !== saved.economy.islandOwner
        || body.economy?.runEpoch !== saved.economy.runEpoch || coinInteger(body.stake) <= 0n) return null;
      return record;
    } catch { return null; }
  }
  function save(saved, record) {
    if (record) memory.set(saved.key, record); else memory.delete(saved.key);
    try { if (record) pendingStore?.setItem(saved.key, JSON.stringify(record)); else pendingStore?.removeItem(saved.key); } catch { /* Memory keeps this page's retry identity. */ }
  }
  function receiptMatches(value, saved, body) {
    const receipt = value?.receipt, wager = receipt?.result?.wager;
    return receipt?.action === 'island_bet' && receipt.actionUid === body.actionUid
      && receipt.actorId === saved.actorId && originMatches(receipt.origin, saved.economy)
      && wager?.product === product && wager.stake === body.stake
      && wager.eventId === (body.asset ?? body.fixtureId) && wager.selection === (body.direction ?? body.pick)
      && (value.currentEconomy === null || (validEconomy(value.currentEconomy)
        && originMatches(value.currentEconomy, saved.economy)));
  }
  async function read(cursor = null) {
    const saved = scope();
    if (!saved) return scopeChanged();
    const query = new URLSearchParams({islandOwner: saved.economy.islandOwner,
      runEpoch: saved.economy.runEpoch, product});
    if (cursor) query.set('cursor', cursor);
    let reply;
    try { reply = await api.get(`/api/island/wagers?${query}`, {headers: HEADERS}); }
    catch { return failure('network_error', 'The Harbor did not answer. Try again.'); }
    if (!current(saved)) return scopeChanged();
    if (!reply?.ok) return reply ?? failure('bad_response', 'The Harbor answer could not be read.');
    const data = reply.data;
    if (!validEconomy(data?.economy) || !originMatches(data.economy, saved.economy)
      || !Array.isArray(data.items) || !Array.isArray(data.choices)
      || data.product !== product || (data.nextCursor !== null && !isUuid(data.nextCursor))) {
      return failure('bad_response', 'The shared Harbor answer did not match this island.');
    }
    const latest = getEconomy?.();
    if (validEconomy(latest) && coinInteger(data.economy.revision) < coinInteger(latest.revision)) {
      return failure('stale_response', 'The island treasury changed. Refresh this stall.');
    }
    return reply;
  }
  async function send(saved, record) {
    let reply;
    try { reply = await api.post(`/api/island/wagers/${product === 'market_call' ? 'market' : 'football'}`,
      record.body, {headers: HEADERS}); }
    catch { reply = failure('outcome_unknown', 'The server did not answer. Retry the same stake.', true); }
    if (!reply || typeof reply.ok !== 'boolean') reply = failure('outcome_unknown', 'The server answer could not be read. Retry the same stake.', true);
    if (reply?.ok && !receiptMatches(reply.data, saved, record.body)) {
      reply = failure('outcome_unknown', 'The receipt did not match. Retry the same stake.', true);
    }
    const unknown = reply?.unknown === true || reply?.status === 0 || reply?.status >= 500;
    if (reply?.ok || (!unknown && reply?.status !== 429 && reply?.code !== 'idempotency_conflict')) save(saved, null);
    if (!current(saved)) return scopeChanged();
    return {...reply, unknown};
  }
  async function place({eventId, selection, stake} = {}) {
    const saved = scope();
    if (!saved) return scopeChanged();
    if (pending(saved)) return failure('pending_wager', 'Resolve the pending stake before placing another.');
    if (coinInteger(stake) < 1n || !eventId || !selection) return failure('invalid_stake', 'Enter a positive whole-coin stake.');
    const economy = {mode: 'island_shared', version: 1,
      islandOwner: saved.economy.islandOwner, runEpoch: saved.economy.runEpoch};
    const body = {economy, actionUid: makeUid(), stake,
      ...(product === 'market_call' ? {asset: eventId, direction: selection} : {fixtureId: eventId, pick: selection})};
    const record = {key: saved.key, actorId: saved.actorId, body};
    save(saved, record);
    return send(saved, record);
  }
  return {read, place, retry() {
    const saved = scope(), record = pending(saved);
    return record ? send(saved, record) : Promise.resolve(failure('no_pending_wager', 'There is no pending stake.'));
  }, get pending() { return pending(scope()); }, scopeKey: () => scope()?.key ?? null};
}
