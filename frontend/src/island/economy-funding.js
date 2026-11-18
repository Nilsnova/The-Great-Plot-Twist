// Select the defended island's treasury without mixing it with the Captain wallet.
// Used by index.js; a confirmed selection/reset may explicitly forget a retired monetary scope.
import {createTreasuryProjection, declaresEconomy, economySnapshot, sameEconomyScope} from './economy-view.js';
import {islandCode} from './codes.js';

export function createIslandFunding() {
  const islands = new Map();
  return Object.freeze({
    forget(code) { islands.delete(islandCode(code ?? '')); },
    view(island, legacyCoins = null) {
      const code = islandCode(island?.code ?? '') || null;
      let entry = code ? islands.get(code) : null;
      if (!entry && !declaresEconomy(island)) return {shared: false, coins: legacyCoins, key: code};
      if (!entry) { entry = {projection: null}; if (code) islands.set(code, entry); }
      const next = economySnapshot(island);
      if (!entry.projection && next) entry.projection = createTreasuryProjection(next);
      else if (entry.projection) {
        if (next && !sameEconomyScope(entry.projection.current, next)) entry.projection.update({economy: null});
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
