// Recovery waves' drawing ahead of the journal (controller.js): your own shot or swing drawn and heard at once,
// told to the room so teammates draw it too, the replayed copies not drawn again, and "Catching up…" when the
// replay is behind. Drawing only: hits and damage still come from the replayed journal. A closure over `ctl`.

import { captainStats } from './captain-stats.js';
import { ROOM_EVENTS, TICK_SECONDS, readMessage, toMessage } from './sync.js';
import { COSMETIC_PER_SECOND, PREDICTION_TIMEOUT_MS, CATCH_UP_TICKS, LOST_BEAT_MS, pirateById } from './controller-shared.js';

export function createPrediction(ctl) {
  const { room, sound, now, poses, actorId, later, emit, cue } = ctl;
  // From the other parts (controller-*.js), linked once every part exists.
  let handOffRecoveryFinish, stop;
  // The tick the shooter sees (recovery waves): the sim checks reach and range at it (sim.js seenPlace).
  const seenTick = current => (current.recoveryReplay && Number.isFinite(current.state?.time)
    ? { seen: Math.max(0, Math.round(current.state.time / TICK_SECONDS)) } : {});
  // The drawing of a captain's shot before the journal replays it, for every gun: a ball at the target (single,
  // pierce), a spray over the cone, a bomb on its arc with its burst where it lands (a bomb's burst and a ball's
  // hit flash are drawn at their landing time too). Drawing only; the replayed copies are not drawn again.
  function cosmeticShot(current, by, stats, input, target, t) {
    const x = input.x, z = input.z, base = { type: 'captain_fired', t, by, level: stats.level, weapon: stats.weapon, mode: stats.mode, x, z };
    const aim = Number.isFinite(input.ax) && Number.isFinite(input.az) ? { x: input.ax, z: input.az } : target ? { x: target.x, z: target.z } : null;
    if (!aim) return null;
    if (stats.mode === 'area') {
      const d = Math.hypot(aim.x - x, aim.z - z), reach = Math.min(d, stats.range), k = d > 0 ? reach / d : 0;
      const toX = x + (aim.x - x) * k, toZ = z + (aim.z - z) * k, flight = stats.flight + reach * stats.flightPerUnit;
      later(() => drawPredicted(current, { type: 'captain_blast', t: t + flight, by: `captain:${by}`, x: toX, z: toZ, radius: stats.radius, hits: 0 },
        'pirate-splash', null), flight * 1000);
      return { ...base, toX, toZ, impactAt: t + flight, radius: stats.radius, targets: [] };
    }
    if (stats.mode === 'cone') {
      const heading = Math.atan2(aim.z - z, aim.x - x);
      return { ...base, toX: x + Math.cos(heading) * stats.range, toZ: z + Math.sin(heading) * stats.range,
        impactAt: t + stats.range / stats.shotSpeed, cone: stats.cone, heading, targets: [] };
    }
    if (!target) return null;
    const reach = Math.hypot(target.x - x, target.z - z), flight = reach / stats.shotSpeed;
    // The hit itself, flashed at its landing (the sim may still refuse it; the journal's damage is the truth).
    later(() => {
      const now2 = pirateById(current.state, target.id);
      if (!now2 || ctl.wave !== current) return;
      drawPredicted(current, target.id.startsWith('boarder_')
        ? { type: 'boarder_hit', t: t + flight, boarderId: target.id, by: `captain:${by}`, x: now2.x, z: now2.z }
        : { type: 'ship_hit', t: t + flight, shipId: target.id, kind: now2.kind, by: `captain:${by}`, x: now2.x, z: now2.z }, null, null);
    }, flight * 1000);
    return { ...base, toX: target.x, toZ: target.z, impactAt: t + flight, targets: [] };
  }
  // Recovery waves run their sim a playout behind real time and an input lands a few ticks ahead, so your own
  // shot or swing would show about a second after the press. It is drawn and heard at once instead (drawing
  // only: hits and damage still come from the replayed journal), and the replayed copy of it is not drawn again.
  // A recovery wave behind its playout (a tab that was hidden, a slow first read): say so instead of a frozen
  // picture while the replay runs 30 s of wave a frame. A wave the server closed while we were away (its seal
  // no longer moves, short of this sim's end) ends here: our finish gets the server's close, the bell is free.
  function catchUp(current, behind) {
    const catching = behind > CATCH_UP_TICKS && !current.recoveryClosed;
    if (catching !== current.catchingUp) {
      current.catchingUp = catching;
      current.hud?.banner(catching ? 'Catching up…' : '', catching ? 'Playing back the wave since you were away.' : '');
      emit({ type: 'recovery_catching_up', waveId: current.info.waveId, catching });
    }
    const replay = current.recoveryReplay;
    if (!current.recoveryClosed || current.recoveryClosedAway || !replay.complete()
      || current.recoveryDriver.nextTick <= replay.sealedThroughTick) return;
    current.recoveryClosedAway = true;
    current.hud?.banner('Wave over', 'This wave ended while you were away.');
    emit({ type: 'recovery_closed_away', waveId: current.info.waveId });
    handOffRecoveryFinish(current, { away: true });
    later(() => { if (ctl.wave === current) stop(); }, LOST_BEAT_MS);
  }
  // Your own: drawn here, and told to the room so teammates draw it at once too (input = the journal command).
  function predict(current, event, sound, input = null) {
    drawPredicted(current, event, sound, current.actorCounter);
    if (!input || !room?.send) return;
    const at = now(), sent = current.cosmeticSent;
    while (sent.length && at - sent[0] > 1000) sent.shift();
    if (sent.length >= COSMETIC_PER_SECOND) return;
    const message = toMessage({ ...input, by: actorId(current) },
      { by: actorId(current), seq: current.actorCounter, tick: current.ticks, waveId: current.info.waveId });
    if (!message) return;
    sent.push(at);
    try { if (room.send(message.type, message.payload)) emit({ type: 'recovery_cosmetic_sent', kind: message.type }); }
    catch (error) { console.error(error); }
  }
  function drawPredicted(current, event, sound, counter) {
    current.renderer?.events([event]); poses.note([event]);
    if (sound) cue(sound);
    const queue = current.predicted ??= [];
    queue.push({ type: event.type, by: event.by, target: event.boarderId ?? event.shipId ?? null,
      counter: Number.isSafeInteger(counter) ? counter : null, at: now() });
    while (queue.length > 32) queue.shift();
  }
  // The replayed copy of a drawn action (by the same captain, the same journal input when the counter is
  // known): not drawn again. A prediction the journal never replays is forgotten after a few seconds.
  function predictedCopy(current, event) {
    const queue = current.predicted;
    if (!queue?.length) return false;
    while (queue.length && now() - queue[0].at > PREDICTION_TIMEOUT_MS) queue.shift();
    const target = event.boarderId ?? event.shipId ?? null;
    const same = item => item.type === event.type && item.by === event.by && (item.target ?? null) === target;
    let index = queue.findIndex(item => same(item) && item.counter !== null && item.counter === event.actorCounter);
    if (index < 0) index = queue.findIndex(item => same(item) && (item.counter === null || !Number.isSafeInteger(event.actorCounter)));
    if (index < 0) return false;
    queue.splice(index, 1);
    return true;
  }
  // The journal command behind a captain's shot or swing in one tick: its actor counter, for predictedCopy.
  function tagActors(out, journal) {
    for (const event of out) {
      if (event.type !== 'captain_fired' && event.type !== 'captain_struck') continue;
      const kind = event.type === 'captain_fired' ? 'captain_shot' : 'captain_strike';
      const source = journal.find(item => item.participantToken === event.by && item.payload?.command?.type === kind);
      if (Number.isSafeInteger(source?.payload?.actorCounter)) event.actorCounter = source.payload.actorCounter;
    }
  }
  // A teammate's shot or swing from the room, drawn at once (drawing only: hits, damage, kills, HP and loot
  // come from the replayed journal). Validated, from a participant of this wave, at most 8 a second each.
  function receiveCosmetic(current, type, payload) {
    if (type !== ROOM_EVENTS.captain_shot && type !== ROOM_EVENTS.captain_strike) return;
    const entry = readMessage(type, payload, current.info.waveId);
    if (!entry || entry.by === actorId(current) || !current.shown || current.state?.phase !== 'running') return;
    if (!participantOf(current, entry.by)) return;
    const at = now(), heard = current.cosmeticHeard.get(entry.by) ?? [];
    while (heard.length && at - heard[0] > 1000) heard.shift();
    if (heard.length >= COSMETIC_PER_SECOND) return;
    heard.push(at); current.cosmeticHeard.set(entry.by, heard);
    const input = entry.input, t = current.ticks * TICK_SECONDS, state = current.state;
    if (input.type === 'captain_shot') {
      const stats = captainStats(input.level, input.skills, input.weapon, { recoveryVersion: 1 });
      const event = cosmeticShot(current, entry.by, stats, input, pirateById(state, input.targetId), t);
      if (!event) return;
      drawPredicted(current, event, stats.mode === 'area' ? null : 'pirate-musket', entry.seq);
    } else {
      const boarder = pirateById(state, input.targetId);
      if (!boarder) return;
      const stats = captainStats(input.level, input.skills, 'musket', { recoveryVersion: 1 });
      drawPredicted(current, { type: 'captain_struck', t, by: entry.by, targetId: boarder.id, level: input.level,
        radius: stats.sweepRadius, x: input.x, z: input.z, toX: boarder.x, toZ: boarder.z }, 'pirate-slash', entry.seq);
    }
    emit({ type: 'recovery_cosmetic_drawn', by: entry.by, kind: type });
  }
  const participantOf = (current, token) => current.info.initialSnapshot?.participants?.some(item => item?.participantToken === token)
    || current.recoveryReplay.participantTokens().has(token);
  function link() { // the names of the other parts, once every part exists (controller.js)
    ({ handOffRecoveryFinish, stop } = ctl);
  }
  return { seenTick, cosmeticShot, catchUp, predict, drawPredicted, predictedCopy, tagActors, receiveCosmetic, link };
}
