// Draws your island on the home_islet place: a glowing marker on every empty build spot, the buildings
// that stand, the cabin and the harbor bell. Tapping a marker, a building or the bell picks it.
// The marker, badges, bell and stand-ins are clean cartoon frames painted in code (src/art/, no outside
// asset, no data: URL); the level art (walls, cannons, mortars by level) replaces the stand-ins once loaded. Everything is added under place.group, so the place's own
// lifetime (resources.js) releases every texture, material and geometry when the player leaves.
import * as THREE from 'three';
import {artSizes, loadArt, placeArt, projectPoint} from '../world/art.js';
import {pixelSizes} from '../pixel/catalog.js';
import {ALL_SPOTS as ISLAND_SPOTS, CABIN, BELL, CAMPAIGN_BUILDINGS, ARSENAL, islandZones, placedSpot} from './spots.js';
import {isExtraSpot} from './extra-spots.js';
import {isInventoryWallId, offeredInventoryWalls} from './wall-cohort.js';
import {makeFootprint, makeWallLanes} from './move-preview.js';
import {createWallBuilderPreview} from './wall-builder-preview.js';
import {isOpen, spotWave, waveOf} from '../campaign/index.js';
import {LOCK_WAVES} from '../art/campaign.js';
import {SLOT_KINDS} from './td-rules.js';
import {ROLE_IDS, activeRole, roleRadius} from '../campaign/houses.js';
import {CULVERIN_ART, HARPOON_ART, SWIVEL_ART, TIER_ART, crewArt, pipRow, pirateLevels} from '../pixel/pirate-catalog.js';
import {islandFrame} from '../art/registry.js';
import {frameCanvas, smoothTexture, spriteMaterial} from '../art/textures.js';
import {clickVerdict, WALK_CLOSER} from '../world/reach.js';
import {decorateProgress} from './decorations.js';
import {makeWallConnections} from './wall-connections.js';
import {createStructureRecoveryIndicators} from './structure-recovery-indicators.js';
import {towerStateFrame} from '../art/tower-states.js';
import {loadWallAtlas, wallPreviewCanvas} from '../art/wall-atlas.js';

