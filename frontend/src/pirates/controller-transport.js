// The wave controller's inputs out and in (controller.js). submit() sends an input: to the room and the input
// schedule in a legacy wave, to the recovery journal queue in a recovery wave. pumpRecovery() runs every frame in
// a recovery wave: flushes the queue, polls the sealed journal, replays it into the sim a playout behind real time,
// checkpoints structure health, and closes and finishes the wave with the server. receive() takes the room's
// messages. A closure over the controller's shared state `ctl`.

import { INPUT_LEAD_TICKS, TICK_SECONDS, readMessage, toMessage } from './sync.js';
import { fetchSealedEvents } from './wave-replay.js';
import { commandForJournal, MAX_INPUT_BATCH, MAX_INPUT_BATCH_BYTES, RECOVERY_FLUSH_MS, RECOVERY_POLL_LEAD_MS,
  RECOVERY_POLL_MARGIN_MS, RECOVERY_POLL_MIN_MS, RECOVERY_POLL_MS, recoveryRefusal, refusalDelayMs, refusalKind,
  simulationInputFromJournal } from './recovery-transport.js';
import { makeActionUid } from '../screens/islet/action-uid.js';
import { MAX_TICKS_PER_FRAME, canonicalJson, validCanonicalClose, END_BEAT_MS, HEALTH_CHECKPOINT_COALESCE_MS } from './controller-shared.js';

