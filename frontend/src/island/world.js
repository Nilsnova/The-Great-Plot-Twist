// Draws your island on the home_islet place: a glowing marker on every empty build spot, the buildings
// that stand, the cabin and the harbor bell. Tapping a marker, a building or the bell picks it.
// The marker, badges, bell and stand-ins are clean cartoon frames painted in code (src/art/, no outside
// asset, no data: URL); the level art (walls, cannons, mortars by level) replaces the stand-ins once loaded. Everything is added under place.group, so the place's own
// lifetime (resources.js) releases every texture, material and geometry when the player leaves.
import * as THREE from 'three';
import {artSizes, loadArt, placeArt, projectPoint} from '../world/art.js';
import {pixelSizes} from '../pixel/catalog.js';
import {SPOTS as ISLAND_SPOTS, CABIN, BELL, CAMPAIGN_BUILDINGS, islandZones} from './spots.js';
import {isOpen, spotWave, waveOf} from '../campaign/index.js';
import {SLOT_KINDS} from './td-rules.js';
import {TIER_ART, crewArt, pipRow, pirateLevels} from '../pixel/pirate-catalog.js';
import {islandFrame} from '../art/registry.js';
import {frameCanvas, smoothTexture, spriteMaterial} from '../art/textures.js';

const UNIT = 16;
// The first id the catalog knows wins; none known means the drawn sprite stays.
export const ART_CANDIDATES = Object.freeze({
  wall: ['wall', 'island-wall', 'wall-1'], cannon: ['cannon', 'island-cannon', 'cannon-1'], mortar: ['mortar', 'island-mortar', 'mortar-1'],
  watchtower: ['watchtower', 'island-watchtower', 'watchtower-1'], house: ['house', 'island-house', 'house-1'],
  bell: ['harbor-bell', 'island-bell', 'bell'],
});
export const catalogArt = (kind, sizes = pixelSizes) => (ART_CANDIDATES[kind] ?? []).find(id => Object.hasOwn(sizes, id)) ?? null;
// Outside a wave a built spot shows its real kind and level: the art lane's level art (pirateLevels) for
// walls, cannons and mortars, the watchtower and the house (one drawing each up to level 3; their pips tell
// the level). Levels 4 and 5 (GAME-V3.md §4.1) have their own drawings, gold trim and the island's banner,
// and gold stars on a teal disc as pips (PIP_TIER_ART).
const tiered = kind => [...pirateLevels[kind], ...TIER_ART[kind]];
export const LEVEL_ART = Object.freeze({wall: tiered('wall'), cannon: tiered('cannon'), mortar: tiered('mortar'),
  watchtower: ['island-watchtower', 'island-watchtower', 'island-watchtower', 'island-watchtower-l4', 'island-watchtower-l5'], house: ['island-house']});
