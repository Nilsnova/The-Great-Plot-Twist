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
// Boarders (§12) are targets too, and with one within cutlass reach F (or the button) swings the cutlass
// instead (its damage and reload scaled by the Brawler skills), synced the same way.
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
import { createPoses } from './poses.js';
import { CONFIG, createWave, hasTavern, revivePrice } from './sim.js';
import { waveGapMs } from '../net/live-rules.js';
import { captainStats, readSkills, readWeapon } from './captain-stats.js';
import { INPUT_LEAD_TICKS, ROOM_EVENTS, TICK_SECONDS, createInputSchedule, readMessage, toMessage } from './sync.js';
import { actionAt, boarderAt, inputFor, promptText, shipAt, tapInput } from './interact.js';
// v3 waves (GAME-V3.md §4.2, §4.3): the wave's event (its banner, art and narrator line) and the boss finisher.
import { EVENT_TEXT, eventFor } from './wave-events.js';
import { createFinisherRecorder } from './finisher/input.js';
import { getPreferences } from '../settings/preferences.js';
// D039 (proposed): the walls start with the server's health and the finish reports it (wall-health.js).
import { healthReport, readWalls, withHealth } from './wall-health.js';

const MAX_TICKS_PER_FRAME = 600;      // a friend joining late catches up 30 s of wave per frame
const SHOWN_LATE_SECONDS = 1;         // events older than this (catching up) are not drawn or heard
const END_BEAT_MS = 1800;             // the last ship sinks on screen before the cutscene
const LOST_BEAT_MS = 4500;            // a lost run's result stays up a little longer
const DEFAULT_WAIT_SECONDS = 5;
const AIM_RADIUS = 8;                 // free aim: a ship this close to the aim point is hit
const SETTLE_TICKS = 20000;           // more than the longest wave (900 s)
const BREAK_GRACE_MS = 10000;         // with Auto next on, the break waits this long for the loot answer
export const MOVE_EVERY_MS = 500;     // captain health: your position at most this often (or 2 × the room's wave gap)
export const HEARD_EVERY_MS = 3000;   // and at least this often while you stand still (the sim's stale is 8 s)
const MOVE_STEP = .4;                 // units: a smaller move waits for the next HEARD_EVERY_MS
const NOTE_MS = 3000;                 // a refused revive's words stay this long
export const LOST_FALLEN = 'Every captain fell.';
export const bossText = warships => (warships >= 2 ? '⚠ Boss wave: two warships!' : '⚠ Boss wave: a warship!');
export const BREAK_SECONDS = 8;       // the break after a won wave (TOWER-DEFENSE.md §1; faster pace, owner 11 Nov)
const BOSS_WARNING_SECONDS = 6;       // the boss warning stays this long after the wave starts
export const AUTO_KEY = 'tgpt:pirates:auto-next';
export const LOST_TITLE = 'The pirates broke through';
export const LOST_LINE = 'Rebuild and ring the bell again.';
const readAuto = () => { try { return globalThis.localStorage?.getItem(AUTO_KEY) === '1'; } catch { return false; } };
const writeAuto = value => { try { globalThis.localStorage?.setItem(AUTO_KEY, value ? '1' : '0'); } catch { /* private mode: kept for this visit */ } };
/** The nearest ship or boarder within the captain's range of (x, z), or null. range: the gun's (captainStats). */
export function captainTarget(player, state, level = 1, range = captainStats(level).range) {
  let best = null, bestDistance = range;
  for (const item of [...(state?.boarders ?? []), ...(state?.ships ?? [])]) {
    const d = Math.hypot(item.x - player.x, item.z - player.z);
    if (d <= bestDistance) { best = item; bestDistance = d; }
  }
  return best;
}
/** The nearest boarder within cutlass reach of (x, z), or null: close quarters (TOWER-DEFENSE.md §12). */
export function bladeTarget(player, state) {
  let best = null, bestDistance = CONFIG.captain.cutlass.reach;
  for (const boarder of state?.boarders ?? []) {
    const d = Math.hypot(boarder.x - player.x, boarder.z - player.z);
    if (d <= bestDistance) { best = boarder; bestDistance = d; }
  }
  return best;
}
const pirateById = (state, id) => state?.boarders?.find(item => item.id === id) ?? state?.ships?.find(item => item.id === id) ?? null;
let atlasPromise = null, atlasKey = null;
// The heart's share below which the narrator hears heart_changed (its HEART_LOW).
export const HEART_WARN = 0.3;

