// Builds exact-health and repair feedback from the server-owned recovery response.
// Used by structure cards and the island recovery health-bar presentation.

const FULL_HP_UNITS = 1_000_000;
const SUPPORTED_KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const ERROR_LABELS = {
  insufficient_funds: 'Not enough coins for this repair.',
  repair_limit_reached: 'The shared Repair now limit is used up for this wave.',
  intact: 'This building is already at full health.',
  stale_recovery_quote: 'The repair details changed. Refresh the building and try again.',
  action_uid_conflict: 'This repair request no longer matches its original action.',
  health_sync_required: 'Battle damage is still being checked. Refresh and try again.',
  client_update_required: 'Update the game before using Repair now.',
};

function isValidHp(structure) {
  return Number.isInteger(structure?.hpUnits)
    && structure.hpUnits >= 0
    && structure.hpUnits <= FULL_HP_UNITS
    && Number.isFinite(structure.maxHP)
    && structure.maxHP > 0;
}

function formatHp(value) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

function getStructureHealthBarModel(hpUnits, maxHP) {
  if (!Number.isInteger(hpUnits) || hpUnits < 0 || hpUnits > FULL_HP_UNITS
      || !Number.isFinite(maxHP) || maxHP <= 0) {
    return { visible: false, fill: 0, minimumVisibleWidthPx: 0, border: 'dark', color: null, destroyed: false, marker: null };
  }

  const fill = hpUnits / FULL_HP_UNITS;
  if (hpUnits === FULL_HP_UNITS) {
    return { visible: false, fill, minimumVisibleWidthPx: 0, border: 'dark', color: null, destroyed: false, marker: null };
  }

  return {
    visible: true,
    fill,
    // The renderer uses the actual bar width to make positive HP at least one pixel wide.
    minimumVisibleWidthPx: hpUnits > 0 ? 1 : 0,
    border: 'dark',
    color: fill > 0.5 ? 'green' : fill > 0.25 ? 'gold' : 'red',
    destroyed: hpUnits === 0,
    marker: hpUnits === 0 ? '!' : null,
  };
}

function buildStructureRecoveryView(state, structure, options = {}) {
  const status = options.status ?? 'ready';
  if (status === 'loading') return { visible: false, status: 'loading', message: 'Loading building health…' };
  if (status === 'error') return { visible: false, status: 'error', message: 'Building health could not be loaded.' };
  if (!state || !SUPPORTED_KINDS.has(structure?.kind) || !isValidHp(structure)) {
    return { visible: false, status: 'unavailable' };
  }

  const hpFraction = structure.hpUnits / FULL_HP_UNITS;
  const actualHp = structure.maxHP * hpFraction;
  const damaged = structure.hpUnits < FULL_HP_UNITS;
  if (!damaged) {
    return {
      visible: false,
      status: 'ready',
      actualHp,
      maxHP: structure.maxHP,
      repairLabel: null,
      freeRepairLabel: null,
      healthBar: getStructureHealthBarModel(structure.hpUnits, structure.maxHP),
    };
  }

  const reserved = state.repairWindow === 'reserved_wave';
  // The owner's rule (fix/playtest-1117): the server makes every structure whole when a wave ends, so a damaged
  // card between waves only shows for an island whose last wave closed before that rule (its next close fixes it).
  const fixedPrice = Number.isSafeInteger(structure.fixedPrice) && structure.fixedPrice > 0
    ? structure.fixedPrice
    : null;
  const canQuote = fixedPrice !== null;
  const remainingUses = Number.isInteger(state.remainingPaidUses)
    && state.remainingPaidUses >= 0 && state.remainingPaidUses <= 3
    ? state.remainingPaidUses
    : null;
  const errorMessage = ERROR_LABELS[options.errorCode] ?? null;
  const actionPending = options.status === 'submitting';
  const coinsKnown = Number.isSafeInteger(options.coins) && options.coins >= 0;
  const canAfford = coinsKnown && fixedPrice !== null && options.coins >= fixedPrice;
  const fundsReason = !coinsKnown ? 'Coins are still loading.'
    : fixedPrice !== null && !canAfford ? `Need ${fixedPrice - options.coins} more coins.` : null;
  return {
    visible: true,
    status: options.status === 'submitting' ? 'submitting' : 'ready',
    spot: structure.spot,
    instanceId: structure.instanceId,
    kind: structure.kind,
    level: structure.level,
    hpUnits: structure.hpUnits,
    actualHp,
    maxHP: structure.maxHP,
    hpLabel: `${formatHp(actualHp)} / ${formatHp(structure.maxHP)} HP`,
    healthBar: getStructureHealthBarModel(structure.hpUnits, structure.maxHP),
    repairLabel: canQuote ? `Repair now: pay ${fixedPrice} coins` : null,
    repairReasonLabel: fundsReason,
    quotedPrice: fixedPrice,
    helperLabel: reserved ? null : 'All buildings are fully repaired when a wave ends.',
    statusLabel: reserved ? 'No free repair during this wave. Full HP is restored when it ends.' : null,
    remainingPaidUses: remainingUses,
    remainingUsesLabel: reserved && remainingUses !== null
      ? `${remainingUses === 0 ? 'No' : remainingUses} shared Repair now use${remainingUses === 1 ? '' : 's'} left this wave`
      : null,
    errorMessage,
    actionPending,
    repairDisabled: !canQuote || actionPending || !canAfford || (reserved && remainingUses !== null && remainingUses === 0)
      || (reserved && remainingUses === null),
    repairIntent: canQuote ? {
      spot: structure.spot,
      instanceId: structure.instanceId,
      expectedEpoch: state.islandEpoch,
      expectedWindow: state.repairWindow,
      expectedWaveId: reserved ? state.waveId : undefined,
      expectedLevel: structure.level,
      expectedRepairSeq: structure.repairSeq,
      quotedPrice: fixedPrice,
      waveProtocol: state.waveProtocol,
    } : null,
  };
}

function isCurrentStructureRecoveryResponse(request, response) {
  if (!request || !response) return false;
  const comparedFields = ['islandEpoch', 'instanceId', 'waveId', 'repairWindow', 'displayPhase'];
  for (const field of comparedFields) {
    if (Object.prototype.hasOwnProperty.call(request, field) && request[field] !== response[field]) return false;
  }
  if (Number.isFinite(request.revision)
      && (!Number.isFinite(response.revision) || response.revision < request.revision)) return false;
  return true;
}

export {
  buildStructureRecoveryView,
  getStructureHealthBarModel,
  isCurrentStructureRecoveryResponse,
};