export const PIP_ART = 'fx-level-pip';
export const PIP_TIER_ART = 'fx-level-pip-gold';
export const pipArt = level => (level >= 4 ? PIP_TIER_ART : PIP_ART);
export function buildingArt(kind, level = 1) {
  const list = LEVEL_ART[kind];
  if (!list) return null;
  const n = Number.isSafeInteger(level) && level > 0 ? level : 1;
  return list[Math.min(list.length, n) - 1];
}
// How many level pips stand above a building: towers always show theirs, the rest from level 2.
export const pipCount = (kind, level = 1) => {
  const n = Number.isSafeInteger(level) && level > 0 ? Math.min(5, level) : 1;
  return kind === 'cannon' || kind === 'mortar' || n > 1 ? n : 0;
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
const DRAWN = {wall: 'island-wall', cannon: 'island-cannon', mortar: 'island-mortar', watchtower: 'island-watchtower', house: 'island-house', bell: 'island-bell'};
function drawn(name) {
  const [width, height, anchor] = islandFrame(name);
  return {texture: smoothTexture(frameCanvas(name)), size: [width, height], anchor};
}
function sprite(group, {texture, size: [width, height], anchor = 0}, x, z, name) {
  const material = spriteMaterial(texture);
  const geometry = new THREE.PlaneGeometry(width / UNIT, height / UNIT); geometry.translate(0, (height / 2 - anchor) / UNIT, 0);
  const mesh = new THREE.Mesh(geometry, material), point = projectPoint(x, z);
  mesh.position.set(point.x, point.y, 0); mesh.renderOrder = 100 + z; mesh.frustumCulled = false;
  mesh.name = name; mesh.userData = {asset: name, ground: {x, z}};
  group.add(mesh);
  return mesh;
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

// ctx: {art (the place's loaded art, with 'cabin'), reducedMotion, canvas, camera, isActive, onPick(id),
// loadArt (tests), and for Pirate Point: layout {spots, zones(), bell: false, cabin: false}}.
// Returns {apply({spots, visitor, battle, unlocks}), update(dt, time), pickAt(x, z), dispose()}.
// A marker shows on an empty spot only when something may be built there (unlocks, TOWER-DEFENSE.md §9).
export function decorateIsland(place, ctx = {}) {
  const layout = ctx.layout ?? {spots: ISLAND_SPOTS, zones: islandZones, bell: true, cabin: true};
  const SPOTS = layout.spots;
  const root = new THREE.Group(); root.name = layout.name ?? 'island'; place.group.add(root);
  const baseZones = [...(place.zones ?? [])];
  const reduced = () => (typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() : !!ctx.reducedMotion);
  const textures = Object.fromEntries(Object.entries(DRAWN).map(([kind, name]) => [kind, drawn(name)]));
  const ringTexture = drawn('build-ring');
  const badgeTextures = Object.fromEntries(['wall', 'tower', 'watchtower', 'house', 'locked'].map(kind => [kind, drawn(`build-badge-${kind}`)]));
  const markers = new Map(), buildings = new Map(); // buildings: 'spot:kind' -> mesh (a tower spot has a cannon and a mortar)
  const slotOf = spot => spot.slot ?? (spot.kind === 'cannon' ? 'tower' : spot.kind);
  const kindsOf = spot => SLOT_KINDS[slotOf(spot)] ?? [spot.kind];
  for (const spot of SPOTS) {
    const ring = sprite(root, ringTexture, spot.x, spot.z, `island-marker:${spot.id}`);
    ring.position.y -= .75; ring.renderOrder = 99; // on the ground, under the player
    const badge = sprite(root, badgeTextures[slotOf(spot) === 'tower' ? 'tower' : spot.kind], spot.x, spot.z, `island-badge:${spot.id}`);
    badge.position.y += .6; badge.userData.baseY = badge.position.y;
    const lock = sprite(root, badgeTextures.locked, spot.x, spot.z, `island-lock:${spot.id}`);
    lock.position.y += .6; lock.visible = false;
    markers.set(spot.id, {ring, badge, lock, set visible(value) { ring.visible = value; badge.visible = value; }});
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
  if (layout.cabin !== false && ctx.art?.cabin) placeArt(root, ctx.art, 'cabin', CABIN.x, CABIN.z).name = 'island-cabin';
  const baseColliders = [...place.colliders];
  let state = {spots: [], visitor: false, battle: false, unlocks: null, crew: null, campaign: null}, disposed = false;
  // The real art once it has loaded (null until then: the drawn sprites stand in), and what each spot shows.
  let art = null;
  const shown = new Map(); // spot id (or 'crew') -> {key, meshes}
  const clear = id => { const item = shown.get(id); if (!item) return; for (const mesh of item.meshes) { root.remove(mesh); mesh.geometry.dispose(); } shown.delete(id); };
  const put = (id, x, z, lift = 0, order = 0, scale = 1) => {
    const mesh = placeArt(root, art, id, x, z, scale); mesh.position.y += lift; mesh.renderOrder += order; return mesh;
  };
  function showSpot(spot, answer, hidden) {
    const built = answer?.built === true, kind = built ? (kindsOf(spot).includes(answer.kind) ? answer.kind : kindsOf(spot)[0]) : null;
    const level = Number.isSafeInteger(answer?.level) && answer.level > 0 ? answer.level : 1;
    const id = kind ? buildingArt(kind, level) : null, pips = kind ? pipCount(kind, level) : 0;
    const key = !id || hidden ? '' : `${id}:${pips}`;
    if (shown.get(spot.id)?.key === key) return;
    clear(spot.id);
    if (!key) return;
    const mesh = put(id, spot.x, spot.z); mesh.name = `island-${kind}:${spot.id}`; mesh.userData.level = level;
    const meshes = [mesh], [, height, anchor] = artSizes[id], top = height * (1 - anchor) + .15;
    // One row (pipRow): 4 and 5 smaller and spaced wider than a disc, so the gold stars never overlap.
    const row = pipCount(kind, level) ? pipRow(level, {step: .6}) : {offsets: []}, pipWidth = artSizes[PIP_ART][0];
    row.offsets.forEach((offset, i) => {
      const pip = put(pipArt(level), spot.x + offset * pipWidth, spot.z, top, .01, row.scale); pip.name = `island-pip:${spot.id}:${i + 1}`; meshes.push(pip);
    });
    shown.set(spot.id, {key, meshes});
  }
  function showCrew(spots, crew, hidden) {
    const places = hidden || !crew ? [] : crewPlaces(spots.map(item => {
      const where = SPOTS.find(spot => spot.id === item.id); return where ? {...item, x: where.x, z: where.z} : null;
    }).filter(Boolean), crew, {bell: layout.bell === false ? null : BELL});
    const key = places.map(item => `${item.kind}@${item.x},${item.z}`).join('|');
    if (shown.get('crew')?.key === key) return;
    clear('crew');
    shown.set('crew', {key, meshes: places.map(item => { const mesh = put(crewArt[item.kind], item.x, item.z, 0, .02); mesh.name = `island-crew:${item.kind}:${item.at}`; return mesh; })});
  }

  // battle: a wave is on screen; its renderer (src/pirates/render.js) draws the walls and cannons with
  // their damage, so the island's own wall and cannon sprites step aside until it ends.
  function apply({spots = [], visitor = false, battle = false, unlocks = null, crew = null, campaign = null} = {}) {
    if (disposed) return;
    state = {spots, visitor, battle, unlocks, crew, campaign};
    const known = spots.length > 0;
    for (const [id, meshes] of campaignMeshes) {
      const frame = known ? campaignArt(CAMPAIGN_BUILDINGS.find(item => item.id === id), campaign) : null;
      for (const [name, mesh] of Object.entries(meshes)) mesh.visible = name === frame;
    }
    for (const spot of SPOTS) {
      const answer = spots.find(item => item.id === spot.id), built = answer?.built === true;
      // Locked things stay on the map (GAME-V3.md §4): a spot the campaign opens later, or whose kind is not
      // open yet, shows a lock badge instead of the glowing ring.
      const open = (!unlocks || kindsOf(spot).some(kind => (unlocks.levels?.[kind] ?? 0) >= 1)) && !spotLocked(spot, campaign);
      const hidden = battle && ['wall', 'cannon', 'mortar'].includes(answer?.kind ?? spot.kind);
      for (const kind of kindsOf(spot)) {
        buildings.get(`${spot.id}:${kind}`).visible = !art && built && (answer.kind === kind || (kindsOf(spot).length === 1))
          && !(battle && ['wall', 'cannon', 'mortar'].includes(kind));
      }
      if (art) showSpot(spot, answer, hidden);
      markers.get(spot.id).visible = !built && known && !battle && open; // a visitor builds too, with their own coins
      markers.get(spot.id).lock.visible = !built && known && !battle && !open;
    }
    // The wave's renderer draws the crew during a battle; outside one they stand by their posts.
    if (art) showCrew(spots, crew, battle);
    if (layout.zones === islandZones) {
      place.zones = islandZones({visitor});
      place.colliders.splice(0, place.colliders.length, ...baseColliders,
        {x: CABIN.x, z: CABIN.z - 1.8, width: 4.8, depth: 3.6, island: true});
    } else place.zones = [...baseZones, ...(known ? layout.zones() : [])];
  }
  apply(state);

  // The real art (every level, the pips and the crew) replaces the drawn sprites once it has loaded.
  const wanted = [...new Set([...SPOTS.flatMap(kindsOf).flatMap(kind => LEVEL_ART[kind] ?? []), PIP_ART, PIP_TIER_ART, ...Object.values(crewArt)])]
    .filter(id => Object.hasOwn(artSizes, id));
  (ctx.loadArt ?? loadArt)(wanted).then(loaded => {
    if (disposed) { Object.values(loaded).forEach(material => { material.map?.dispose(); material.dispose(); }); return; }
    art = loaded;
    for (const mesh of buildings.values()) { mesh.visible = false; root.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    apply(state);
  }).catch(() => { /* The drawn sprites stay. */ });

  // The nearest pickable thing to a ground point (a tap), or null.
  function pickAt(x, z) {
    const candidates = [...SPOTS.map(spot => ({id: spot.id, x: spot.x, z: spot.z, w: 2.4, h: spot.kind === 'watchtower' ? 5 : 3})),
      ...(bell ? [{id: BELL.id, x: BELL.x, z: BELL.z, w: 1.6, h: 3.4}] : []),
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
    const click = event => {
      if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) { down = null; return; }
      down = null; if (!ctx.isActive?.()) return;
      const rect = ctx.canvas.getBoundingClientRect();
      const point = new THREE.Vector3((event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2, 0).unproject(ctx.camera);
      const picked = pickAt(point.x, -point.y / .72);
      if (picked) ctx.onPick?.(picked);
    };
    ctx.canvas.addEventListener('pointerdown', start); ctx.canvas.addEventListener('pointerup', click);
    cleanups.push(() => { ctx.canvas.removeEventListener('pointerdown', start); ctx.canvas.removeEventListener('pointerup', click); });
  }
  let ringing = 0;
  return {
    apply, pickAt,
    ring() { ringing = 1.2; },
    update(dt, time = 0) {
      if (disposed) return;
      const still = reduced();
      const glow = still ? 1 : .7 + .3 * Math.sin(time * 3.2), bob = still ? 0 : Math.sin(time * 2.4) * 2.4 / UNIT;
      for (const marker of markers.values()) { marker.ring.material.opacity = glow; marker.badge.position.y = marker.badge.userData.baseY + bob; }
      if (!bell) return;
      if (ringing > 0 && !still) { ringing = Math.max(0, ringing - dt); bell.rotation.z = Math.sin(ringing * 18) * .12 * ringing; }
      else bell.rotation.z = 0;
    },
    get root() { return root; },
    dispose() {
      if (disposed) return; disposed = true; cleanups.splice(0).forEach(stop => stop());
      for (const id of [...shown.keys()]) clear(id);
      if (art) Object.values(art).forEach(material => { material.map?.dispose(); material.dispose(); });
    },
  };
}
