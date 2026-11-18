import * as THREE from 'three';
import '../../src/ui/base.css';
import '../../src/ui/kit/kit.css';
import '../../src/ui/shell.css';
import '../../src/ui/styles.css';
import '../../src/ui/travel.css';
import '../../src/ui/readability.css';
import '../../src/ui/kit/components.css';
import '../../src/ui/devices.css';
import '../../src/ui/open-panels.css';
import '../../src/island/island.css';
import '../../src/island/boat-card.css';
import '../../src/island/structure-recovery.css';
import '../../src/pirates/pirates.css';
import {createIsland} from '../../src/island/index.js';
import {spotById} from '../../src/island/spots.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';
import {wireWaves} from '../../src/pirates/game-wiring.js';
import {createPlace} from '../../src/world/places/factory.js';
import {projectPoint} from '../../src/world/art.js';

const FULL = 1_000_000;
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const EPOCH = '22345678-1234-4234-8234-123456789abc';
const WAVE_ID = '62345678-1234-4234-8234-123456789abc';
const instance = n => `32345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const specs = [
  ['wall_1', 'wall', 750_000, 60, 10, 150],
  ['wall_2', 'wall', 0, 60, 10, 600],
  ['cannon_1', 'cannon', 300_000, 80, 30, 450],
  ['cannon_2', 'mortar', 400_000, 70, 60, 360],
  ['cannon_3', 'harpoon', 1, 60, 40, 600],
  ['cannon_4', 'swivel', FULL, 72, 50, 0],
  ['cannon_5', 'culverin', 300_000, 56, 80, 420],
  ['cannon_8', 'cannon', 500_000, 80, 30, 300],
  ['cannon_9', 'cannon', 900_000, 80, 30, 60],
  ['cannon_10', 'cannon', 250_000, 80, 30, 450],
  ['cannon_11', 'cannon', 250_000, 80, 30, 450],
];
let rows = specs.map(([spot, kind, hpUnits, maxHP, fixedPrice, estimatedFreeSeconds], index) => ({
  spot, instanceId: instance(index + 1), kind, level: 1, hpUnits, maxHP,
  rateUnitsPerSecond: 1_000_000 / 600, estimatedFreeSeconds, fixedPrice, repairSeq: 0,
}));
let revision = 1, remainingPaidUses = null, waveStartedAt = null, phase = 'between_waves';
let repairEvents = [], visibleHeadSeq = 0, eventsHeld = false, repairMode = 'success', balance = 2_000;
let lastCheckpointResult = null;
const calls = [];
const busHandlers = new Map();
const roomHandlers = new Map();
const on = (type, handler) => {
  if (!busHandlers.has(type)) busHandlers.set(type, new Set());
  busHandlers.get(type).add(handler);
  return () => busHandlers.get(type)?.delete(handler);
};
const emit = event => { for (const handler of [...(busHandlers.get(event.type) ?? [])]) handler(event); };
function openFixtureRoom() {
  return {
    send(type, payload) { for (const handler of [...(roomHandlers.get(type) ?? [])]) handler(payload); return true; },
    on(type, handler) {
      if (!roomHandlers.has(type)) roomHandlers.set(type, new Set());
      roomHandlers.get(type).add(handler);
      return () => roomHandlers.get(type)?.delete(handler);
    },
    close() { roomHandlers.clear(); },
  };
}
const currentPhase = () => phase === 'between_waves' ? phase
  : waveStartedAt && Date.now() >= waveStartedAt ? 'combat' : 'preparing';
const canonicalState = () => ({serverNow: new Date().toISOString(), islandEpoch: EPOCH, revision,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: currentPhase(),
  repairWindow: phase === 'between_waves' ? 'between_waves' : 'reserved_wave',
  waveId: phase === 'between_waves' ? null : WAVE_ID,
  remainingPaidUses: phase === 'between_waves' ? null : remainingPaidUses,
  structures: rows.map(row => ({...row, estimatedFreeSeconds: phase === 'between_waves' ? row.estimatedFreeSeconds : null}))});
const ok = data => ({ok: true, status: 200, data});
const base = createFakeIslandTransport({coins: balance, version: 2, unlocking: false, flags: {defenses_v2: true, more_tower_spots: true}});
const extraSpots = ['cannon_8', 'cannon_9', 'cannon_10', 'cannon_11'];
function withExtraSpots(answer) {
  if (!answer?.ok || !Array.isArray(answer.data?.spots)) return answer;
  const present = new Set(answer.data.spots.map(row => row.id));
  for (const id of extraSpots) if (!present.has(id)) answer.data.spots.push({id, kind: 'cannon', built: true, cost: 30});
  return answer;
}
function waveSnapshot(startsAt) {
  const structures = rows.map(row => {
    const spot = spotById(row.spot);
    return {...row, x: spot.x, z: spot.z};
  });
  const defenses = structures.map(row => ({id: row.spot, kind: row.kind, level: row.level, x: row.x, z: row.z}));
  return {recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: WAVE_ID, islandEpoch: EPOCH,
    seed: 7, startsAt, weather: {kind: 'calm'}, rules: ['tower_health', 'pathing', 'structure_recovery'],
    createWave: {seed: 7, wave: 1, defenses}, structures,
    participants: [{participantToken: TOKEN, captain: {level: 1, skills: [], weapon: 'musket'}}]};
}
function waveResponse() {
  return {waveId: WAVE_ID, wave: 1, seed: 7, startsAt: snapshot.startsAt, weather: {kind: 'calm'}, flagship: false,
    recoveryVersion: 1, waveProtocol: 2, rules: snapshot.rules, initialSnapshot: snapshot, participantToken: TOKEN, lastActorCounter: 0};
}
let snapshot = null;
let transport;
transport = {
  async get(path) {
    calls.push({method: 'GET', path});
    if (path.startsWith('/api/island/structures')) return ok(canonicalState());
    if (path.startsWith('/api/waves/current')) return ok(phase === 'between_waves' ? null : waveResponse());
    if (path.startsWith(`/api/waves/${WAVE_ID}/events`)) {
      const url = new URL(path, location.origin), after = Number(url.searchParams.get('after') ?? 0);
      const events = repairEvents.filter(event => event.serverSeq > after && event.serverSeq <= visibleHeadSeq);
      const liveThrough = waveStartedAt && Date.now() >= waveStartedAt ? Math.max(0, Math.floor((Date.now() - waveStartedAt) / 50)) : -1;
      const hiddenRepairs = eventsHeld ? repairEvents.filter(event => event.serverSeq > visibleHeadSeq) : [];
      const sealedThroughTick = hiddenRepairs.reduce((through, event) => Math.min(through, event.effectiveTick - 1), liveThrough);
      return ok({headSeq: visibleHeadSeq, sealedThroughTick, events});
    }
    return withExtraSpots(await base.get(path));
  },
  async post(path, body) {
    calls.push({method: 'POST', path, body: structuredClone(body)});
    if (path === '/api/waves/start') {
      waveStartedAt = Date.now() + 12_000;
      const startsAt = new Date(waveStartedAt).toISOString();
      snapshot = waveSnapshot(startsAt);
      phase = 'preparing'; remainingPaidUses = 3; revision++;
      return ok(waveResponse());
    }
    if (path === '/api/waves/join') return ok(waveResponse());
    if (path === `/api/waves/${WAVE_ID}/inputs`) return ok({accepted: body.inputs.map((input, index) => ({
      serverSeq: index + 2, effectiveTick: input.tick, type: 'captain_input', participantToken: TOKEN,
      payload: {inputUid: input.inputUid, actorCounter: input.actorCounter, participantToken: TOKEN,
        command: input.command, captain: {level: 1, skills: [], weapon: 'musket'}},
    }))});
    if (path === `/api/waves/${WAVE_ID}/health`) return ok({accepted: true, throughTick: body.throughTick,
      inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits});
    if (path === '/api/island/structures/repair') {
      if (repairMode !== 'success') return {ok: false, status: 409, code: repairMode,
        message: repairMode === 'insufficient_funds' ? 'Not enough coins for this repair.' : 'The repair details changed.'};
      const row = rows.find(item => item.spot === body.spot);
      if (!row) return {ok: false, status: 404, code: 'no_such_spot', message: 'There is no such building.'};
      const useOrdinal = body.expectedWindow === 'reserved_wave' ? 4 - remainingPaidUses : null;
      if (body.expectedWindow === 'reserved_wave') remainingPaidUses--;
      balance -= body.quotedPrice;
      const next = {...row, hpUnits: FULL, repairSeq: row.repairSeq + 1, estimatedFreeSeconds: 0};
      rows = rows.map(item => item.spot === row.spot ? next : item); revision++;
      const eventSeq = body.expectedWindow === 'reserved_wave' ? (repairEvents.at(-1)?.serverSeq ?? 0) + 1 : null;
      const receipt = {actionUid: body.actionUid, spot: body.spot, instanceId: row.instanceId, kind: row.kind, level: row.level,
        chargedPrice: body.quotedPrice, balanceAtCommit: balance, waveId: body.expectedWaveId ?? null,
        useOrdinal, eventSeq, repairSeq: next.repairSeq};
      if (eventSeq !== null) {
        const liveTick = waveStartedAt && Date.now() >= waveStartedAt ? Math.floor((Date.now() - waveStartedAt) / 50) : 0;
        repairEvents.push({serverSeq: eventSeq, effectiveTick: currentPhase() === 'combat' ? Math.max(1, liveTick + 10) : 0, type: 'structure_repaired', participantToken: TOKEN,
          payload: {spot: row.spot, instanceId: row.instanceId, hpUnits: FULL, maxHP: row.maxHP,
            repairSeq: next.repairSeq, chargedPrice: body.quotedPrice}});
        if (!eventsHeld) visibleHeadSeq = eventSeq;
      }
      return ok({receipt, currentState: canonicalState(), coins: balance});
    }
    return withExtraSpots(await base.post(path, body));
  },
};

const canvas = document.querySelector('#island-scene');
let recoveryButtonClicks = 0;
document.addEventListener('click', event => { if (event.target?.closest?.('.recovery-repair')) recoveryButtonClicks++; }, true);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#88b5bd');
const camera = new THREE.OrthographicCamera(-23, 23, 23, -23, 0.1, 100);
camera.position.set(0, 0, 50); camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor('#88b5bd', 1);
function resize() {
  const aspect = innerWidth / innerHeight;
  camera.left = -22 * aspect; camera.right = 22 * aspect; camera.top = 22; camera.bottom = -22;
  camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false);
}
window.addEventListener('resize', resize);

const island = createIsland({container: document.body, emit, on, mode: 'live', transport, storage: null,
  structureRecoveryOn: () => false, menu: () => () => {}, reducedMotion: true});
const player = {position: new THREE.Vector3(0, 1.03, 10), rotation: 0};
const world = {current: null, isBlocked: () => false};
let waveWiring = null, place = null, disposed = false;
async function boot() {
  await island.load();
  const builds = [['wall_1', 'wall'], ['wall_2', 'wall'], ['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_3', 'harpoon'],
    ['cannon_4', 'swivel'], ['cannon_5', 'culverin']];
  for (const [spot, kind] of builds) {
    const answer = await island.api.build({spot, kind});
    if (!answer.ok) throw new Error(`Could not build fixture ${spot}: ${answer.code}`);
  }
  await island.load();
  place = await createPlace({id: 'home_islet', island, on, emit, canvas, camera, player: () => player,
    reducedMotion: true, isActive: () => true});
  scene.add(place.group); world.current = place;
  waveWiring = wireWaves({island, on, emit, scene, camera, canvas, container: document.body, player, world,
    loop: true, every: (run, ms) => { const id = setInterval(run, ms); return () => clearInterval(id); },
    later: (run, ms) => { const id = setTimeout(run, ms); return () => clearTimeout(id); },
    openRoom: openFixtureRoom, battleGuide: false});
  island.setRecoveryCheckpointHandler(async () => {
    lastCheckpointResult = await waveWiring.island.checkpointBeforeRepair();
    return lastCheckpointResult;
  });
  const tick = time => {
    if (disposed) return;
    place.update(1 / 60, {time: time / 1000, night: 0, weather: {wind: 0}, player: {x: 0, y: 1.03, z: 10}});
    renderer.render(scene, camera); requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
}
window.recoveryFixture = {
  ready: false,
  async boot() { if (!this.ready) { await boot(); this.ready = true; } return true; },
  pick(spot) { island.pick(spot); }, close() { island.ui.close(); },
  async startWave() { return island.flow.ring('own'); },
  async waitForCombat() {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (waveStartedAt && Date.now() > waveStartedAt + 250 && waveWiring?.island?.recoveryCombatState) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  },
  setRepairMode(value) { repairMode = value; },
  holdEvents() { eventsHeld = true; visibleHeadSeq = repairEvents.at(-1)?.serverSeq ?? 0; },
  releaseEvents() { eventsHeld = false; visibleHeadSeq = repairEvents.at(-1)?.serverSeq ?? 0; },
  getCalls() { return structuredClone(calls); },
  getRepairButtonClicks() { return recoveryButtonClicks; },
  async readCanonical() { return island.api.structureRecovery(); },
  getState() { return {phase: currentPhase(), remainingPaidUses, rows: structuredClone(rows), waveStartedAt,
    recoveryVersion: island.recoveryVersion, recoveryCombatState: waveWiring?.island?.recoveryCombatState ?? null, lastCheckpointResult}; },
  inspectRecoveryVisual(spot) {
    const found = {indicator: null, building: null};
    const kind = rows.find(row => row.spot === spot)?.kind;
    place?.group?.traverse(object => {
      if (object.name === `structure-recovery:${spot}`) found.indicator = {visible: object.visible, width: object.geometry?.parameters?.width ?? null};
      if (object.name === `island-${kind}:${spot}`) {
        found.building = {visible: object.visible, look: object.userData?.recoveryLook, art: object.userData?.art};
      }
      if (kind === 'wall' && object.name === 'island-wall-connections') {
        const post = object.wallPosts?.find(item => item.id === spot);
        if (post) found.building = {visible: true, look: post.look, art: `wall-post-${post.level}-${post.look}`};
      }
    });
    return found;
  },
  focusScene(spotId) {
    let building = null;
    const kind = rows.find(row => row.spot === spotId)?.kind;
    place?.group?.traverse(object => {
      if (object.name === `island-${kind}:${spotId}` && object.userData?.recoveryLook === 'broken') building = object;
    });
    let point = building?.getWorldPosition(new THREE.Vector3()) ?? null;
    if (!point && kind === 'wall') {
      let brokenPost = null;
      place?.group?.traverse(object => {
        if (object.name !== 'island-wall-connections') return;
        brokenPost = object.wallPosts?.find(item => item.id === spotId && item.look === 'broken') ?? null;
      });
      if (brokenPost) point = new THREE.Vector3(projectPoint(brokenPost.x, brokenPost.z).x, projectPoint(brokenPost.x, brokenPost.z).y, 0);
    }
    if (!point) return false;
    const halfHeight = 11, aspect = innerWidth / innerHeight;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.position.set(point.x, point.y + 2, 50); camera.lookAt(point.x, point.y + 2, 0); camera.updateProjectionMatrix();
    return true;
  },
  resetSceneCamera() {
    const aspect = innerWidth / innerHeight;
    camera.left = -22 * aspect; camera.right = 22 * aspect; camera.top = 22; camera.bottom = -22;
    camera.position.set(0, 0, 50); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  },
  dispose() { disposed = true; waveWiring?.dispose(); island.dispose(); place?.dispose?.(); renderer.dispose(); },
};
window.recoveryFixture.boot().catch(error => { window.recoveryFixture.error = error.message; console.error(error); });