// The wider view during a wave: cannons reach about 28 units, ships appear about 40 units out, so the
// camera shows about 34 units either side of the player (half zoom on a 16:9 screen, 0.4 on a phone).
export const battleZoom = camera => {
  const half = Number.isFinite(camera.right - camera.left) ? (camera.right - camera.left) / 2 : 17.8;
  return Math.max(.4, Math.min(.85, half / 34));
};
// Where the camera leans during a wave: from the player a little towards the ships (or the lanes they
// will come in on), at most 14 units across and 9 units up or down, so the player stays on screen.
export function battleLean(player, state, lanes = []) {
  if (!player) return { x: 0, z: 0 };
  const pirates = [...(state?.ships ?? []), ...(state?.boarders ?? [])];
  const points = pirates.length ? pirates : lanes;
  if (!points?.length) return { x: 0, z: 0 };
  let x = 0, z = 0;
  for (const point of points) { x += point.x; z += point.z; }
  x = x / points.length - player.x; z = z / points.length - player.z;
  return { x: Math.max(-14, Math.min(14, x * .5)), z: Math.max(-9, Math.min(9, z * .5)) };
}
const parseTime = value => (typeof value === 'number' ? value : Date.parse(value));
export function readWaveInfo(info) {
  if (!info || typeof info !== 'object' || typeof info.waveId !== 'string' || !info.waveId) return null;
  const startsAtMs = parseTime(info.startsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(Number(info.seed))) return null;
  const wave = Number.isInteger(info.wave) && info.wave > 0 ? info.wave : 1;
  const weather = info.weather && typeof info.weather === 'object' ? info.weather : {};
  return { waveId: info.waveId, wave, seed: Number(info.seed), startsAtMs, weather, flagship: info.flagship === true,
    boss: typeof info.boss === 'boolean' ? info.boss : undefined, walls: readWalls(info.walls),
    serverTimeMs: Number.isFinite(parseTime(info.serverTime)) ? parseTime(info.serverTime) : null };
}

