// One pirate wave from the bell to the loot (lanes P3 to P5). Listens to `wave_started_server` (the
// island lane emits it once the start or join route answered), builds the deterministic sim from the
// server's seed, wave, weather and flagship, waits for startsAt (server time), runs the sim tick by
// tick on that clock, draws it, takes the player's shots and repairs (sent to the room and applied in
// sync, see sync.js), and when the sim is done calls finishWave once (again after waitSeconds on
// 409 wave_too_early), emits `wave_finished`, plays wave_won or wave_lost and cleans up.
//
//   const waves = createWaveController({bus, world, getDefenses, finishWave, room, sound, reducedMotion, quality});
//   waves.update(dt)   every frame (mountPirates drives it)       waves.start(info)  without the bus
//   waves.fire(cannonId, targetId) / waves.repair(wallId) / waves.lampsLit()      waves.dispose()
//
// world: {scene, camera, canvas, container, player: {position}, place(): current place id,
//   isBlocked(): an overlay is open, unproject(clientX, clientY): logical {x, z}}; every field optional.
// room: {send(type, payload), on(type, handler) -> unsubscribe}, the island's or Pirate Point's live room.
import { createWave } from './sim.js';
import { INPUT_LEAD_TICKS, ROOM_EVENTS, TICK_SECONDS, createInputSchedule, readMessage, toMessage } from './sync.js';
import { actionAt, inputFor, promptText, shipAt, tapInput } from './interact.js';

const MAX_TICKS_PER_FRAME = 600;      // a friend joining late catches up 30 s of wave per frame
const SHOWN_LATE_SECONDS = 1;         // events older than this (catching up) are not drawn or heard
const END_BEAT_MS = 1800;             // the last ship sinks on screen before the cutscene
const DEFAULT_WAIT_SECONDS = 5;
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
  setTimer = (run, ms) => setTimeout(run, ms), clearTimer = id => clearTimeout(id), onEvents = null } = {}) {
  let wave = null, disposed = false, pressed = false, down = null, shake = 0;
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
  const keydown = event => {
    if (event.code !== 'KeyE' || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, select, textarea, button, [contenteditable=true]')) return;
    pressed = true;
  };
  const pointerdown = event => { if (event.button === 0) down = [event.clientX, event.clientY]; };
  const pointerup = event => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 8) { down = null; return; }
    down = null; tap(event.clientX, event.clientY);
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', keydown);
  world.canvas?.addEventListener('pointerdown', pointerdown);
  world.canvas?.addEventListener('pointerup', pointerup);

  function start(raw) {
    if (disposed) return null;
    const info = raw?.startsAtMs !== undefined ? raw : readWaveInfo(raw);
    if (!info) return null;
    if (wave?.info.waveId === info.waveId) return wave;
    if (wave) stop();
    const defenses = getDefenses() ?? [];
    const offset = info.serverTimeMs !== null ? info.serverTimeMs - now() : serverOffset();
    const sim = createWave({ seed: info.seed, wave: info.wave, weather: info.weather, flagship: info.flagship, defenses, countdown: 0, ...simOptions });
    const current = wave = { info, sim, defenses, offset, ticks: 0, seq: 0, schedule: createInputSchedule(), done: false, finished: false,
      result: null, renderer: null, hud: null, shown: false, lampsSent: false, lampsRelit: false, flagshipSunk: false,
      splashesAt: [], lastCount: null, state: sim.state(), action: null, lanes: [], lean: { x: 0, z: 0 } };
    emit({ type: 'wave_controller_started', waveId: info.waveId, wave: info.wave, flagship: info.flagship });
    if (world.scene) {
      Promise.resolve(createRenderer({ scene: world.scene, defenses, reducedMotion, quality, beamFrom })).then(renderer => {
        if (disposed || wave !== current || current.finished) renderer?.dispose(); else current.renderer = renderer;
      }).catch(error => console.error(error));
    }
    if (world.container) {
      Promise.resolve(createHud({ container: world.container, onAction: () => act(), reducedMotion })).then(hud => {
        if (disposed || wave !== current || current.finished) hud?.dispose(); else current.hud = hud;
      }).catch(error => console.error(error));
    }
    current.shown = here();
    cue('pirate-bell');
    return current;
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

  function act() {
    if (!wave || blocked() || !here()) return;
    const input = inputFor(wave.action);
    if (input) submit(input);
  }
  function tap(clientX, clientY) {
    if (!wave || blocked() || !here() || wave.action?.kind !== 'fire' || !world.unproject) return;
    const point = world.unproject(clientX, clientY), ship = point && shipAt(point, wave.state);
    const input = tapInput(wave.action, ship, wave.state);
    if (input) submit(input);
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
      } else if (event.type === 'ship_hit' && !event.blocked) cue('pirate-hit');
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
    current.hud?.bar(current.done && !current.finished ? current.state : current.state.phase === 'countdown' ? countdownBar(current) : current.state);
    const player = world.player?.position;
    current.action = !current.done && current.shown && !blocked() && player ? actionAt({ x: player.x, z: player.z }, current.defenses, current.state) : null;
    current.hud?.prompt(promptText(current.action), !!inputFor(current.action));
    if (pressed) { pressed = false; act(); }
    current.renderer?.update({ state: current.state, simTime, dt });
    if (shake > 0 && world.camera) {
      const t = now() / 1000;
      world.camera.position.x += Math.sin(t * 61) * shake * .35; world.camera.position.y += Math.cos(t * 53) * shake * .25;
      shake = Math.max(0, shake - dt * 1.6);
    }
  }
  const countdownBar = current => ({ wave: current.info.wave, shipsLeft: current.state.total, islandHp: current.state.islandHp, maxIslandHp: current.state.maxIslandHp });

  function end(current) {
    if (current.done) return;
    current.done = true;
    const result = current.result = current.sim.result();
    current.hud?.banner(result.survived ? 'Wave won!' : 'The island fell', `${result.shipsSunk} ${result.shipsSunk === 1 ? 'ship' : 'ships'} sunk`);
    cue(result.survived ? 'pirate-victory' : 'pirate-defeat');
    emit({ type: 'wave_finished', waveId: current.info.waveId, survived: result.survived, shipsSunk: result.shipsSunk });
    void submitFinish(current);
    const summary = { lampsRelit: current.lampsRelit, flagshipSunk: current.flagshipSunk, flagship: current.info.flagship, wave: current.info.wave };
    later(async () => {
      if (wave !== current) return;
      current.hud?.banner('');
      const id = current.shown ? cutsceneFor(result, summary) : null;
      try { if (id) await playCutscene(id); } catch { /* The cutscene is a bonus: the banner already said it. */ }
      if (wave === current) stop();
    }, END_BEAT_MS);
  }

  async function submitFinish(current) {
    if (current.finishing) return;
    current.finishing = true;
    const body = { waveId: current.info.waveId, survived: current.result.survived, shipsSunk: current.result.shipsSunk };
    const attempt = async () => {
      try { current.answer = await finishWave(body); emit({ type: 'wave_finish_answered', waveId: body.waveId }); }
      catch (error) {
        const wait = tooEarlyWait(error);
        if (wait !== null && !disposed) later(attempt, wait * 1000);
        else console.error(error);
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
      if (typeof window !== 'undefined') window.removeEventListener('keydown', keydown);
      world.canvas?.removeEventListener('pointerdown', pointerdown);
      world.canvas?.removeEventListener('pointerup', pointerup);
    },
  };
}
