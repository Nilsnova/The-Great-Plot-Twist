// Strict shared repair response validation; financial facts never become current wallet money.
import {isRepairEconomy, sameRepairOrigin} from './shared-combat-funds.js';

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const kinds = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);

export function isSharedRecoveryState(data) {
  return object(data) && typeof data.serverNow === 'string' && Number.isFinite(Date.parse(data.serverNow))
    && uuid(data.islandEpoch) && count(data.revision) && data.recoveryVersion === 1 && data.waveProtocol === 2
    && ['between_waves', 'preparing', 'combat'].includes(data.displayPhase)
    && ['between_waves', 'reserved_wave'].includes(data.repairWindow)
    && (data.repairWindow === 'reserved_wave' ? uuid(data.waveId) : data.waveId === null)
    && (data.remainingPaidUses === null || count(data.remainingPaidUses) && data.remainingPaidUses <= 3)
    && Array.isArray(data.structures) && data.structures.every(row => object(row)
      && typeof row.spot === 'string' && uuid(row.instanceId) && kinds.has(row.kind)
      && count(row.level) && row.level >= 1 && row.level <= 5 && count(row.hpUnits) && row.hpUnits <= 1_000_000
      && Number.isFinite(row.maxHP) && row.maxHP > 0 && count(row.repairSeq)
      && Number.isFinite(row.rateUnitsPerSecond) && row.rateUnitsPerSecond >= 0
      && (row.estimatedFreeSeconds === null || count(row.estimatedFreeSeconds)) && count(row.fixedPrice));
}

export function isSharedRepairReply(data, body, actor, origin) {
  const receipt = data?.receipt, result = receipt?.result, paid = result?.financialReceipt;
  if (!object(data) || typeof data.repeat !== 'boolean' || Object.hasOwn(data, 'coins')
      || !object(receipt) || !uuid(receipt.receiptId) || receipt.actionUid !== body.actionUid
      || receipt.actorId !== actor || receipt.action !== 'structure_repair'
      || !sameRepairOrigin(receipt.origin, origin) || !object(result) || !object(paid)
      || result.spot !== body.spot || result.instanceId !== body.instanceId
      || result.recoveryEpoch !== body.expectedEpoch || result.level !== body.expectedLevel
      || result.chargedPrice !== String(body.quotedPrice) || !kinds.has(result.kind)
      || !uuid(result.waveId) || !count(result.useOrdinal) || result.useOrdinal < 1 || result.useOrdinal > 3
      || !count(result.eventSeq) || result.eventSeq < 1 || !count(result.repairSeq) || result.repairSeq < 1) return false;
  if (!data.repeat && (result.waveId !== body.expectedWaveId || result.repairSeq !== body.expectedRepairSeq + 1)) return false;
  const id = receipt.receiptId.toLowerCase();
  if (!uuid(paid.id) || paid.actorId !== actor || paid.accountId !== origin.accountId || paid.runEpoch !== origin.runEpoch
      || paid.actionUid !== `fx_${id.replaceAll('-', '')}_repair` || paid.reference !== `repair:${id}`
      || paid.kind !== 'spend' || paid.reason !== 'structure_repair' || paid.balanceDelta !== `-${body.quotedPrice}`
      || paid.committedDelta !== '0' || paid.sourceReservationId !== null
      || !['balanceAtCommit', 'committedAtCommit', 'revisionAtCommit'].every(key => decimal(paid[key]))
      || BigInt(paid.balanceAtCommit) < BigInt(paid.committedAtCommit) || BigInt(paid.revisionAtCommit) < 1n) return false;
  if (data.repeat && (data.economy != null || data.currentState != null)) return false;
  return (data.economy == null || isRepairEconomy(data.economy) && sameRepairOrigin(data.economy, origin)
      && BigInt(data.economy.revision) >= BigInt(paid.revisionAtCommit))
    && (data.currentState == null || isSharedRecoveryState(data.currentState));
}

export const isSharedRepairQuote = value => object(value) && typeof value.spot === 'string'
  && /^[a-z][a-z0-9_]{1,39}$/.test(value.spot) && uuid(value.instanceId) && uuid(value.expectedEpoch)
  && value.expectedWindow === 'reserved_wave' && uuid(value.expectedWaveId)
  && count(value.expectedLevel) && value.expectedLevel >= 1 && value.expectedLevel <= 5
  && count(value.expectedRepairSeq) && count(value.quotedPrice) && value.quotedPrice > 0
  && value.waveProtocol === 2;

export const isSharedActor = uuid;
export const isRootAction = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
  && !value.startsWith('fx_') && !value.startsWith('sys_');
