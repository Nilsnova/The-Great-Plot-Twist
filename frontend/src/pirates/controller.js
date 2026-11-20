// One pirate wave from the bell to the loot (lanes P3 to P5). Listens to `wave_started_server` (the
// island lane emits it once the start or join route answered), builds the deterministic sim from the
// server's seed, wave, weather and flagship, waits for startsAt (server time), runs the sim tick by
// tick on that clock, draws it, takes the player's shots and repairs (sent to the room and applied in
// sync, see sync.js), and when the sim is done calls finishWave once (again after waitSeconds on
// 409 wave_too_early), emits `wave_finished`, plays wave_won or wave_lost and cleans up.
//
// The run (TOWER-DEFENSE.md §1): with startNextWave given, a won wave opens an 8-second break with a big
// "Next wave" button and the "Auto next wave" switch (kept in localStorage); the button, or the end of the
// break with the switch on, calls startNextWave() (the island's start route), whose wave_started_server
// starts the next wave. A lost wave ends the run. The HUD keeps a running "Loot this run".
// For the narrator it emits boarders_ashore {wave, count} when the first boarders land in a wave and
// heart_changed {hp, max} when the heart's ♥ crosses below 30% (HEART_WARN), once each per wave.
// The game's Pause (GAME-V3.md §2): holdBreak() says whether the room paused the break ({paused, line, label,
// canToggle} or null); while paused the break stays open, Auto next and "Next wave" wait, and the card shows
// "Paused by <name>"; toggleHold() is the card's Pause / Resume button.
// The captain (§10): click or tap a ship in range, or press F for the nearest, to fire your gun
// (captainLevel(), captainSkills() and captainWeapon(): your own level, skills §14 and weapon §15, whose
// numbers come from captain-stats.js), sent to the room like a cannon shot. A click anywhere else aims
// there (free aim): the ship or boarder in range nearest the aim point, a spray or a bomb towards it.
// Boarders (§12) are targets too, and with one within cutlass reach F (or the button, or a tap on any boarder)
// swings the cutlass at the nearest one instead (its damage and reload scaled by the Brawler skills), synced the
// same way. Close quarters (D052): a boarder in reach and no attack of yours for AUTO_BLADE.after seconds, and your
// captain swings by themself, slower (AUTO_BLADE.reload); it is a normal captain_strike input, so every sim agrees.
// Captain health (GAME-V3.md §3): while the wave runs and you are on its island, your position goes to the
// room as captain_move (every MOVE_EVERY_MS or 2 × the room's wave gap when you moved, at least every
// HEARD_EVERY_MS), so every sim lets the same boarders go for you. At 0 hp you fall: you cannot move, shoot
// or build (the world asks captainDown), the HUD says so with a timer. Next to a fallen teammate, hold E (or
// the prompt) for 2 s: reviveCaptain({waveId, fallen, downAt}) pays 20 + 5 × wave on the server (downAt: the
// tick of the fall, the same on every screen, so two helpers of one fall pay once), then the revive
// goes to the room (captain_revive). For the narrator: player_fell {playerId, self}, player_revived
// {playerId, self, by} and captains_all_fallen {} (every captain down: the wave is lost).
//
//   const waves = createWaveController({bus, world, getDefenses, finishWave, room, sound, reducedMotion, quality});
//   waves.update(dt)   every frame (mountPirates drives it)       waves.start(info)  without the bus
//   waves.fire(cannonId, targetId) / waves.repair(wallId) / waves.lampsLit()      waves.dispose()
//   waves.shoot(targetId?) the captain's gun   waves.aim({x, z}) free aim   waves.next() / waves.setAuto(on)  the break
//   waves.captainDown  true while your captain has fallen          waves.revive  {targetId, share} while you hold E
//
// world: {scene, camera, canvas, container, player: {position}, place(): current place id,
//   isBlocked(): an overlay is open, unproject(clientX, clientY): logical {x, z}, project(x, z, lift): the
//   point on screen {x, y} in px of the container (the timers over fallen captains)}; every field optional.
// room: {send(type, payload), on(type, handler) -> unsubscribe}, the island's or Pirate Point's live room.
//
// This file builds the controller: its options, its mutable state (one object `ctl` shared by the parts), the key
// and pointer wiring, start() and the public API. The parts live beside it, one job each, each a closure over ctl:
//   controller-shared.js     the module-level constants and pure helpers (readWaveInfo, captainTarget, battleLean, ...)
//   controller-transport.js  inputs out and in: submit() and the room's messages (legacy waves), the recovery
//                            journal (flush, poll, replay, checkpoints, the terminal close and its finish)
//   controller-predict.js    recovery waves' own and teammates' shots and swings drawn at once, and catching up
//   controller-captain.js    the captain's gun, aim and cutlass, position, revive, and the break's buttons
//   controller-frame.js      every frame: update(), the events of a tick (sound, narrator), the HUD, the guide
//   controller-finish.js     a wave's end: settle, the finish call and its retries, the cutscene, stop
import { createPoses } from './poses.js';
import { createLiveAttackFeedback } from './live-attack-feedback.js';
import { createWave } from './sim.js';
import {sameFrozenNativeWave} from '../island/shared-wave-shapes.js';
import { waveGapMs } from '../net/live-rules.js';
import { captainStats, readSkills, readWeapon } from './captain-stats.js';
import { ROOM_EVENTS, createInputSchedule } from './sync.js';
import { eventFor } from './wave-events.js';
import { withHealth } from './wall-health.js';
import { isParticipantToken, readRecoveryPolicy } from './recovery-policy.js';
import { readRecoverySnapshot, recoveryWaveDefenses } from './recovery-snapshot.js';
import { createReplayDriver, createWaveReplay } from './wave-replay.js';
import { createRangeFeedback } from './range-feedback.js';
import { createDangerFeedback } from './danger-feedback.js';
import { RECOVERY_PLAYOUT_MS, RECOVERY_RTT_START_MS, canonicalJson, bossText, BREAK_SECONDS, readAuto, writeAuto,
  readWaveInfo, defaultCutscene, defaultRenderer, defaultHud, defaultGuide, defaultEventArt, defaultFinisherScene,
  readEasy } from './controller-shared.js';
