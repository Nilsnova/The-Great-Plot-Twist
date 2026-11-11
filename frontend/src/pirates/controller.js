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
// The captain (§10): click or tap a ship in range, or press F for the nearest, to fire your musket
// (captainLevel(), your own level), sent to the room like a cannon shot.
//
//   const waves = createWaveController({bus, world, getDefenses, finishWave, room, sound, reducedMotion, quality});
//   waves.update(dt)   every frame (mountPirates drives it)       waves.start(info)  without the bus
//   waves.fire(cannonId, targetId) / waves.repair(wallId) / waves.lampsLit()      waves.dispose()
//   waves.shoot(targetId?) the captain's musket   waves.aim({x, z}) free aim   waves.next() / waves.setAuto(on)  the break
//
// world: {scene, camera, canvas, container, player: {position}, place(): current place id,
//   isBlocked(): an overlay is open, unproject(clientX, clientY): logical {x, z}}; every field optional.
// room: {send(type, payload), on(type, handler) -> unsubscribe}, the island's or Pirate Point's live room.
import { CONFIG, createWave } from './sim.js';
import { INPUT_LEAD_TICKS, ROOM_EVENTS, TICK_SECONDS, createInputSchedule, readMessage, toMessage } from './sync.js';
import { actionAt, inputFor, promptText, shipAt, tapInput } from './interact.js';

const MAX_TICKS_PER_FRAME = 600;      // a friend joining late catches up 30 s of wave per frame
const SHOWN_LATE_SECONDS = 1;         // events older than this (catching up) are not drawn or heard
const END_BEAT_MS = 1800;             // the last ship sinks on screen before the cutscene
const LOST_BEAT_MS = 4500;            // a lost run's result stays up a little longer
const DEFAULT_WAIT_SECONDS = 5;
const AIM_RADIUS = 8;                 // free aim: a ship this close to the aim point is hit
const SETTLE_TICKS = 20000;           // more than the longest wave (900 s)
const BREAK_GRACE_MS = 10000;         // with Auto next on, the break waits this long for the loot answer
export const bossText = warships => (warships >= 2 ? '⚠ Boss wave: two warships!' : '⚠ Boss wave: a warship!');
export const BREAK_SECONDS = 8;       // the break after a won wave (TOWER-DEFENSE.md §1; faster pace, owner 11 Nov)
const BOSS_WARNING_SECONDS = 6;       // the boss warning stays this long after the wave starts
export const AUTO_KEY = 'tgpt:pirates:auto-next';
export const LOST_TITLE = 'The pirates broke through';
export const LOST_LINE = 'Rebuild and ring the bell again.';
const readAuto = () => { try { return globalThis.localStorage?.getItem(AUTO_KEY) === '1'; } catch { return false; } };
const writeAuto = value => { try { globalThis.localStorage?.setItem(AUTO_KEY, value ? '1' : '0'); } catch { /* private mode: kept for this visit */ } };
/** The nearest ship within the captain's range of (x, z), or null. */
export function captainTarget(player, state, level = 1) {
  const range = CONFIG.captain.levels[Math.min(5, Math.max(1, level)) - 1].range;
  let best = null, bestDistance = range;
  for (const ship of state?.ships ?? []) {
    const d = Math.hypot(ship.x - player.x, ship.z - player.z);
    if (d <= bestDistance) { best = ship; bestDistance = d; }
  }
  return best;
}
let atlasPromise = null;

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
  const points = state?.ships?.length ? state.ships : lanes;
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
    boss: typeof info.boss === 'boolean' ? info.boss : undefined,
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
  atlasPromise ??= module.loadAtlas().catch(error => { atlasPromise = null; throw error; });
  return module.createWaveRenderer({ ...options, atlas: await atlasPromise });
};
const defaultHud = async options => (await import('./hud.js')).createWaveHud(options);