/** How long to wait before finishing again, from a 409 wave_too_early refusal; null for other errors. */
export function tooEarlyWait(error) {
  const code = error?.code ?? error?.body?.error?.code ?? error?.error?.code;
  if (code !== 'wave_too_early') return null;
  const seconds = Number(error.waitSeconds ?? error.retryAfter ?? error.body?.error?.waitSeconds ?? error.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(60, seconds) : DEFAULT_WAIT_SECONDS;
}

const defaultCutscene = (world, reducedMotion) => async id => {
  if (!world.container) return { status: 'skipped' };
  const module = await import('../cutscenes/player.js');
  return module.playCutscene({ container: world.container, id, reducedMotion }).done;
};
const defaultRenderer = async options => {
  const module = await import('./render.js');
  // One atlas at a time, painted again when your lobby colour (the musket and cutlass poses) changes.
  const key = `${options.quality?.() === 'low' ? 'low' : 'high'}:${options.colour ?? 0}`;
  if (atlasKey !== key) { atlasPromise = null; atlasKey = key; }
  atlasPromise ??= module.loadAtlas({ quality: key.split(':')[0], colour: options.colour ?? 0 }).catch(error => { atlasPromise = null; throw error; });
  return module.createWaveRenderer({ ...options, atlas: await atlasPromise });
};
const defaultHud = async options => (await import('./hud.js')).createWaveHud(options);
// v3 waves: the event's drawing and the finisher's scene load with their first wave; the finisher slows the sea.
const defaultEventArt = async options => (typeof document === 'undefined' ? null : (await import('./wave-events-art.js')).createEventArt(options));
const defaultFinisherScene = async options => {
  if (typeof document === 'undefined') return null; // no page (a headless test): the sim alone
  const [module, water] = await Promise.all([import('./finisher/introduction.js'), import('../world/water.js').catch(() => null)]);
  const scene = module.createFinisherIntroduction(options);
  if (!options.reducedMotion?.()) water?.setSeaPace?.(.25);
  const dispose = scene.dispose;
  scene.dispose = () => { water?.setSeaPace?.(1); dispose(); };
  return scene;
};
export const FINISHER_FRAME_Z = 7;     // units: the camera looks this far south of the boss, so it shows above the panel
export const EVENT_BANNER_SECONDS = 8;   // the event's line shows this long under the wave bar, then its title alone
export const EVENT_ICONS = Object.freeze({ fog_bank: '☁', storm: '⛈', night_raid: '🌙', fire_ships: '🔥', pincer: '⚔', armada: '⛵',
  siege_barge: '💣', treasure_galleon: '💰', smugglers: '🛶', kraken: '🐙' });
const readEasy = () => { try { return getPreferences()?.easyFinishers === true; } catch { return false; } };

export function createWaveController({ bus, world = {}, getDefenses = () => [], finishWave = async () => null, room = null,
  sound = null, reducedMotion = () => false, quality = () => 'high', playerId = `p-${Math.random().toString(36).slice(2, 10)}`,
  now = () => Date.now(), serverOffset = () => 0, place = null, accept = info => info.flagship !== true, listen = true,
  simOptions = {}, beamFrom = null, cutsceneFor = (result, summary) => (summary.lampsRelit ? 'lamps_relit' : result.survived ? 'wave_won' : 'wave_lost'),
  playCutscene = defaultCutscene(world, reducedMotion), createRenderer = defaultRenderer, createHud = defaultHud,
  setTimer = (run, ms) => setTimeout(run, ms), clearTimer = id => clearTimeout(id), onEvents = null,
  getCrew = () => null, captainLevel = () => 1, captainSkills = () => [], captainWeapon = () => 'musket', captainColour = () => 0,
  startNextWave = null, breakSeconds = BREAK_SECONDS,
  loadAuto = readAuto, saveAuto = writeAuto, holdBreak = null, toggleHold = null, reviveCaptain = null,
  createEventArt = defaultEventArt, createFinisherScene = defaultFinisherScene, easyFinishers = readEasy, practiceIdentity = () => null } = {}) {
  // The captains' poses (src/pirates/poses.js): your character and the teammates' figures fire in their own body.
  const poses = createPoses({ now: () => now() / 1000 });
  let wave = null, disposed = false, pressed = false, shootPressed = false, shootHeld = false, down = null, shake = 0;
  let holdE = false, holdPrompt = false; // E or the prompt held down (a revive)
  let figures = null; // the presence figures' positions of the other captains (setFigures)
  let runLoot = 0, auto = !!loadAuto(), level = null, skills = null, weapon = null;
  const myLevel = () => { const value = Number(level ?? captainLevel()); return Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1; };
  const read = (get, fallback) => { try { return get(); } catch { return fallback; } };
  const mySkills = () => readSkills(skills ?? read(captainSkills, []));
  const myWeapon = () => readWeapon(weapon ?? read(captainWeapon, 'musket'));
  // Your gun's numbers now: level, skills and the equipped weapon (captain-stats.js).
  const myStats = () => captainStats(myLevel(), mySkills(), myWeapon());
  const timers = new Set(), stops = [];
  const later = (run, ms) => { const id = setTimer(() => { timers.delete(id); if (!disposed) run(); }, ms); timers.add(id); return id; };
  const emit = event => { try { bus?.emit?.(event); } catch (error) { console.error(error); } };
  const cue = name => { if (wave?.shown) sound?.cue?.(name); };
  const here = () => !place || (world.place?.() ?? place) === place;
  const blocked = () => !!world.isBlocked?.();

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
    if (event.code === 'KeyF') { shootHeld = true; if (!event.repeat) shootPressed = true; } else { holdE = true; if (!event.repeat) pressed = true; }
  };
  const keyup = event => { if (event.code === 'KeyF') shootHeld = false; if (event.code === 'KeyE') holdE = false; };
  const letGo = () => { shootHeld = false; holdE = false; holdPrompt = false; };
  const pointerdown = event => { if (event.button === 0) down = [event.clientX, event.clientY]; };
  const pointerup = event => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 8) { down = null; return; }
    down = null; tap(event.clientX, event.clientY);
  };
  if (typeof window !== 'undefined') { window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', letGo); }
  world.canvas?.addEventListener('pointerdown', pointerdown);
  world.canvas?.addEventListener('pointerup', pointerup);

  function start(raw) {
    if (disposed) return null;
    const info = raw?.startsAtMs !== undefined ? raw : readWaveInfo(raw);
    if (!info) return null;
    if (wave?.info.waveId === info.waveId) return wave;
    // A friend rang the next wave while ours still runs here (a ship that sinks a moment later on this
    // client): play ours to its end at once, so our part is finished and paid, then start the new one.
    if (wave && !wave.done) settle(wave);
    // A wave that starts in the break of a won one continues the run (and its loot).
    if (!wave?.pause) runLoot = 0;
    if (wave) stop();
    // D039: with the flag wall_recovery on the server sends each wall's health after its last wave.
    const defenses = withHealth(getDefenses() ?? [], info.walls);
    const offset = info.serverTimeMs !== null ? info.serverTimeMs - now() : serverOffset();
    // v3 waves: the event from the wave's seed and number (the server repeats it for the galleon's bonus), and
    // the boss finishers with the room's wave gap (their grace time). simOptions may name an event (the demo).
    const event = info.flagship ? null : eventFor(info.wave, info.seed);
    const sim = createWave({ seed: info.seed, wave: info.wave, weather: info.weather, flagship: info.flagship, defenses, countdown: 0,
      crew: getCrew() ?? undefined, ...(info.boss !== undefined ? { boss: info.boss } : {}), event, finishers: true, finisherPreparation: true, gapMs: waveGapMs, ...simOptions });
    const first = sim.state();
    const current = wave = { info, sim, defenses, offset, ticks: 0, seq: 0, schedule: createInputSchedule(), done: false, finished: false,
      pause: null, boss: first.boss ? bossText(first.warships) : '', captainAt: -Infinity, bladeAt: -Infinity,
      result: null, renderer: null, hud: null, shown: false, lampsSent: false, lampsRelit: false, flagshipSunk: false,
      splashesAt: [], lastCount: null, state: sim.state(), action: null, lanes: [], lean: { x: 0, z: 0 },
      // Captain health: the last position sent, your fall (pin: where you lie on this screen), a revive you hold.
      moveSentAt: -Infinity, moveSent: null, awaySent: false, pin: null, revive: null, reviveNote: null, reviveWait: false,
      // v3 waves: the event's id and drawing, the finisher's scene and this player's recorder of its samples.
      eventId: first.event?.id ?? null, eventArt: null, finisher: null };
    emit({ type: 'wave_controller_started', waveId: info.waveId, wave: info.wave, flagship: info.flagship });
    if (world.scene) {
      Promise.resolve(createRenderer({ scene: world.scene, defenses, reducedMotion, quality, beamFrom, colour: read(captainColour, 0) })).then(renderer => {
        if (disposed || wave !== current || current.finished) renderer?.dispose(); else current.renderer = renderer;
      }).catch(error => console.error(error));
    }
    if (world.container) {
      Promise.resolve(createHud({ container: world.container, onAction: () => act(), onNext: () => next(), onAuto: value => setAuto(value),
        onPromptHold: held => { holdPrompt = held === true; },
        onHold: () => { try { toggleHold?.(); } catch (error) { console.error(error); } },
        onShoot: held => { shootHeld = held === true; if (held) shootPressed = true; },
        reducedMotion })).then(hud => {
        if (disposed || wave !== current || current.finished) hud?.dispose(); else current.hud = hud;
      }).catch(error => console.error(error));
    }
    if (current.eventId && world.container) {
      Promise.resolve(createEventArt({ container: world.container, canvas: world.canvas, project: (x, z, lift) => world.project?.(x, z, lift) ?? null,
        reducedMotion, quality })).then(art => { if (disposed || wave !== current || current.finished) art?.dispose(); else current.eventArt = art; })
        .catch(error => console.error(error));
    }
    current.shown = here();
    cue('pirate-bell');
    return current;
  }

  function settle(current) {
    for (let i = 0; i < SETTLE_TICKS && !current.sim.done; i++) { current.sim.step(TICK_SECONDS, current.schedule.take(current.ticks)); current.ticks++; }
    current.state = current.sim.state();
    if (current.sim.done) end(current);
  }
  // v3 waves: a boss finisher is running (the battle stands still: no shots, repairs or prompts meanwhile).
  const finishing = current => current?.state?.finisher?.active === true;
  function submit(input, lead = INPUT_LEAD_TICKS) {
    if (!wave || wave.done || wave.state.phase !== 'running') return false;
    const entry = { by: playerId, seq: ++wave.seq, tick: wave.ticks + lead, input };
    wave.schedule.add(entry, wave.ticks);
    const message = toMessage(input, { ...entry, waveId: wave.info.waveId });
    if (message) try { room?.send?.(message.type, message.payload); } catch (error) { console.error(error); }
    return true;
  }
  function receive(type, payload) {
    if (!wave || wave.done) return;
    const entry = readMessage(type, payload, wave.info.waveId);
    if (!entry || entry.by === playerId) return;
    if (entry.input.type === 'lamps_lit') wave.lampsSent = true; // somebody else lit them first
    wave.schedule.add(entry, wave.ticks);
  }

  // The captain's gun: at a ship or boarder (a tap) or the nearest in range (F), from where the player
  // stands. A boarder within cutlass reach gets the cutlass instead (close quarters, §12). A spray
  // (blunderbuss) and a bomb (fire bombs) also carry the aim point: the target's place.
  function shoot(targetId = null) {
    const player = world.player?.position;
    if (!wave || wave.done || !player || !here() || isDown(wave) || finishing(wave)) return false;
    const stats = myStats(), state = wave.state;
    const named = targetId ? pirateById(state, targetId) : null;
    const close = named?.id?.startsWith('boarder_') && Math.hypot(named.x - player.x, named.z - player.z) <= CONFIG.captain.cutlass.reach
      ? named : !targetId ? bladeTarget(player, state) : null;
    if (close) return strike(close);
    const target = targetId ? named : captainTarget(player, state, myLevel(), stats.range);
    if (!target || Math.hypot(target.x - player.x, target.z - player.z) > stats.range) return false;
    return fireAt(stats, player, target, { x: target.x, z: target.z });
  }
  function fireAt(stats, player, target, point) {
    const t = wave.ticks * TICK_SECONDS;
    if (t - wave.captainAt < stats.reload) return false;
    const round = value => Math.round(value * 100) / 100;
    const aimed = stats.mode === 'cone' || stats.mode === 'area' ? { ax: round(point.x), az: round(point.z) } : {};
    const input = { type: 'captain_shot', by: playerId, targetId: target?.id ?? null, level: stats.level, skills: mySkills(), weapon: stats.weapon,
      x: round(player.x), z: round(player.z), ...aimed };
    if (!submit(input)) return false;
    wave.captainAt = t + INPUT_LEAD_TICKS * TICK_SECONDS;
    return true;
  }
  // Free aim (owner, 11 Nov: "shooting when not pressing on something"): a click or tap anywhere fires
  // your gun that way. A single or piercing shot hits the ship or boarder tapped, else the one in range
  // nearest to the aim point (within AIM_RADIUS of it); with none there the shot is a visible miss on this
  // screen only (nothing to sync). A spray and a bomb always fly towards the aim point (the sim finds the
  // hits, ships and boarders alike).
  function aimAt(point, target) {
    const player = world.player?.position;
    if (!wave || wave.done || !point || !player || !here() || wave.state.phase !== 'running' || isDown(wave) || finishing(wave)) return false;
    const stats = myStats();
    if (stats.mode === 'cone' || stats.mode === 'area') return fireAt(stats, player, target ?? null, target ?? point);
    const inRange = item => Math.hypot(item.x - player.x, item.z - player.z) <= stats.range;
    let hit = target && inRange(target) ? target : null;
    if (!hit) {
      let best = AIM_RADIUS;
      for (const item of [...(wave.state.boarders ?? []), ...wave.state.ships]) {
        const d = Math.hypot(item.x - point.x, item.z - point.z);
        if (d <= best && inRange(item)) { best = d; hit = item; }
      }
    }
    if (hit) return shoot(hit.id);
    const t = wave.ticks * TICK_SECONDS;
    if (t - wave.captainAt < stats.reload) return false;
    wave.captainAt = t;
    const dx = point.x - player.x, dz = point.z - player.z, length = Math.hypot(dx, dz) || 1, reach = Math.min(length, stats.range);
    const toX = player.x + dx / length * reach, toZ = player.z + dz / length * reach;
    const shot = [{ type: 'captain_fired', t, by: playerId, level: stats.level, weapon: stats.weapon, mode: stats.mode,
      x: player.x, z: player.z, toX, toZ, impactAt: t + reach / stats.shotSpeed, miss: true, targets: [] }];
    wave.renderer?.events(shot); poses.note(shot);
    cue('pirate-musket');
    return true;
  }
  // The cutlass: one blow at a boarder within reach, synced as captain_strike with your skills (Brawler:
  // the sim scales damage and reload and sweeps with them; the reload here matches it).
  const bladeReload = () => CONFIG.captain.cutlass.reload * myStats().strikeReloadMultiplier;
  function strike(boarder) {
    const player = world.player?.position, t = wave.ticks * TICK_SECONDS;
    if (t - wave.bladeAt < bladeReload() - 1e-9) return false;
    const input = { type: 'captain_strike', by: playerId, targetId: boarder.id, level: myLevel(), skills: mySkills(),
      x: Math.round(player.x * 100) / 100, z: Math.round(player.z * 100) / 100 };
    if (!submit(input)) return false;
    wave.bladeAt = t + INPUT_LEAD_TICKS * TICK_SECONDS;
    return true;
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
  const meIn = current => current?.state?.party?.find(hero => hero.id === playerId) ?? null;
  const isDown = current => !!current && !current.done && meIn(current)?.down === true;
  const colourNow = () => { const value = Number(read(captainColour, 0)); return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0; };
  const roomSize = current => Math.max(1, current.state.party?.length ?? 1);
  // A position may wait in the room's send queue for one gap, so it is stamped that much further ahead:
  // it still arrives before its tick on every screen.
  const moveLead = current => INPUT_LEAD_TICKS + Math.ceil(waveGapMs(roomSize(current)) / 1000 / TICK_SECONDS);
  // Your position for the sims: after a move (MOVE_STEP) once the gap passed, else at least every
  // HEARD_EVERY_MS; once `away` when the island is no longer on screen (another place) during the wave.
  function sendPosition(current, player) {
    if (current.done || current.state.phase !== 'running' || finishing(current)) return; // v3 waves: no moves while the battle stands still
    if (!current.shown || !player) {
      if (current.moveSent && !current.awaySent && submit({ type: 'captain_move', by: playerId, ...current.moveSent, away: true }, moveLead(current))) current.awaySent = true;
      return;
    }
    const t = now(), gap = Math.max(MOVE_EVERY_MS, 2 * waveGapMs(roomSize(current)));
    const at = current.pin ?? player; // a fallen captain lies where they fell
    const moved = !current.moveSent || current.awaySent || Math.hypot(at.x - current.moveSent.x, at.z - current.moveSent.z) >= MOVE_STEP;
    if (t - current.moveSentAt < (moved ? gap : Math.max(gap, HEARD_EVERY_MS))) return;
    const round = value => Math.round(value * 100) / 100, x = round(at.x), z = round(at.z);
    if (!submit({ type: 'captain_move', by: playerId, x, z, colour: colourNow() }, moveLead(current))) return;
    current.moveSentAt = t; current.moveSent = { x, z }; current.awaySent = false;
  }
  // The fallen teammate within revive reach of where you stand (never yourself), or null.
  function fallenNear(current, player) {
    let best = null, near = CONFIG.health.revive.reach;
    for (const hero of current.state.party ?? []) {
      if (!hero.down || !hero.present || hero.id === playerId) continue;
      const d = Math.hypot(hero.x - player.x, hero.z - player.z);
      if (d <= near) { best = hero; near = d; }
    }
    return best;
  }
  // Holding E (or the prompt) next to a fallen teammate: after revive.hold seconds the server charges you
  // (reviveCaptain), then the revive goes to the room. Let go or walk off and it starts over; after a
  // refusal, let go before trying again.
  function holdRevive(current, target, player) {
    const holding = (holdE || holdPrompt) && !blocked();
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
    Promise.resolve().then(() => (reviveCaptain ? reviveCaptain({ waveId: current.info.waveId, fallen: target.id, downAt }) : null)).then(() => {
      if (wave !== current) return;
      current.revive = null;
      submit({ type: 'captain_revive', by: playerId, targetId: target.id, skills: mySkills(), ...at });
    }).catch(error => {
      if (wave !== current) return;
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
      const mine = hero.id === playerId, at = mine && current.pin ? current.pin : hero;
      const point = world.project(at.x, at.z, 2.6);
      if (point) marks.push({ id: hero.id, x: point.x, y: point.y, seconds: Math.max(0, Math.floor(current.state.time - (hero.downAt ?? current.state.time))), mine });
    }
    return marks;
  }

  // The break after a won wave.
  function setAuto(value) { auto = value === true; saveAuto(auto); }
  const held = () => { try { return holdBreak?.() ?? null; } catch { return null; } };
  function next() {
    const current = wave;
    if (!current?.pause || !current.pause.ready || current.pause.requested || !startNextWave) return false;
    if (held()?.paused) return false; // the room paused the break: Resume first
    current.pause.requested = true;
    Promise.resolve().then(() => startNextWave({ wave: current.info.wave + 1, waveId: current.info.waveId })).then(answer => {
      if (wave !== current || answer?.ok !== false) return;
      // Refused (a wave already runs there, the server is away): say so and let the player try again.
      current.pause.requested = false; current.pause.note = answer.message || 'That did not work. Try again.';
    }).catch(error => {
      if (wave !== current) return;
      current.pause.requested = false; current.pause.note = error?.message || 'That did not work. Try again.';
    });
    return true;
  }

  function act() {
    if (!wave || blocked() || !here() || isDown(wave) || finishing(wave)) return;
    const input = inputFor(wave.action);
    // A repair or a rebuild carries your skills (Shipwright: faster repairs, Master shipwright rebuilds to 60%).
    if (input) submit(input.type === 'repair' || input.type === 'rebuild' ? { ...input, skills: mySkills() } : input);
  }
  function tap(clientX, clientY) {
    if (!wave || wave.done || blocked() || !here() || !world.unproject || isDown(wave) || finishing(wave)) return;
    const point = world.unproject(clientX, clientY), boarder = point && boarderAt(point, wave.state);
    if (boarder) { if (!shoot(boarder.id)) aimAt(point, boarder); return; } // a boarder: cutlass or musket
    const ship = point && shipAt(point, wave.state);
    const input = wave.action?.kind === 'fire' ? tapInput(wave.action, ship, wave.state) : null;
    if (input) submit(input);
    else aimAt(point, ship); // not manning a cannon (or out of its reach): your gun
  }

  function handle(events, current, fresh) {
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
      if (event.type === 'captain_fell') emit({ type: 'player_fell', playerId: event.captainId, self: event.captainId === playerId });
      else if (event.type === 'captain_revived') emit({ type: 'player_revived', playerId: event.captainId, self: event.captainId === playerId, by: event.by });
      else if (event.type === 'wave_ended' && event.reason === 'captains_fallen') emit({ type: 'captains_all_fallen' });
    }
    for (const event of fresh) {
      if (event.type === 'cannon_fired') {
        cue(event.manual ? 'pirate-cannon-manual' : 'pirate-cannon');
        if (!event.hit) current.splashesAt.push(event.impactAt);
      } else if (event.type === 'mortar_fired') cue('pirate-mortar');
      else if (event.type === 'harpoon_thrown') cue('pirate-harpoon'); // T4's harpoon twang
      else if (event.type === 'mortar_impact') { cue('pirate-mortar-impact'); cue(event.hits ? 'pirate-hit' : 'pirate-splash'); kick(.08); }
      else if (event.type === 'captain_fired') cue('pirate-musket');
      else if (event.type === 'captain_blast') { cue(event.hits ? 'pirate-hit' : 'pirate-splash'); kick(.06); } else if (event.type === 'ship_hit' && !event.blocked) cue('pirate-hit');
      else if (event.type === 'captain_struck' || event.type === 'boarder_killed') cue('pirate-hit');
      else if (event.type === 'ship_sunk') { cue('pirate-sunk'); if (event.kind === 'flagship') kick(.5); }
      else if (event.type === 'wall_damaged') cue('pirate-wall');
      else if (event.type === 'island_damaged') { cue('pirate-wall'); kick(.18); }
    }
    onEvents?.(events);
  }

  function kick(amount) { if (!reducedMotion() && wave?.shown) shake = Math.max(shake, amount); }

  function update(dt = 0) {
    if (disposed || !wave) return;
    const current = wave;
    current.shown = here();
    current.renderer?.setVisible(current.shown);
    current.hud?.setVisible(current.shown);
    const elapsed = (now() + current.offset - current.info.startsAtMs) / 1000;
    if (!current.done && elapsed >= 0) {
      const due = Math.floor(elapsed / TICK_SECONDS + 1e-6);
      let budget = MAX_TICKS_PER_FRAME;
      const events = [], recent = [];
      // v3 waves: an event is fresh by the tick it came from, not by its sim time (a finisher freezes the
      // sim's clock while real time runs on, so its outcome's t lies seconds behind).
      const lateTicks = Math.round(SHOWN_LATE_SECONDS / TICK_SECONDS);
      while (current.ticks < due && budget-- > 0 && !current.sim.done) {
        const out = current.sim.step(TICK_SECONDS, current.schedule.take(current.ticks));
        events.push(...out); if (current.ticks >= due - lateTicks) recent.push(...out);
        current.ticks++;
      }
      current.state = current.sim.state();
      if (events.length) handle(events, current, recent);
      if (current.sim.done) end(current);
    }
    if (wave !== current) return;
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
    const simTime = Math.max(0, Math.min(elapsed, current.ticks * TICK_SECONDS + TICK_SECONDS));
    for (let i = current.splashesAt.length - 1; i >= 0; i--) if (current.splashesAt[i] <= simTime) { current.splashesAt.splice(i, 1); cue('pirate-splash'); }
    const seconds = elapsed < 0 ? Math.ceil(-elapsed) : 0;
    if (seconds !== current.lastCount) { current.lastCount = seconds; if (seconds > 0 && seconds <= 3) cue('pirate-tick'); }
    current.hud?.countdown(current.done ? 0 : Math.min(seconds, 99));
    current.hud?.boss?.(current.boss && !current.done && elapsed < BOSS_WARNING_SECONDS ? current.boss : '');
    current.hud?.loot?.(startNextWave || runLoot > 0 ? runLoot : null);
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
        : actionAt({ x: player.x, z: player.z }, current.defenses, current.state, { repairReach: stats.repairReach })) : null;
    if (current.action?.kind === 'revive') current.hud?.prompt(revivePrompt(current), true, current.revive?.share ?? 0);
    else current.hud?.prompt(promptText(current.action), !!inputFor(current.action));
    if (pressed) { pressed = false; act(); }
    if (shootPressed || shootHeld) { shootPressed = false; if (!blocked()) shoot(); }
    // The button: "Cutlass" with a boarder in strike reach, else the equipped weapon's name (none while fallen).
    const blade = running && !!bladeTarget(player, current.state);
    current.hud?.musket?.(running && !fallen && !finishing(current) ? { share: blade ? bladeShare(current) : captainShare(current),
      ready: blade || !!captainTarget(player, current.state, myLevel(), stats.range), blade, label: stats.name } : null);
    current.hud?.health?.(me && !current.done && current.shown ? { hp: me.hp, maxHp: me.maxHp, down: me.down } : null);
    current.hud?.down?.(fallen && current.shown ? { seconds: Math.max(0, Math.floor(current.state.time - (me.downAt ?? current.state.time))),
      alone: !(current.state.party ?? []).some(hero => hero.id !== playerId && hero.present && !hero.down) } : null);
    current.hud?.marks?.(fallenMarks(current, player));
    const captain = player && current.shown && !current.done ? { id: playerId, x: player.x, z: player.z, share: captainShare(current), down: fallen } : null;
    current.renderer?.update({ state: current.state, simTime, dt, captain, figures,
      revive: current.revive && !current.revive.paying ? { targetId: current.revive.targetId, share: current.revive.share } : null });
    if (shake > 0 && world.camera) {
      const t = now() / 1000;
      world.camera.position.x += Math.sin(t * 61) * shake * .35; world.camera.position.y += Math.cos(t * 53) * shake * .25;
      shake = Math.max(0, shake - dt * 1.6);
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
        Promise.resolve(createFinisherScene({ container: world.container, me: playerId, easy: () => !!easyFinishers(), reducedMotion, recorder: entry.recorder,
          practiceIdentity: practiceIdentity(), onReady: () => { entry.ready = true; } }))
          .then(scene => { if (disposed || current.finisher !== entry || current.finished) scene?.dispose(); else entry.scene = scene; })
          .catch(error => console.error(error));
      }
    }
    const entry = current.finisher;
    if (entry.scene) {
      entry.scene.element && (entry.scene.element.hidden = !current.shown);
      entry.scene.update({ finisher: f, dt, boss: world.project?.(f.x, f.z, 1.5) ?? null });
    }
    if (f.phase === 'prepare' && f.players.includes(playerId) && (entry.ready || !world.container)
      && !f.ready.includes(playerId) && now() - (entry.readyAt ?? -Infinity) >= 1000) {
      entry.readyAt = now(); submit({type: 'finisher_ready', by: playerId, shipId: f.shipId});
    }
    if (!f.players.includes(playerId) || f.outcome || !(f.phase === 'task' || f.phase === 'grace')) return;
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
    pause.ready = current.answer !== undefined || pause.failed === true;
    if (left <= 0 && !pause.requested && !hold?.paused) {
      if (auto && pause.ready && !pause.note) next();
      // The break is over: ring the bell again for the next wave. With Auto next on, a refused try (note)
      // or a loot answer that never came must not keep the break (and the blocked input) forever.
      else if (!auto || pause.note || now() > pause.until + BREAK_GRACE_MS) { stop(); return; }
    }
    const loot = Number.isFinite(current.answer?.loot) ? ` · 🪙 +${current.answer.loot}` : '';
    current.hud?.pause?.({ title: `Wave ${current.info.wave} won!`, line: hold?.paused ? hold.line : pause.note ?? `${current.result.shipsSunk} ${current.result.shipsSunk === 1 ? 'ship' : 'ships'} sunk${loot}`,
      seconds: hold?.paused ? 0 : left, auto, ready: pause.ready && !pause.requested && !hold?.paused, paused: !!hold?.paused,
      hold: hold && toggleHold ? { label: hold.label, enabled: hold.canToggle === true } : null });
  }

  function end(current) {
    if (current.done) return;
    current.done = true;
    const result = current.result = current.sim.result();
    const run = typeof startNextWave === 'function', fallenAll = current.sim.endReason === 'captains_fallen';
    current.revive = null; current.pin = null;
    current.hud?.down?.(null); current.hud?.health?.(null); current.hud?.marks?.([]);
    if (run && result.survived) current.pause = { until: now() + breakSeconds * 1000, ready: false, requested: false, note: null };
    else if (run) current.hud?.banner(LOST_TITLE, `${fallenAll ? `${LOST_FALLEN} ` : ''}${LOST_LINE} Loot this run: 🪙 ${runLoot}`);
    else current.hud?.banner(result.survived ? 'Wave won!' : 'The island fell', fallenAll ? LOST_FALLEN : `${result.shipsSunk} ${result.shipsSunk === 1 ? 'ship' : 'ships'} sunk`);
    cue(result.survived ? 'pirate-victory' : 'pirate-defeat');
    emit({ type: 'wave_finished', waveId: current.info.waveId, survived: result.survived, shipsSunk: result.shipsSunk });
    void submitFinish(current);
    if (current.pause) return; // the break runs from update(); the next wave (or its end) cleans up
    const summary = { lampsRelit: current.lampsRelit, flagshipSunk: current.flagshipSunk, flagship: current.info.flagship, wave: current.info.wave };
    later(async () => {
      if (wave !== current) return;
      current.hud?.banner('');
      const id = current.shown ? cutsceneFor(result, summary) : null;
      try { if (id) await playCutscene(id); } catch { /* The cutscene is a bonus: the banner already said it. */ }
      if (wave === current) stop();
    }, run ? LOST_BEAT_MS : END_BEAT_MS);
  }

  async function submitFinish(current) {
    if (current.finishing) return;
    current.finishing = true;
    // v3 waves: the bonuses the sim saw (the galleon sunk, a finisher won); the server pays them only where the wave allows.
    const body = { waveId: current.info.waveId, survived: current.result.survived, shipsSunk: current.result.shipsSunk,
      ...(current.result.bonuses?.length ? { bonuses: [...current.result.bonuses] } : {}),
      // D039: only a wave that came with walls (the flag on) reports them back, every wall's percent.
      ...(current.info.walls ? { walls: healthReport(current.sim.state().walls) } : {}) };
    const attempt = async () => {
      try {
        current.answer = (await finishWave(body)) ?? null;
        if (Number.isFinite(current.answer?.loot)) runLoot += current.answer.loot;
        emit({ type: 'wave_finish_answered', waveId: body.waveId, loot: current.answer?.loot ?? null, runLoot });
      } catch (error) {
        const wait = tooEarlyWait(error);
        if (wait !== null && !disposed) later(attempt, wait * 1000);
        else { console.error(error); if (current.pause) current.pause.failed = true; }
      }
    };
    await attempt();
  }

  function stop() {
    const current = wave;
    if (!current) return;
    wave = null; current.finished = true;
    if (world.camera?.userData) { delete world.camera.userData.battleZoom; delete world.camera.userData.battleFocus; }
    current.renderer?.dispose(); current.hud?.dispose(); current.schedule.clear(); poses.clear();
    current.eventArt?.dispose(); current.finisher?.scene?.dispose(); current.finisher = null;
    emit({ type: 'wave_controller_stopped', waveId: current.info.waveId });
  }

  return {
    start, update,
    get wave() { return wave; },
    get state() { return wave?.state ?? null; },
    fire: (cannonId, targetId) => submit({ type: 'fire', cannonId, targetId }),
    shoot, aim: point => aimAt(point, null), next, setAuto,
    get auto() { return auto; },
    get runLoot() { return runLoot; },
    get inBreak() { return !!wave?.pause; },
    // Captain health (GAME-V3.md §3): your captain in the sim ({id, x, z, hp, maxHp, down, ...} or null),
    // whether you are down (no walking, shooting or building), and the revive you hold ({targetId, share}).
    get captain() { return meIn(wave); },
    get captainDown() { return isDown(wave); },
    get revive() { return wave?.revive ? { targetId: wave.revive.targetId, share: wave.revive.share, paying: wave.revive.paying } : null; },
    get playerId() { return playerId; },
    // The pose of a captain of the wave on screen ({kind, flip, age} from poses.js, or null): your own by
    // playerId, a teammate's by their sim id. Drawing only.
    pose(by) { return wave && !wave.finished && wave.shown ? poses.get(by) : null; },
    // Where the presence draws the other captains (src/pirates/figures.js figurePositions: sim id -> {x, z}),
    // so their hp bars sit over the figures; null draws them where the sim has them.
    setFigures(value) { figures = value instanceof Map ? value : null; },
    // The island changed (an upgrade or a new building, ours or a friend's): once the wave is decided, in the
    // break, its posts show the new levels. A wave under way keeps the defenses it started with.
    refreshDefenses() {
      if (!wave?.done || !wave.renderer) return false;
      wave.renderer.setDefenses?.(getDefenses() ?? []); return true;
    },
    setCaptainLevel(value) { level = Number.isInteger(value) ? value : null; },
    // Override the getters (tests, the dev harness): null goes back to captainSkills() / captainWeapon().
    setCaptainSkills(value) { skills = Array.isArray(value) ? readSkills(value) : null; },
    setCaptainWeapon(value) { weapon = typeof value === 'string' ? readWeapon(value) : null; },
    get captainStats() { return myStats(); },
    repair: wallId => submit({ type: 'repair', wallId, skills: mySkills() }),
    lampsLit() {
      if (!wave || !wave.info.flagship || wave.lampsSent) return false;
      if (!submit({ type: 'lamps_lit' })) return false;
      wave.lampsSent = true; return true;
    },
    dispose() {
      if (disposed) return;
      stop(); disposed = true;
      for (const id of timers) clearTimer(id);
      timers.clear(); stops.splice(0).forEach(stopListening => stopListening());
      if (typeof window !== 'undefined') { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', letGo); }
      world.canvas?.removeEventListener('pointerdown', pointerdown);
      world.canvas?.removeEventListener('pointerup', pointerup);
    },
  };
}