const UNIT = 16;
const FULL_HP_UNITS = 1_000_000;
const RECOVERY_TOWERS = Object.freeze(['cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const RECOVERY_PHASES = new Set(['between_waves', 'preparing']);
const RECOVERY_ART = Object.freeze(['island-wall-damaged', 'island-wall-broken', ...RECOVERY_TOWERS.flatMap(kind =>
  Array.from({length: 5}, (_, index) => ['damaged', 'broken'].map(state => towerStateFrame(kind, index + 1, state))).flat())]);

/** Return the existing world-art state for a matching canonical v1 row outside combat. */
export function structureRecoveryAppearance(answer, row, state) {
  if (!state || state.recoveryVersion !== 1 || !RECOVERY_PHASES.has(state.displayPhase)
      || typeof state.islandEpoch !== 'string' || !answer?.built || !row
      || row.spot !== answer.id || row.kind !== answer.kind || row.level !== (answer.level ?? 1)
      || typeof row.instanceId !== 'string' || !Number.isInteger(row.hpUnits) || row.hpUnits < 0 || row.hpUnits > FULL_HP_UNITS
      || !Number.isFinite(row.maxHP) || row.maxHP <= 0) return null;
  if (row.hpUnits === FULL_HP_UNITS) return null;
  const look = row.hpUnits === 0 ? 'broken' : row.hpUnits < FULL_HP_UNITS / 2 ? 'damaged' : null;
  if (!look) return null;
  const frame = row.kind === 'wall' ? `island-wall-${look}` : RECOVERY_TOWERS.includes(row.kind)
    ? towerStateFrame(row.kind, row.level, look) : null;
  return frame ? {look, frame, suppressPips: look === 'broken' && row.kind !== 'wall'} : null;
}

// The first id the catalog knows wins; none known means the drawn sprite stays.
export const ART_CANDIDATES = Object.freeze({
  wall: ['wall', 'island-wall', 'wall-1'], cannon: ['cannon', 'island-cannon', 'cannon-1'], mortar: ['mortar', 'island-mortar', 'mortar-1'],
  watchtower: ['watchtower', 'island-watchtower', 'watchtower-1'], house: ['house', 'island-house', 'house-1'],
  bell: ['harbor-bell', 'island-bell', 'bell'],
});
export const catalogArt = (kind, sizes = pixelSizes) => (ART_CANDIDATES[kind] ?? []).find(id => Object.hasOwn(sizes, id)) ?? null;
// Outside a wave a built spot shows its real kind and level: the art lane's level art (pirateLevels) for
// walls, cannons, mortars and houses; house levels retain their existing ground box and role signs.
// Levels 4 and 5 (GAME-V3.md §4.1) have their own drawings, gold trim and the island's banner,
// and gold stars on a teal disc as pips (PIP_TIER_ART).
const tiered = kind => [...pirateLevels[kind], ...TIER_ART[kind]];
export const LEVEL_ART = Object.freeze({wall: tiered('wall'), cannon: tiered('cannon'), mortar: tiered('mortar'), harpoon: HARPOON_ART.levels,
  culverin: CULVERIN_ART.levels, // T43 (D048 proposed): only an island answer with the flag defenses_v2 on has one
  swivel: SWIVEL_ART.levels, // D055: the swivel-gun nest
  watchtower: ['island-watchtower', 'island-watchtower', 'island-watchtower', 'island-watchtower-l4', 'island-watchtower-l5'], house: ['island-house', 'island-house-l2', 'island-house-l3']});
export const PIP_ART = 'fx-level-pip';
export const PIP_TIER_ART = 'fx-level-pip-gold';
export const pipArt = level => (level >= 4 ? PIP_TIER_ART : PIP_ART);
// A house with a role (level 2 and up, GAME-V3.md "Houses") wears its own look: the Barracks' crossed swords
// and flag, the Tavern's hanging mug, the Workshop's gear and hammer (src/art/island.js).
export const ROLE_ART = Object.freeze(Object.fromEntries(ROLE_IDS.map(id => [id, `island-house-${id}`])));
export function buildingArt(kind, level = 1, spec = null) {
  const list = LEVEL_ART[kind];
  if (!list) return null;
  const n = Number.isSafeInteger(level) && level > 0 ? level : 1;
  const role = activeRole({kind, level: n, spec});
  if (role) return `${ROLE_ART[role]}${n >= 3 ? '-l3' : ''}`;
  return list[Math.min(list.length, n) - 1];
}
// The kinds that stand on a tower spot and that the wave's renderer draws during a battle (so the island hides
// them then), with the culverin (T43): the server sends one only while the flag defenses_v2 is on.
const TOWERS = Object.freeze([...SLOT_KINDS.tower, 'culverin']);
const BATTLE_KINDS = Object.freeze(['wall', ...TOWERS]);
// How many level pips stand above a building: towers always show theirs, the rest from level 2.
export const pipCount = (kind, level = 1) => {
  const n = Number.isSafeInteger(level) && level > 0 ? Math.min(5, level) : 1;
  return TOWERS.includes(kind) || n > 1 ? n : 0;
};
// Where the hired crew stand outside a wave (TOWER-DEFENSE.md §3): gunners beside the strongest towers
// (level, then id order, as the wave mans them), carpenters beside the walls, the lookout at the
// watchtower (or by the bell when there is none). spots: the answer's spots with their places {id, kind,
// level, built, x, z}. Pure; returns [{kind, x, z, at}] with at the spot id (or 'bell').
export function crewPlaces(spots = [], crew = {}, {bell = null} = {}) {
  const count = (value, max) => Math.max(0, Math.min(max, Number.isSafeInteger(value) ? value : value ? 1 : 0));
  const built = spots.filter(item => item?.built === true && Number.isFinite(item.x) && Number.isFinite(item.z));
  const beside = (item, side, front = .35) => ({x: item.x + (item.x > 0 ? -side : side), z: item.z + front});
  const out = [];
  const towers = built.filter(item => item.kind === 'cannon' || item.kind === 'mortar')
    .sort((a, b) => (b.level ?? 1) - (a.level ?? 1) || (a.kind === b.kind ? 0 : a.kind === 'mortar' ? -1 : 1));
  towers.slice(0, count(crew?.gunner, 2)).forEach(item => out.push({kind: 'gunner', at: item.id, ...beside(item, 1.3)}));
  const walls = built.filter(item => item.kind === 'wall');
  for (let i = 0; i < count(crew?.carpenter, 2) && walls.length; i++) {
    const wall = walls[i % walls.length], twice = i >= walls.length;
    out.push({kind: 'carpenter', at: wall.id, ...beside(wall, twice ? -1.6 : 1.6, .4)});
  }
  if (count(crew?.lookout, 1)) {
    const tower = built.find(item => item.kind === 'watchtower');
    if (tower) out.push({kind: 'lookout', at: tower.id, ...beside(tower, 1.5, .3)});
    else if (bell) out.push({kind: 'lookout', at: 'bell', x: bell.x - 1.6, z: bell.z + .3});
  }
  return out;
}

// The drawn stand-ins (until the level art has loaded), the bell, the build ring and the kind badges:
// clean cartoon frames (src/art/island.js) painted once into smooth textures.
const DRAWN = {wall: 'island-wall', cannon: 'island-cannon', mortar: 'island-mortar', harpoon: 'island-harpoon', culverin: 'island-culverin', swivel: 'island-swivel', watchtower: 'island-watchtower', house: 'island-house', bell: 'island-bell'};
function drawn(name) {
  const [width, height, anchor] = islandFrame(name);
  return {texture: smoothTexture(frameCanvas(name)), size: [width, height], anchor};
}
// How near (world units) the captain stands for a build marker to glow at full strength; farther ones fade to MARKER_FAR.
export const MARKER_NEAR = 9, MARKER_FAR = .4;
function sprite(group, {texture, size: [width, height], anchor = 0}, x, z, name) {
  const material = spriteMaterial(texture);
  const geometry = new THREE.PlaneGeometry(width / UNIT, height / UNIT); geometry.translate(0, (height / 2 - anchor) / UNIT, 0);
  const mesh = new THREE.Mesh(geometry, material), point = projectPoint(x, z);
  mesh.position.set(point.x, point.y, 0); mesh.renderOrder = 100 + z; mesh.frustumCulled = false;
  mesh.name = name; mesh.userData = {asset: name, ground: {x, z}};
  group.add(mesh);
  return mesh;
}

// Moves a sprite made by sprite() to another ground point (T36: a building moved on the build grid),
// keeping its lift above the ground and its draw order relative to its foot.
export function moveSprite(mesh, x, z) {
  const ground = mesh.userData.ground;
  if (!ground || (ground.x === x && ground.z === z)) return;
  const from = projectPoint(ground.x, ground.z), to = projectPoint(x, z);
  mesh.position.x += to.x - from.x; mesh.position.y += to.y - from.y; mesh.renderOrder += z - ground.z;
  if (Number.isFinite(mesh.userData.baseY)) mesh.userData.baseY += to.y - from.y;
  mesh.userData.ground = {x, z};
}

// A house role's reach on the ground (GAME-V3.md "Houses"): one unit disc and one unit rim, scaled to the radius
// and squashed like the ground (projectPoint's 0.72), under everything that stands. Pure Three.js, no art.
export const ROLE_COLOURS = Object.freeze({barracks: 0xe2463b, tavern: 0x3fa04d, workshop: 0xf2c14e});
export function makeRangeRing(root) {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({transparent: true, opacity: .14, depthTest: false, depthWrite: false}));
  const rim = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 96), new THREE.MeshBasicMaterial({transparent: true, opacity: .85, depthTest: false, depthWrite: false}));
  for (const [mesh, order] of [[disc, 97], [rim, 98]]) { mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); }
  disc.name = 'island-range'; rim.name = 'island-range-rim';
  let shown = null;
  return {
    show(range, time = 0) {
      const on = !!range && Number.isFinite(range.radius) && range.radius > 0;
      disc.visible = rim.visible = on;
      if (!on) { shown = null; return; }
      const point = projectPoint(range.x, range.z), colour = ROLE_COLOURS[range.role] ?? 0xffffff;
      for (const mesh of [disc, rim]) { mesh.position.set(point.x, point.y, 0); mesh.scale.set(range.radius, range.radius * .72, 1); mesh.material.color.setHex(colour); }
      disc.material.opacity = .12 + .04 * Math.sin(time * 2.4);
      disc.userData = {range: {...range}}; shown = range;
    },
    get shown() { return shown; },
  };
}

