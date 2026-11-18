// Structure recovery on the island screen (D059, index.js): whether the island on screen plays by it, its read
// and poll, the paid repair of one structure, the errors shown on the card, the replay's combat state and the
// wave controller's checkpoint before a repair. A closure over the island's state `isl`.

import {isPointSpot} from './spots.js';
import {isCurrentStructureRecoveryResponse} from './structure-recovery-model.js';

export function createRecovery(isl) {
  const {emit, setTimer, clearTimer} = isl;
  // From the other parts (island-*.js), linked once every part exists.
  let target, applyWorld, tookCoins, reloadOwn, refreshCard, refreshCardIfBuild;
  function clearRecoveryError() { isl.recoveryError = null; isl.recoveryErrorSource = null; isl.recoveryErrorContext = null; }
  function setRecoveryReadError(code) {
    if (isl.recoveryErrorSource === 'action') return;
    isl.recoveryError = code; isl.recoveryErrorSource = 'read'; isl.recoveryErrorContext = null;
  }
  function setRecoveryActionError(code, spotId, quote) {
    isl.recoveryError = code; isl.recoveryErrorSource = 'action';
    isl.recoveryErrorContext = {spot: spotId, instanceId: quote?.instanceId, islandEpoch: quote?.expectedEpoch,
      waveId: quote?.expectedWaveId ?? null, repairWindow: quote?.expectedWindow};
  }
  function sameRecoveryErrorContext(state) {
    const context = isl.recoveryErrorContext, row = state?.structures?.find(item => item.spot === context?.spot);
    return !!context && state?.islandEpoch === context.islandEpoch && state?.waveId === context.waveId
      && state?.repairWindow === context.repairWindow
      && row?.instanceId === context.instanceId;
  }
  const recoveryPolicyOn = () => {
    const code = target()?.code;
    if (!code) return false;
    if (isl.recoveryIslandCode === code && isl.recoveryStatus === 'disabled') return false;
    return isl.recoveryState?.recoveryVersion === 1 && isl.recoveryIslandCode === code || target()?.recoveryVersion === 1;
  };
  const recoveryControlsOn = () => recoveryPolicyOn()
    || (isl.recoveryIslandCode === target()?.code && ['loading', 'error'].includes(isl.recoveryStatus));
  const recoveryModelVersion = () => recoveryPolicyOn() ? 1 : 0;
  function stopRecoveryPoll() {
    if (isl.recoveryPollTimer === null) return;
    (clearTimer ?? clearTimeout)(isl.recoveryPollTimer);
    isl.recoveryPollTimer = null; isl.recoveryPollCode = null;
  }
  function scheduleRecoveryPoll() {
    const askedCode = target()?.code;
    if (isl.recoveryPollTimer !== null && isl.recoveryPollCode === askedCode) return;
    stopRecoveryPoll();
    if (isl.disposed || !recoveryControlsOn() || !askedCode) return;
    isl.recoveryPollCode = askedCode;
    isl.recoveryPollTimer = (setTimer ?? setTimeout)(async () => {
      isl.recoveryPollTimer = null;
      isl.recoveryPollCode = null;
      if (isl.disposed || target()?.code !== askedCode || !recoveryControlsOn()) return;
      // Nobody looks (a hidden tab), or a wave runs with no card that shows structure health open (its
      // replay is the live HP; the wave's start and finish and every card opening read on their own):
      // skip this read, keep the timer.
      const unseen = globalThis.document?.visibilityState === 'hidden'
        || (isl.battle && !isl.waveOver && !(isl.ui.open === 'build' && isl.openSpot) && !['bell', 'captain', 'tech'].includes(isl.ui.open));
      if (!unseen) await readStructureRecovery();
      scheduleRecoveryPoll();
    }, 5000);
  }
  async function readStructureRecovery(spotId = isl.openSpot) {
    if (isl.disposed || isPointSpot(spotId ?? '')) return;
    const askedCode = target()?.code;
    if (!askedCode) return;
    if (isl.recoveryReadPromise) {
      if (isl.recoveryReadCode === askedCode) return isl.recoveryReadPromise;
      try { await isl.recoveryReadPromise; } catch { /* The next target gets its own read. */ }
      if (isl.disposed || askedCode !== target()?.code) return;
    }
    if (isl.recoveryIslandCode !== askedCode) {
      isl.recoveryState = null; isl.recoveryCombat = null; isl.recoveryIslandCode = askedCode; isl.recoveryStatus = 'loading'; clearRecoveryError();
    } else if (isl.recoveryStatus !== 'ready') {
      isl.recoveryStatus = 'loading';
    }
    const askedId = ++isl.recoveryReadId;
    const request = (async () => {
      const answer = await isl.api.structureRecovery({code: isl.visiting ? isl.visiting.code : null});
      if (isl.disposed || askedId !== isl.recoveryReadId || askedCode !== target()?.code) return;
      if (!answer.ok) {
        if (answer.code === 'feature_off') {
          const persistedV1 = (isl.recoveryState?.recoveryVersion === 1 && isl.recoveryIslandCode === askedCode)
            || target()?.recoveryVersion === 1;
          isl.recoveryIslandCode = askedCode;
          if (persistedV1) { isl.recoveryStatus = 'error'; setRecoveryReadError(answer.code); }
          else { isl.recoveryState = null; isl.recoveryStatus = 'disabled'; clearRecoveryError(); }
        } else {
          isl.recoveryIslandCode = askedCode; isl.recoveryStatus = 'error'; setRecoveryReadError(answer.code);
        }
      } else {
        const prior = isl.recoveryState && isl.recoveryIslandCode === askedCode ? isl.recoveryState : null;
        if (prior && prior.islandEpoch === answer.data.islandEpoch
            && !isCurrentStructureRecoveryResponse({revision: prior.revision}, answer.data)) return;
        isl.recoveryState = answer.data; isl.recoveryIslandCode = askedCode; isl.recoveryStatus = 'ready';
        if (isl.recoveryErrorSource === 'read' || isl.recoveryErrorSource === 'action' && !sameRecoveryErrorContext(answer.data)) clearRecoveryError();
      }
      if (isl.ui.open === 'build' && isl.openSpot === spotId) refreshCard();
      else if (['bell', 'captain', 'tech'].includes(isl.ui.open)) refreshCard();
      applyWorld();
      scheduleRecoveryPoll();
    })();
    isl.recoveryReadPromise = request; isl.recoveryReadCode = askedCode;
    try { await request; } finally {
      if (isl.recoveryReadPromise === request) { isl.recoveryReadPromise = null; isl.recoveryReadCode = null; }
    }
  }
  async function repairStructure(spotId, quote) {
    if (isl.busySpot || !quote || isPointSpot(spotId)) return;
    const askedCode = target()?.code;
    if (!askedCode || !isl.recoveryState || isl.recoveryIslandCode !== askedCode) return;
    const askedEpoch = quote.expectedEpoch, askedInstance = quote.instanceId;
    isl.busySpot = spotId; isl.busyKind = 'structure-repair'; isl.recoveryPendingSpot = spotId; clearRecoveryError(); refreshCard();
    if (quote.expectedWindow === 'reserved_wave') {
      let checkpoint;
      try { checkpoint = await isl.recoveryCheckpointHandler?.(); } catch { checkpoint = null; }
      if (isl.disposed) return;
      if (!checkpoint?.ok) {
        isl.busySpot = null; isl.busyKind = null; isl.recoveryPendingSpot = null;
        const failureCode = checkpoint?.code ?? 'health_sync_required';
        await readStructureRecovery(spotId);
        setRecoveryActionError(failureCode, spotId, quote);
        refreshCard();
        return;
      }
      const currentRow = isl.recoveryState?.islandEpoch === askedEpoch
        ? isl.recoveryState.structures.find(item => item.spot === spotId) : null;
      if (askedCode !== target()?.code || currentRow?.instanceId !== askedInstance
          || isl.recoveryState?.waveId !== quote.expectedWaveId) {
        isl.busySpot = null; isl.busyKind = null; isl.recoveryPendingSpot = null;
        setRecoveryActionError('stale_recovery_quote', spotId, quote);
        refreshCard();
        return;
      }
    }
    const answer = await isl.api.repairStructure({quote, code: isl.visiting ? isl.visiting.code : null});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null; isl.recoveryPendingSpot = null;
    if (askedCode !== target()?.code) { refreshCard(); return; }
    const currentInstance = isl.recoveryState?.islandEpoch === askedEpoch
      ? isl.recoveryState.structures.find(item => item.spot === spotId)?.instanceId : null;
    if (currentInstance !== askedInstance) {
      clearRecoveryError(); isl.recoveryStatus = 'loading'; refreshCard();
      await readStructureRecovery(spotId);
      return;
    }
    if (answer.ok) {
      tookCoins(answer.data.coins);
      clearRecoveryError();
      // The wave on screen draws the structure whole at once; its replayed repair event confirms it later.
      if (quote.expectedWindow === 'reserved_wave') emit({type: 'structure_repair_paid', spot: spotId, waveId: quote.expectedWaveId});
    } else {
      await reloadOwn();
      await readStructureRecovery(spotId);
      setRecoveryActionError(answer.code, spotId, quote);
      refreshCard();
      return;
    }
    refreshCard();
    // The response receipt is not a combat HP patch. Read the current canonical view and let the
    // replay hook update active-wave HP from its ordered journal event.
    await readStructureRecovery(spotId);
  }
  function setRecoveryCombatState(state) {
    if (!state) {
      if (!isl.recoveryCombat) return;
      isl.recoveryCombat = null;
      applyWorld();
      refreshCardIfBuild();
      return;
    }
    if (!recoveryPolicyOn() || !isl.recoveryState
        || state.islandEpoch !== isl.recoveryState.islandEpoch || state.waveId !== isl.flow.current?.wave?.waveId
        || !Array.isArray(state.structures)) return;
    const structures = state.structures.filter(item => item && typeof item.spot === 'string'
      && typeof item.instanceId === 'string' && Number.isSafeInteger(item.hpUnits) && item.hpUnits >= 0 && item.hpUnits <= 1_000_000
      && Number.isFinite(item.maxHP) && item.maxHP > 0 && Number.isSafeInteger(item.repairSeq) && item.repairSeq >= 0);
    const errorContext = isl.recoveryErrorContext;
    if (isl.recoveryErrorSource === 'action' && errorContext
        && (errorContext.islandEpoch !== state.islandEpoch || errorContext.waveId !== state.waveId
          || errorContext.repairWindow !== 'reserved_wave' || structures.find(item => item.spot === errorContext.spot)?.instanceId !== errorContext.instanceId)) {
      clearRecoveryError(); refreshCardIfBuild();
    }
    const next = {waveId: state.waveId, islandEpoch: state.islandEpoch, structures};
    if (JSON.stringify(isl.recoveryCombat) === JSON.stringify(next)) return;
    // The island scene only shows whether this wave's replay is the live source (applyWorld), not its HP:
    // redraw it when that changes, not on every hit (the wiring publishes up to four times a second).
    const replayChanged = isl.recoveryCombat?.waveId !== next.waveId;
    isl.recoveryCombat = next;
    if (replayChanged) applyWorld();
    refreshCardIfBuild();
  }
  function setRecoveryCheckpointHandler(handler) {
    isl.recoveryCheckpointHandler = typeof handler === 'function' ? handler : null;
  }
  function link() { // the names of the other parts, once every part exists (index.js)
    ({target, applyWorld, tookCoins, reloadOwn, refreshCard, refreshCardIfBuild} = isl);
  }
  return {clearRecoveryError, recoveryPolicyOn, recoveryControlsOn, recoveryModelVersion, stopRecoveryPoll,
    readStructureRecovery, repairStructure, setRecoveryCombatState, setRecoveryCheckpointHandler, link};
}
