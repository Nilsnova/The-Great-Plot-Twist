// Select the HUD's island funding mode. Used by game.js and real HUD/island integration tests.
export function createIslandHudFunding(hud) {
  let shared = false, fundingKey = null;
  return (value, options = {}) => {
    if (options.shared === true) {
      const nextKey = options.fundingKey ?? null;
      const replace = !shared || nextKey !== fundingKey;
      shared = true; fundingKey = nextKey;
      hud.setTreasury(options.economy, {replace});
      return;
    }
    // Only the island's accepted legacy source may leave shared/unknown mode.
    if (options.legacyIsland !== true || !Number.isSafeInteger(value) || value < 0) return;
    if (shared) { shared = false; fundingKey = null; hud.clearTreasury(); }
    hud.setCoinSource('island'); hud.setCoins(value, options);
  };
}
