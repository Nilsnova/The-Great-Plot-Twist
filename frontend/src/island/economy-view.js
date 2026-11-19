// Exact shared-island money and monetary snapshot ordering. Used by the island cards, HUD and API adapter.
// Receipt balances are historical; only economy/currentEconomy snapshots update the live projection.
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function coinInteger(value) {
  if (decimal(value)) return value;
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
}

export function exactCoinText(value) {
  const amount = coinInteger(value);
  return amount === null ? '🪙 ?' : `🪙 ${amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function canAffordCoins(available, price) {
  const funds = coinInteger(available), cost = coinInteger(price);
  return funds !== null && cost !== null && BigInt(funds) >= BigInt(cost);
}

export function missingCoins(available, price) {
  const funds = coinInteger(available), cost = coinInteger(price);
  if (funds === null || cost === null) return null;
  const difference = BigInt(cost) - BigInt(funds);
  return String(difference > 0n ? difference : 0n);
}

export function readEconomy(value) {
  if (!value || value.mode !== 'island_shared' || value.version !== 1
    || !uuid(value.islandOwner) || !uuid(value.accountId) || !uuid(value.runEpoch) || !decimal(value.revision)) return null;
  const money = value.treasury;
  if (!money || !decimal(money.balanceCoins) || !decimal(money.committedCoins) || !decimal(money.availableCoins)) return null;
  if (BigInt(money.balanceCoins) - BigInt(money.committedCoins) !== BigInt(money.availableCoins)) return null;
  return Object.freeze({mode: value.mode, version: value.version, islandOwner: value.islandOwner,
    accountId: value.accountId, runEpoch: value.runEpoch, revision: value.revision,
    treasury: Object.freeze({balanceCoins: money.balanceCoins, committedCoins: money.committedCoins, availableCoins: money.availableCoins})});
}

export function readLegacyEconomy(value) {
  if (!value || value.mode !== 'personal_legacy' || value.version !== 0) return null;
  if (!uuid(value.islandOwner)) return null;
  if (['accountId','runEpoch','revision','treasury'].some(key => value[key] !== null)) return null;
  return Object.freeze({...value});
}

export function economySnapshot(data) {
  return readEconomy(data && Object.hasOwn(data, 'currentEconomy') ? data.currentEconomy : data?.economy);
}

export const declaresEconomy = data => !!data && (Object.hasOwn(data, 'economy') || Object.hasOwn(data, 'currentEconomy'));
export const sameEconomyScope = (one, two) => !!one && !!two && one.islandOwner === two.islandOwner
  && one.accountId === two.accountId && one.runEpoch === two.runEpoch;

export function economyContext(economy) {
  const state = readEconomy(economy);
  return state ? {mode: state.mode, version: state.version, islandOwner: state.islandOwner, runEpoch: state.runEpoch} : null;
}

export function treasuryLine(economy) {
  const state = readEconomy(economy);
  return state ? `Island treasury · ${exactCoinText(state.treasury.availableCoins)} available · ${exactCoinText(state.treasury.committedCoins)} committed`
    : 'Island treasury unavailable. Reload the island.';
}

export function cardFunds(economy, legacyCoins = null) {
  if (economy === undefined) return {shared: false, coins: legacyCoins, line: legacyCoins === null ? '' : `You have ${exactCoinText(legacyCoins)}`};
  const state = readEconomy(economy);
  return {shared: true, coins: state?.treasury.availableCoins ?? null, line: treasuryLine(state)};
}

// Construct a new projection only when an authoritative island selection/reset chooses a new scope.
// update() never adopts a different account or epoch from a delayed write/retry.
export function createTreasuryProjection(initial) {
  let current = readEconomy(initial), valid = current !== null;
  if (!current) throw new TypeError('A treasury projection needs a valid shared-island snapshot.');
  return Object.freeze({
    get current() { return current; },
    get availableCoins() { return valid ? current.treasury.availableCoins : null; },
    get valid() { return valid; },
    context: () => economyContext(current),
    update(data) {
      const next = economySnapshot(data);
      if (!next) { valid = false; return 'unavailable'; }
      if (!sameEconomyScope(current, next)) return 'scope_mismatch';
      if (BigInt(next.revision) < BigInt(current.revision)) return 'older_revision';
      if (next.revision === current.revision && Object.keys(current.treasury).some(key => current.treasury[key] !== next.treasury[key])) {
        valid = false; return 'revision_conflict';
      }
      current = next; valid = true;
      return 'accepted';
    },
  });
}