export function createWaveController({ bus, world = {}, getDefenses = () => [], finishWave = async () => null, room = null,
  sound = null, reducedMotion = () => false, quality = () => 'high', playerId = `p-${Math.random().toString(36).slice(2, 10)}`,
  now = () => Date.now(), serverOffset = () => 0, place = null, accept = info => info.flagship !== true, listen = true,
  simOptions = {}, beamFrom = null, cutsceneFor = (result, summary) => (summary.lampsRelit ? 'lamps_relit' : result.survived ? 'wave_won' : 'wave_lost'),
  playCutscene = defaultCutscene(world, reducedMotion), createRenderer = defaultRenderer, createHud = defaultHud,
  setTimer = (run, ms) => setTimeout(run, ms), clearTimer = id => clearTimeout(id), onEvents = null,
  getCrew = () => null, captainLevel = () => 1, startNextWave = null, breakSeconds = BREAK_SECONDS,
  loadAuto = readAuto, saveAuto = writeAuto } = {}) {
  let wave = null, disposed = false, pressed = false, shootPressed = false, shootHeld = false, down = null, shake = 0;
  let runLoot = 0, auto = !!loadAuto(), level = null;
  const myLevel = () => { const value = Number(level ?? captainLevel()); return Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1; };
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
    if (event.code === 'KeyF') { shootHeld = true; if (!event.repeat) shootPressed = true; } else if (!event.repeat) pressed = true;
  };
  const keyup = event => { if (event.code === 'KeyF') shootHeld = false; };
  const letGo = () => { shootHeld = false; };
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
    const defenses = getDefenses() ?? [];
    const offset = info.serverTimeMs !== null ? info.serverTimeMs - now() : serverOffset();
    const sim = createWave({ seed: info.seed, wave: info.wave, weather: info.weather, flagship: info.flagship, defenses, countdown: 0,
      crew: getCrew() ?? undefined, ...(info.boss !== undefined ? { boss: info.boss } : {}), ...simOptions });
    const first = sim.state();
    const current = wave = { info, sim, defenses, offset, ticks: 0, seq: 0, schedule: createInputSchedule(), done: false, finished: false,
      pause: null, boss: first.boss ? bossText(first.warships) : '', captainAt: -Infinity,
      result: null, renderer: null, hud: null, shown: false, lampsSent: false, lampsRelit: false, flagshipSunk: false,
      splashesAt: [], lastCount: null, state: sim.state(), action: null, lanes: [], lean: { x: 0, z: 0 } };
    emit({ type: 'wave_controller_started', waveId: info.waveId, wave: info.wave, flagship: info.flagship });
    if (world.scene) {
      Promise.resolve(createRenderer({ scene: world.scene, defenses, reducedMotion, quality, beamFrom })).then(renderer => {
        if (disposed || wave !== current || current.finished) renderer?.dispose(); else current.renderer = renderer;
      }).catch(error => console.error(error));
    }
    if (world.container) {
      Promise.resolve(createHud({ container: world.container, onAction: () => act(), onNext: () => next(), onAuto: value => setAuto(value),
        onShoot: held => { shootHeld = held === true; if (held) shootPressed = true; },
        reducedMotion })).then(hud => {
        if (disposed || wave !== current || current.finished) hud?.dispose(); else current.hud = hud;
      }).catch(error => console.error(error));
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
  function submit(input) {
    if (!wave || wave.done || wave.state.phase !== 'running') return false;
    const entry = { by: playerId, seq: ++wave.seq, tick: wave.ticks + INPUT_LEAD_TICKS, input };
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

  // The captain's musket: at a ship (a tap) or the nearest in range (F), from where the player stands.
  function shoot(targetId = null) {
    const player = world.player?.position;
    if (!wave || wave.done || !player || !here()) return false;
    const lvl = myLevel(), stats = CONFIG.captain.levels[lvl - 1], state = wave.state;
    const ship = targetId ? state.ships.find(item => item.id === targetId) : captainTarget(player, state, lvl);
    if (!ship || Math.hypot(ship.x - player.x, ship.z - player.z) > stats.range) return false;
    const t = wave.ticks * TICK_SECONDS;
    if (t - wave.captainAt < stats.reload) return false;
    const input = { type: 'captain_shot', by: playerId, targetId: ship.id, level: lvl,
      x: Math.round(player.x * 100) / 100, z: Math.round(player.z * 100) / 100 };
    if (!submit(input)) return false;
    wave.captainAt = t + INPUT_LEAD_TICKS * TICK_SECONDS;
    return true;
  }
  function captainShare(current) {
    const reload = CONFIG.captain.levels[myLevel() - 1].reload, t = current.ticks * TICK_SECONDS;
    return Math.max(0, Math.min(1, (t - current.captainAt) / reload));
  }

  // The break after a won wave.
  function setAuto(value) { auto = value === true; saveAuto(auto); }
  function next() {
    const current = wave;
    if (!current?.pause || !current.pause.ready || current.pause.requested || !startNextWave) return false;
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
    if (!wave || blocked() || !here()) return;
    const input = inputFor(wave.action);
    if (input) submit(input);
  }
  function tap(clientX, clientY) {
    if (!wave || wave.done || blocked() || !here() || !world.unproject) return;
    const point = world.unproject(clientX, clientY), ship = point && shipAt(point, wave.state);
    const input = wave.action?.kind === 'fire' ? tapInput(wave.action, ship, wave.state) : null;
    if (input) submit(input);
    else aimAt(point, ship); // not manning a cannon (or out of its reach): the musket
  }
  // Free aim (owner, 11 Nov: "shooting when not pressing on something"): a click or tap anywhere fires the
  // musket that way. It hits the ship tapped, else the ship in range nearest to the aim point (within
  // AIM_RADIUS of it); with none there the shot is a visible miss on this screen only (nothing to sync).
  function aimAt(point, ship) {
    const player = world.player?.position;
    if (!wave || wave.done || !point || !player || wave.state.phase !== 'running') return false;
    const lvl = myLevel(), stats = CONFIG.captain.levels[lvl - 1];
    const inRange = item => Math.hypot(item.x - player.x, item.z - player.z) <= stats.range;
    let target = ship && inRange(ship) ? ship : null;
    if (!target) {
      let best = AIM_RADIUS;
      for (const item of wave.state.ships) {
        const d = Math.hypot(item.x - point.x, item.z - point.z);
        if (d <= best && inRange(item)) { best = d; target = item; }
      }
    }
    if (target) return shoot(target.id);
    const t = wave.ticks * TICK_SECONDS;
    if (t - wave.captainAt < stats.reload) return false;
    wave.captainAt = t;
    const dx = point.x - player.x, dz = point.z - player.z, length = Math.hypot(dx, dz) || 1, reach = Math.min(length, stats.range);
    const toX = player.x + dx / length * reach, toZ = player.z + dz / length * reach;
    wave.renderer?.events([{ type: 'captain_fired', t, by: playerId, level: lvl, x: player.x, z: player.z, toX, toZ,
      impactAt: t + reach / CONFIG.captain.shotSpeed, miss: true }]);
    cue('pirate-cannon-manual');
    return true;
  }

  function handle(events, current, simTime) {
    const shownFrom = simTime - SHOWN_LATE_SECONDS;
    const fresh = events.filter(event => (event.t ?? 0) >= shownFrom);
    for (const event of events) {
      emit(event);
      if (event.type === 'wave_started') current.lanes = event.lanes ?? [];
      if (event.type === 'ship_sunk' && event.kind === 'flagship') { current.flagshipSunk = true; current.lampsRelit = event.by === 'lamps'; }
    }
    if (current.shown) current.renderer?.events(fresh);
    for (const event of fresh) {
      if (event.type === 'cannon_fired') {
        cue(event.manual ? 'pirate-cannon-manual' : 'pirate-cannon');
        if (!event.hit) current.splashesAt.push(event.impactAt);
      } else if (event.type === 'mortar_fired') cue('pirate-cannon');
      else if (event.type === 'mortar_impact') { cue(event.hits ? 'pirate-hit' : 'pirate-splash'); kick(.08); }
      else if (event.type === 'captain_fired') cue('pirate-cannon-manual'); else if (event.type === 'ship_hit' && !event.blocked) cue('pirate-hit');
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
      const events = [];
      while (current.ticks < due && budget-- > 0 && !current.sim.done) {
        events.push(...current.sim.step(TICK_SECONDS, current.schedule.take(current.ticks)));
        current.ticks++;
      }
      current.state = current.sim.state();
      if (events.length) handle(events, current, elapsed);
      if (current.sim.done) end(current);
    }
    if (wave !== current) return;
    if (world.camera?.userData) {
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
    current.action = !current.done && current.shown && !blocked() && player ? actionAt({ x: player.x, z: player.z }, current.defenses, current.state) : null;
    current.hud?.prompt(promptText(current.action), !!inputFor(current.action));
    if (pressed) { pressed = false; act(); }
    if (shootPressed || shootHeld) { shootPressed = false; if (!blocked()) shoot(); }
    const running = player && current.shown && !current.done && current.state.phase === 'running';
    current.hud?.musket?.(running ? { share: captainShare(current), ready: !!captainTarget(player, current.state, myLevel()) } : null);
    const captain = player && current.shown && !current.done ? { x: player.x, z: player.z, share: captainShare(current) } : null;
    current.renderer?.update({ state: current.state, simTime, dt, captain });
    if (shake > 0 && world.camera) {
      const t = now() / 1000;
      world.camera.position.x += Math.sin(t * 61) * shake * .35; world.camera.position.y += Math.cos(t * 53) * shake * .25;
      shake = Math.max(0, shake - dt * 1.6);
    }
  }
  const countdownBar = current => ({ wave: current.info.wave, shipsLeft: current.state.total, islandHp: current.state.islandHp, maxIslandHp: current.state.maxIslandHp });

  function updatePause(current) {
    const pause = current.pause, left = Math.max(0, Math.ceil((pause.until - now()) / 1000 - 1e-9));
    pause.ready = current.answer !== undefined || pause.failed === true;
    if (left <= 0 && !pause.requested) {
      if (auto && pause.ready && !pause.note) next();
      // The break is over: ring the bell again for the next wave. With Auto next on, a refused try (note)
      // or a loot answer that never came must not keep the break (and the blocked input) forever.
      else if (!auto || pause.note || now() > pause.until + BREAK_GRACE_MS) { stop(); return; }
    }
    const loot = Number.isFinite(current.answer?.loot) ? ` · 🪙 +${current.answer.loot}` : '';
    current.hud?.pause?.({ title: `Wave ${current.info.wave} won!`, line: pause.note ?? `${current.result.shipsSunk} ${current.result.shipsSunk === 1 ? 'ship' : 'ships'} sunk${loot}`,
      seconds: left, auto, ready: pause.ready && !pause.requested });
  }

  function end(current) {
    if (current.done) return;
    current.done = true;
    const result = current.result = current.sim.result();
    const run = typeof startNextWave === 'function';
    if (run && result.survived) current.pause = { until: now() + breakSeconds * 1000, ready: false, requested: false, note: null };
    else if (run) current.hud?.banner(LOST_TITLE, `${LOST_LINE} Loot this run: 🪙 ${runLoot}`);
    else current.hud?.banner(result.survived ? 'Wave won!' : 'The island fell', `${result.shipsSunk} ${result.shipsSunk === 1 ? 'ship' : 'ships'} sunk`);
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
    const body = { waveId: current.info.waveId, survived: current.result.survived, shipsSunk: current.result.shipsSunk };
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
    current.renderer?.dispose(); current.hud?.dispose(); current.schedule.clear();
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
    setCaptainLevel(value) { level = Number.isInteger(value) ? value : null; },
    repair: wallId => submit({ type: 'repair', wallId }),
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
