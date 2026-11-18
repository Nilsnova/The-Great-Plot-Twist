// One accepted island funding view and its authenticated lifetime; no ledger or account authority.
import {createIslandFunding} from './economy-funding.js';
import {readEconomy, readLegacyEconomy, sameEconomyScope} from './economy-view.js';

export function createIslandEconomy(isl) {
  isl.funding = createIslandFunding();
  const getEconomy = () => {
    if (isl.visitCode && !isl.visiting) return null;
    const selected = isl.visiting ?? isl.own;
    if (readLegacyEconomy(selected?.economy)) return selected.economy;
    return isl.currentFunds?.().economy ?? null;
  };
  const domainAvailable = name => {
    const selected = isl.visiting ?? isl.own;
    if (!selected || isl.visitCode && !isl.visiting) return false;
    return !isl.currentFunds().shared || selected.capabilities?.[name]?.available === true;
  };
  function refreshEconomy(envelope, origin) {
    const selected = isl.visiting ?? isl.own, before = readEconomy(getEconomy()), next = readEconomy(envelope);
    if (isl.disposed || !selected || !before || !next || !sameEconomyScope(before, origin)
      || !sameEconomyScope(next, origin) || BigInt(next.revision) < BigInt(before.revision)) return false;
    const projection = isl.funding.view({...selected, economy: next});
    if (!projection.economy) {
      selected.economy=null; selected.quotesStale=true; isl.tellCoins?.(); return false;
    }
    selected.economy = projection.economy;
    if (selected.snapshotVersion === 1) selected.quotesStale = true;
    isl.tellCoins?.();
    void (isl.visiting ? isl.reloadVisit() : isl.reloadOwn()).then(() => {
      if (!isl.disposed) isl.refreshCard();
    }).catch(() => {});
    return true;
  }
  function watchEconomyIdentity() {
    let accepted = isl.authGeneration();
    return isl.onAuthGenerationChange(() => {
      const next = isl.authGeneration();
      if (isl.disposed || Object.is(next, accepted)) return;
      accepted = next;
      isl.selectionGeneration++; isl.loadTicket++; isl.resetGeneration++; isl.coreTravelGeneration++;
      isl.own = null; isl.visiting = null; isl.point = null; isl.lobbyAnswer = null; isl.gameCode = null; isl.here = new Map();
      isl.funding = createIslandFunding();
      isl.pendingWallet=null;isl.walletGeneration++;isl.clearJoins();
      isl.interruptBoat();
      isl.personalUnavailable = true; isl.ownRetry = true; isl.ownMessage = 'Reload the island for the signed-in account.';
      isl.busySpot = null; isl.busyKind = null; isl.busyCrew = null; isl.busyResearch = null; isl.busyGift = null;
      isl.busyCaptain = false; isl.busySkill = null; isl.busyRole = false; isl.busyRespec = false; isl.respecAsk = false;
      isl.pickedSkill = null; isl.pickedRole = null; isl.cardMessage = '';
      isl.demolishSpot = null; isl.demolishQuote = null; isl.busyDemolish = false;
      isl.recoveryReadId++; isl.recoveryState = null; isl.recoveryCombat = null; isl.recoveryStatus = 'disabled'; isl.stopRecoveryPoll();
      isl.boatTicket++; isl.boatStatus = null; isl.ui.close(); isl.moving.cancel(); isl.village.leave();
      isl.game?.clear?.();
      isl.flow.reset(); isl.coreState.reset(null); isl.coreRejoin = null; void isl.arsenal.refresh();
      try {isl.onCaptain(null);} catch { /* The HUD cannot stop clearing an old identity. */ }
      try {isl.onCoins(null, {shared: true, economy: null, fundingKey: null});} catch { /* The island still clears. */ }
      isl.applyWorld();
    });
  }
  return {getEconomy, refreshEconomy, domainAvailable, watchEconomyIdentity};
}
