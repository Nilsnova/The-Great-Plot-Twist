// Presentation of the existing walkable heart target. This module never changes combat state.
import * as THREE from 'three';
import {HEART} from './placement.js';
import {makeBuildingFoundations} from './building-foundations.js';
import {projectPoint} from '../world/art.js';
import {paintIds, screenDensity, smoothTexture, spriteMaterial} from '../art/textures.js';

const IDS = ['island_core', 'island_core_damaged', 'island_core_broken'];
export function decorateCore(place, {prepare = paintIds, density = screenDensity()} = {}) {
  const geometry = new THREE.PlaneGeometry(8, 8); geometry.translate(0, (64 - 12) / 16, 0);
  const blank = spriteMaterial(null), mesh = new THREE.Mesh(geometry, blank);
  const point = projectPoint(HEART.x, HEART.z);
  mesh.name = 'island-core'; mesh.position.set(point.x, point.y, 0);
  mesh.renderOrder = 100 + HEART.z; mesh.frustumCulled = false; mesh.visible = false;
  mesh.userData.ground = {...HEART}; place.group.add(mesh);
  const foundation = makeBuildingFoundations(place.group, 'island-heart-shadow');
  let state = null, disposed = false, pending = null, materials = null;
  const release = pool => { for (const material of Object.values(pool ?? {})) { material.map?.dispose(); material.dispose(); } };
  function show() {
    const id = state?.frame ?? IDS[0]; mesh.visible = !disposed && !!materials;
    mesh.userData.art = id;
    mesh.userData.health = state ? {hp: state.hp, max: state.max, waveId: state.waveId} : null;
    if (materials) mesh.material = materials[id];
    foundation.show(mesh.visible ? [{slot: 'heart', ...HEART, ruin: id === IDS[2]}] : []);
  }
  function retryArt() {
    if (disposed || materials) return Promise.resolve();
    if (pending) return pending;
    const pool = {};
    pending = Promise.resolve().then(() => prepare(IDS, density, (id, canvas) => {
      if (!canvas || !IDS.includes(id)) throw new Error('Core artwork could not be prepared.');
      pool[id] = spriteMaterial(smoothTexture(canvas));
    })).then(() => {
      if (IDS.some(id => !pool[id])) throw new Error('Core artwork is not registered.');
      if (disposed) { release(pool); return; }
      materials = pool; show();
    }).catch(error => { release(pool); if (!disposed) throw error; }).finally(() => { pending = null; });
    return pending;
  }
  return {mesh, retryArt, setHealth(value) { if (!disposed) { state = value; show(); } }, reset() { if (!disposed) { state = null; show(); } },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); foundation.dispose(); release(materials); materials = null; blank.dispose(); geometry.dispose(); }};
}