import { createTransport } from './controller-transport.js';
import { createPrediction } from './controller-predict.js';
import { createCaptainActions } from './controller-captain.js';
import { createFrame } from './controller-frame.js';
import { createFinish } from './controller-finish.js';
import {readEconomy,sameEconomyScope} from '../island/economy-view.js';
import {validSessionProof} from '../island/shared-session-shapes.js';

export { RECOVERY_PLAYOUT_MS, RECOVERY_PLAYOUT_MIN_MS, recoveryPlayoutTarget, COSMETIC_PER_SECOND, MOVE_EVERY_MS,
  HEARD_EVERY_MS, RECOVERY_HEARD_EVERY_MS, LOST_FALLEN, bossText, BREAK_SECONDS, AUTO_KEY, HINT_KEY, HINT_SECONDS,
  LOST_TITLE, LOST_LINE, roundLootText, captainTarget, bladeTarget, AUTO_BLADE, HEART_WARN, battleZoom, battleLean,
  readWaveInfo, tooEarlyWait, FINISH_RETRY_SECONDS, finishRetryWait, FINISHER_FRAME_Z, EVENT_BANNER_SECONDS,
  EVENT_ICONS } from './controller-shared.js';

export function createWaveController({ bus, world = {}, getDefenses = () => [], getManaging = () => false, finishWave = async () => null, room = null,
  sound = null, reducedMotion = () => false, quality = () => 'high', playerId = `p-${Math.random().toString(36).slice(2, 10)}`,
  now = () => Date.now(), serverOffset = () => 0, place = null, accept = info => info.flagship !== true, listen = true,
  simOptions = {}, beamFrom = null, cutsceneFor = (result, summary) => (summary.lampsRelit ? 'lamps_relit' : result.survived ? 'wave_won' : 'wave_lost'),
  playCutscene = defaultCutscene(world, reducedMotion), createRenderer = defaultRenderer, createHud = defaultHud,
  setTimer = (run, ms) => setTimeout(run, ms), clearTimer = id => clearTimeout(id), onEvents = null,
  getCrew = () => null, captainLevel = () => 1, captainSkills = () => [], captainWeapon = () => 'musket', captainColour = () => 0,
  startNextWave = null, breakSeconds = BREAK_SECONDS, recoveryPlayoutMs = RECOVERY_PLAYOUT_MS,
  loadAuto = readAuto, saveAuto = writeAuto, holdBreak = null, toggleHold = null, reviveCaptain = null,
  createEventArt = defaultEventArt, createFinisherScene = defaultFinisherScene, easyFinishers = readEasy, practiceIdentity = () => null,
  guide: guideOn = false, createGuide = defaultGuide, recoveryTransport = null, inspectDefenses = false, getSessionProof = () => null,
  completeRevival=async()=>({ok:false,code:'economy_path_unavailable'}),getSessionSettings=()=>null,setSessionSettings=async()=>({ok:false}) } = {}) {
  // The captains' poses (src/pirates/poses.js): your character and the teammates' figures fire in their own body.
  const poses = createPoses({ now: () => now() / 1000 });
  const rangeFeedback = createRangeFeedback(), dangerFeedback = createDangerFeedback();
  // The controller's mutable state, shared by its parts (controller-*.js) as ctl.wave, ctl.runLoot, ...: the wave on
  // screen, the keys held, the run's loot, the overrides of the captain's level, skills and weapon, the guide.
  const ctl = { wave: null, disposed: false, pressed: false, shootPressed: false, shootHeld: false, down: null, shake: 0,
    holdE: false, holdPrompt: false, // E or the prompt held down (a revive)
    figures: null, // the presence figures' positions of the other captains (setFigures)
    runLoot: 0, auto: !!loadAuto(), level: null, skills: null, weapon: null,
    guide: null, guideLoading: false, lastWave: 0, lastTowerObstacles: false,
    autoBlade: true, rangePreview: false }; // the browser checks turn it off to let a captain fall on purpose (controller.autoBlade)
  const frozenCaptain=()=>ctl.wave?.info.nativeShared?ctl.wave.info.initialSnapshot.participants.find(row=>row.participantToken===ctl.wave.info.participantToken)?.captain:null;
  const myLevel = () => { const value = Number(frozenCaptain()?.level ?? ctl.level ?? captainLevel()); return Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1; };
  const read = (get, fallback) => { try { return get(); } catch { return fallback; } };
  const mySkills = () => readSkills(frozenCaptain()?.skills ?? ctl.skills ?? read(captainSkills, []));
  const myWeapon = () => readWeapon(frozenCaptain()?.weapon ?? ctl.weapon ?? read(captainWeapon, 'musket'));
  const controls=current=>{
    if(!current?.info.nativeShared)return true;
    if(current.info.spectator)return false;
    try{const proof=getSessionProof();return validSessionProof(proof) && proof.sessionId===current.info.controlSessionId
      && sameEconomyScope(proof.origin,current.info.initialSnapshot.economy);}catch{return false;}
  };
  // "Me" in the sim: a recovery wave names its captains by participant token, every other wave by playerId.
  const actorId = current => current?.info?.recoveryVersion === 1 ? current.info.participantToken : playerId;
  // Your gun's numbers now: level, skills and the equipped weapon (captain-stats.js).
  const myStats = () => captainStats(myLevel(), mySkills(), myWeapon(),
    { recoveryVersion: ctl.wave?.info.recoveryVersion === 1 ? 1 : 0 });
  const timers = new Set(), stops = [];
  const later = (run, ms) => { const id = setTimer(() => { timers.delete(id); if (!ctl.disposed) run(); }, ms); timers.add(id); return id; };
  const emit = event => { try { bus?.emit?.(event); } catch (error) { console.error(error); } };
  const cue = name => { if (ctl.wave?.shown) sound?.cue?.(name); };
  // No place on screen (null: the front door's open water) is not here; a world without place() always is.
  const here = () => !place || (world.place ? world.place() : place) === place;
  const blocked = () => !!world.isBlocked?.();
  const canInspect = current => inspectDefenses && current?.shown && here() && !current.done
    && current.state.phase === 'running' && !isDown(current) && !finishing(current)
    && !current.catchingUp && !current.recoveryInvalid && current.state.towers.length > 0;
  const focusCanvas = () => world.canvas?.focus?.({preventScroll: true});
  function closeDefenseInspection(current, restoreFocus = false) {
    if (!current?.defenseSelection) return false;
    current.defenseSelection = null;
    current.hud?.inspectDefense?.(null);
    if (restoreFocus) focusCanvas();
    return true;
  }
  function openDefenseInspection() {
    const current = ctl.wave;
    if (!canInspect(current)) return false;
    const options = current.state.towers.map(({id,kind,level}) => ({id,kind,level}));
    current.defenseSelection = {id: options[0].id, options};
    return true;
  }
  function updateDefenseInspection(current, active, danger) {
    const selected = current.defenseSelection;
    if (!selected) return null;
    const coverage = active && !danger?.critical && canInspect(current) ? current.sim.attackCoverage(selected.id) : null;
    if (!coverage) { closeDefenseInspection(current); return null; }
    current.hud?.inspectDefense?.({options: selected.options, coverage});
    return coverage;
  }
  function clearLiveFeedback(){
    closeDefenseInspection(ctl.wave);
    if(ctl.wave){ctl.wave.liveFeedback.clear();ctl.wave.feedbackReady=false;}
    poses.clear();
  }
  function noteLiveInput(input){
    if(ctl.wave?.feedbackReady&&here()&&globalThis.document?.hidden!==true)ctl.wave.liveFeedback.note(input);
  }
  if(bus?.on)stops.push(bus.on('travel',clearLiveFeedback));
  const feedbackDocument=globalThis.document;
  if(feedbackDocument?.addEventListener){
    const hidden=()=>{if(feedbackDocument.hidden)clearLiveFeedback();};
    feedbackDocument.addEventListener('visibilitychange',hidden);
    stops.push(()=>feedbackDocument.removeEventListener('visibilitychange',hidden));
  }
  Object.assign(ctl, { bus, world, getDefenses, getManaging, finishWave, room, sound, reducedMotion, quality,
    playerId, now, serverOffset, place, accept, listen, simOptions, beamFrom, cutsceneFor, playCutscene,
    createRenderer, createHud, setTimer, clearTimer, onEvents, getCrew, captainLevel, captainSkills, captainWeapon,
    captainColour, startNextWave, breakSeconds, recoveryPlayoutMs, loadAuto, saveAuto, holdBreak, toggleHold,
    reviveCaptain, createEventArt, createFinisherScene, easyFinishers, practiceIdentity, guideOn, createGuide,
    recoveryTransport, inspectDefenses, poses, myLevel, read, mySkills, myWeapon, actorId, myStats, controls, completeRevival, getSessionSettings,setSessionSettings,timers, stops,
    later, emit, cue, here, blocked, rangeFeedback, dangerFeedback, canInspect, focusCanvas, closeDefenseInspection,
    openDefenseInspection, updateDefenseInspection, clearLiveFeedback, noteLiveInput });
  // The parts, each a closure over ctl; they call each other through names linked once all exist.
  const parts = [createTransport, createPrediction, createCaptainActions, createFrame, createFinish].map(create => create(ctl));
  for (const { link, ...part } of parts) Object.assign(ctl, part);
  for (const part of parts) part.link?.();
  const { submit, checkpointBeforeRepair, handOffRecoveryFinish, receive, shoot, aimAt, meIn, isDown, setAuto, held,
    next, act, tap, update, settle, finishing, stop } = ctl;

  if (listen && bus?.on) stops.push(bus.on('wave_started_server', event => { const info = readWaveInfo(event); if (info && accept(info)) start(info); }));
  if (room?.on) for (const type of Object.values(ROOM_EVENTS)) {
    const stop = room.on(type, payload => receive(type, payload));
    if (typeof stop === 'function') stops.push(stop);
  }
  // F (held: keeps firing whenever the musket has reloaded) and E (one action).
  const keydown = event => {
    if (event.code !== 'KeyE' && event.code !== 'KeyF') return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, select, textarea, button, [contenteditable=true]')) return;
    if (event.code === 'KeyF') { ctl.shootHeld = true; if (!event.repeat) ctl.shootPressed = true; } else { ctl.holdE = true; if (!event.repeat) ctl.pressed = true; }
  };
  const keyup = event => { if (event.code === 'KeyF') ctl.shootHeld = false; if (event.code === 'KeyE') ctl.holdE = false; };
  const letGo = () => { ctl.shootHeld = false; ctl.holdE = false; ctl.holdPrompt = false; ctl.rangePreview = false; };
  const pointerdown = event => { if (event.button === 0) ctl.down = [event.clientX, event.clientY]; };
  const pointerup = event => {
    if (!ctl.down || event.button !== 0 || Math.hypot(event.clientX - ctl.down[0], event.clientY - ctl.down[1]) > 8) { ctl.down = null; return; }
    ctl.down = null; tap(event.clientX, event.clientY);
  };
  if (typeof window !== 'undefined') { window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', letGo); }
  world.canvas?.addEventListener('pointerdown', pointerdown);
  world.canvas?.addEventListener('pointerup', pointerup);

  function start(raw) {
    if (ctl.disposed) return null;
    const info = raw?.startsAtMs !== undefined ? raw : readWaveInfo(raw);
    if (!info) return null;
    const recoveryPolicy = readRecoveryPolicy(info);
    if (!recoveryPolicy) return null;
    if (recoveryPolicy === 'structure-recovery-v1' && !info.spectator && !isParticipantToken(info.participantToken)) return null;
    if (recoveryPolicy === 'structure-recovery-v1' && (!recoveryTransport
      || typeof recoveryTransport.sendInputs !== 'function' || typeof recoveryTransport.readEvents !== 'function'
      || typeof recoveryTransport.checkpoint !== 'function' || typeof recoveryTransport.finishWave !== 'function')) return null;
    const snapshot = recoveryPolicy === 'structure-recovery-v1' ? readRecoverySnapshot(info.initialSnapshot, info.waveId) : null;
    if (recoveryPolicy === 'structure-recovery-v1' && !snapshot) return null;
    ctl.lastTowerObstacles = info.rules?.towerObstacles === true;
    if (ctl.wave?.info.waveId === info.waveId) {
      const current=ctl.wave,proof=read(getSessionProof,null);
      if(current.info.nativeShared && current.info.spectator && info.nativeShared && !info.spectator
        && !current.done && !current.recoveryFinishAnswered && sameFrozenNativeWave(current.info,info)
        && validSessionProof(proof) && proof.sessionId===info.controlSessionId
        && sameEconomyScope(proof.origin,info.initialSnapshot.economy)
        && info.initialSnapshot.participants.some(row=>row.participantToken===info.participantToken)) {
        // Keep simulation, HP, replay head, cooldowns and pending history intact.
        current.info=info;current.nativeActorId=proof.actorId;
        current.actorCounter=Math.max(current.actorCounter,info.lastActorCounter);
        current.moveSentAt=-Infinity;
      }
      return current;
    }
    // A friend rang the next wave while ours still runs here (a ship that sinks a moment later on this
    // client): play ours to its end at once, so our part is finished and paid, then start the new one.
    if (ctl.wave && !ctl.wave.done) settle(ctl.wave);
    if (ctl.wave?.recoveryReplay && !ctl.wave.recoveryFinishAnswered) handOffRecoveryFinish(ctl.wave);
    // A wave that starts in the break of a won one continues the run (and its loot).
    if (!ctl.wave?.pause) ctl.runLoot = 0;
    if (ctl.wave) stop();
    // D039: with the flag wall_recovery on the server sends each wall's health after its last wave.
    // T43: a culverin fights only in a wave whose rules say defenses_v2 (every client of the wave alike); without
    // the rule it is left out here too, so the screen does not show a gun that never fires.
    const sourceDefenses = snapshot ? recoveryWaveDefenses(snapshot) : withHealth(getDefenses() ?? [], info.walls);
    const defenses = (sourceDefenses ?? []).filter(item => item?.kind !== 'culverin' || info.rules?.defensesV2 === true);
    const offset = info.clockOffsetMs ?? (info.serverTimeMs !== null ? info.serverTimeMs - now() : serverOffset());
    // v3 waves: the event from the wave's seed and number (the server repeats it for the galleon's bonus), and
    // the boss finishers with the room's wave gap (their grace time). simOptions may name an event (the demo).
    const event = info.flagship ? null : eventFor(info.wave, info.seed);
    const simOptionsForWave = snapshot ? { ...snapshot.createWave,
      seed: snapshot.seed, wave: info.wave, weather: snapshot.createWave.weather ?? snapshot.weather,
      flagship: snapshot.createWave.flagship ?? info.flagship, defenses, countdown: 0,
      ...(snapshot.createWave.boss !== undefined ? {} : (info.boss !== undefined ? { boss: info.boss } : {})),
      event: snapshot.createWave.event ?? event, finishers: true, finisherPreparation: true, gapMs: waveGapMs,
      ...info.rules, recoveryStructures: snapshot.structures, towerHealth: true,
      recoveryVersion: info.recoveryVersion, waveProtocol: info.waveProtocol,
      ...(info.nativeShared?{canonicalCaptains:snapshot.captainInitialState,canonicalLoadouts:Object.fromEntries(snapshot.participants.map(row=>[row.participantToken,row.captain]))}:{}) }
      : { seed: info.seed, wave: info.wave, weather: info.weather, flagship: info.flagship, defenses, countdown: 0,
        crew: getCrew() ?? undefined, ...(info.boss !== undefined ? { boss: info.boss } : {}), event, finishers: true,
        finisherPreparation: true, gapMs: waveGapMs, ...(info.rules ?? {}), ...simOptions };
    const sim = createWave(simOptionsForWave);
    const first = sim.state();
    const recoveryReplay = snapshot ? createWaveReplay() : null;
    const initialRecoveryHealth = recoveryReplay ? sim.recoveryHealthVector() : null;
    const initialRecoverySignature = initialRecoveryHealth ? canonicalJson(initialRecoveryHealth) : null;
    const current = ctl.wave = { info, sim, defenses, offset, ticks: 0, seq: 0, schedule: createInputSchedule(), done: false, finished: false,
      nativeActorId:info.nativeShared?getSessionProof()?.actorId??null:null,
      liveFeedback:createLiveAttackFeedback(),feedbackReady:false,
      pause: null, boss: first.boss ? bossText(first.warships) : '', captainAt: -Infinity, bladeAt: -Infinity, handAt: -Infinity,
      result: null, renderer: null, hud: null, shown: false, lampsSent: false, lampsRelit: false, flagshipSunk: false,
      splashesAt: [], lastCount: null, state: sim.state(), action: null, lanes: [], lean: { x: 0, z: 0 },
      // Captain health: the last position sent, your fall (pin: where you lie on this screen), a revive you hold.
      moveSentAt: -Infinity, moveSent: null, awaySent: false, pin: null, revive: null, reviveNote: null, reviveWait: false,
      actorCounter: info.lastActorCounter ?? 0, recoveryPending: [], recoverySending: false, recoveryPolling: false,
      recoveryLastFlushAt: -Infinity, recoveryLastPollAt: -Infinity, recoveryRttMs: RECOVERY_RTT_START_MS, recoveryReplay,
      recoveryHealthPersistedSignature: initialRecoverySignature,
      recoveryHealthLastAttemptAt: -Infinity, recoveryHealthCheckpointPromise: null,
      recoveryDriver: recoveryReplay ? createReplayDriver(recoveryReplay) : null,
      recoveryLastRepairSeq: 0, recoveryInvalid: false, recoveryFinishPending: false, recoveryFinishing: false,
      recoveryFinishAnswered: false, recoveryFinishFailed: false, recoveryFinishRequest: null, recoveryFinishRetryAt: -Infinity,
      recoveryFinishAttempts: 0, recoveryInputRetryAt: -Infinity, recoveryInputAttempts: 0, recoveryPollRetryAt: -Infinity,
      recoveryPollAttempts: 0, recoveryCounterResync: false, recoveryPlayoutMs: Math.max(0, recoveryPlayoutMs),
      recoveryClosed: false, cosmeticHeard: new Map(), cosmeticSent: [], catchingUp: false,
      // v3 waves: the event's id and drawing, the finisher's scene and this player's recorder of its samples.
      eventId: first.event?.id ?? null, eventArt: null, finisher: null };
    emit({ type: 'wave_controller_started', waveId: info.waveId, wave: info.wave, flagship: info.flagship,
      ...(recoveryReplay ? { recovery: true } : {}) });
    if (world.scene) {
      Promise.resolve(createRenderer({ scene: world.scene, defenses, reducedMotion, quality, beamFrom, colour: read(captainColour, 0),
        towerStates: info.rules?.towerHealth === true || !!snapshot, culverins: defenses.some(item => item.kind === 'culverin'),
        recoveryV1: !!snapshot,nativeCaptains:info.nativeShared===true,
        swivels: defenses.some(item => item.kind === 'swivel') })).then(renderer => {
        if (ctl.disposed || ctl.wave !== current || current.finished) renderer?.dispose(); else current.renderer = renderer;
      }).catch(error => console.error(error));
    }
    if (world.container) {
      Promise.resolve(createHud({ container: world.container, onAction: () => act(), onNext: () => {if(ctl.wave===current)next();}, onAuto: value => {if(ctl.wave===current)setAuto(value);},
        onPromptHold: held => { ctl.holdPrompt = held === true; },
        onHold: () => {if(ctl.wave!==current || current.info.nativeShared && !controls(current))return;try { toggleHold?.(); } catch (error) { console.error(error); } },
        onShoot: held => { ctl.shootHeld = held === true; if (held) ctl.shootPressed = true; },
        onRangePreview: value => { ctl.rangePreview = value === true; },
        ...(inspectDefenses ? {inspectDefenses: {
          onSelect: id => {
            const selected = current.defenseSelection;
            if (ctl.wave !== current || !selected?.options.some(option => option.id === id)) return;
            selected.id = id;
            focusCanvas();
          },
          onClose: () => { if (ctl.wave === current) closeDefenseInspection(current, true); },
        }} : {}),
        reducedMotion })).then(hud => {
        if (ctl.disposed || ctl.wave !== current || current.finished) hud?.dispose(); else current.hud = hud;
      }).catch(error => console.error(error));
    }
    if (current.eventId && world.container) {
      Promise.resolve(createEventArt({ container: world.container, canvas: world.canvas, project: (x, z, lift) => world.project?.(x, z, lift) ?? null,
        reducedMotion, quality })).then(art => { if (ctl.disposed || ctl.wave !== current || current.finished) art?.dispose(); else current.eventArt = art; })
        .catch(error => console.error(error));
    }
    current.shown = here();
    cue('pirate-bell');
    return current;
  }


  return {
    start, update,
    stopIfOriginChanged(economy){
      const next=readEconomy(economy),current=ctl.wave;
      if(!current?.info.nativeShared || !next || sameEconomyScope(current.info.initialSnapshot.economy,next))return false;
      stop();return true;
    },
    openDefenseInspection,
    closeDefenseInspection: () => closeDefenseInspection(ctl.wave, true),
    get canInspectDefense() { return !!canInspect(ctl.wave); },
    get wave() { return ctl.wave; },
    get state() { return ctl.wave?.state ?? null; },
    get recoveryCombatState() {
      const current = ctl.wave;
      if (!current?.recoveryReplay || current.recoveryFinishAnswered || !current.info.initialSnapshot?.structures
        || now() + current.offset < current.info.startsAtMs) return null;
      const vector = current.sim.recoveryHealthVector();
      if (!vector) return null;
      const structures = current.info.initialSnapshot.structures.map(row => {
        if (!Object.hasOwn(vector.hpUnits, row.instanceId) || !Object.hasOwn(vector.basisRepairSeq, row.instanceId)) return null;
        return { spot: row.spot, instanceId: row.instanceId, hpUnits: vector.hpUnits[row.instanceId], maxHP: row.maxHP,
          repairSeq: vector.basisRepairSeq[row.instanceId] };
      });
      return structures.some(row => !row) ? null : { waveId: current.info.waveId,
        islandEpoch: current.info.initialSnapshot.islandEpoch, structures };
    },
    checkpointBeforeRepair,
    fire: (cannonId, targetId) => submit({ type: 'fire', cannonId, targetId }),
    syncCaptains:()=>ctl.syncCaptains(),
    shoot, aim: point => aimAt(point, null), next, setAuto,
    get auto() { return ctl.wave?.info.nativeShared?getSessionSettings()?.autoNext===true:ctl.auto; },
    get runLoot() { return ctl.runLoot; },
    get inBreak() { return !!ctl.wave?.pause; },
    // Captain health (GAME-V3.md §3): your captain in the sim ({id, x, z, hp, maxHp, down, ...} or null),
    // whether you are down (no walking, shooting or building), and the revive you hold ({targetId, share}).
    get captain() { return meIn(ctl.wave); },
    get captainDown() { return isDown(ctl.wave); },
    // D052: the automatic cutlass (on by default). scripts/check-multiplayer.js turns it off for a captain who must fall.
    get autoBlade() { return ctl.autoBlade; },
    set autoBlade(on) { ctl.autoBlade = on !== false; },
    get revive() { return ctl.wave?.revive ? { targetId: ctl.wave.revive.targetId, share: ctl.wave.revive.share, paying: ctl.wave.revive.paying } : null; },
    // Your captain's id in the wave on screen (the participant token in a recovery wave).
    get playerId() { return actorId(ctl.wave); },
    // A paid repair the server accepted for `spot` (game-wiring.js): drawn whole until the replay catches up.
    repairedNow(spot) { if (ctl.wave?.recoveryReplay && typeof spot === 'string') (ctl.wave.repairedNow ??= new Map()).set(spot, now()); },
    // The pose of a captain of the wave on screen ({kind, flip, age} from poses.js, or null): your own by
    // playerId, a teammate's by their sim id. Drawing only.
    pose(by) { return ctl.wave && !ctl.wave.finished && ctl.wave.shown ? poses.get(by) : null; },
    // Where the presence draws the other captains (src/pirates/figures.js figurePositions: sim id -> {x, z}),
    // so their hp bars sit over the figures; null draws them where the sim has them.
    setFigures(value) { ctl.figures = value instanceof Map ? value : null; },
    // The island changed (an upgrade or a new building, ours or a friend's): once the wave is decided, in the
    // break, its posts show the new levels. A wave under way keeps the defenses it started with.
    // walls ({spot: percent}, optional): fresh wall health from a paid repair or rebuild (D039).
    refreshDefenses(walls = null) {
      if (!ctl.wave?.done || !ctl.wave.renderer) return false;
      ctl.wave.renderer.setDefenses?.(withHealth(getDefenses() ?? [], walls)); return true;
    },
    setCaptainLevel(value) { ctl.level = Number.isInteger(value) ? value : null; },
    // Override the getters (tests, the dev harness): null goes back to captainSkills() / captainWeapon().
    setCaptainSkills(value) { ctl.skills = Array.isArray(value) ? readSkills(value) : null; },
    setCaptainWeapon(value) { ctl.weapon = typeof value === 'string' ? readWeapon(value) : null; },
    get captainStats() { return myStats(); },
    repair: wallId => submit({ type: 'repair', wallId, skills: mySkills() }),
    lampsLit() {
      if (!ctl.wave || !ctl.wave.info.flagship || ctl.wave.lampsSent) return false;
      if (!submit({ type: 'lamps_lit' })) return false;
      ctl.wave.lampsSent = true; return true;
    },
    dispose() {
      if (ctl.disposed) return;
      ctl.disposed = true; stop(); ctl.guide?.dispose(); ctl.guide = null;
      for (const id of timers) clearTimer(id);
      timers.clear(); stops.splice(0).forEach(stopListening => stopListening());
      if (typeof window !== 'undefined') { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', letGo); }
      world.canvas?.removeEventListener('pointerdown', pointerdown);
      world.canvas?.removeEventListener('pointerup', pointerup);
    },
  };
}
