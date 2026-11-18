// A wave's end in the controller (controller.js): settle() plays a wave out at once, end() shows the result and
// opens the break, submitFinish() calls finishWave (retried on too-early and unknown outcomes; a recovery wave
// hands over to its journal finish), and stop() cleans up. A closure over `ctl`.

import { TICK_SECONDS } from './sync.js';
import { healthReport } from './wall-health.js';
import { RECOVERY_FLUSH_MS } from './recovery-transport.js';
import { END_BEAT_MS, LOST_BEAT_MS, SETTLE_TICKS, LOST_FALLEN, LOST_TITLE, LOST_LINE, tooEarlyWait, finishRetryWait } from './controller-shared.js';

export function createFinish(ctl) {
  const { world, finishWave, now, cutsceneFor, playCutscene, startNextWave, breakSeconds, poses, later, emit, cue,
    rangeFeedback, dangerFeedback, closeDefenseInspection } = ctl;
  // From the other parts (controller-*.js), linked once every part exists.
  let tryRecoveryFinish, handOffRecoveryFinish, roundLoot;
  function settle(current) {
    if (current.recoveryReplay) return;
    for (let i = 0; i < SETTLE_TICKS && !current.sim.done; i++) { current.sim.step(TICK_SECONDS, current.schedule.take(current.ticks)); current.ticks++; }
    current.state = current.sim.state();
    if (current.sim.done) end(current);
  }
  // v3 waves: a boss finisher is running (the battle stands still: no shots, repairs or prompts meanwhile).
  const finishing = current => current?.state?.finisher?.active === true;
  function end(current) {
    if (current.done) return;
    current.done = true;
    current.result = current.sim.result();
    current.revive = null; current.pin = null;
    current.hud?.down?.(null); current.hud?.health?.(null); current.hud?.marks?.([]);
    if (current.recoveryReplay) {
      current.recoveryPending = [];
      current.hud?.banner('Wave over', 'Confirming the result…');
    } else presentEnd(current);
    void submitFinish(current);
  }

  function presentEnd(current) {
    const result = current.result;
    const run = typeof startNextWave === 'function', fallenAll = current.sim.endReason === 'captains_fallen';
    if (run && result.survived) current.pause = { until: now() + breakSeconds * 1000, ready: false, requested: false, note: null };
    else if (run) current.hud?.banner(LOST_TITLE, `${fallenAll ? `${LOST_FALLEN} ` : ''}${LOST_LINE}`);
    else current.hud?.banner(result.survived ? 'Wave won!' : 'The island fell', fallenAll ? LOST_FALLEN : `${result.shipsSunk} ${result.shipsSunk === 1 ? 'ship' : 'ships'} sunk`);
    cue(result.survived ? 'pirate-victory' : 'pirate-defeat');
    // Recovery quest/narrator events come once from wave-flow.ended, after wave_finish_answered.
    if (!current.recoveryReplay) emit({ type: 'wave_finished', waveId: current.info.waveId, survived: result.survived, shipsSunk: result.shipsSunk });
    if (current.pause) return; // the break runs from update(); the next wave (or its end) cleans up
    const summary = { lampsRelit: current.lampsRelit, flagshipSunk: current.flagshipSunk, flagship: current.info.flagship, wave: current.info.wave };
    const cleanup = async () => {
      if (ctl.wave !== current) return;
      if (current.recoveryReplay && !current.recoveryFinishAnswered && !current.recoveryFinishFailed) { later(cleanup, RECOVERY_FLUSH_MS); return; }
      current.hud?.banner('');
      const id = current.shown ? cutsceneFor(result, summary) : null;
      try { if (id) await playCutscene(id); } catch { /* The cutscene is a bonus: the banner already said it. */ }
      if (ctl.wave === current) stop();
    };
    later(cleanup, run ? LOST_BEAT_MS : END_BEAT_MS);
  }

  async function submitFinish(current) {
    if (current.finishing) return;
    current.finishing = true;
    if (current.recoveryReplay) {
      current.recoveryFinishPending = true;
      tryRecoveryFinish(current);
      return;
    }
    // v3 waves: the bonuses the sim saw (the galleon sunk, a finisher won); the server pays them only where the wave allows.
    const body = { waveId: current.info.waveId, survived: current.result.survived, shipsSunk: current.result.shipsSunk,
      ...(current.result.bonuses?.length ? { bonuses: [...current.result.bonuses] } : {}),
      ...(current.result.rescued === true ? { rescued: true } : {}), // T38: a won last-chance rescue (rescue.js)
      // D039: only a wave that came with walls (the flag on) reports them back, every wall's percent.
      ...(current.info.walls ? { walls: healthReport(current.sim.state().walls) } : {}) };
    let unknown = 0; // finishes sent again after an unknown outcome
    const attempt = async () => {
      try {
        current.answer = (await finishWave(body)) ?? null;
        roundLoot(current, current.answer?.loot);
        emit({ type: 'wave_finish_answered', waveId: body.waveId, loot: current.answer?.loot ?? null, runLoot: ctl.runLoot });
      } catch (error) {
        const early = tooEarlyWait(error), retry = early === null ? finishRetryWait(error, unknown) : null;
        if (retry !== null) unknown++;
        const wait = early ?? retry;
        if (wait !== null && !ctl.disposed) later(attempt, wait * 1000);
        else { console.error(error); if (current.pause) current.pause.failed = true; }
      }
    };
    await attempt();
  }

  function stop() {
    const current = ctl.wave;
    if (!current) return;
    if (!ctl.disposed && current.recoveryFinishPending && !current.recoveryDetached) handOffRecoveryFinish(current);
    ctl.wave = null; current.finished = true;
    closeDefenseInspection(current);
    rangeFeedback.reset(); dangerFeedback.reset(); ctl.rangePreview = false;
    if (world.camera?.userData) { delete world.camera.userData.battleZoom; delete world.camera.userData.battleFocus; }
    current.renderer?.dispose(); current.hud?.dispose(); current.schedule.clear(); current.liveFeedback.clear(); poses.clear();
    current.eventArt?.dispose(); current.finisher?.scene?.dispose(); current.finisher = null;
    emit({ type: 'wave_controller_stopped', waveId: current.info.waveId, ...(current.recoveryReplay ? { recovery: true } : {}) });
  }
  function link() { // the names of the other parts, once every part exists (controller.js)
    ({ tryRecoveryFinish, handOffRecoveryFinish, roundLoot } = ctl);
  }
  return { settle, finishing, end, presentEnd, stop, link };
}
