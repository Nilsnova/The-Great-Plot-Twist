// Select the defended island's treasury without mixing it with the Captain wallet.
// Used by index.js; a confirmed selection/reset may explicitly forget a retired monetary scope.
import {createTreasuryProjection, declaresEconomy, economySnapshot, readLegacyEconomy, sameEconomyScope} from './economy-view.js';
import {islandCode} from './codes.js';

export function createIslandFunding() {
  const islands = new Map();
  const scopeKey = economy => JSON.stringify([economy?.islandOwner, economy?.accountId, economy?.runEpoch]);
  return Object.freeze({
    forget(code) { islands.delete(islandCode(code ?? '')); },
    // Call only after the requesting GET's read/selection generation has been accepted.
    acceptRead(island) {
      const code = islandCode(island?.code ?? ''), next = economySnapshot(island), entry = islands.get(code);
      if (!next || !entry?.projection?.current) return true;
      if (entry.retired.has(scopeKey(next))) return false;
      if (!sameEconomyScope(entry.projection.current, next)) {
        entry.retired.add(scopeKey(entry.projection.current));
        entry.projection = createTreasuryProjection(next);
      }
      return true;
    },
    view(island, legacyCoins = null) {
      const code = islandCode(island?.code ?? '') || null;
      let entry = code ? islands.get(code) : null;
      const legacy = !!readLegacyEconomy(island?.economy);
      if (!entry && (legacy || !declaresEconomy(island))) return {shared: false, coins: legacyCoins, key: code};
      if (!entry) { entry = {projection: null, retired: new Set()}; if (code) islands.set(code, entry); }
      const next = economySnapshot(island);
      if (!entry.projection && next) entry.projection = createTreasuryProjection(next);
      else if (entry.projection) {
        if (next && !sameEconomyScope(entry.projection.current, next)) {
          if (!entry.retired.has(scopeKey(next))) entry.projection.update({economy: null});
        }
        else entry.projection.update(island);
      }
      const projection = entry.projection;
      const economy = projection?.valid ? projection.current : null;
      const scope = projection?.current;
      return {shared: true, coins: projection?.availableCoins ?? null, economy,
        context: projection?.context() ?? null,
        key: [code, scope?.islandOwner, scope?.accountId, scope?.runEpoch].join(':')};
    },
  });
}
