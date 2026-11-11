// Draws your island on the home_islet place: a glowing marker on every empty build spot, the buildings
// that stand, the cabin and the harbor bell. Tapping a marker, a building or the bell picks it.
// Simple pixel shapes are drawn in code onto small canvases (no outside asset, no data: URL); when the
// art lane registers real sprites in src/pixel/catalog.js (ids such as wall, cannon, watchtower, house,
// harbor-bell) they are used instead. Everything is added under place.group, so the place's own
// lifetime (resources.js) releases every texture, material and geometry when the player leaves.
import * as THREE from 'three';
import {loadArt, placeArt, projectPoint} from '../world/art.js';
import {pixelSizes, snapPixel} from '../pixel/catalog.js';
import {SPOTS, CABIN, BELL, islandZones} from './spots.js';

const UNIT = 16;
// The first id the catalog knows wins; none known means the drawn sprite stays.
export const ART_CANDIDATES = Object.freeze({
  wall: ['wall', 'island-wall', 'wall-1'], cannon: ['cannon', 'island-cannon', 'cannon-1'],
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
const SIZES = {wall: [40, 24], cannon: [32, 24], watchtower: [32, 56], house: [40, 40], bell: [24, 40]};
// A pulsing ring of light on the ground with a small diamond above it: "you can build here".
function paintMarker(c) {
  for (let y = 0; y < 14; y++) for (let x = 0; x < 36; x++) {
    const r = Math.hypot((x + .5 - 18) / 17, (y + .5 - 7) / 6.5);
    if (r > 1 || r < .62) continue;
    c.fillStyle = r > .86 ? 'rgba(243,213,140,0.95)' : (x + y) % 2 ? 'rgba(255,240,190,0.7)' : 'rgba(232,170,70,0.55)';
    c.fillRect(x, y + 18, 1, 1);
  }
  rects(c, [[16, 2, 4, 2, '#fff2c4'], [14, 4, 8, 4, '#f3d58c'], [16, 8, 4, 2, '#d9a93b'], [17, 10, 2, 6, 'rgba(243,213,140,0.6)']]);
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
// loadArt (tests)}. Returns {apply({spots, visitor}), update(dt, time), pickAt(x, z), dispose()}.
export function decorateIsland(place, ctx = {}) {
  const root = new THREE.Group(); root.name = 'island'; place.group.add(root);
  const reduced = () => (typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() : !!ctx.reducedMotion);
  const textures = Object.fromEntries(Object.entries(PAINT).map(([kind, paint]) => [kind, canvasTexture(...SIZES[kind], paint)]));
  const markerTexture = canvasTexture(36, 32, paintMarker);
  const markers = new Map(), buildings = new Map();
  for (const spot of SPOTS) {
    const marker = sprite(root, markerTexture, [36, 32], spot.x, spot.z, `island-marker:${spot.id}`);
    marker.position.y -= .6; marker.renderOrder = 99; // on the ground, under the player
    markers.set(spot.id, marker);
    const building = sprite(root, textures[spot.kind], SIZES[spot.kind], spot.x, spot.z, `island-${spot.kind}:${spot.id}`);
    building.visible = false; buildings.set(spot.id, building);
  }
  const bell = sprite(root, textures.bell, SIZES.bell, BELL.x, BELL.z, 'island-bell');
  if (ctx.art?.cabin) placeArt(root, ctx.art, 'cabin', CABIN.x, CABIN.z).name = 'island-cabin';
  const baseColliders = [...place.colliders];
  let state = {spots: [], visitor: false}, disposed = false;

  function apply({spots = [], visitor = false} = {}) {
    if (disposed) return;
    state = {spots, visitor};
    const known = spots.length > 0;
    for (const spot of SPOTS) {
      const built = spots.find(item => item.id === spot.id)?.built === true;
      buildings.get(spot.id).visible = built;
      markers.get(spot.id).visible = !built && !visitor && known;
    }
    place.zones = islandZones({visitor});
    place.colliders.splice(0, place.colliders.length, ...baseColliders,
      {x: CABIN.x, z: CABIN.z - 1.8, width: 4.8, depth: 3.6, island: true});
  }
  apply(state);

  // Real art from the catalog replaces the drawn sprite of the same kind, once it has loaded.
  const wanted = [...new Set([...SPOTS.map(spot => spot.kind), 'bell'])].map(kind => [kind, catalogArt(kind)]).filter(([, id]) => id);
  if (wanted.length) {
    (ctx.loadArt ?? loadArt)(wanted.map(([, id]) => id)).then(art => {
      if (disposed) { Object.values(art).forEach(material => { material.map?.dispose(); material.dispose(); }); return; }
      for (const [kind, id] of wanted) {
        const swap = mesh => {
          const real = placeArt(root, art, id, mesh.userData.ground.x, mesh.userData.ground.z);
          real.name = mesh.name; real.visible = mesh.visible; mesh.visible = false; root.remove(mesh);
          mesh.geometry.dispose(); mesh.material.dispose();
          return real;
        };
        if (kind === 'bell') continue; // the bell keeps its drawn sprite object (it is picked by name)
        for (const spot of SPOTS.filter(item => item.kind === kind)) buildings.set(spot.id, swap(buildings.get(spot.id)));
      }
      apply(state);
    }).catch(() => { /* The drawn sprites stay. */ });
  }

  // The nearest pickable thing to a ground point (a tap), or null.
  function pickAt(x, z) {
    const candidates = [...SPOTS.map(spot => ({id: spot.id, x: spot.x, z: spot.z, w: 2.4, h: spot.kind === 'watchtower' ? 5 : 3})),
      {id: BELL.id, x: BELL.x, z: BELL.z, w: 1.6, h: 3.4}, ...(state.visitor ? [] : [{id: CABIN.id, x: CABIN.x, z: CABIN.z, w: 3, h: 6}])];
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
      const glow = still ? .9 : .65 + .35 * Math.sin(time * 3.2);
      markerTexture.userData.glow = glow;
      for (const marker of markers.values()) marker.material.opacity = glow;
      if (ringing > 0 && !still) { ringing = Math.max(0, ringing - dt); bell.rotation.z = Math.sin(ringing * 18) * .12 * ringing; }
      else bell.rotation.z = 0;
    },
    get root() { return root; },
    dispose() { if (disposed) return; disposed = true; cleanups.splice(0).forEach(stop => stop()); },
  };
}
