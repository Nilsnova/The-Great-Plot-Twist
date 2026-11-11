// Draws your island on the home_islet place: a glowing marker on every empty build spot, the buildings
// that stand, the cabin and the harbor bell. Tapping a marker, a building or the bell picks it.
// Simple pixel shapes are drawn in code onto small canvases (no outside asset, no data: URL); when the
// art lane registers real sprites in src/pixel/catalog.js (ids such as wall, cannon, watchtower, house,
// harbor-bell) they are used instead. Everything is added under place.group, so the place's own
// lifetime (resources.js) releases every texture, material and geometry when the player leaves.
import * as THREE from 'three';
import {loadArt, placeArt, projectPoint} from '../world/art.js';
import {pixelSizes, snapPixel} from '../pixel/catalog.js';
import {SPOTS as ISLAND_SPOTS, CABIN, BELL, islandZones} from './spots.js';
import {SLOT_KINDS} from './td-rules.js';

const UNIT = 16;
// The first id the catalog knows wins; none known means the drawn sprite stays.
export const ART_CANDIDATES = Object.freeze({
  wall: ['wall', 'island-wall', 'wall-1'], cannon: ['cannon', 'island-cannon', 'cannon-1'], mortar: ['mortar', 'island-mortar', 'mortar-1'],
  watchtower: ['watchtower', 'island-watchtower', 'watchtower-1'], house: ['house', 'island-house', 'house-1'],
  bell: ['harbor-bell', 'island-bell', 'bell'],
});
export const catalogArt = (kind, sizes = pixelSizes) => (ART_CANDIDATES[kind] ?? []).find(id => Object.hasOwn(sizes, id)) ?? null;

