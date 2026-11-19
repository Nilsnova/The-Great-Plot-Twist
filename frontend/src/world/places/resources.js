// A place owns its root, textures, materials, geometry and explicit subscriptions.
import * as THREE from 'three';
import {QUALITY, settings} from '../../config.js';
import {legacyBackdrop} from '../ground-transform.js';
import { loadTexture } from '../texture.js';
import { hasGround, paintGround } from '../../art/ground.js';
import {paintOutpostGround} from '../../art/outpost-ground.js';
import { premultiply, screenDensity, smoothTexture } from '../../art/textures.js';
import {acquireRasterSheet} from '../../art/village-raster.js';
import {TERRAIN_SHEET} from '../../art/village/terrain-materials.js';
const OUTPOST_GROUND = new Set([
  'pixel/ground.png', 'places/saltreach_harbor.png', 'places/smugglers_cove.png',
  'places/wreck_point.png', 'places/the_teeth.png',
]);
// A place with a painted cartoon ground (src/art/ground.js) gets it instead of its pixel backdrop:
// Rasterise the ground at the screen's density up to the shipped terrain atlas limit.
export async function loadBackdrop(path, {quality = settings.quality} = {}) {
  const id = /^places\/([a-z_]+)\.png$/.exec(path)?.[1];
  if (id && hasGround(id) && typeof document !== 'undefined') {
    const lease = await acquireRasterSheet(TERRAIN_SHEET);
    try {
      const limit = (QUALITY[quality] ?? QUALITY.high).groundTexels;
      const density = Math.max(16, Math.min(limit, screenDensity(quality) * 10));
      return smoothTexture(paintGround(id, density, lease.image));
    } finally { lease.release(); }
  }
  const texture = await loadTexture(`${import.meta.env.BASE_URL}${path}`);
  if (OUTPOST_GROUND.has(path) && texture.image?.width && typeof document !== 'undefined') {
    const density = Math.max(16, Math.min(32, (QUALITY[quality] ?? QUALITY.high).groundTexels, screenDensity(quality) * 10));
    const original = texture.image;
    try {
      const painted = smoothTexture(paintOutpostGround(original, density, {muted: id === 'the_teeth'}));
      painted.userData.coastSource = original;
      texture.dispose();
      return painted;
    } catch (error) {
      if (error?.name !== 'SecurityError') { texture.dispose(); throw error; }
    }
  }
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; return texture;
}
export function createLifetime(group, art = {}, cleanups = []) {
  let disposed = false;
  return () => {
    if (disposed) return; disposed = true;
    cleanups.splice(0).forEach(cleanup => cleanup()); group.removeFromParent();
    const geometries = new Set(), materials = new Set(Object.values(art)), textures = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    });
    materials.forEach(material => { if (material.map) textures.add(material.map); material.dispose(); });
    textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose());
    group.clear();
  };
}
export function backdrop(group, texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, premultipliedAlpha: !!texture.premultiplyAlpha, depthTest: false, depthWrite: false, toneMapped: false,
  });
  if (texture.premultiplyAlpha) material.onBeforeCompile = premultiply;
  const mesh = legacyBackdrop(new THREE.Mesh(new THREE.PlaneGeometry(64, 48), material));
  mesh.renderOrder = 4; group.add(mesh); return mesh;
}
