// The wave controller's frame (controller.js): update() runs the sim to the server clock (or the replay), handles
// each tick's events (sound, the narrator, the renderer), drives the HUD, the camera, the finisher scene, the break
// and the battle guide. A closure over `ctl`.

import { waveGapMs } from '../net/live-rules.js';
import { TICK_SECONDS } from './sync.js';
import { actionAt, inputFor, promptText } from './interact.js';
import { EVENT_TEXT } from './wave-events.js';
import { createFinisherRecorder } from './finisher/input.js';
import { simulationInputFromJournal } from './recovery-transport.js';
import { MAX_TICKS_PER_FRAME, PLAYOUT_SLEW_MS, recoveryPlayoutTarget, PREDICTION_TIMEOUT_MS, PREDICTED_KINDS,
  SHOWN_LATE_SECONDS, BREAK_GRACE_MS, LOST_FALLEN, BOSS_WARNING_SECONDS, HINT_SECONDS, readHint, writeHint,
  LOST_TITLE, LOST_LINE, roundLootText, captainTarget, bladeTarget, HEART_WARN, battleZoom, battleLean,
  FINISHER_FRAME_Z, EVENT_BANNER_SECONDS, EVENT_ICONS } from './controller-shared.js';

export function createFrame(ctl) {
  const { world, getDefenses, getManaging, reducedMotion, playerId, now, place, onEvents, startNextWave, breakSeconds,
    recoveryPlayoutMs, toggleHold, createFinisherScene, easyFinishers, practiceIdentity, guideOn, createGuide, poses,
    myLevel, read, actorId, myStats, emit, cue, here, blocked } = ctl;
  // From the other parts (controller-*.js), linked once every part exists.
  let submit, pumpRecovery, catchUp, predictedCopy, tagActors, shoot, autoStrike, captainShare, bladeShare, meIn,
    isDown, sendPosition, fallenNear, holdRevive, revivePrompt, helpPrice, fallenMarks, held, next, act, finishing,
    end, stop;
  // The battle guide (guide: true, the island's controller only): landings, routes, the heart and the walls' bars;
  // faintly between waves on this island, in full during a wave. Drawing only: it reads the state, never the sim.
  function updateGuide(dt) {
    if (!guideOn || !world.scene || ctl.disposed) return;
    if (!ctl.guide) {
      if (!ctl.guideLoading) {
        ctl.guideLoading = true;
        Promise.resolve(createGuide({ scene: world.scene, reducedMotion, characterScale: () => world.scene?.userData?.characterScale ?? 1 }))
          .then(made => { if (ctl.disposed) made?.dispose(); else ctl.guide = made; }).catch(error => console.error(error));
      }
      return;
    }
    const current = ctl.wave, running = current && !current.done && !current.pause;
    const show = here() && (!current || current.pause || running);
    ctl.guide.setVisible?.(show);
    if (!show) { ctl.guide.update(null); return; }
    if (running) {
      ctl.guide.update({ mode: 'wave', lanes: current.lanes?.length ? current.lanes : null, defenses: current.defenses, stateWalls: current.state.walls,
        stateTowers: current.state.towers, towerObstacles: current.info.rules?.towerObstacles === true,
        boarders: current.state.boarders, heart: current.state.heart, wave: current.info.wave, dt });
    } else {
      const defenses = read(getDefenses, []) ?? [];
      ctl.guide.update({ mode: 'preview', lanes: null, defenses, stateWalls: null, stateTowers: null,
        managing: read(getManaging, false) === true,
        towerObstacles: current?.info.rules?.towerObstacles ?? ctl.lastTowerObstacles, boarders: [], heart: null,
        wave: (current?.info.wave ?? ctl.lastWave) + 1, dt });
    }
  }

  function handle(events, current, fresh) {
    if (current.predicted?.length) {
      fresh = fresh.filter(event => !(PREDICTED_KINDS.has(event.type) && predictedCopy(current, event)));
    }
    for (const event of events) {
      emit(event);
      if (event.type === 'wave_started') current.lanes = event.lanes ?? [];
      // For the narrator (GAME-V3.md §6): the first boarders ashore in this wave, and the heart crossing
      // below 30% (once each per wave; narrator/index.js decides what it says).
      if (event.type === 'boarder_landed' && !current.ashoreTold) {
        current.ashoreTold = true;
        emit({ type: 'boarders_ashore', wave: current.info.wave, count: Math.max(1, current.sim.state().boarders?.length ?? 1) });
      }
      if (event.type === 'island_damaged' && !current.heartTold && Number.isFinite(event.hp)) {
        const max = current.state?.maxIslandHp ?? current.sim.state().maxIslandHp;
        if (max > 0 && event.hp / max < HEART_WARN) { current.heartTold = true; emit({ type: 'heart_changed', hp: event.hp, max }); }
      }
      if (event.type === 'ship_sunk' && event.kind === 'flagship') { current.flagshipSunk = true; current.lampsRelit = event.by === 'lamps'; }
    }
    if (current.shown) { current.renderer?.events(fresh); poses.note(fresh); }
    if (current.shown) current.eventArt?.events(fresh);
    // v3 waves, for the narrator: the wave's event (its line the first time in this game) and a boss finisher.
    for (const event of fresh) {
      if (event.type === 'wave_event') emit({ type: 'wave_event_announced', event: event.event, wave: event.wave });
      else if (event.type === 'finisher_started') { emit({ type: 'finisher_moment', kind: event.kind, phase: 'start' }); cue('pirate-bell'); }
      else if (event.type === 'finisher_won') { emit({ type: 'finisher_moment', kind: event.kind, phase: 'won' }); cue('pirate-victory'); }
      else if (event.type === 'ship_spawned' && event.boss) cue('pirate-horn');
      else if (event.type === 'finisher_failed') { emit({ type: 'finisher_moment', kind: event.kind, phase: 'failed' }); cue('pirate-wall'); }
    }
    // Captain health for the narrator (GAME-V3.md §6): only what happens now, not a late joiner's catching up.
    for (const event of fresh) {
      if (event.type === 'captain_fell') emit({ type: 'player_fell', playerId: event.captainId, self: event.captainId === actorId(current) });
      else if (event.type === 'captain_revived') emit({ type: 'player_revived', playerId: event.captainId, self: event.captainId === actorId(current), by: event.by });
      else if (event.type === 'wave_ended' && event.reason === 'captains_fallen') emit({ type: 'captains_all_fallen' });
    }
    for (const event of fresh) {
      if (event.type === 'cannon_fired') {
        cue(event.manual ? 'pirate-cannon-manual' : 'pirate-cannon');
        if (!event.hit) current.splashesAt.push(event.impactAt);
      } else if (event.type === 'mortar_fired') cue('pirate-mortar');
      else if (event.type === 'harpoon_thrown') cue('pirate-harpoon'); // T4's harpoon twang
      else if (event.type === 'culverin_fired') { cue('pirate-culverin'); kick(.05); } // T43: the long gun's deep boom
      else if (event.type === 'swivel_fired') cue('pirate-musket'); // D055: the swivel nest's short crack
      else if (event.type === 'mortar_impact') { cue('pirate-mortar-impact'); cue(event.hits ? 'pirate-hit' : 'pirate-splash'); kick(.08); }
      else if (event.type === 'captain_fired') cue('pirate-musket');
      else if (event.type === 'captain_blast') { cue(event.hits ? 'pirate-hit' : 'pirate-splash'); kick(.06); } else if (event.type === 'ship_hit' && !event.blocked) cue('pirate-hit');
      else if (event.type === 'captain_struck') cue('pirate-slash'); // melee: a blade's whoosh, not the musket's crack
      else if (event.type === 'boarder_killed') cue('pirate-hit');
      else if (event.type === 'ship_sunk') { cue('pirate-sunk'); if (event.kind === 'flagship') kick(.5); }
      else if (event.type === 'wall_damaged') cue('pirate-wall');
      else if (event.type === 'island_damaged') { cue('pirate-wall'); kick(.18); }
    }
    onEvents?.(events);
  }

  function kick(amount) { if (!reducedMotion() && ctl.wave?.shown) ctl.shake = Math.max(ctl.shake, amount); }

  function update(dt = 0) {
    updateGuide(dt);
    if (ctl.disposed || !ctl.wave) return;
    const current = ctl.wave;
    pumpRecovery(current, now());
    // The island's display of structure health follows the replay, at most 4 times a second, and only while
    // a recovery wave is on (no timer outside one).
    if (current.recoveryReplay && now() - (current.recoveryPublishedAt ?? -Infinity) >= 250) {
      current.recoveryPublishedAt = now();
      emit({ type: 'recovery_combat_changed', waveId: current.info.waveId });
    }
    ctl.lastWave = current.info.wave;
    current.shown = here();
    current.renderer?.setVisible(current.shown);
    current.hud?.setVisible(current.shown);
    const elapsed = (now() + current.offset - current.info.startsAtMs) / 1000;
    if (!current.done && elapsed >= 0) {
      if (current.recoveryReplay) {
        const target = recoveryPlayoutTarget(current.recoveryRttMs, recoveryPlayoutMs), step = PLAYOUT_SLEW_MS * Math.max(0, dt);
        current.recoveryPlayoutMs += Math.max(-step, Math.min(step, target - current.recoveryPlayoutMs));
      }
      const playout = current.recoveryReplay ? current.recoveryPlayoutMs / 1000 : 0;
      const due = Math.floor((elapsed - playout) / TICK_SECONDS + 1e-6);
      let budget = MAX_TICKS_PER_FRAME;
      const events = [], recent = [];
      // v3 waves: an event is fresh by the tick it came from, not by its sim time (a finisher freezes the
      // sim's clock while real time runs on, so its outcome's t lies seconds behind).
      const lateTicks = Math.round(SHOWN_LATE_SECONDS / TICK_SECONDS);
      while (current.ticks < due && budget-- > 0 && !current.sim.done) {
        if (current.recoveryReplay) {
          const tick = current.ticks;
          const advanced = current.recoveryDriver.advanceThrough(tick, (simTick, journal) => {
            const inputs = journal.map(simulationInputFromJournal).filter(Boolean);
            // The health vector checks a paid repair's fence; a tick without one needs neither.
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
            events.push(...out); if (simTick >= due - lateTicks) recent.push(...out);
          });
          if (!advanced) break;
        } else {
          const out = current.sim.step(TICK_SECONDS, current.schedule.take(current.ticks));
          events.push(...out); if (current.ticks >= due - lateTicks) recent.push(...out);
        }
        current.ticks++;
      }
      current.state = current.sim.state();
      if (events.length) handle(events, current, recent);
      if (current.sim.done) end(current);
      if (current.recoveryReplay && !current.done) catchUp(current, due - current.ticks);
    }
    if (ctl.wave !== current) return;
    // v3 waves: the event's banner and drawing, and a running finisher's scene.
    current.hud?.event?.(current.eventId && !current.done ? { id: current.eventId, icon: EVENT_ICONS[current.eventId], ...EVENT_TEXT[current.eventId],
      open: current.state.time < EVENT_BANNER_SECONDS } : null);
    current.eventArt?.setVisible(current.shown && !current.done);
    current.eventArt?.update({ state: current.state, dt });
    updateFinisher(current, dt);
    const boss = finishing(current) ? current.state.finisher : null, standing = world.player?.position;
    if (world.camera?.userData && boss && current.shown && standing) {
      // The camera pushes in on the boss (the camera eases there; with reduced motion it simply goes).
      world.camera.userData.battleZoom = 1; world.camera.userData.battleFocus = { x: boss.x - standing.x, z: boss.z - standing.z + FINISHER_FRAME_Z };
    } else if (world.camera?.userData) {
      const data = world.camera.userData;
      if (current.shown && !current.finished) {
        data.battleZoom = battleZoom(world.camera);
        const goal = battleLean(world.player?.position, current.state, current.lanes), k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 1.2);
        current.lean.x += (goal.x - current.lean.x) * k; current.lean.z += (goal.z - current.lean.z) * k;
        data.battleFocus = current.lean;
      } else { delete data.battleZoom; delete data.battleFocus; }
    }
    // After the wave ends the sim stops, but its shells, bombs and balls in flight still land on screen: the
    // drawing clock goes on in real time instead of freezing them in the air through the break.
    const stepped = Math.max(0, Math.min(elapsed, current.ticks * TICK_SECONDS + TICK_SECONDS));
    const simTime = current.done ? (current.doneSimTime = (current.doneSimTime ?? stepped) + Math.max(0, dt)) : stepped;
    for (let i = current.splashesAt.length - 1; i >= 0; i--) if (current.splashesAt[i] <= simTime) { current.splashesAt.splice(i, 1); cue('pirate-splash'); }
    const seconds = elapsed < 0 ? Math.ceil(-elapsed) : 0;
    if (seconds !== current.lastCount) { current.lastCount = seconds; if (seconds > 0 && seconds <= 3) cue('pirate-tick'); }
    current.hud?.countdown(current.done ? 0 : Math.min(seconds, 99));
    current.hud?.boss?.(current.boss && !current.done && elapsed < BOSS_WARNING_SECONDS ? current.boss : '');
    // Only actual wave one consumes the device's first-wave hint, for its existing HINT_SECONDS window.
    if (guideOn && current.info.wave === 1 && current.hud && current.hintShown === undefined) { current.hintShown = !readHint(); if (current.hintShown) writeHint(); }
    current.hud?.goalHint?.(current.hintShown === true && !current.done && elapsed > -3 && elapsed < HINT_SECONDS);
    // "+coins" is this round's: the server's loot for this wave and this player, shown once it answered.
    current.hud?.loot?.(Number.isFinite(current.roundLoot) ? current.roundLoot : null);
    if (current.pause) updatePause(current);
    current.hud?.bar(current.done && !current.finished ? current.state : current.state.phase === 'countdown' ? countdownBar(current) : current.state);
    const player = world.player?.position;
    const stats = myStats();
    // Captain health: fallen, you lie where you fell (no walking: game.js asks captainDown too).
    const fallen = isDown(current), me = meIn(current);
    if (fallen && player) { current.pin ??= { x: player.x, z: player.z }; player.x = current.pin.x; player.z = current.pin.z; } else current.pin = null;
    sendPosition(current, player);
    const running = player && current.shown && !current.done && current.state.phase === 'running';
    const reviveTarget = running && !fallen && !blocked() ? fallenNear(current, player) : null;
    holdRevive(current, reviveTarget, player);
    current.action = !current.done && current.shown && !blocked() && player && !fallen && !finishing(current)
      ? (reviveTarget ? { kind: 'revive', targetId: reviveTarget.id, price: helpPrice(current), x: reviveTarget.x, z: reviveTarget.z }
        : withoutFreeRepair(current, actionAt({ x: player.x, z: player.z }, current.defenses, current.state, { repairReach: stats.repairReach }))) : null;
    if (current.action?.kind === 'revive') current.hud?.prompt(revivePrompt(current), true, current.revive?.share ?? 0);
    else current.hud?.prompt(promptText(current.action), !!inputFor(current.action));
    if (ctl.pressed) { ctl.pressed = false; act(); }
    if (ctl.shootPressed || ctl.shootHeld) { ctl.shootPressed = false; if (!blocked()) shoot(); }
    else if (ctl.autoBlade && running && !fallen && !blocked() && !finishing(current)) autoStrike(current, player);
    // The button: "F: Slash" (the cutlass) with a boarder in strike reach, else the equipped weapon's name (none while fallen).
    const blade = running && !!bladeTarget(player, current.state, stats.sweepRadius);
    current.hud?.musket?.(running && !fallen && !finishing(current) ? { share: blade ? bladeShare(current) : captainShare(current),
      ready: blade || !!captainTarget(player, current.state, myLevel(), stats.range), blade, label: stats.name } : null);
    current.hud?.health?.(me && !current.done && current.shown ? { hp: me.hp, maxHp: me.maxHp, down: me.down } : null);
    current.hud?.down?.(fallen && current.shown ? { seconds: Math.max(0, Math.floor(current.state.time - (me.downAt ?? current.state.time))),
      alone: !(current.state.party ?? []).some(hero => hero.id !== actorId(current) && hero.present && !hero.down) } : null);
    current.hud?.marks?.(fallenMarks(current, player));
    const captain = player && current.shown && !current.done ? { id: actorId(current), x: player.x, z: player.z, share: captainShare(current), down: fallen } : null;
    current.renderer?.update({ state: drawnState(current), simTime, dt, captain, figures: ctl.figures,
      revive: current.revive && !current.revive.paying ? { targetId: current.revive.targetId, share: current.revive.share } : null });
    if (ctl.shake > 0 && world.camera) {
      const t = now() / 1000;
      world.camera.position.x += Math.sin(t * 61) * ctl.shake * .35; world.camera.position.y += Math.cos(t * 53) * ctl.shake * .25;
      ctl.shake = Math.max(0, ctl.shake - dt * 1.6);
    }
  }
  // A running finisher: the scene (loaded once per finisher), this player's samples to the room in windows.
  function updateFinisher(current, dt) {
    const f = current.state.finisher, key = f?.active ? `${f.shipId}:${f.kind}` : null;
    if (current.finisher && current.finisher.key !== key) { current.finisher.scene?.dispose(); current.finisher = null; }
    if (!key) return;
    if (!current.finisher) {
      const players = f.players.length;
      const entry = current.finisher = { key, scene: null, recorder: createFinisherRecorder({ players, gapMs: waveGapMs(players) }) };
      if (world.container) {
        Promise.resolve(createFinisherScene({ container: world.container, me: actorId(current), easy: () => !!easyFinishers(), reducedMotion, recorder: entry.recorder,
          practiceIdentity: practiceIdentity(), onReady: () => { entry.ready = true; } }))
          .then(scene => { if (ctl.disposed || current.finisher !== entry || current.finished) scene?.dispose(); else entry.scene = scene; })
          // A scene that cannot load must not hold the whole crew in the preparation phase: say ready anyway.
          .catch(error => { console.error(error); entry.ready = true; });
      }
    }
    const entry = current.finisher;
    if (entry.scene) {
      entry.scene.element && (entry.scene.element.hidden = !current.shown);
      entry.scene.update({ finisher: f, dt, boss: world.project?.(f.x, f.z, 1.5) ?? null });
    }
    const me = actorId(current);
    if (f.phase === 'prepare' && f.players.includes(me) && (entry.ready || !world.container)
      && !f.ready.includes(me) && now() - (entry.readyAt ?? -Infinity) >= 1000) {
      entry.readyAt = now(); submit({type: 'finisher_ready', by: playerId, shipId: f.shipId});
    }
    if (!f.players.includes(me) || f.outcome || !(f.phase === 'task' || f.phase === 'grace')) return;
    const easy = !!easyFinishers();
    for (const { from, marks } of entry.recorder.take(now(), f.sample, f.tasks, { force: f.sample >= f.taskEnd })) {
      submit({ type: 'finisher_input', by: playerId, from, marks, ...(easy ? { easy: true } : {}) });
    }
  }
  const countdownBar = current => ({ wave: current.info.wave, shipsLeft: current.state.total, islandHp: current.state.islandHp, maxIslandHp: current.state.maxIslandHp });

  function updatePause(current) {
    const pause = current.pause, hold = held();
    // Paused by the room: the break keeps its full length until Resume.
    if (hold?.paused) pause.until = Math.max(pause.until, now() + breakSeconds * 1000);
    const left = Math.max(0, Math.ceil((pause.until - now()) / 1000 - 1e-9));
    pause.ready = current.answer !== undefined || pause.failed === true || current.recoveryFinishFailed === true;
    if (left <= 0 && !pause.requested && !hold?.paused) {
      if (ctl.auto && pause.ready && !pause.note) next();
      // The break is over: ring the bell again for the next wave. With Auto next on, a refused try (note)
      // or a loot answer that never came must not keep the break (and the blocked input) forever.
      else if (!ctl.auto || pause.note || now() > pause.until + BREAK_GRACE_MS) { stop(); return; }
    }
    const loot = Number.isFinite(current.answer?.loot) ? ` · 🪙 +${current.answer.loot}` : '';
    current.hud?.pause?.({ title: `Wave ${current.info.wave} won!`, line: hold?.paused ? hold.line : pause.note ?? `${current.result.shipsSunk} ${current.result.shipsSunk === 1 ? 'ship' : 'ships'} sunk${loot}`,
      seconds: hold?.paused ? 0 : left, auto: ctl.auto, ready: pause.ready && !pause.requested && !hold?.paused, paused: !!hold?.paused,
      hold: hold && toggleHold ? { label: hold.label, enabled: hold.canToggle === true } : null });
  }

  // What the wave renderer draws: the sim's state, with every wall and tower whole once an island wave is over
  // (the owner's rule of 18 Nov: the server repairs everything at the wave's end) and a paid repair the server
  // just accepted shown at once (the replayed structure_repaired confirms it a playout later).
  function drawnState(current) {
    const state = current.state;
    const ended = current.done && place !== 'pirate_point';
    const repaired = current.repairedNow;
    if (repaired) for (const [spot, at] of repaired) if (now() - at > PREDICTION_TIMEOUT_MS) repaired.delete(spot);
    if (!state || (!ended && !repaired?.size)) return state;
    const whole = item => (ended || repaired?.has(item.id)) && Number.isFinite(item.maxHp) && item.hp < item.maxHp
      ? { ...item, hp: item.maxHp, broken: false, repairing: false } : item;
    return { ...state, walls: (state.walls ?? []).map(whole), towers: (state.towers ?? []).map(whole) };
  }
  // A recovery wave changes structure HP only through the paid Repair now (D059): no E prompt that does nothing.
  const withoutFreeRepair = (current, action) => current.recoveryReplay && (action?.kind === 'repair' || action?.kind === 'rebuild') ? null : action;
  // This wave's loot, from the server's finish answer: the HUD chip, the lost banner and the run total.
  function roundLoot(current, loot) {
    if (!Number.isFinite(loot) || Number.isFinite(current.roundLoot)) return;
    current.roundLoot = loot;
    ctl.runLoot += loot;
    if (current.done && !current.pause && current.result && !current.result.survived && typeof startNextWave === 'function' && ctl.wave === current) {
      const fallenAll = current.sim.endReason === 'captains_fallen';
      current.hud?.banner(LOST_TITLE, `${fallenAll ? `${LOST_FALLEN} ` : ''}${LOST_LINE} ${roundLootText(loot)}`);
    }
  }
  function link() { // the names of the other parts, once every part exists (controller.js)
    ({ submit, pumpRecovery, catchUp, predictedCopy, tagActors, shoot, autoStrike, captainShare, bladeShare, meIn,
      isDown, sendPosition, fallenNear, holdRevive, revivePrompt, helpPrice, fallenMarks, held, next, act, finishing,
      end, stop } = ctl);
  }
  return { updateGuide, handle, update, roundLoot, link };
}