const rects = (context, list) => { for (const [x, y, w, h, colour] of list) { context.fillStyle = colour; context.fillRect(x, y, w, h); } };
const PAINT = {
  wall: c => rects(c, [
    [0, 6, 40, 18, '#7d7a6e'], [0, 4, 40, 3, '#9a978a'], [0, 22, 40, 2, '#4f4c43'],
    [2, 9, 9, 5, '#8e8b7e'], [13, 9, 11, 5, '#86837a'], [26, 9, 12, 5, '#8e8b7e'],
    [6, 16, 11, 5, '#86837a'], [19, 16, 9, 5, '#8e8b7e'], [30, 16, 8, 5, '#86837a'],
    [0, 0, 6, 5, '#9a978a'], [11, 0, 6, 5, '#9a978a'], [23, 0, 6, 5, '#9a978a'], [34, 0, 6, 5, '#9a978a'],
  ]),
  cannon: c => rects(c, [
    [4, 14, 22, 6, '#7a5532'], [4, 13, 22, 2, '#9b7146'], // carriage
    [14, 4, 16, 6, '#2d2f33'], [12, 6, 4, 6, '#3b3e44'], [28, 3, 3, 8, '#1c1d20'], [16, 5, 10, 1, '#5a5e66'], // barrel
    [5, 18, 7, 6, '#3d2a18'], [18, 18, 7, 6, '#3d2a18'], [7, 20, 3, 2, '#9b7146'], [20, 20, 3, 2, '#9b7146'], // wheels
  ]),
  // A squat iron mortar on a wooden bed, its mouth to the sky.
  mortar: c => rects(c, [
    [3, 17, 26, 6, '#7a5532'], [3, 16, 26, 2, '#9b7146'], [5, 22, 5, 2, '#3d2a18'], [22, 22, 5, 2, '#3d2a18'],
    [8, 8, 16, 9, '#2d2f33'], [6, 10, 20, 6, '#3b3e44'], [9, 5, 14, 4, '#1c1d20'], [10, 4, 12, 2, '#5a5e66'],
    [11, 6, 10, 2, '#0e0f11'], [8, 11, 3, 3, '#5a5e66'], [24, 12, 3, 2, '#b8892c'],
  ]),
  watchtower: c => rects(c, [
    [6, 18, 3, 38, '#6b4a2b'], [23, 18, 3, 38, '#6b4a2b'], [9, 30, 14, 2, '#7a5532'], [9, 44, 14, 2, '#7a5532'],
    [3, 14, 26, 5, '#8a6236'], [3, 12, 26, 2, '#a97b46'], [5, 6, 2, 8, '#6b4a2b'], [25, 6, 2, 8, '#6b4a2b'],
    [3, 3, 26, 4, '#8f3f33'], [14, 0, 2, 4, '#3a2a18'], [16, 0, 8, 3, '#d8c47a'], // roof and flag
  ]),
  house: c => rects(c, [
    [6, 18, 28, 20, '#e2d3ac'], [6, 36, 28, 4, '#a68d62'], [17, 26, 7, 12, '#6b4a2b'], [9, 22, 6, 6, '#7fa7b5'], [26, 22, 6, 6, '#7fa7b5'],
    [2, 14, 36, 5, '#a3452f'], [6, 9, 28, 5, '#b9543a'], [11, 4, 18, 5, '#a3452f'], [16, 0, 8, 4, '#b9543a'], [27, 3, 4, 8, '#6f6a5a'],
  ]),
  bell: c => rects(c, [
    [2, 6, 3, 34, '#6b4a2b'], [19, 6, 3, 34, '#6b4a2b'], [0, 2, 24, 5, '#8a6236'], [0, 1, 24, 2, '#a97b46'],
    [8, 9, 8, 3, '#b8892c'], [6, 12, 12, 9, '#d9a93b'], [5, 20, 14, 3, '#e8bf55'], [8, 12, 2, 7, '#f3d58c'], [11, 23, 2, 2, '#4d3a14'],
    [0, 38, 24, 2, '#4d3a14'],
  ]),
};
const SIZES = {wall: [40, 24], cannon: [32, 24], mortar: [32, 24], watchtower: [32, 56], house: [40, 40], bell: [24, 40]};
// "You can build here": a glowing ring on the ground (pulses) and a floating badge with the kind
// (bobs). Stepped, dithered light like the class demo's lamps; no smooth gradients.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function paintRing(c) {
  for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
    const r = Math.hypot((x + .5 - 24) / 23, (y + .5 - 12) / 11);
    if (r > 1) continue;
    const edge = Math.abs(r - .78);
    if (edge < .09) { c.fillStyle = r > .78 ? '#fff2c4' : '#f3c75a'; c.fillRect(x, y, 1, 1); continue; }
    const glow = Math.max(0, 1 - edge / .4) + (BAYER[(y % 4) * 4 + (x % 4)] + .5) / 16 - .5;
    if (glow <= .15) continue;
    c.fillStyle = glow > .6 ? 'rgba(255,214,120,0.75)' : 'rgba(240,170,60,0.45)'; c.fillRect(x, y, 1, 1);
  }
}
const GLYPHS = {
  wall: [[4, 9, 12, 5, '#e9dfc1'], [4, 7, 3, 2, '#e9dfc1'], [9, 7, 3, 2, '#e9dfc1'], [14, 7, 2, 2, '#e9dfc1'], [7, 11, 1, 1, '#5b3a1e'], [12, 11, 1, 1, '#5b3a1e']],
  cannon: [[5, 11, 10, 3, '#e9dfc1'], [6, 6, 10, 4, '#e9dfc1'], [15, 5, 2, 6, '#e9dfc1'], [6, 13, 3, 3, '#e9dfc1'], [12, 13, 3, 3, '#e9dfc1']],
  watchtower: [[6, 8, 2, 8, '#e9dfc1'], [12, 8, 2, 8, '#e9dfc1'], [5, 6, 10, 2, '#e9dfc1'], [9, 2, 1, 4, '#e9dfc1'], [10, 2, 4, 2, '#f3c75a']],
  // A tower spot (cannon or mortar): a round tower top with a barrel.
  tower: [[5, 9, 10, 7, '#e9dfc1'], [4, 7, 3, 2, '#e9dfc1'], [8, 7, 4, 2, '#e9dfc1'], [13, 7, 3, 2, '#e9dfc1'], [11, 4, 6, 2, '#f3c75a'], [9, 12, 2, 4, '#5b3a1e']],
  house: [[5, 10, 10, 6, '#e9dfc1'], [3, 9, 14, 2, '#e9dfc1'], [5, 7, 10, 2, '#e9dfc1'], [7, 5, 6, 2, '#e9dfc1'], [9, 12, 2, 4, '#5b3a1e']],
};
function paintBadge(kind) {
  return c => {
    rects(c, [[2, 0, 16, 1, '#5b3a1e'], [1, 1, 18, 18, '#5b3a1e'], [2, 2, 16, 16, '#f3c75a'], [3, 3, 14, 14, '#8a5a2b'],
      [8, 19, 4, 2, '#5b3a1e'], [9, 21, 2, 2, '#f3c75a']]);
    rects(c, GLYPHS[kind] ?? []);
  };
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false; paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function sprite(group, texture, [width, height], x, z, name) {
  const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  const geometry = new THREE.PlaneGeometry(width / UNIT, height / UNIT); geometry.translate(0, height / UNIT / 2, 0);
  const mesh = new THREE.Mesh(geometry, material), point = projectPoint(x, z);
  mesh.position.set(snapPixel(point.x), snapPixel(point.y), 0); mesh.renderOrder = 100 + z; mesh.frustumCulled = false;
  mesh.name = name; mesh.userData = {asset: name, ground: {x, z}};
  group.add(mesh);
  return mesh;
}

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
  const textures = Object.fromEntries(Object.entries(PAINT).map(([kind, paint]) => [kind, canvasTexture(...SIZES[kind], paint)]));
  const ringTexture = canvasTexture(48, 24, paintRing);
  const badgeTextures = Object.fromEntries(Object.keys(GLYPHS).map(kind => [kind, canvasTexture(20, 24, paintBadge(kind))]));
  const markers = new Map(), buildings = new Map(); // buildings: 'spot:kind' -> mesh (a tower spot has a cannon and a mortar)
  const slotOf = spot => spot.slot ?? (spot.kind === 'cannon' ? 'tower' : spot.kind);
  const kindsOf = spot => SLOT_KINDS[slotOf(spot)] ?? [spot.kind];
  for (const spot of SPOTS) {
    const ring = sprite(root, ringTexture, [48, 24], spot.x, spot.z, `island-marker:${spot.id}`);
    ring.position.y -= .75; ring.renderOrder = 99; // on the ground, under the player
    const badge = sprite(root, badgeTextures[slotOf(spot) === 'tower' ? 'tower' : spot.kind], [20, 24], spot.x, spot.z, `island-badge:${spot.id}`);
    badge.position.y += .6; badge.userData.baseY = badge.position.y;
    markers.set(spot.id, {ring, badge, set visible(value) { ring.visible = value; badge.visible = value; }});
    for (const kind of kindsOf(spot)) {
      const building = sprite(root, textures[kind], SIZES[kind], spot.x, spot.z, `island-${kind}:${spot.id}`);
      building.visible = false; buildings.set(`${spot.id}:${kind}`, building);
    }
  }
  const bell = layout.bell === false ? null : sprite(root, textures.bell, SIZES.bell, BELL.x, BELL.z, 'island-bell');
  if (layout.cabin !== false && ctx.art?.cabin) placeArt(root, ctx.art, 'cabin', CABIN.x, CABIN.z).name = 'island-cabin';
  const baseColliders = [...place.colliders];
  let state = {spots: [], visitor: false, battle: false, unlocks: null}, disposed = false;

  // battle: a wave is on screen; its renderer (src/pirates/render.js) draws the walls and cannons with
  // their damage, so the island's own wall and cannon sprites step aside until it ends.
  function apply({spots = [], visitor = false, battle = false, unlocks = null} = {}) {
    if (disposed) return;
    state = {spots, visitor, battle, unlocks};
    const known = spots.length > 0;
    for (const spot of SPOTS) {
      const answer = spots.find(item => item.id === spot.id), built = answer?.built === true;
      const open = !unlocks || kindsOf(spot).some(kind => (unlocks.levels?.[kind] ?? 0) >= 1);
      for (const kind of kindsOf(spot)) {
        buildings.get(`${spot.id}:${kind}`).visible = built && (answer.kind === kind || (kindsOf(spot).length === 1))
          && !(battle && ['wall', 'cannon', 'mortar'].includes(kind));
      }
      markers.get(spot.id).visible = !built && !visitor && known && !battle && open;
    }
    if (layout.zones === islandZones) {
      place.zones = islandZones({visitor});
      place.colliders.splice(0, place.colliders.length, ...baseColliders,
        {x: CABIN.x, z: CABIN.z - 1.8, width: 4.8, depth: 3.6, island: true});
    } else place.zones = [...baseZones, ...(known ? layout.zones() : [])];
  }
  apply(state);

  // Real art from the catalog replaces the drawn sprite of the same kind, once it has loaded.
  const wanted = [...new Set([...SPOTS.flatMap(kindsOf), 'bell'])].map(kind => [kind, catalogArt(kind)]).filter(([, id]) => id);
  if (wanted.length) {
    (ctx.loadArt ?? loadArt)(wanted.map(([, id]) => id)).then(art => {
      if (disposed) { Object.values(art).forEach(material => { material.map?.dispose(); material.dispose(); }); return; }
      for (const [kind, id] of wanted) {
        if (kind === 'bell') continue; // the bell keeps its drawn sprite object (it is picked by name)
        const swap = mesh => {
          const real = placeArt(root, art, id, mesh.userData.ground.x, mesh.userData.ground.z);
          real.name = mesh.name; real.visible = mesh.visible; mesh.visible = false; root.remove(mesh);
          mesh.geometry.dispose(); mesh.material.dispose();
          return real;
        };
        for (const key of [...buildings.keys()].filter(item => item.endsWith(`:${kind}`))) buildings.set(key, swap(buildings.get(key)));
      }
      apply(state);
    }).catch(() => { /* The drawn sprites stay. */ });
  }

  // The nearest pickable thing to a ground point (a tap), or null.
  function pickAt(x, z) {
    const candidates = [...SPOTS.map(spot => ({id: spot.id, x: spot.x, z: spot.z, w: 2.4, h: spot.kind === 'watchtower' ? 5 : 3})),
      ...(bell ? [{id: BELL.id, x: BELL.x, z: BELL.z, w: 1.6, h: 3.4}] : []),
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
      const glow = still ? 1 : .7 + .3 * Math.sin(time * 3.2), bob = still ? 0 : Math.round(Math.sin(time * 2.4) * 2) / UNIT;
      for (const marker of markers.values()) { marker.ring.material.opacity = glow; marker.badge.position.y = marker.badge.userData.baseY + bob; }
      if (!bell) return;
      if (ringing > 0 && !still) { ringing = Math.max(0, ringing - dt); bell.rotation.z = Math.sin(ringing * 18) * .12 * ringing; }
      else bell.rotation.z = 0;
    },
    get root() { return root; },
    dispose() { if (disposed) return; disposed = true; cleanups.splice(0).forEach(stop => stop()); },
  };
}
