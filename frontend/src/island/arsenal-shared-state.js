// Strict shared arsenal wire values. Used by its API and cards; these checks grant no authority.
import {WEAPON_BY_ID} from '../pirates/captain-ids.js';

export const isDecimalCoin = value => typeof value === 'string' && value.trim() === value && /^(0|[1-9][0-9]*)$/.test(value);
export const isArsenalId = value => typeof value === 'string' && value.trim() === value && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
export const sameArsenalOrigin = (a, b) => !!a && !!b && ['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'].every(key => a[key] === b[key]);
export const arsenalOrigin = value => value ? Object.fromEntries(['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'].map(key => [key, value[key]])) : null;
export const isArsenalOrigin = value => !!value && value.mode === 'island_shared' && value.version === 1
  && ['islandOwner', 'accountId', 'runEpoch'].every(key => isArsenalId(value[key]));

export function isArsenalEconomy(value) {
  if (!isArsenalOrigin(value) || !isDecimalCoin(value.revision)) return false;
  const money = value.treasury;
  return !!money && ['balanceCoins', 'committedCoins', 'availableCoins'].every(key => isDecimalCoin(money[key]))
    && BigInt(money.balanceCoins) - BigInt(money.committedCoins) === BigInt(money.availableCoins);
}

function copy(item) {
  return !!item && isArsenalId(item.id) && count(item.no) && item.no > 0 && !!WEAPON_BY_ID[item.weapon]
    && (item.holder === null || isArsenalId(item.holder)) && typeof item.you === 'boolean'
    && typeof item.away === 'boolean' && (item.holderName === null || typeof item.holderName === 'string')
    && isDecimalCoin(item.holderGeneration) && (item.pendingReturnWaveId === null || isArsenalId(item.pendingReturnWaveId))
    && (item.disconnectedUntil === null || (typeof item.disconnectedUntil === 'string' && Number.isFinite(Date.parse(item.disconnectedUntil))));
}

export function readSharedArsenal(value) {
  if (!value || value.arsenalVersion !== 1 || !isArsenalEconomy(value.economy) || !isDecimalCoin(value.arsenalRevision)
    || typeof value.code !== 'string' || value.capacity !== 20 || !count(value.total) || !count(value.stored)
    || typeof value.waveRunning !== 'boolean' || !count(value.unlockWave) || !Array.isArray(value.copies)
    || !value.copies.every(copy) || value.total !== value.copies.length
    || value.stored !== value.copies.filter(item => item.holder === null).length
    || new Set(value.copies.map(item => item.id)).size !== value.total) return false;
  const mine = value.copies.filter(item => item.you);
  if (mine.length > 1 || mine.some(item => item.holder === null || item.pendingReturnWaveId !== null)
    || value.mine !== (mine[0]?.id ?? null) || value.carried !== (mine[0]?.weapon ?? 'musket')) return false;
  return Array.isArray(value.types) && value.types.every(item => !!item && !!WEAPON_BY_ID[item.id]
    && isDecimalCoin(item.priceCoins) && count(item.unlockWave) && typeof item.unlocked === 'boolean');
}

export function readArsenalReceipt(value, actor, origin, uid) {
  const receipt = value?.receipt, effect = receipt?.result;
  if (value?.status !== 'done' || typeof value.repeat !== 'boolean' || !isArsenalId(value.operationId)
    || !receipt || receipt.receiptId !== value.operationId || receipt.actionUid !== uid || receipt.actorId !== actor
    || !['arsenal_buy', 'arsenal_withdraw', 'arsenal_return'].includes(receipt.action)
    || !sameArsenalOrigin(receipt.origin, origin) || !effect || !isArsenalId(effect.copyId)
    || !WEAPON_BY_ID[effect.weapon] || !isDecimalCoin(effect.holderGeneration) || !isDecimalCoin(effect.priceCoins)) return false;
  if (receipt.action === 'arsenal_buy' ? (!isArsenalId(effect.financialReceiptId) || effect.priceCoins === '0')
    : (effect.financialReceiptId !== null || effect.priceCoins !== '0')) return false;
  if (value.repeat && value.currentEconomy !== null) return false;
  if (!value.repeat && !isArsenalEconomy(value.currentEconomy)) return false;
  if (value.currentEconomy !== null && (!isArsenalEconomy(value.currentEconomy) || !sameArsenalOrigin(value.currentEconomy, origin))) return false;
  return value.arsenal === null || (readSharedArsenal(value.arsenal) && sameArsenalOrigin(value.arsenal.economy, origin));
}
