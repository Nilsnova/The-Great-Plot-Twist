// Pirate Point (lane 0, task 0.4, frontend): the armada battle on lighthouse_isle for everyone present.
// Fixed shared defenses (4 cannons, 4 walls) owned by nobody; anyone rings the Pirate Point bell
// (POST /api/waves/start {where: 'pirate_point'}) or joins the running wave (GET /api/waves/current
// ?where=pirate_point, then POST /api/waves/join). Everybody plays the same sim (flagship: true) in the
// room live:place:pirate_point:1. The three lamps reuse the class demo's mechanic (lamp-sync.js,
// lamps.js): three captains hold E at three lamp posts within one 20 s window (the host or a rehearsal
// may fill missing lamps); once all three burn, {type: 'lamps_lit'} goes to the sim and the room, the
// lighthouse beam burns the flagship, and lamps_relit plays after the wave. The armada cutscene plays
// once per wave when it starts.
import * as THREE from 'three';
import { cameraAnchors } from '../world/lighthouse.js';
import { projectPoint } from '../world/art.js';
import { createWaveController } from './controller.js';
import { createRoomProxy } from './room.js';
import './pirates.css';

export const PLACE = 'lighthouse_isle';
export const ROOM_TOPIC = 'live:place:pirate_point:1';
// Lighthouse Isle's drawn coast (about 22 × 19 units around the middle) for the sea lanes. The armada
// comes from the open sea in the east, on lanes that keep clear of the jetty and the forest.
export const COAST = Object.freeze({ rx: 22, rz: 19, seed: 0 });
export const LANES = Object.freeze([
  Object.freeze({ id: 'east', bearing: -8 }), Object.freeze({ id: 'south_east', bearing: 38 }),
  Object.freeze({ id: 'north_east', bearing: -60 }),
]);
// The shared defenses around the lighthouse (9, -8), on open sand and grass of Lighthouse Isle (clear
// of its trees, so they can be seen and manned): walls on the three beaches the lanes land on.
export const DEFENSES = Object.freeze([
  { id: 'cannon_1', kind: 'cannon', x: 12, z: -12 }, { id: 'cannon_2', kind: 'cannon', x: 11, z: 12.5 },
  { id: 'cannon_3', kind: 'cannon', x: 12.5, z: -3 }, { id: 'cannon_4', kind: 'cannon', x: 3, z: 12.5 },
  { id: 'wall_1', kind: 'wall', x: 20, z: -1 }, { id: 'wall_2', kind: 'wall', x: 15.5, z: 11 },
  { id: 'wall_3', kind: 'wall', x: 12, z: -15.5 }, { id: 'wall_4', kind: 'wall', x: 19.5, z: 5 },
].map(item => Object.freeze(item)));
export const BELL_SPOT = Object.freeze({ id: 'pirate_bell', x: 3, z: -3, radius: 2 });
export const LAMP_SPOTS = Object.freeze([
  Object.freeze({ id: 'point_lamp_1', index: 0, x: 4.5, z: -8, radius: 1.6 }),
  Object.freeze({ id: 'point_lamp_2', index: 1, x: 9, z: -3.5, radius: 1.6 }),
  Object.freeze({ id: 'point_lamp_3', index: 2, x: 13.5, z: -8, radius: 1.6 }),
]);
export const LAMP_HINT_SECONDS = 6, LAMP_HINT_NEAR = 3;
/** The lamp hint's clock: shown for LAMP_HINT_SECONDS, again when the wave's phase or the lit count changes or near a lamp. Pure. */
export function lampHint(prev, { key, lit, near, dt = 0 }) {
  const fresh = prev.key !== key || prev.lit !== lit || near;
  const age = fresh ? 0 : prev.age + Math.max(0, dt);
  return { age, key, lit, tucked: age > LAMP_HINT_SECONDS };
}
export const BEAM_FROM = Object.freeze({ x: cameraAnchors.lamp_room.x, y: cameraAnchors.lamp_room.y });

