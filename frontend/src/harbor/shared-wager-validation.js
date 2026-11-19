// Validate consumed server projections before any balance setter, renderer or pending-intent release.
import {coinInteger, isUuid, originMatches, validEconomy} from './shared-stakes.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 256) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const date = value => typeof value === 'string' && value.length <= 64 && /(Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) && Number.isFinite(Date.parse(value));
const assets = new Set(['harbor-trust', 'tidewright-works', 'greyfathom-salvage', 'apple', 'nvidia']);
const sides = product => product === 'market_call' ? ['up', 'down'] : ['home', 'draw', 'away'];
const event = (value, product) => product === 'market_call' ? assets.has(value) : typeof value === 'string' && /^fd-[1-9][0-9]{0,14}$/.test(value);
const amount = (value, positive = false) => {
  try { return coinInteger(value) >= (positive ? 1n : 0n); } catch { return false; }
};
function choice(value, product) {
  const allowed = sides(product);
  return object(value) && event(value.id, product) && text(value.name) && typeof value.open === 'boolean'
    && Array.isArray(value.options) && value.options.length === allowed.length
    && new Set(value.options.map(option => option?.id)).size === allowed.length
    && value.options.every(option => object(option) && allowed.includes(option.id) && text(option.label, 120));
}
function item(value, product) {
  if (!object(value) || !isUuid(value.id) || value.product !== product || !event(value.eventId, product)
    || !sides(product).includes(value.selection) || !amount(value.stake, true)
    || !date(value.openedAt) || !date(value.settleAt) || Date.parse(value.settleAt) <= Date.parse(value.openedAt)
    || !text(value.actorName, 120) || !['open', 'won', 'lost', 'refunded'].includes(value.status)
    || ![value.home, value.away].every(name => name === null || text(name, 120))
    || (value.eventName !== undefined && !text(value.eventName))) return false;
  if (value.status === 'open') return value.payout === null;
  if (!amount(value.payout)) return false;
  const expected = value.status === 'won' ? coinInteger(value.stake) * 2n : value.status === 'lost' ? 0n : coinInteger(value.stake);
  return coinInteger(value.payout) === expected;
}
export function validProjection(value, product, origin) {
  return object(value) && validEconomy(value.economy) && originMatches(value.economy, origin)
    && value.product === product && (value.nextCursor === null || isUuid(value.nextCursor))
    && Array.isArray(value.items) && value.items.length <= 50 && value.items.every(row => item(row, product))
    && new Set(value.items.map(row => row.id)).size === value.items.length
    && Array.isArray(value.choices) && value.choices.length <= (product === 'market_call' ? 5 : 100)
    && value.choices.every(row => choice(row, product))
    && new Set(value.choices.map(row => row.id)).size === value.choices.length;
}
export function validOpeningReceipt(value, saved, body, product) {
  try {
    const receipt = value?.receipt, result = receipt?.result, wager = result?.wager, financial = result?.financialReceipt;
    if (!object(value) || value.status !== 'done' || typeof value.repeat !== 'boolean'
      || !object(receipt) || !isUuid(receipt.receiptId) || receipt.action !== 'island_bet'
      || receipt.actionUid !== body.actionUid || receipt.actorId !== saved.actorId
      || !originMatches(receipt.origin, saved.economy) || !object(result) || result.settlement !== null
      || !object(wager) || !isUuid(wager.id) || receipt.receiptId !== wager.id
      || !isUuid(wager.operationId) || !isUuid(wager.sourceReservationId)
      || wager.actorId !== saved.actorId || wager.accountId !== saved.economy.accountId
      || wager.runEpoch !== saved.economy.runEpoch || wager.product !== product
      || wager.stake !== body.stake || !amount(wager.stake, true)
      || wager.eventId !== (body.asset ?? body.fixtureId) || wager.selection !== (body.direction ?? body.pick)
      || !date(wager.openedAt) || !date(wager.settleAt) || Date.parse(wager.settleAt) <= Date.parse(wager.openedAt)
      || !object(financial) || financial.id !== wager.sourceReservationId
      || financial.accountId !== wager.accountId || financial.runEpoch !== wager.runEpoch
      || financial.actorId !== wager.actorId || financial.kind !== 'reserve'
      || financial.actionUid !== `fx_${wager.operationId.replaceAll('-', '')}_stake`
      || financial.reason !== (product === 'market_call' ? 'market_call_stake' : 'prediction_stake')
      || financial.reference !== `wager:${wager.id}` || financial.balanceDelta !== '0'
      || financial.committedDelta !== wager.stake || financial.sourceReservationId !== null
      || !amount(financial.balanceAtCommit) || !amount(financial.committedAtCommit)
      || !amount(financial.revisionAtCommit, true)
      || coinInteger(financial.balanceAtCommit) < coinInteger(financial.committedAtCommit)) return false;
    if (value.currentEconomy === null) return true;
    return validEconomy(value.currentEconomy) && originMatches(value.currentEconomy, saved.economy)
      && coinInteger(value.currentEconomy.revision) >= coinInteger(financial.revisionAtCommit);
  } catch { return false; }
}