export function createTransport(ctl) {
  const { room, now, recoveryTransport, actorId, later, emit, noteLiveInput } = ctl;
  // From the other parts (controller-*.js), linked once every part exists.
  let tagActors, receiveCosmetic, handle, roundLoot, end, stop;
  function submit(input, lead = INPUT_LEAD_TICKS) {
    if (!ctl.wave || ctl.wave.done || ctl.wave.state.phase !== 'running') return false;
    if (ctl.wave.recoveryReplay) {
      const command = commandForJournal(input);
      if (!command) return false;
      const attack = ['captain_shot', 'captain_strike', 'fire', 'finisher_ready', 'finisher_input', 'lamps_lit'].includes(command.type);
      const elapsed = (now() + ctl.wave.offset - ctl.wave.info.startsAtMs) / 1000;
      if (attack && elapsed < 0) return false;
      let inputUid;
      try { inputUid = makeActionUid(); } catch { return false; }
      const tick = Math.max(0, ctl.wave.ticks + lead, (ctl.wave.recoveryReplay.sealedThroughTick ?? -1) + 1);
      ctl.wave.recoveryPending.push({ inputUid, actorCounter: ++ctl.wave.actorCounter, tick, command });
      // An attack goes out in this frame, not at the next 250 ms flush: it lands sooner in the journal.
      if (attack) ctl.wave.recoveryFlushNow = true;
      return true;
    }
    const entry = { by: actorId(ctl.wave), seq: ++ctl.wave.seq, tick: ctl.wave.ticks + lead, input };
    ctl.wave.schedule.add(entry, ctl.wave.ticks);
    noteLiveInput(input);
    const message = toMessage(input, { ...entry, waveId: ctl.wave.info.waveId });
    if (message) try { room?.send?.(message.type, message.payload); } catch (error) { console.error(error); }
    return true;
  }

  function pumpRecovery(current, at) {
    if (!current.recoveryReplay || !recoveryTransport) return;
    const waveId = current.info.waveId;
    if (!current.recoverySending && current.recoveryPending.length
      && (at - current.recoveryLastFlushAt >= RECOVERY_FLUSH_MS || current.recoveryFlushNow) && at >= current.recoveryInputRetryAt) {
      current.recoveryLastFlushAt = at;
      current.recoveryFlushNow = false;
      // The body's size grows by each item and a comma: {"waveProtocol":2,"inputs":[a,b,...]}.
      const batch = [], encoder = new TextEncoder();
      let bytes = encoder.encode(JSON.stringify({ waveProtocol: 2, inputs: [] })).length;
      for (const item of current.recoveryPending) {
        const size = encoder.encode(JSON.stringify(item)).length + (batch.length ? 1 : 0);
        if (batch.length >= MAX_INPUT_BATCH || bytes + size > MAX_INPUT_BATCH_BYTES) break;
        bytes += size;
        batch.push(item);
      }
      if (batch.length) {
        current.recoverySending = true;
        const sending = Promise.resolve().then(() => recoveryTransport.sendInputs({ waveId, inputs: batch }));
        current.recoverySendPromise = sending;
        sending
          .then(answer => { if (ctl.wave === current) applyInputAnswer(current, batch, answer); })
          .catch(error => { console.error(error); if (ctl.wave === current) applyInputAnswer(current, batch, null); })
          .finally(() => { current.recoverySending = false; current.recoverySendPromise = null; tryRecoveryFinish(current); });
      }
    }
    if (recoveryPollDue(current, at)) void fetchRecoveryFrontier(current);
    // The health vector and its signature only when a checkpoint could go out (not every frame).
    if (!current.done && !current.recoveryInvalid && !current.recoveryHealthCheckpointPromise && !current.catchingUp
      && at - current.recoveryHealthLastAttemptAt >= HEALTH_CHECKPOINT_COALESCE_MS) {
      const vector = current.sim.recoveryHealthVector();
      const signature = vector ? canonicalJson(vector) : null;
      if (signature && signature !== current.recoveryHealthPersistedSignature) void checkpointBeforeRepair({ force: false }).catch(error => console.error(error));
    }
    reconcileTerminalRecovery(current);
    tryRecoveryFinish(current);
  }

  // The next regular journal read (fetchRecoveryFrontier keeps one in flight at a time). A closed,
  // refused or diverged wave reads nothing more on its own: the break can stay open for minutes.
  function recoveryPollDue(current, at) {
    if (current.recoveryPolling || current.recoveryFinishing || current.recoveryInvalid || current.recoveryFinishAnswered
      || current.recoveryFinishFailed || at < current.recoveryPollRetryAt) return false;
    const since = at - current.recoveryLastPollAt;
    if (since >= RECOVERY_POLL_MS) return true;
    if (since < RECOVERY_POLL_MIN_MS) return false;
    const sealed = current.recoveryReplay.sealedThroughTick;
    // The ended wave waits for its close (fresh seals for the finish); no seal yet: read.
    if (current.done || !Number.isInteger(sealed)) return true;
    // How long the sealed ticks still last under the playout clock, against the time a read takes.
    const playoutAt = at + current.offset - current.info.startsAtMs - current.recoveryPlayoutMs;
    const headroomMs = (sealed + 1) * TICK_SECONDS * 1000 - playoutAt;
    return headroomMs < Math.max(RECOVERY_POLL_LEAD_MS, current.recoveryRttMs + RECOVERY_POLL_MARGIN_MS);
  }

  function fetchRecoveryFrontier(current) {
    if (current.recoveryPolling) return current.recoveryPollPromise ?? Promise.resolve(false);
    current.recoveryPolling = true;
    const startedAt = current.recoveryLastPollAt = now();
    let polling, refusal = null;
    polling = Promise.resolve().then(() => fetchSealedEvents(current.recoveryReplay,
      request => recoveryTransport.readEvents({ waveId: current.info.waveId, ...request }), undefined, page => { refusal = page; },
      page => { if (page.closed === true) current.recoveryClosed = true; }))
      .catch(error => { console.error(error); refusal = recoveryRefusal(null); return false; }).then(complete => {
        if (current.recoveryPollPromise !== polling) return complete;
        if (complete) {
          current.recoveryPollAttempts = 0;
          resyncActorCounter(current);
        } else if (refusal) {
          const kind = refusalKind(refusal);
          if (kind === 'terminal') endRecoveryWave(current, refusal.code);
          else current.recoveryPollRetryAt = now() + (kind === 'later' ? refusalDelayMs(refusal, current.recoveryPollAttempts++) : 0);
        }
        // A slow answer counts at once; a fast one lowers the estimate gradually.
        const took = Math.max(0, now() - startedAt);
        current.recoveryRttMs = took >= current.recoveryRttMs ? took : current.recoveryRttMs + (took - current.recoveryRttMs) / 4;
        current.recoveryPolling = false;
        current.recoveryPollPromise = null;
        reconcileTerminalRecovery(current);
        tryRecoveryFinish(current);
        return complete;
      });
    current.recoveryPollPromise = polling;
    return polling;
  }

  function acceptedRecoveryInputs(events, batch, participantToken) {
    if (!Array.isArray(events)) return null;
    const expected = new Map(batch.map(item => [item.inputUid, item]));
    const accepted = new Set();
    for (const event of events) {
      const payload = event?.payload;
      const item = expected.get(payload?.inputUid);
      if (!item || event.type !== 'captain_input' || event.participantToken !== participantToken
        || payload.participantToken !== participantToken || payload.actorCounter !== item.actorCounter
        || canonicalJson(payload.command) !== canonicalJson(item.command)
        || !simulationInputFromJournal(event)) return null;
      accepted.add(item.inputUid);
    }
    return accepted;
  }

  // One input answer under the refusal policy: accepted inputs leave the queue; 'later' waits and sends the
  // same batch again; a counter conflict drops the queue and renumbers from the journal; any other refusal
  // drops the batch (the whole queue once the wave is over for this player). Answers true when it progressed.
  function applyInputAnswer(current, batch, answer) {
    if (Array.isArray(answer?.accepted)) {
      const accepted = acceptedRecoveryInputs(answer.accepted, batch, current.info.participantToken);
      current.recoveryInputAttempts = 0;
      if (accepted?.size) {
        current.recoveryPending = current.recoveryPending.filter(item => !accepted.has(item.inputUid));
        return true;
      }
      console.error('Recovery inputs were answered with other commands; they are dropped.');
      dropInputs(current, batch);
      return false;
    }
    // No answer at all is an unknown outcome: the same batch again later (same UIDs, same counters).
    const refusal = answer?.refused ? answer : recoveryRefusal(answer);
    const kind = refusalKind(refusal);
    if (kind === 'later') {
      current.recoveryInputRetryAt = now() + refusalDelayMs(refusal, current.recoveryInputAttempts++);
      return false;
    }
    current.recoveryInputAttempts = 0;
    if (refusal.code === 'input_counter_conflict' || ['wave_over', 'not_in_wave', 'no_such_wave'].includes(refusal.code)) {
      current.recoveryPending = [];
      if (refusal.code === 'input_counter_conflict') current.recoveryCounterResync = true;
    } else dropInputs(current, batch);
    console.warn(`Recovery inputs refused (${refusal.code}); dropped.`);
    return false;
  }
  function dropInputs(current, batch) {
    const sent = new Set(batch.map(item => item.inputUid));
    current.recoveryPending = current.recoveryPending.filter(item => !sent.has(item.inputUid));
  }
  // After a counter conflict: number the next commands after the last one the journal accepted from us.
  function resyncActorCounter(current) {
    if (!current.recoveryCounterResync || current.recoverySending) return;
    let counter = current.recoveryReplay.maxActorCounter(current.info.participantToken);
    for (const item of current.recoveryPending) item.actorCounter = ++counter;
    current.actorCounter = counter;
    current.recoveryCounterResync = false;
  }
  // A terminal refusal of the wave itself (not in it, no such wave, a client update needed): stop reading
  // and finishing it; the screen says so and the wave ends here like a refused finish.
  function endRecoveryWave(current, code) {
    if (current.recoveryFinishFailed || current.recoveryFinishAnswered) return;
    console.warn(`Recovery wave ended by the server (${code}).`);
    current.recoveryFinishFailed = true;
    current.recoveryFinishPending = false;
    current.recoveryPending = [];
    if (current.pause) current.pause.failed = true;
    if (!current.done) {
      current.hud?.banner('Wave over', 'This wave ended on the server.');
      later(() => { if (ctl.wave === current) stop(); }, END_BEAT_MS);
    }
  }

  async function flushRecoveryInputs(current) {
    while (current.recoverySending) {
      const pending = current.recoverySendPromise;
      if (!pending) return false;
      await pending;
    }
    while (current.recoveryPending.length) {
      const batch = current.recoveryPending.slice(0, MAX_INPUT_BATCH);
      current.recoverySending = true;
      const pending = Promise.resolve().then(() => recoveryTransport.sendInputs({ waveId: current.info.waveId, inputs: batch }));
      current.recoverySendPromise = pending;
      let answer;
      try { answer = await pending; } catch (error) { console.error(error); answer = recoveryRefusal(null); }
      current.recoverySending = false;
      current.recoverySendPromise = null;
      if (!applyInputAnswer(current, batch, answer)) return false;
    }
    return true;
  }

  function checkpointBeforeRepair({ force = true } = {}) {
    const current = ctl.wave;
    if (!current?.recoveryReplay) return Promise.resolve({ ok: false, code: 'recovery_unavailable' });
    if (now() + current.offset < current.info.startsAtMs && current.info.initialSnapshot?.waveId === current.info.waveId) {
      // During preparation the frozen bell snapshot is canonical; accepted paid repairs replay at tick zero.
      return Promise.resolve({ ok: true });
    }
    const prior = current.recoveryHealthCheckpointPromise;
    const running = (prior ? prior.then(result => result?.ok ? checkpointRecovery(current, { force }) : result)
      : checkpointRecovery(current, { force })).finally(() => {
      if (current.recoveryHealthCheckpointPromise === running) current.recoveryHealthCheckpointPromise = null;
    });
    current.recoveryHealthCheckpointPromise = running;
    return running;
  }

  async function checkpointRecovery(current, { force = true } = {}) {
    if (!current?.recoveryReplay || !recoveryTransport?.checkpoint || current.recoveryFinishAnswered
      || current.recoveryInvalid) return { ok: false, code: 'recovery_unavailable' };
    // A paid repair needs the server to know this screen's damage. When the last accepted checkpoint already holds
    // exactly the HP on screen, it does: no flush, read or checkpoint round trips before the repair goes out.
    if (force && !current.done && current.recoveryReplay.complete()) {
      const vector = current.sim.recoveryHealthVector();
      if (vector && canonicalJson(vector) === current.recoveryHealthPersistedSignature) return { ok: true, reused: true };
    }
    // The periodic checkpoint of a running wave saves ticks already shown, so a complete frontier from the
    // regular reads is enough: every later journal event lands after its seal (the server clamps effective
    // ticks past it), and a waiting command does too. Only a paid repair or the end reads afresh.
    const reuse = !force && !current.done && current.recoveryReplay.complete();
    if (!reuse) {
      if (!await flushRecoveryInputs(current)) return { ok: false, code: 'input_sync_required' };
      let fetched = false;
      try { fetched = await fetchRecoveryFrontier(current); }
      catch (error) { console.error(error); fetched = false; }
      if (!fetched || !current.recoveryReplay.complete()) return { ok: false, code: 'health_sync_required' };
    }
    // The periodic health checkpoint (force false) saves the ticks already shown, which the server accepts
    // while they are sealed; only a checkpoint before a paid repair catches the wave up to the seal.
    if (!current.done && force) {
      const serverTick = Math.floor((((now() + current.offset) - current.info.startsAtMs) / 1000) / TICK_SECONDS);
      // A server seal may arrive between render frames. Catch up only through time that has actually elapsed.
      if (!Number.isInteger(serverTick) || current.recoveryReplay.sealedThroughTick > serverTick
        || !advanceRecoveryThrough(current, current.recoveryReplay.sealedThroughTick)) {
        return { ok: false, code: 'health_sync_required' };
      }
    } else if (current.done && !reconcileTerminalRecovery(current)) {
      return { ok: false, code: 'health_sync_required' };
    }
    const replay = current.recoveryReplay, vector = current.sim.recoveryHealthVector();
    if (!vector || replay.sealedThroughTick < 0) return { ok: false, code: 'health_sync_required' };
    const throughTick = Math.min(replay.sealedThroughTick, current.recoveryDriver.nextTick - 1);
    if (throughTick < 0) return { ok: false, code: 'health_sync_required' };
    let checkpoint = current.recoveryHealthRequest;
    if (!checkpoint || checkpoint.throughTick !== throughTick || checkpoint.inputHeadSeq !== replay.headSeq
      || checkpoint.lastRepairSeq !== current.recoveryLastRepairSeq
      || canonicalJson(checkpoint.hpUnits) !== canonicalJson(vector.hpUnits)
      || canonicalJson(checkpoint.basisRepairSeq) !== canonicalJson(vector.basisRepairSeq)) {
      checkpoint = { islandEpoch: current.info.initialSnapshot.islandEpoch, checkpointUid: makeActionUid(), throughTick,
        inputHeadSeq: replay.headSeq, lastRepairSeq: current.recoveryLastRepairSeq,
        basisRepairSeq: { ...vector.basisRepairSeq }, hpUnits: { ...vector.hpUnits } };
      current.recoveryHealthRequest = checkpoint;
    }
    const attemptAt = now();
    if (!force && attemptAt - current.recoveryHealthLastAttemptAt < HEALTH_CHECKPOINT_COALESCE_MS) {
      return { ok: false, code: 'checkpoint_throttled' };
    }
    current.recoveryHealthLastAttemptAt = attemptAt;
    let answer;
    try { answer = await recoveryTransport.checkpoint({ waveId: current.info.waveId, checkpoint }); }
    catch (error) { console.error(error); answer = recoveryRefusal(null); }
    const accepted = answer?.accepted === true && answer.throughTick === checkpoint.throughTick
      && answer.inputHeadSeq === checkpoint.inputHeadSeq && answer.lastRepairSeq === checkpoint.lastRepairSeq
      && canonicalJson(answer.hpUnits) === canonicalJson(checkpoint.hpUnits);
    if (accepted) current.recoveryHealthPersistedSignature = canonicalJson({ hpUnits: checkpoint.hpUnits,
      basisRepairSeq: checkpoint.basisRepairSeq });
    return accepted ? { ok: true } : { ok: false, code: answer?.reason ?? answer?.code ?? 'health_sync_required' };
  }

  function advanceRecoveryThrough(current, throughTick) {
    if (!Number.isInteger(throughTick) || throughTick < current.recoveryDriver.nextTick
      || !current.recoveryReplay.canAdvanceThrough(throughTick)) return current.recoveryDriver.nextTick > throughTick;
    const emitted = [], fresh = [];
    while (current.recoveryDriver.nextTick <= throughTick && !current.sim.done) {
      const tick = current.recoveryDriver.nextTick;
      const advanced = current.recoveryDriver.advanceThrough(tick, (simTick, journal) => {
        const inputs = journal.map(simulationInputFromJournal).filter(Boolean);
        const repairing = journal.some(event => event.type === 'structure_repaired');
        const before = repairing ? current.sim.recoveryHealthVector() : null;
        const out = current.sim.step(TICK_SECONDS, inputs);
        const after = repairing ? current.sim.recoveryHealthVector() : null;
        if (!repairing) { /* nothing to check */ } else if (!before || !after) current.recoveryInvalid = true;
        else {
          const expected = { ...before.basisRepairSeq };
          let repairs = 0;
          for (const event of journal) if (event.type === 'structure_repaired') {
            const id = event.payload?.instanceId, sequence = event.payload?.repairSeq;
            if (!Object.hasOwn(expected, id) || !Number.isInteger(sequence) || sequence !== expected[id] + 1) current.recoveryInvalid = true;
            else { expected[id] = sequence; repairs++; }
          }
          if (JSON.stringify(expected) !== JSON.stringify(after.basisRepairSeq)) current.recoveryInvalid = true;
          else current.recoveryLastRepairSeq += repairs;
        }
        tagActors(out, journal);
        emitted.push(...out); fresh.push(...out);
        if (simTick !== tick) current.recoveryInvalid = true;
      });
      if (!advanced || current.recoveryInvalid) return false;
      current.ticks = tick + 1;
    }
    current.state = current.sim.state();
    if (emitted.length) handle(emitted, current, fresh);
    if (current.sim.done) end(current);
    return current.recoveryDriver.nextTick > throughTick;
  }

  function reconcileTerminalRecovery(current) {
    const replay = current?.recoveryReplay;
    if (!current?.done || !replay?.complete() || !Number.isInteger(replay.sealedThroughTick)
      || replay.sealedThroughTick < current.recoveryDriver.nextTick) return false;
    const through = Math.min(replay.sealedThroughTick, current.recoveryDriver.nextTick + MAX_TICKS_PER_FRAME - 1);
    let changed = false;
    const advanced = current.recoveryDriver.advanceThrough(through, (_tick, journal) => {
      const vector = current.sim.recoveryHealthVector();
      if (!vector) { current.recoveryInvalid = true; return; }
      for (const event of journal) {
        if (event.type !== 'structure_repaired') continue;
        const id = event.payload?.instanceId, seq = event.payload?.repairSeq;
        if (!Object.hasOwn(vector.basisRepairSeq, id) || !Number.isInteger(seq) || seq !== vector.basisRepairSeq[id] + 1
          || !current.sim.applyRecoveryEvent(event)) { current.recoveryInvalid = true; return; }
        vector.basisRepairSeq[id] = seq;
        current.recoveryLastRepairSeq++;
        changed = true;
      }
    });
    if (changed) current.state = current.sim.state();
    return advanced;
  }

  function tryRecoveryFinish(current) {
    if (!current?.recoveryFinishPending || current.recoveryFinishing || current.recoveryFinishAnswered
      || current.recoveryFinishFailed || !current.done || current.recoveryInvalid || current.recoverySending
      || current.recoveryPolling || !current.recoveryReplay?.complete()
      || now() < current.recoveryFinishRetryAt) return false;
    const replay = current.recoveryReplay;
    // The server owns the end: it takes our own complete prefix (the ticks this sim ran, the head it read),
    // not the seal of the moment, which every poll of a teammate moves on.
    const throughTick = current.recoveryDriver.nextTick - 1;
    if (!Number.isInteger(replay.sealedThroughTick) || throughTick < 0 || throughTick > replay.sealedThroughTick) return false;
    const vector = current.sim.recoveryHealthVector();
    const structures = current.info.initialSnapshot.structures;
    if (!vector || structures.length !== Object.keys(vector.hpUnits).length
      || structures.some(row => !Object.hasOwn(vector.hpUnits, row.instanceId) || !Object.hasOwn(vector.basisRepairSeq, row.instanceId))) {
      current.recoveryInvalid = true; return false;
    }
    const existing = current.recoveryFinishRequest;
    const checkpointUid = existing?.checkpoint.throughTick === throughTick && existing.checkpoint.inputHeadSeq === replay.headSeq
      && existing.checkpoint.lastRepairSeq === current.recoveryLastRepairSeq ? existing.checkpoint.checkpointUid : makeActionUid();
    const body = { waveId: current.info.waveId, survived: current.result.survived, shipsSunk: current.result.shipsSunk,
      ...(current.result.bonuses?.length ? { bonuses: [...current.result.bonuses] } : {}),
      ...(current.result.rescued === true ? { rescued: true } : {}), waveProtocol: 2,
      checkpoint: { islandEpoch: current.info.initialSnapshot.islandEpoch, checkpointUid, throughTick,
        inputHeadSeq: replay.headSeq, lastRepairSeq: current.recoveryLastRepairSeq,
        basisRepairSeq: vector.basisRepairSeq, hpUnits: vector.hpUnits } };
    current.recoveryFinishRequest = body;
    current.recoveryFinishing = true;
    Promise.resolve().then(() => recoveryTransport.finishWave(body)).then(answer => {
      const recovered = answer?.data?.recovery;
      const completeClose = answer?.ok === true && validCanonicalClose(recovered, current);
      // A close answered after the next wave started still pays (and says so); a refusal then no longer matters.
      if (ctl.wave !== current && !completeClose) return;
      if (completeClose) {
        current.answer = answer.data;
        current.recoveryFinishAnswered = true;
        current.recoveryFinishPending = false;
        roundLoot(current, answer.data.loot);
        emitRecoveryFinish(current.info.waveId, answer.data, current.result.survived);
        return;
      }
      const refusal = answer?.ok === true ? { refused: true, status: 502, code: 'unreadable' }
        : answer == null ? recoveryRefusal(null) : recoveryRefusal(answer);
      const kind = refusalKind(refusal);
      const delay = refusalDelayMs(refusal, current.recoveryFinishAttempts++);
      if (kind === 'refresh') {
        // Read the journal again, then a new checkpoint; paced, so a refusal loop cannot use up the budget.
        current.recoveryFinishRequest = null;
        current.recoveryLastPollAt = -Infinity;
        current.recoveryPollRetryAt = -Infinity;
        current.recoveryFinishRetryAt = now() + delay;
      } else if (kind === 'later') {
        // An unknown outcome retries byte-for-byte with the same checkpoint UID.
        current.recoveryFinishRetryAt = now() + delay;
      } else {
        console.warn(`Recovery finish refused (${refusal.code}).`);
        current.recoveryFinishFailed = true;
        if (current.pause) current.pause.failed = true;
      }
    }).catch(error => {
      console.error(error);
      current.recoveryFinishRetryAt = now() + refusalDelayMs(null, current.recoveryFinishAttempts++);
    }).finally(() => { current.recoveryFinishing = false; });
    return true;
  }
  const emitRecoveryFinish = (waveId, data, survived, extra = {}) => emit({ type: 'wave_finish_answered', waveId, loot: data.loot ?? null, runLoot: ctl.runLoot,
    recovery: data.recovery, coins: data.coins, waveBest: data.waveBest, flags: data.flags, survived: survived === true, ...extra });
  // A friend rang the next wave before this recovery wave ended on this screen: the server closed it already
  // (a bell is refused while one runs), so our part goes in now with what this sim has; the server pays the
  // outcome of the first close. Retried under the refusal policy, never longer than a few tries.
  function handOffRecoveryFinish(current, tries = 5, extra = {}) {
    if (!current.recoveryReplay || current.recoveryFinishAnswered || current.recoveryFinishFailed || current.recoveryFinishing) return;
    const vector = current.sim.recoveryHealthVector();
    if (!vector) return;
    const result = current.result ?? current.sim.result();
    const body = { waveId: current.info.waveId, survived: result.survived === true, shipsSunk: result.shipsSunk ?? 0, waveProtocol: 2,
      checkpoint: { islandEpoch: current.info.initialSnapshot.islandEpoch, checkpointUid: makeActionUid(),
        throughTick: Math.max(0, current.recoveryDriver.nextTick - 1), inputHeadSeq: current.recoveryReplay.headSeq ?? 0,
        lastRepairSeq: current.recoveryLastRepairSeq, basisRepairSeq: vector.basisRepairSeq, hpUnits: vector.hpUnits } };
    current.recoveryFinishing = true;
    let attempt = 0;
    const send = () => Promise.resolve().then(() => recoveryTransport.finishWave(body)).then(answer => {
      if (answer?.ok === true && validCanonicalClose(answer.data?.recovery, current)) {
        current.recoveryFinishAnswered = true;
        // The old wave's loot is its own round (the island's toast says it), never the new wave's chip.
        if (Number.isFinite(answer.data.loot)) current.roundLoot = answer.data.loot;
        emitRecoveryFinish(current.info.waveId, answer.data, answer.data.survived ?? result.survived, extra);
        return;
      }
      const refusal = answer == null ? recoveryRefusal(null) : recoveryRefusal(answer);
      if (refusalKind(refusal) === 'terminal' || ++attempt >= tries) { current.recoveryFinishFailed = true; return; }
      later(send, refusalDelayMs(refusal, attempt));
    }, error => { console.error(error); if (++attempt < tries) later(send, refusalDelayMs(null, attempt)); });
    void send();
  }
  function receive(type, payload) {
    if (!ctl.wave || ctl.wave.done) return;
    // Recovery v1 accepts commands only from durable replay; the room only draws teammates' actions sooner.
    if (ctl.wave.info.recoveryVersion === 1) { if (ctl.wave.recoveryReplay) receiveCosmetic(ctl.wave, type, payload); return; }
    const entry = readMessage(type, payload, ctl.wave.info.waveId);
    if (!entry || entry.by === actorId(ctl.wave)) return;
    if (entry.input.type === 'lamps_lit') ctl.wave.lampsSent = true; // somebody else lit them first
    if(ctl.wave.schedule.add(entry, ctl.wave.ticks)!==null)noteLiveInput(entry.input);
  }

  function link() { // the names of the other parts, once every part exists (controller.js)
    ({ tagActors, receiveCosmetic, handle, roundLoot, end, stop } = ctl);
  }
  return { submit, pumpRecovery, checkpointBeforeRepair, tryRecoveryFinish, handOffRecoveryFinish, receive, link };
}