const nearest = (spots, player) => {
  let best = null, bestDistance = Infinity;
  for (const spot of spots) {
    const d = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (d <= spot.radius && d < bestDistance) { best = spot; bestDistance = d; }
  }
  return best;
};

// The Pirate Point bell: an original code-drawn post, yoke and bronze bell (no outside asset).
function createBell(scene, { x, z }) {
  const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 40;
  const c = canvas.getContext('2d');
  const rects = [[10, 14, 4, 26, '#4a3a28'], [8, 36, 8, 4, '#2f251a'], [3, 6, 18, 3, '#5b4630'], [3, 6, 2, 10, '#4a3a28'], [19, 6, 2, 10, '#4a3a28'],
    [8, 9, 8, 2, '#a8752c'], [7, 11, 10, 7, '#c48a33'], [6, 18, 12, 3, '#a8752c'], [8, 11, 3, 6, '#e3b25a'], [11, 21, 2, 2, '#3a2a12'], [11, 2, 2, 4, '#5b4630']];
  for (const [rx, ry, w, h, colour] of rects) { c.fillStyle = colour; c.fillRect(rx, ry, w, h); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(24 / 16, 40 / 16); geometry.translate(0, 40 / 16 * .47, 0);
  const mesh = new THREE.Mesh(geometry, material), point = projectPoint(x, z);
  mesh.position.set(point.x, point.y, 0); mesh.renderOrder = 100 + z; mesh.frustumCulled = false; mesh.name = 'pirate-point-bell';
  scene.add(mesh);
  return { mesh, setVisible(value) { mesh.visible = value; },
    ring(fx, still) { fx?.ring(point.x, point.y + 1.8, { radius: 2.6, life: .8, colour: '#f3d58c' }); if (!still) fx?.ring(point.x, point.y + 1.8, { radius: 5, life: 1.2, delay: .25, colour: '#e9d39a' }); },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); } };
}