// The campaign (GAME-V3.md §4): which frame a campaign building shows. A building that is not open yet is a
// building site whose sign shows the wave it opens after; the wreck shows mended once her repair is paid.
export function campaignArt(building, campaign) {
  if (!campaign || !isOpen(campaign, building.item)) {
    const wave = waveOf(building.item);
    return [4, 5, 6, 8].includes(wave) ? `island-site-${wave}` : 'island-site';
  }
  if (building.mended && campaign.wreck && campaign.wreck.paid >= campaign.wreck.goal) return building.mended;
  return building.art;
}
// A spot the campaign opens later (the inner wall ring after wave 5) shows a lock badge instead of the build badge.
export const spotLocked = (spot, campaign) => !!campaign && spotWave(spot.id) > (campaign.wave ?? 0);
// The first wave any of the spot's kinds opens after (the house after 1, the watchtower after 3), or null.
export function lockWave(kinds, unlocks) {
  const waves = kinds.map(kind => unlocks?.locked?.[`${kind}:1`] ?? waveOf(`${kind}:1`)).filter(Number.isSafeInteger);
  return waves.length ? Math.min(...waves) : null;
}

// T36 (flexible placement): every spot stands where the answer's x/z say (placedSpot), and while a building is
// moved ctx.placing() is true: a tap on the ground then calls ctx.onGround(x, z) instead of picking, and
// preview({spotId, x, z, size, ok}) draws that building and its footprint at the cell under consideration.
// ctx: {art (the place's loaded art, with 'cabin'), reducedMotion, canvas, camera, isActive, onPick(id), player() (its
// position: a click out of reach calls onFar(id, {hint, zone}) instead of onPick),
// loadArt (tests), and for Pirate Point: layout {spots, zones(), bell: false, cabin: false}}.
// Returns {apply({spots, visitor, battle, unlocks}), update(dt, time), pickAt(x, z), dispose()}.
// A marker shows on an empty spot only when something may be built there (unlocks, TOWER-DEFENSE.md §9).
export function decorateIsland(place, ctx = {}) {
  const layout = ctx.layout ?? {spots: ISLAND_SPOTS, zones: islandZones, bell: true, cabin: true};
  const fixedSpots = layout.spots;
  let SPOTS = fixedSpots;
  const root = new THREE.Group(); root.name = layout.name ?? 'island'; place.group.add(root);
  const progress = layout.zones === islandZones ? decorateProgress(place) : null;
  const baseZones = [...(place.zones ?? [])];
  const reduced = () => (typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() : !!ctx.reducedMotion);
  const textures = Object.fromEntries(Object.entries(DRAWN).map(([kind, name]) => [kind, drawn(name)]));
  // The marker (src/art/island.js): a gold ring on the ground and a gold "+" badge; a spot that opens later a
  // slate ring and a padlock badge with the wave it opens after (src/art/campaign.js).
  const ringTexture = drawn('build-ring'), lockRingTexture = drawn('build-ring-locked'), badgeTexture = drawn('build-badge');
  const lockTextures = new Map();
  const lockTexture = wave => {
    const name = LOCK_WAVES.includes(wave) ? `build-badge-locked-${wave}` : 'build-badge-locked';
    if (!lockTextures.has(name)) lockTextures.set(name, drawn(name));
    return lockTextures.get(name);
  };
  const markers = new Map(), buildings = new Map(); // buildings: 'spot:kind' -> mesh (a tower spot has a cannon and a mortar)
  const slotOf = spot => spot.slot ?? (spot.kind === 'cannon' ? 'tower' : spot.kind);
  const kindsOf = spot => (slotOf(spot) === 'tower' ? TOWERS : SLOT_KINDS[slotOf(spot)] ?? [spot.kind]);
  for (const spot of SPOTS) {
    const ring = sprite(root, ringTexture, spot.x, spot.z, `island-marker:${spot.id}`);
    ring.position.y -= .75; ring.renderOrder = 99; // on the ground, under the player
    const badge = sprite(root, badgeTexture, spot.x, spot.z, `island-badge:${spot.id}`);
    badge.position.y += .6; badge.userData.baseY = badge.position.y;
    const lockRing = sprite(root, lockRingTexture, spot.x, spot.z, `island-lock-ring:${spot.id}`);
    lockRing.position.y -= .75; lockRing.renderOrder = 99; lockRing.visible = false;
    const lock = sprite(root, lockTexture(null), spot.x, spot.z, `island-lock:${spot.id}`);
    lock.position.y += .6; lock.visible = false;
    markers.set(spot.id, {ring, badge, lock, lockRing, wave: null, set visible(value) { ring.visible = value; badge.visible = value; },
      set locked(value) { lock.visible = value; lockRing.visible = value; }});
    for (const kind of kindsOf(spot)) {
      const building = sprite(root, textures[kind], spot.x, spot.z, `island-${kind}:${spot.id}`);
      building.visible = false; buildings.set(`${spot.id}:${kind}`, building);
    }
  }
  const bell = layout.bell === false ? null : sprite(root, textures.bell, BELL.x, BELL.z, 'island-bell');
  // The campaign's buildings (home island only): one mesh per frame they can show, the right one visible.
  const campaignMeshes = new Map(); // building id -> {frame name -> mesh}
  const campaignTextures = new Map();
  if (layout.bell !== false) for (const building of CAMPAIGN_BUILDINGS) {
    const names = [...new Set([building.art, building.mended, 'island-site', ...[4, 5, 6, 8].map(n => `island-site-${n}`)].filter(Boolean))];
    const meshes = {};
    for (const name of names) {
      const texture = campaignTextures.get(name) ?? drawn(name); campaignTextures.set(name, texture);
      const mesh = sprite(root, texture, building.x, building.z, `island-campaign:${building.id}:${name}`);
      mesh.visible = false; mesh.userData.campaign = building.id; meshes[name] = mesh;
    }
    campaignMeshes.set(building.id, meshes);
  }
  // The arsenal (T41): painted only the first time apply() is told the flag "arsenal" is on, so with the flag off
  // nothing of it is drawn or kept (home island only, like the bell).
  let arsenalMesh = null;
  const showArsenal = on => {
    if (on && !arsenalMesh && layout.bell !== false) arsenalMesh = sprite(root, drawn(ARSENAL.art), ARSENAL.x, ARSENAL.z, 'island-arsenal');
    return arsenalMesh;
  };
  if (layout.cabin !== false && ctx.art?.cabin) placeArt(root, ctx.art, 'cabin', CABIN.x, CABIN.z).name = 'island-cabin';
  // The reach of a house's role while its card is open (GAME-V3.md "Houses"): a soft disc with a bright rim on
  // the ground, in the role's colour. ctx.range() says which ({x, z, radius, role} or null), read every frame.
  const rangeRing = makeRangeRing(root);
  const wallConnections = makeWallConnections(root);
  let joinedWalls = new Set();
  const baseColliders = [...place.colliders];
  let state = {spots: [], visitor: false, battle: false, unlocks: null, crew: null, campaign: null, arsenal: false}, disposed = false;
  let preview = null;
  const footprint = makeFootprint(root);
  const wallDraft = createWallBuilderPreview({root, wall: textures.wall});
  // D056: while a wall is moved, the cells where a wall stops pirates glow (home island only).
  const wallLanes = layout.zones === islandZones ? makeWallLanes(root) : null;
  // Where a spot stands now: the cell of a move under way, the answer's x/z, else its fixed spot (Pirate Point's stay).
  const whereOf = spot => {
    if (preview?.spotId === spot.id) return {x: preview.x, z: preview.z};
    return layout.zones === islandZones ? placedSpot(spot.id, state.spots) ?? spot : spot;
  };
  const recoveryIndicators = createStructureRecoveryIndicators({root, locate: id => {
    const spot = SPOTS.find(item => item.id === id);
    return spot ? whereOf(spot) : null;
  }});
  let recoveryState = null, recoveryStateKey = 'null';
  // The real art once it has loaded (null until then: the drawn sprites stand in), and what each spot shows.
  let art = null;
  const shown = new Map(); // spot id (or 'crew') -> {key, meshes}
  const clear = id => { const item = shown.get(id); if (!item) return; for (const mesh of item.meshes) { root.remove(mesh); mesh.geometry.dispose(); } shown.delete(id); };
  const releaseStandin = mesh => {
    mesh.visible = false; root.remove(mesh);
    if (mesh.userData.standinReleased) return;
    mesh.userData.standinReleased = true; mesh.geometry.dispose(); mesh.material.dispose();
  };
  function syncInventory(rows) {
    const added = layout.zones === islandZones ? offeredInventoryWalls(rows) : [], live = new Set(added.map(spot => spot.id));
    for (const [key, mesh] of buildings) {
      const id = key.split(':')[0];
      if (isInventoryWallId(id) && !live.has(id)) { clear(id); releaseStandin(mesh); buildings.delete(key); }
    }
    for (const spot of added) if (!buildings.has(`${spot.id}:wall`)) {
      const mesh = sprite(root, textures.wall, spot.x, spot.z, `island-wall:${spot.id}`);
      mesh.visible = false; buildings.set(`${spot.id}:wall`, mesh);
      if (art) releaseStandin(mesh); // Real loaded art replaces it without allocating empty markers.
    }
    SPOTS = [...fixedSpots, ...added];
  }
  const put = (id, x, z, lift = 0, order = 0, scale = 1) => {
    const mesh = placeArt(root, art, id, x, z, scale); mesh.position.y += lift; mesh.renderOrder += order; return mesh;
  };
  function showSpot(spot, answer, hidden) {
    const built = answer?.built === true, kind = built ? (kindsOf(spot).includes(answer.kind) ? answer.kind : kindsOf(spot)[0]) : null;
    if (kind === 'wall' && wallConnections.hasPost(spot.id)) { clear(spot.id); return; }
    const level = Number.isSafeInteger(answer?.level) && answer.level > 0 ? answer.level : 1;
    const recoveryRow = recoveryState?.structures?.find(item => item.spot === spot.id);
    const appearance = structureRecoveryAppearance(answer, recoveryRow, recoveryState);
    const normalId = kind ? buildingArt(kind, level, answer?.spec) : null;
    const id = appearance && art?.[appearance.frame] ? appearance.frame : normalId;
    const pips = kind && !appearance?.suppressPips ? pipCount(kind, level) : 0;
    // A recovery ruin frame stands alone; only the normal level art is drawn as posts of a joined wall.
    const joined = kind === 'wall' && id === normalId && joinedWalls.has(spot.id);
    const where = whereOf(spot), key = !id || hidden ? '' : `${id}:${pips}:${joined}@${where.x},${where.z}`;
    if (shown.get(spot.id)?.key === key) return;
    clear(spot.id);
    if (!key) return;
    const mesh = put(id, where.x, where.z); mesh.name = `island-${kind}:${spot.id}`; mesh.userData.level = level;
    if (joined) mesh.scale.x = .62; // Keep the original level art as posts; the join draws the span.
    mesh.userData.role = activeRole({kind, level, spec: answer?.spec}); mesh.userData.art = id;
    mesh.userData.recoveryLook = appearance?.look ?? 'intact';
    const meshes = [mesh], [, height, anchor] = artSizes[id], top = height * (1 - anchor) + .15;
    // One row (pipRow): 4 and 5 smaller and spaced wider than a disc, so the gold stars never overlap.
    const row = pipCount(kind, level) ? pipRow(level, {step: .6}) : {offsets: []}, pipWidth = artSizes[PIP_ART][0];
    row.offsets.forEach((offset, i) => {
      const pip = put(pipArt(level), where.x + offset * pipWidth, where.z, top, .01, row.scale); pip.name = `island-pip:${spot.id}:${i + 1}`; meshes.push(pip);
    });
    shown.set(spot.id, {key, meshes});
  }
  function showCrew(spots, crew, hidden) {
    const places = hidden || !crew ? [] : crewPlaces(spots.map(item => {
      const spot = SPOTS.find(entry => entry.id === item.id), where = spot ? whereOf(spot) : null;
      return where ? {...item, x: where.x, z: where.z} : null;
    }).filter(Boolean), crew, {bell: layout.bell === false ? null : BELL});
    const key = places.map(item => `${item.kind}@${item.x},${item.z}`).join('|');
    if (shown.get('crew')?.key === key) return;
    clear('crew');
    shown.set('crew', {key, meshes: places.map(item => { const mesh = put(crewArt[item.kind], item.x, item.z, 0, .02); mesh.name = `island-crew:${item.kind}:${item.at}`; return mesh; })});
  }

  // battle: a wave is on screen; its renderer (src/pirates/render.js) draws the walls and cannons with
  // their damage, so the island's own wall and cannon sprites step aside until it ends.
  function apply({spots = [], visitor = false, battle = false, unlocks = null, crew = null, campaign = null, arsenal = false} = {}) {
    if (disposed) return;
    state = {spots, visitor, battle, unlocks, crew, campaign, arsenal: arsenal === true};
    syncInventory(spots);
    joinedWalls = wallConnections.show(battle ? [] : spots.map(item => {
      const spot = SPOTS.find(entry => entry.id === item.id);
      const appearance = structureRecoveryAppearance(item, recoveryState?.structures?.find(row => row.spot === item.id), recoveryState);
      return spot ? {...item, ...whereOf(spot), look: appearance?.look ?? 'intact', ...(appearance?.look === 'broken' ? {broken: true} : {}),
        ...(preview?.spotId === item.id && !preview.ok ? {built: false} : {})} : item;
    })).connected;
    const known = spots.length > 0;
    const shownArsenal = showArsenal(known && state.arsenal);
    if (shownArsenal) shownArsenal.visible = known && state.arsenal;
    progress?.apply(campaign, spots, known);
    for (const [id, meshes] of campaignMeshes) {
      const frame = known ? campaignArt(CAMPAIGN_BUILDINGS.find(item => item.id === id), campaign) : null;
      for (const [name, mesh] of Object.entries(meshes)) mesh.visible = name === frame;
    }
    for (const spot of SPOTS) {
      const answer = spots.find(item => item.id === spot.id), built = answer?.built === true, where = whereOf(spot);
      const marker = markers.get(spot.id);
      // D060: an extra tower spot stands only while the answer lists it (the server's flag more_tower_spots).
      if (isExtraSpot(spot.id) && !answer) { marker.visible = false; marker.locked = false; clear(spot.id); for (const kind of kindsOf(spot)) buildings.get(`${spot.id}:${kind}`).visible = false; continue; }
      if (marker) {
        for (const mesh of [marker.ring, marker.badge, marker.lock, marker.lockRing]) moveSprite(mesh, where.x, where.z);
        marker.x = where.x; marker.z = where.z;
      }
      for (const kind of kindsOf(spot)) moveSprite(buildings.get(`${spot.id}:${kind}`), where.x, where.z);
      // Locked things stay on the map (GAME-V3.md §4): a spot the campaign opens later, or whose kind is not
      // open yet, shows a lock badge instead of the glowing ring.
      const open = (!unlocks || kindsOf(spot).some(kind => (unlocks.levels?.[kind] ?? 0) >= 1)) && !spotLocked(spot, campaign);
      const hidden = battle && BATTLE_KINDS.includes(answer?.kind ?? spot.kind);
      for (const kind of kindsOf(spot)) {
        buildings.get(`${spot.id}:${kind}`).visible = !art && built && (answer.kind === kind || (kindsOf(spot).length === 1))
          && !(battle && BATTLE_KINDS.includes(kind)) && !(kind === 'wall' && wallConnections.hasPost(spot.id));
        if (kind === 'wall') buildings.get(`${spot.id}:${kind}`).scale.x = joinedWalls.has(spot.id) ? .62 : 1;
      }
      if (art) showSpot(spot, answer, hidden);
      if (!marker) continue;
      marker.visible = !built && known && !battle && open; // a visitor builds too, with their own coins
      marker.locked = !built && known && !battle && !open;
      // The wave the padlock shows: the campaign step of the spot, else the first wave its kind opens after.
      const wave = open ? null : spotLocked(spot, campaign) ? spotWave(spot.id) : lockWave(kindsOf(spot), unlocks);
      if (marker.wave !== wave) { marker.wave = wave; marker.lock.material.map = lockTexture(wave).texture; marker.lock.material.needsUpdate = true; }
    }
    // The wave's renderer draws the crew during a battle; outside one they stand by their posts.
    if (art) showCrew(spots, crew, battle);
    if (layout.zones === islandZones) {
      place.zones = islandZones({visitor, spots, arsenal: state.arsenal});
      place.colliders.splice(0, place.colliders.length, ...baseColliders,
        {x: CABIN.x, z: CABIN.z - 1.8, width: 4.8, depth: 3.6, island: true});
    } else place.zones = [...baseZones, ...(known ? layout.zones() : [])];
  }
  apply(state);

  // The real art (every level, the pips and the crew) replaces the drawn sprites once it has loaded.
  const wanted = [...new Set([...SPOTS.flatMap(kindsOf).flatMap(kind => LEVEL_ART[kind] ?? []), ...Object.values(ROLE_ART).flatMap(id => [id, `${id}-l3`]), PIP_ART, PIP_TIER_ART, ...Object.values(crewArt)])]
    .concat(RECOVERY_ART)
    .filter(id => Object.hasOwn(artSizes, id));
  (ctx.loadArt ?? loadArt)(wanted).then(loaded => {
    if (disposed) { Object.values(loaded).forEach(material => { material.map?.dispose(); material.dispose(); }); return; }
    art = loaded;
    for (const mesh of buildings.values()) releaseStandin(mesh);
    apply(state);
  }).catch(() => { /* The drawn sprites stay. */ });

  let wallArtLoading = null;
  function retryWallArt() {
    if (disposed || wallArtLoading) return wallArtLoading;
    root.userData.wallArtError = null;
    wallArtLoading = Promise.resolve().then(() => (ctx.loadWallAtlas ?? loadWallAtlas)({
      quality: typeof ctx.quality === 'function' ? ctx.quality() : ctx.quality ?? 'high',
    })).then(value => {
      if (!value) return;
      if (disposed || !wallConnections.setArt(value)) { if (value.ownsTexture) value.texture.dispose(); return; }
      textures.wall.texture.image = wallPreviewCanvas(value); textures.wall.texture.needsUpdate = true;
      const frame = value.rects['island-wall']; wallDraft.setFrame({size: [frame.w, frame.h], anchor: frame.anchor});
      apply(state);
    }).catch(error => {
      if (!disposed) { root.userData.wallArtError = String(error?.message ?? 'Wall artwork unavailable'); ctx.onArtError?.(error); }
    }).finally(() => { wallArtLoading = null; });
    return wallArtLoading;
  }
  retryWallArt();

  // The nearest pickable thing to a ground point (a tap), or null.
  function pickAt(x, z) {
    const candidates = [...SPOTS.filter(spot => !isExtraSpot(spot.id) || state.spots.some(item => item.id === spot.id))
        .map(spot => ({id: spot.id, ...whereOf(spot), w: 2.4, h: spot.kind === 'watchtower' ? 5 : 3})),
      ...(bell ? [{id: BELL.id, x: BELL.x, z: BELL.z, w: 1.6, h: 3.4}] : []),
      ...(arsenalMesh?.visible ? [{id: ARSENAL.id, x: ARSENAL.x, z: ARSENAL.z, w: ARSENAL.w / 2, h: ARSENAL.h}] : []),
      ...(campaignMeshes.size ? CAMPAIGN_BUILDINGS.map(item => ({id: item.id, x: item.x, z: item.z, w: item.w, h: item.h})) : []),
      ...(state.visitor || layout.cabin === false ? [] : [{id: CABIN.id, x: CABIN.x, z: CABIN.z, w: 3, h: 6}])];
    let best = null, bestScore = Infinity;
    for (const item of candidates) {
      if (Math.abs(item.x - x) > item.w || z < item.z - item.h / .72 || z > item.z + .9) continue;
      const score = Math.hypot(item.x - x, item.z - z);
      if (score < bestScore) { best = item.id; bestScore = score; }
    }
    return best;
  }
  const cleanups = [];
  if (ctx.canvas && ctx.camera) {
    let down = null;
    const start = event => { if (event.button === 0) down = [event.clientX, event.clientY]; };
    const cancelPick = () => { down = null; };
    const click = event => {
      if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) { down = null; return; }
      down = null; if (event.defaultPrevented || !ctx.isActive?.()) return;
      const rect = ctx.canvas.getBoundingClientRect();
      const point = new THREE.Vector3((event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2, 0).unproject(ctx.camera);
      // Moving a building (T36): the tap chooses a cell of the ground instead of a building.
      if (ctx.placing?.()) { ctx.onGround?.(point.x, -point.y / .72); return; }
      const picked = pickAt(point.x, -point.y / .72);
      if (!picked) return;
      if (ctx.canPickRemote?.(picked)) { ctx.onPick?.(picked); return; }
      // Walk up first: a click on something out of reach only says so (ctx.player is the player's position).
      const position = ctx.player?.(), verdict = clickVerdict(position, place.zones, picked);
      // An installed position adapter must have a position before it can open a building.
      if (ctx.player && !position) { ctx.onFar?.(picked, {...verdict, open: false, hint: WALK_CLOSER}); return; }
      if (verdict.open) ctx.onPick?.(picked); else ctx.onFar?.(picked, verdict);
    };
    ctx.canvas.addEventListener('pointerdown', start); ctx.canvas.addEventListener('pointerup', click);
    for (const type of ['pointercancel', 'lostpointercapture']) ctx.canvas.addEventListener(type, cancelPick);
    cleanups.push(() => {
      ctx.canvas.removeEventListener('pointerdown', start); ctx.canvas.removeEventListener('pointerup', click);
      for (const type of ['pointercancel', 'lostpointercapture']) ctx.canvas.removeEventListener(type, cancelPick);
    });
  }
  let ringing = 0;
  return {
    apply, pickAt,
    setRecoveryState(value) {
      const accepted = value?.recoveryVersion === 1 && RECOVERY_PHASES.has(value.displayPhase)
        && typeof value.islandEpoch === 'string' && Array.isArray(value.structures) ? value : null;
      const key = accepted ? JSON.stringify(accepted) : 'null';
      recoveryIndicators.setState(accepted);
      recoveryIndicators.update();
      if (key === recoveryStateKey) return;
      recoveryState = accepted; recoveryStateKey = key;
      apply(state);
    },
    // T36: the cell a building is moved to ({spotId, x, z, size, ok}), or null when the move ends.
    preview(next) {
      if (disposed) return;
      preview = next && Number.isFinite(next.x) && Number.isFinite(next.z) ? {...next} : null;
      footprint.show(preview);
      wallLanes?.show(preview && preview.wallRuleVersion !== 1 && SPOTS.find(spot => spot.id === preview.spotId)?.slot === 'wall');
      apply(state);
    },
    wallDraft: model => wallDraft.show(model),
    get previewing() { return preview ? {...preview} : null; },
    get wallLanesShown() { return !!wallLanes?.shown; },
    ring() { ringing = 1.2; },
    update(dt, time = 0) {
      if (disposed) return;
      recoveryIndicators.update();
      rangeRing.show(ctx.range?.() ?? null, reduced() ? 0 : time);
      const still = reduced();
      const glow = still ? 1 : .7 + .3 * Math.sin(time * 3.2), bob = still ? 0 : Math.sin(time * 2.4) * 2.4 / UNIT;
      // Calm markers (owner, 15 Nov: "limit the visual overload"): only the spots near the captain glow and bob;
      // the others stay on the map as faint, still rings and badges, so a dozen gold "+" never shout at once.
      const at = ctx.player?.() ?? null;
      for (const marker of markers.values()) {
        const near = !at || !Number.isFinite(marker.x) || Math.hypot(at.x - marker.x, at.z - marker.z) <= MARKER_NEAR;
        const target = near ? 1 : MARKER_FAR;
        marker.fade = still || marker.fade === undefined ? target : marker.fade + (target - marker.fade) * Math.min(1, dt * 6);
        marker.ring.material.opacity = (near ? glow : 1) * marker.fade;
        for (const mesh of [marker.badge, marker.lock, marker.lockRing]) mesh.material.opacity = marker.fade;
        marker.badge.position.y = marker.badge.userData.baseY + (near ? bob : 0);
      }
      if (!bell) return;
      if (ringing > 0 && !still) { ringing = Math.max(0, ringing - dt); bell.rotation.z = Math.sin(ringing * 18) * .12 * ringing; }
      else bell.rotation.z = 0;
    },
    get root() { return root; },
    get wallJoins() { return wallConnections.links; },
    retryWallArt,
    dispose() {
      if (disposed) return; disposed = true; cleanups.splice(0).forEach(stop => stop());
      progress?.dispose(); recoveryIndicators.dispose();
      wallConnections.dispose(); wallDraft.dispose();
      for (const id of [...shown.keys()]) clear(id);
      for (const [key, mesh] of buildings) if (isInventoryWallId(key.split(':')[0])) releaseStandin(mesh);
      for (const item of lockTextures.values()) item.texture.dispose(); // the padlocks a spot no longer shows
      if (art) Object.values(art).forEach(material => { material.map?.dispose(); material.dispose(); });
    },
  };
}
