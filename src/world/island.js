// Assembles the island. Static props sharing a material become one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTerrain } from './terrain.js';
import { createPaths } from './paths.js';
import { createBuildings } from './buildings.js';
import { createLighthouse } from './lighthouse.js';
import { createScenery } from './scenery.js';

export function batchStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), originals = [];
  group.traverse(object => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    const key = object.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: object.material, geometries: [] });
    let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
    geometry.deleteAttribute('uv');
    buckets.get(key).geometries.push(geometry); originals.push(object);
  });
  for (const object of originals) { object.removeFromParent(); object.geometry.dispose(); }
  const result = new THREE.Group();
  for (const { material, geometries } of buckets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material);
    merged.castShadow = true; merged.receiveShadow = true; result.add(merged);
    geometries.forEach(geometry => geometry.dispose());
  }
  return result;
}

export function createIsland(scene) {
  const buildings = createBuildings(), tower = createLighthouse(), scenery = createScenery();
  // Keep the roof separate: it lifts away while the player explores the cottage.
  buildings.cottageRoof.removeFromParent();
  const roof = batchStatic(buildings.cottageRoof);
  roof.position.copy(buildings.group.children[0].position);
  scene.add(createTerrain(), createPaths(), batchStatic(buildings.group),
    batchStatic(scenery.group), roof, tower.group);
  return {
    tower, colliders: [...buildings.colliders, tower.collider, ...scenery.colliders],
    update(player, time, night) {
      const bounds = buildings.cottageBounds;
      roof.visible = Math.abs(player.x - bounds.x) > 3.5 || Math.abs(player.z - bounds.z) > 2.8;
      tower.update(time, night);
    },
  };
}
