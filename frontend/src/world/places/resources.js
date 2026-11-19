// A place owns its root, textures, materials, geometry and explicit subscriptions.
import * as THREE from 'three';
import {legacyBackdrop} from '../ground-transform.js';
import { loadTexture } from '../texture.js';
import { hasGround, paintGround } from '../../art/ground.js';
import { premultiply, screenDensity, smoothTexture } from '../../art/textures.js';
import {acquireRasterSheet} from '../../art/village-raster.js';
import {TERRAIN_SHEET} from '../../art/village/terrain-materials.js';
const HOME_REFERENCE = {file: 'village/home-reference-terrain.webp', width: 1536, height: 1152};

// A place with a painted cartoon ground (src/art/ground.js) gets it instead of its pixel backdrop:
// 16 to 32 texels per world unit, by the screen's density.
export async function loadBackdrop(path, { quality = 'high' } = {}) {
  const id = /^places\/([a-z_]+)\.png$/.exec(path)?.[1];
  if (id && hasGround(id) && typeof document !== 'undefined') {
    const density = Math.max(16, Math.min(32, screenDensity(quality) * 8));
    if (id === 'home_islet') {
      const reference = await acquireRasterSheet(HOME_REFERENCE).catch(() => null);
      if (reference) {
        try {
          const texture = smoothTexture(paintGround(id, density, null, reference.image));
          texture.userData.homeReference = true;
          return texture;
        } finally { reference.release(); }
      }
    }
    const lease = await acquireRasterSheet(TERRAIN_SHEET);
    try {
      return smoothTexture(paintGround(id, density, lease.image));
    } finally { lease.release(); }
  }
  const texture = await loadTexture(`${import.meta.env.BASE_URL}${path}`);
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
