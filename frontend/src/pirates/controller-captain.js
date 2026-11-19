// The player's captain in a wave (controller.js): the gun (a target, the nearest, free aim), the cutlass and the
// automatic blade, the position sent to the sims, holding E to revive a fallen teammate, the timers over fallen
// captains, and the break's Next wave / Auto next and the E action and taps. A closure over `ctl`.

import { CONFIG, hasTavern, revivePrice } from './sim.js';
import { waveGapMs } from '../net/live-rules.js';
import { INPUT_LEAD_TICKS, TICK_SECONDS } from './sync.js';
import { boarderAt, inputFor, shipAt, tapInput } from './interact.js';
import { AIM_RADIUS, MOVE_EVERY_MS, HEARD_EVERY_MS, RECOVERY_HEARD_EVERY_MS, MOVE_STEP, NOTE_MS, captainTarget,
  bladeTarget, AUTO_BLADE, pirateById } from './controller-shared.js';

export function createCaptainActions(ctl) {
  const { world, getDefenses, playerId, now, captainColour, startNextWave, saveAuto, holdBreak, reviveCaptain, poses,
    myLevel, read, mySkills, actorId, myStats, emit, cue, here, blocked, rangeFeedback } = ctl;
  // From the other parts (controller-*.js), linked once every part exists.
  let submit, seenTick, cosmeticShot, predict, drawPredicted, finishing;
  // The captain's gun: at a ship or boarder (a tap) or the nearest in range (F), from where the player
  // stands. A boarder within cutlass reach gets the cutlass instead (close quarters, §12). A spray
  // (blunderbuss) and a bomb (fire bombs) also carry the aim point: the target's place.
  // The guided start (T52) waits for your own attack: captain_attack {weapon: 'gun' | 'cutlass'} (not the automatic blade).
  const attacked = (weapon, ok) => { if (ok) emit({ type: 'captain_attack', weapon }); return ok; };
  const rangeAttempt = (message, point = null, blade = false) => rangeFeedback.attempt({ nowMs: now(), message,
    point: point ? { x: point.x, z: point.z } : null, blade });
  function shoot(targetId = null) {
    const player = world.player?.position;
    if (!ctl.wave || ctl.wave.done || !player || !here() || isDown(ctl.wave) || finishing(ctl.wave)) return false;
    const stats = myStats(), state = ctl.wave.state;
    const named = targetId ? pirateById(state, targetId) : null;
    ctl.wave.handAt = ctl.wave.ticks * TICK_SECONDS; // an attack of yours: the automatic cutlass waits (D052)
    // Close quarters: the named boarder in reach, else (F, or a tap on a boarder further away) the nearest boarder
    // in reach. A musket at point blank is no use with a pirate in your face.
    const isBoarder = named?.id?.startsWith('boarder_');
    const close = isBoarder && Math.hypot(named.x - player.x, named.z - player.z) <= stats.sweepRadius
      ? named : !targetId || isBoarder ? bladeTarget(player, state, myStats().sweepRadius) : null;
    if (close) {
      const ok = strike(close);
      rangeAttempt(ok ? 'Slash' : 'Reloading', close, true);
      return attacked('cutlass', ok);
    }
    const target = targetId ? named : captainTarget(player, state, myLevel(), stats.range);
    if (!target || Math.hypot(target.x - player.x, target.z - player.z) > stats.range) {
      rangeAttempt(target ? 'Out of range · move closer' : 'No enemy in range', target);
      return false;
    }
    return attacked('gun', fireAt(stats, player, target, { x: target.x, z: target.z }));
  }
  function fireAt(stats, player, target, point) {
    const t = ctl.wave.ticks * TICK_SECONDS;
    if (t - ctl.wave.captainAt < stats.reload) { rangeAttempt('Reloading', point); return false; }
    const round = value => Math.round(value * 100) / 100;
    const aimed = stats.mode === 'cone' || stats.mode === 'area' ? { ax: round(point.x), az: round(point.z) } : {};
    const input = { type: 'captain_shot', by: playerId, targetId: target?.id ?? null, level: stats.level, skills: mySkills(), weapon: stats.weapon,
      x: round(player.x), z: round(player.z), ...aimed, ...seenTick(ctl.wave) };
    if (!submit(input)) { rangeAttempt('Shot not sent · try again', point); return false; }
    const beyond = Math.hypot(point.x - player.x, point.z - player.z) > stats.range;
    rangeAttempt(stats.mode === 'area' ? beyond ? 'Throw limited to ring' : 'Bomb thrown'
      : stats.mode === 'cone' && beyond ? 'Spray limited to ring' : 'Shot fired', point);
    ctl.wave.captainAt = t + INPUT_LEAD_TICKS * TICK_SECONDS;
    if (ctl.wave.recoveryReplay) {
      const event = cosmeticShot(ctl.wave, actorId(ctl.wave), stats, input, target, t);
      if (event) predict(ctl.wave, event, stats.mode === 'area' ? null : 'pirate-musket', input);
    }
    return true;
  }
  // Free aim (owner, 11 Nov: "shooting when not pressing on something"): a click or tap anywhere fires
  // your gun that way. A single or piercing shot hits the ship or boarder tapped, else the one in range
  // nearest to the aim point (within AIM_RADIUS of it); with none there the shot is a visible miss on this
  // screen only (nothing to sync). A spray and a bomb always fly towards the aim point (the sim finds the
  // hits, ships and boarders alike).
  function aimAt(point, target) {
    const player = world.player?.position;
    if (!ctl.wave || ctl.wave.done || !point || !player || !here() || ctl.wave.state.phase !== 'running' || isDown(ctl.wave) || finishing(ctl.wave)) return false;
    const stats = myStats();
    ctl.wave.handAt = ctl.wave.ticks * TICK_SECONDS; // an attack of yours: the automatic cutlass waits (D052)
    if (stats.mode === 'cone' || stats.mode === 'area') return attacked('gun', fireAt(stats, player, target ?? null, target ?? point));
    const inRange = item => Math.hypot(item.x - player.x, item.z - player.z) <= stats.range;
    let hit = target && inRange(target) ? target : null;
    if (!hit) {
      let best = AIM_RADIUS;
      for (const item of [...(ctl.wave.state.boarders ?? []), ...ctl.wave.state.ships]) {
        const d = Math.hypot(item.x - point.x, item.z - point.z);
        if (d <= best && inRange(item)) { best = d; hit = item; }
      }
    }
    if (hit) return shoot(hit.id);
    const t = ctl.wave.ticks * TICK_SECONDS;
    if (t - ctl.wave.captainAt < stats.reload) { rangeAttempt('Reloading', target ?? point); return false; }
    rangeAttempt(Math.hypot(point.x - player.x, point.z - player.z) > stats.range
      ? 'Out of range · move closer' : 'No target at aim point', target ?? point);
    ctl.wave.captainAt = t;
    const dx = point.x - player.x, dz = point.z - player.z, length = Math.hypot(dx, dz) || 1, reach = Math.min(length, stats.range);
    const toX = player.x + dx / length * reach, toZ = player.z + dz / length * reach;
    const shot = [{ type: 'captain_fired', t, by: actorId(ctl.wave), level: stats.level, weapon: stats.weapon, mode: stats.mode,
      x: player.x, z: player.z, toX, toZ, impactAt: t + reach / stats.shotSpeed, miss: true, targets: [] }];
    ctl.wave.renderer?.events(shot); poses.note(shot);
    cue('pirate-musket');
    return attacked('gun', true);
  }
  // The cutlass: one blow at a boarder within reach, synced as captain_strike with your skills (Brawler:
  // the sim scales damage and reload and sweeps with them; the reload here matches it).
  const bladeReload = () => CONFIG.captain.cutlass.reload * myStats().strikeReloadMultiplier;
  function strike(boarder, reload = bladeReload()) {
    const player = world.player?.position, t = ctl.wave.ticks * TICK_SECONDS;
    if (t - ctl.wave.bladeAt < reload - 1e-9) return false;
    const input = { type: 'captain_strike', by: playerId, targetId: boarder.id, level: myLevel(), skills: mySkills(),
      x: Math.round(player.x * 100) / 100, z: Math.round(player.z * 100) / 100, ...seenTick(ctl.wave) };
    if (!submit(input)) return false;
    ctl.wave.bladeAt = t + INPUT_LEAD_TICKS * TICK_SECONDS;
    if (ctl.wave.recoveryReplay) {
      predict(ctl.wave, { type: 'captain_struck', t, by: actorId(ctl.wave), targetId: boarder.id, level: myLevel(),
        radius: myStats().sweepRadius, x: input.x, z: input.z, toX: boarder.x, toZ: boarder.z }, 'pirate-slash', input);
      // The blade's hit next to you, at once (the replayed boarder_hit is not flashed again).
      drawPredicted(ctl.wave, { type: 'boarder_hit', t, boarderId: boarder.id, by: `captain:${actorId(ctl.wave)}`, blade: true, x: boarder.x, z: boarder.z },
        null, null);
    }
    return true;
  }
  // Close quarters (D052): with a boarder in cutlass reach and no attack of yours for AUTO_BLADE.after seconds, your
  // captain swings by themself every AUTO_BLADE.reload seconds (slower than your own F). The same captain_strike.
  function autoStrike(current, player) {
    const t = current.ticks * TICK_SECONDS, target = bladeTarget(player, current.state, myStats().sweepRadius);
    if (!target || t - (current.handAt ?? -Infinity) < AUTO_BLADE.after - 1e-9) return false;
    return strike(target, Math.max(bladeReload(), AUTO_BLADE.reload));
  }
  function captainShare(current) {
    const reload = myStats().reload, t = current.ticks * TICK_SECONDS;
    return Math.max(0, Math.min(1, (t - current.captainAt) / reload));
  }
  function bladeShare(current) {
    const t = current.ticks * TICK_SECONDS;
    return Math.max(0, Math.min(1, (t - current.bladeAt) / bladeReload()));
  }

  // Captain health (GAME-V3.md §3).
  const meIn = current => current?.state?.party?.find(hero => hero.id === actorId(current)) ?? null;
  const isDown = current => !!current && !current.done && meIn(current)?.down === true;
  const colourNow = () => { const value = Number(read(captainColour, 0)); return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0; };
  const roomSize = current => Math.max(1, current.state.party?.length ?? 1);
  // A position may wait in the room's send queue for one gap, so it is stamped that much further ahead:
  // it still arrives before its tick on every screen.
  const moveLead = current => INPUT_LEAD_TICKS + Math.ceil(waveGapMs(roomSize(current)) / 1000 / TICK_SECONDS);
  // Your position for the sims: after a move (MOVE_STEP) once the gap passed, else at least every
  // HEARD_EVERY_MS; once `away` when the island is no longer on screen (another place) during the wave.
  function sendPosition(current, player) {
    if(current.info.nativeShared && !ctl.controls(current))return;
    if (current.done || current.state.phase !== 'running' || finishing(current)) return; // v3 waves: no moves while the battle stands still
    if (!current.shown || !player) {
      if(current.info.nativeShared)return;
      if (current.moveSent && !current.awaySent && submit({ type: 'captain_move', by: playerId, ...current.moveSent, away: true }, moveLead(current))) current.awaySent = true;
      return;
    }
    const t = now(), gap = Math.max(MOVE_EVERY_MS, 2 * waveGapMs(roomSize(current)));
    const at = current.pin ?? player; // a fallen captain lies where they fell
    const moved = !current.moveSent || current.awaySent || Math.hypot(at.x - current.moveSent.x, at.z - current.moveSent.z) >= MOVE_STEP;
    const heard = current.recoveryReplay ? RECOVERY_HEARD_EVERY_MS : HEARD_EVERY_MS;
    if (t - current.moveSentAt < (moved ? gap : Math.max(gap, heard))) return;
    const round = value => Math.round(value * 100) / 100, x = round(at.x), z = round(at.z);
    if (!submit({ type: 'captain_move', by: playerId, x, z, colour: colourNow() }, moveLead(current))) return;
    current.moveSentAt = t; current.moveSent = { x, z }; current.awaySent = false;
  }
  // The fallen teammate within revive reach of where you stand (never yourself), or null.
  function fallenNear(current, player) {
    let best = null, near = CONFIG.health.revive.reach;
    for (const hero of current.state.party ?? []) {
      if (!hero.down || !hero.present || hero.id === actorId(current)) continue;
      const d = Math.hypot(hero.x - player.x, hero.z - player.z);
      if (d <= near) { best = hero; near = d; }
    }
    return best;
  }
  // Holding E (or the prompt) next to a fallen teammate: after revive.hold seconds the server charges you
  // (reviveCaptain). Recovery payment includes its journal event; legacy revival goes to the room.
  // Let go or walk off and it starts over; after a
  // refusal, let go before trying again.
  function holdRevive(current, target, player) {
    const holding = (ctl.holdE || ctl.holdPrompt) && !blocked();
    if (!holding) current.reviveWait = false;
    if (current.revive?.paying) return;
    if (!target || !holding || current.reviveWait) { current.revive = null; return; }
    const t = now();
    if (current.revive?.targetId !== target.id) current.revive = { targetId: target.id, since: t, share: 0, paying: false };
    current.revive.share = Math.min(1, (t - current.revive.since) / (myStats().reviveHold * 1000)); // a medic holds 1.2 s, not 2
    if (current.revive.share < 1) return;
    current.revive.paying = true; current.reviveWait = true;
    const round = value => Math.round(value * 100) / 100, at = { x: round(player.x), z: round(player.z) };
    // The tick of the fall: the sim keeps it in seconds of 50 ms ticks, the same on every screen.
    const downAt = Math.max(0, Math.round((target.downAt ?? 0) / TICK_SECONDS));
    const recovery = current.recoveryReplay ? { waveProtocol: 2, ...at } : {};
    Promise.resolve().then(() => (reviveCaptain ? reviveCaptain({ waveId: current.info.waveId, fallen: target.id, downAt, ...recovery }) : null)).then(answer => {
      if (ctl.wave !== current) return;
      if (current.recoveryReplay && answer?.journaled !== true) throw new Error('The revival was not confirmed. Try again.');
      current.revive = null;
      // A recovery payment already committed the journal effect. Replay applies it, including after reload.
      if (!current.recoveryReplay) submit({ type: 'captain_revive', by: playerId, targetId: target.id, skills: mySkills(), ...at });
    }).catch(error => {
      if (ctl.wave !== current) return;
      current.revive = null;
      current.reviveNote = { text: error?.message || 'That did not work. Try again.', until: now() + NOTE_MS };
    });
  }
  function revivePrompt(current) {
    if (current.reviveNote && now() < current.reviveNote.until) return current.reviveNote.text;
    current.reviveNote = null;
    if (current.revive?.paying) return 'Helping up…';
    return `Hold to help up · 🪙 ${helpPrice(current)}`;
  }
  // A Tavern on the island (GAME-V3.md "Houses") takes 25% off; the server checks the island's buildings as
  // they are now, so the island's latest answer decides, else the wave's own defenses.
  const helpPrice = current => revivePrice(current.info.wave, { tavern: hasTavern(getDefenses() ?? current.defenses) });
  // The timers over fallen captains (yours where you lie, a teammate's where their sim has them).
  function fallenMarks(current, player) {
    if (!world.project || current.done || !current.shown) return [];
    const marks = [];
    for (const hero of current.state.party ?? []) {
      if (!hero.down || !hero.present) continue;
      const mine = hero.id === actorId(current), at = mine && current.pin ? current.pin : hero;
      const point = world.project(at.x, at.z, 2.6);
      if (point) marks.push({ id: hero.id, x: point.x, y: point.y, seconds: Math.max(0, Math.floor(current.state.time - (hero.downAt ?? current.state.time))), mine });
    }
    return marks;
  }

  // The break after a won wave.
  function setAuto(value) { ctl.auto = value === true; saveAuto(ctl.auto); }
  const held = () => { try { return holdBreak?.() ?? null; } catch { return null; } };
  function next() {
    const current = ctl.wave;
    if (current?.recoveryReplay && !current.recoveryFinishAnswered && !current.recoveryFinishFailed) return false;
    if (!current?.pause || !current.pause.ready || current.pause.requested || !startNextWave) return false;
    if (held()?.paused) return false; // the room paused the break: Resume first
    current.pause.requested = true;
    Promise.resolve().then(() => startNextWave({ wave: current.info.wave + 1, waveId: current.info.waveId })).then(answer => {
      if (ctl.wave !== current || answer?.ok !== false) return;
      // Refused (a wave already runs there, the server is away): say so and let the player try again.
      current.pause.requested = false; current.pause.note = answer.message || 'That did not work. Try again.';
    }).catch(error => {
      if (ctl.wave !== current) return;
      current.pause.requested = false; current.pause.note = error?.message || 'That did not work. Try again.';
    });
    return true;
  }

  function act() {
    if (!ctl.wave || blocked() || !here() || isDown(ctl.wave) || finishing(ctl.wave)) return;
    const input = inputFor(ctl.wave.action);
    // A repair or a rebuild carries your skills (Shipwright: faster repairs, Master shipwright rebuilds to 60%).
    if (input) submit(input.type === 'repair' || input.type === 'rebuild' ? { ...input, skills: mySkills() } : input);
  }
  function tap(clientX, clientY) {
    if (!ctl.wave || ctl.wave.done || blocked() || !here() || !world.unproject || isDown(ctl.wave) || finishing(ctl.wave)) return;
    const point = world.unproject(clientX, clientY), boarder = point && boarderAt(point, ctl.wave.state);
    if (boarder) { if (!shoot(boarder.id)) aimAt(point, boarder); return; } // a boarder: cutlass or musket
    const ship = point && shipAt(point, ctl.wave.state);
    const input = ctl.wave.action?.kind === 'fire' ? tapInput(ctl.wave.action, ship, ctl.wave.state) : null;
    if (input) submit(input);
    else aimAt(point, ship); // not manning a cannon (or out of its reach): your gun
  }
  function link() { // the names of the other parts, once every part exists (controller.js)
    ({ submit, seenTick, cosmeticShot, predict, drawPredicted, finishing } = ctl);
  }
  return { shoot, aimAt, autoStrike, captainShare, bladeShare, meIn, isDown, sendPosition, fallenNear, holdRevive,
    revivePrompt, helpPrice, fallenMarks, setAuto, held, next, act, tap, link };
}
