// Canonical exact island amounts. Used only by the shared Harbor controls and tests.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = value => typeof value === 'string' && UUID.test(value);
export function coinInteger(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError('Invalid coin amount.');
  return BigInt(value);
}
export function allIn(available, feeBasisPoints = 0) {
  if (!Number.isSafeInteger(feeBasisPoints) || feeBasisPoints < 0) throw new TypeError('Invalid fee.');
  return (coinInteger(available) * 10000n / (10000n + BigInt(feeBasisPoints))).toString();
}
export function shareOf(available, percent) {
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) throw new TypeError('Invalid share.');
  return (coinInteger(available) * BigInt(percent) / 100n).toString();
}
export const coinsText = value => `🪙 ${coinInteger(value).toLocaleString('en-US')}`;
export function validEconomy(value) {
  try {
    const money = value?.treasury;
    return value?.mode === 'island_shared' && value.version === 1 && isUuid(value.islandOwner)
      && isUuid(value.accountId) && isUuid(value.runEpoch) && coinInteger(value.revision) >= 0n
      && coinInteger(money.balanceCoins) >= coinInteger(money.committedCoins)
      && coinInteger(money.availableCoins) === coinInteger(money.balanceCoins) - coinInteger(money.committedCoins);
  } catch { return false; }
}
export function originMatches(a, b) {
  return a?.mode === 'island_shared' && a.version === 1 && a.islandOwner === b?.islandOwner
    && a.accountId === b.accountId && a.runEpoch === b.runEpoch;
}
