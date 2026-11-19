// Exact repair affordability and payer copy for a shared treasury or an explicit legacy card.

const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const originFields = ['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'];

/** Validate the common account envelope before any exact money comparison. */
export function isRepairEconomy(value) {
  const money = value?.treasury;
  if (value?.mode !== 'island_shared' || value.version !== 1 || !decimal(value.revision)
      || !['islandOwner', 'accountId', 'runEpoch'].every(key => uuid(value[key]))
      || !money || !['balanceCoins', 'committedCoins', 'availableCoins'].every(key => decimal(money[key]))) return false;
  return BigInt(money.balanceCoins) - BigInt(money.committedCoins) === BigInt(money.availableCoins);
}

export function sameRepairOrigin(a, b) {
  return !!a && !!b && originFields.every(key => a[key] === b[key]);
}

/** An explicitly shared or unknown context can never use the caller's personal coins. */
export function repairFunding(state, options, price) {
  const hasContext = Object.hasOwn(state ?? {}, 'economy') || Object.hasOwn(options, 'economy');
  const economy = Object.hasOwn(options, 'economy') ? options.economy : state?.economy;
  if (!hasContext || economy?.mode === 'personal_legacy' && !Object.hasOwn(state ?? {}, 'economy')) {
    const known = Number.isSafeInteger(options.coins) && options.coins >= 0;
    const affordable = known && price !== null && options.coins >= price;
    return {shared: false, known, affordable, payerLabel: null,
      reason: !known ? 'Coins are still loading.' : price !== null && !affordable ? `Need ${price - options.coins} more coins.` : null};
  }
  const known = isRepairEconomy(economy) && (!Object.hasOwn(state ?? {}, 'economy')
    || isRepairEconomy(state.economy) && sameRepairOrigin(state.economy, economy));
  const available = known ? BigInt(economy.treasury.availableCoins) : null;
  const affordable = known && price !== null && available >= BigInt(price);
  const missing = known && price !== null && !affordable ? BigInt(price) - available : null;
  return {shared: true, known, affordable, payerLabel: 'Paid from the island treasury.',
    reason: !known ? 'Island treasury is still loading.' : missing !== null
      ? `Need ${missing} more available island coin${missing === 1n ? '' : 's'}.` : null};
}