const actionUid = () => `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * createPiratePoint({bus, world, api, openRoom, sound, reducedMotion, quality, playerId, input, rehearsal})
 * api: {startWave, joinWave, currentWave, finishWave} (the fake API or the island lane's client).
 * openRoom(topic) -> room or null. createFinale/createObjects/createBellMesh/playCutscene/notify: overrides.
 */
export function createPiratePoint(ctx) {
  const { bus, world = {}, api, sound = null, reducedMotion = () => false, input = null } = ctx;
  const room = createRoomProxy();
  let realRoom = null, finale = null, objects = null, bell = null, disposed = false, busy = false, pressed = false;
  let relitPending = false, relitShown = false, lampsShownFor = null, sentLampsAt = null, promptKey = '';
  // The lamp hint tucks itself away after LAMP_HINT_SECONDS and comes back near a lamp or when a lamp lights.
  let hint = { age: 0, key: null, lit: -1, tucked: false };
  const armadaShown = new Set(), stops = [];
  const here = () => (world.place?.() ?? null) === PLACE;
  const notify = ctx.notify ?? (() => {});
  const playCutscene = ctx.playCutscene ?? (async id => {
    if (!world.container) return null;
    const module = await import('../cutscenes/player.js');
    return module.playCutscene({ container: world.container, id, reducedMotion }).done;
  });
  const controller = createWaveController({ bus, world, room, sound, reducedMotion, quality: ctx.quality, playerId: ctx.playerId,
    // The towers and walls players built at Pirate Point (§5, GET /api/pirate-point) with their levels; the
    // fixed defenses only while nobody has built anything there yet.
    getDefenses: () => { const built = ctx.getDefenses?.(); return built?.length ? built : DEFENSES.map(item => ({ ...item })); }, place: PLACE, listen: false, accept: info => info.flagship === true,
    simOptions: { coast: COAST, lanes: LANES }, beamFrom: BEAM_FROM, playCutscene, captainLevel: ctx.captainLevel ?? (() => 1),
    finishWave: async body => { const answer = await api.finishWave(body); if (answer?.loot) notify(`Pirate Point loot: 🪙 ${answer.loot}`); return answer; },
    ...ctx.controllerOptions });

  const layer = world.container ? document.createElement('div') : null;
  let prompt = null;
  if (layer) {
    layer.className = 'pirate-point-layer'; world.container.append(layer);
    prompt = document.createElement('div'); prompt.className = 'pirate-point-prompt'; prompt.hidden = true; layer.append(prompt);
  }
  if (world.scene && typeof document !== 'undefined') bell = (ctx.createBellMesh ?? createBell)(world.scene, BELL_SPOT);

  async function ensureObjects() {
    if (objects || !world.scene) return objects;
    const create = ctx.createObjects ?? (await import('../class-demo/world-objects.js')).createDemoObjects;
    if (disposed) return null;
    objects = create({ scene: world.scene, reducedMotion, lampSpots: LAMP_SPOTS, beam: BEAM_FROM, lock: false, poolKey: 'pirate-point' });
    return objects;
  }
  // A fresh lamp round for every wave: the class demo's finale, its messages in our room.
  async function newFinale(waveId) {
    finale?.dispose(); finale = null; relitPending = false; relitShown = false;
    const create = ctx.createFinale ?? (await import('../class-demo/lamps.js')).createLampFinale;
    if (disposed || controller.wave?.info.waveId !== waveId) return;
    finale = create({ container: layer ?? world.container, myName: () => 'Captain', canFill: () => ctx.rehearsal === true || ctx.host === true,
      send: (event, data) => room.send(event, { ...data, waveId }) !== false,
      helpers: ctx.rehearsal ? (lit, light) => [0, 1, 2].filter(index => index !== lit)
        .forEach((index, order) => setTimeout(() => { if (!disposed) light(index); }, 2500 * (order + 1))) : null,
      onLit: () => { sound?.cue?.('festival-claim'); bus?.emit?.({ type: 'pirate_lamp_lit', waveId }); },
      onRelit: () => { relitPending = true; relitShown = true; objects?.setRelit(true, { celebrate: true }); } });
    void ensureObjects();
  }

  function begin(info) {
    const wave = controller.start(info);
    if (!wave) return null;
    const waveId = wave.info.waveId;
    if (lampsShownFor !== waveId) { lampsShownFor = waveId; void newFinale(waveId); }
    if (!armadaShown.has(waveId) && here()) {
      armadaShown.add(waveId);
      Promise.resolve(playCutscene('armada')).catch(() => {});
    }
    return wave;
  }
  async function join(waveId) {
    if (controller.wave?.info.waveId === waveId) return;
    try { begin(await api.joinWave({ waveId })); } catch (error) { if (error?.code !== 'wave_over') console.error(error); }
  }
  async function refresh() {
    try { const current = await api.currentWave('pirate_point'); if (current && !disposed) await join(current.waveId); }
    catch (error) { console.error(error); }
  }
  async function ringBell() {
    if (busy || controller.wave) return false;
    busy = true;
    try {
      const info = await api.startWave({ where: 'pirate_point', actionUid: actionUid() });
      if (disposed) return false;
      bell?.ring(world.scene?.userData?.pixelFx, reducedMotion());
      room.send('wave_start', { waveId: info.waveId, seed: info.seed, startsAt: info.startsAt });
      return !!begin(info);
    } catch (error) {
      if (error?.code === 'wave_running') { await refresh(); return true; }
      notify(error?.message ?? 'The bell could not ring. Try again.');
      return false;
    } finally { busy = false; }
  }

  stops.push(room.on('wave_start', payload => { if (typeof payload?.waveId === 'string' && payload.waveId.length <= 64) void join(payload.waveId); }));
  stops.push(room.on('lamp', payload => { if (payload?.waveId === controller.wave?.info.waveId) finale?.receive(payload); }));
  function openRoom() {
    if (realRoom) return;
    realRoom = ctx.openRoom?.(ROOM_TOPIC) ?? null;
    room.attach(realRoom);
  }
  function closeRoom() { room.attach(null); realRoom?.close?.(); realRoom = null; }
  if (bus?.on) {
    stops.push(bus.on('arrived', event => { if (event.place === PLACE) { openRoom(); void refresh(); } }));
    stops.push(bus.on('travel', () => closeRoom()));
  }
  if (here()) { openRoom(); void refresh(); }
  const keydown = event => {
    if (event.code !== 'KeyE' || event.repeat) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, [contenteditable=true]')) return;
    pressed = true;
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', keydown);

  function showPrompt(next) {
    if (!prompt) return;
    const key = next ? `${next.kind}:${next.index ?? ''}:${next.lit ?? ''}` : '';
    if (key === promptKey) return;
    promptKey = key; prompt.replaceChildren(); prompt.hidden = !next; prompt.holdBar = null;
    if (!next) return;
    if (next.kind === 'bell') {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'kit-button';
      const kbd = document.createElement('kbd'); kbd.textContent = 'E';
      button.append(kbd, document.createTextNode('Ring the Pirate Point bell'));
      button.addEventListener('click', () => void ringBell());
      prompt.append(button);
    } else {
      const words = document.createElement('p');
      words.textContent = next.lit ? `Lamp ${next.index + 1} burns. Two more captains, two more lamps!` : `Lamp ${next.index + 1}: hold the button or E for 2 seconds.`;
      prompt.append(words);
      if (!next.lit && finale?.holdButton) { const hold = finale.holdButton(next.index); prompt.append(hold.button); prompt.holdBar = hold.bar; }
    }
  }

  return {
    controller, room, ringBell, refresh, join,
    get finale() { return finale; },
    update(dt = 0) {
      if (disposed) return;
      controller.update(dt);
      const shown = here(), wave = controller.wave, player = world.player?.position, blocked = !!world.isBlocked?.();
      const running = !!wave && !wave.done && wave.info.flagship;
      bell?.setVisible(shown);
      objects?.setVisible(shown && running);
      objects?.update?.(dt);
      let next = null, progress = 0;
      if (finale) {
        const lampSpot = shown && running && player && !blocked ? nearest(LAMP_SPOTS, player) : null;
        const state = finale.update({ lampSpot, heldE: !!lampSpot && !!input?.held?.has?.('KeyE'), shown: shown && running && !blocked });
        progress = state?.progress ?? 0;
        const lamps = finale.state.lamps.map((_, index) => finale.lit(index));
        objects?.setLamps?.(lamps);
        const lit = lamps.filter(Boolean).length, near = shown && running && player && LAMP_SPOTS.some(spot => Math.hypot(spot.x - player.x, spot.z - player.z) <= LAMP_HINT_NEAR);
        hint = lampHint(hint, { key: `${wave?.info.waveId}:${wave?.state.phase}`, lit, near, dt });
        layer?.classList.toggle('lamp-hint-tucked', hint.tucked);
        // One caption at the lamps moment: once the lighthouse burns again, its status line says so alone.
        if (lampSpot && !relitShown) next = { kind: 'lamp', index: lampSpot.index, lit: state?.lit };
      }
      if (!next && shown && !wave && !blocked && player && nearest([BELL_SPOT], player)) next = { kind: 'bell' };
      showPrompt(next);
      if (prompt?.holdBar) prompt.holdBar.value = progress;
      if (pressed) { pressed = false; if (next?.kind === 'bell') void ringBell(); }
      // The lamps burn together: one lamps_lit for the sim and the room (somebody else's counts too).
      if (relitPending && wave) {
        if (wave.lampsSent) relitPending = false;
        else if (controller.lampsLit()) { relitPending = false; sentLampsAt = wave.ticks; }
      }
    },
    get sentLampsAt() { return sentLampsAt; },
    dispose() {
      if (disposed) return;
      disposed = true; controller.dispose(); closeRoom(); room.close();
      for (const stop of stops.splice(0)) stop?.();
      if (typeof window !== 'undefined') window.removeEventListener('keydown', keydown);
      finale?.dispose(); objects?.dispose(); bell?.dispose(); layer?.remove();
    },
  };
}
