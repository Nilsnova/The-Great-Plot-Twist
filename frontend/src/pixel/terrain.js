// One pre-baked pixel backdrop uses the canonical land mask and drawn organic paths.
import * as THREE from 'three';
import {premultiply} from '../art/textures.js';
import {legacyBackdrop} from '../world/ground-transform.js';
export function createPixelTerrain(loadedTexture) {
  const texture = loadedTexture ?? new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}pixel/ground.png`);
  if (!texture.isCanvasTexture) {
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  }
  const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false,
    depthWrite: false, toneMapped: false, premultipliedAlpha: texture.premultiplyAlpha});
  if (texture.premultiplyAlpha) material.onBeforeCompile = premultiply;
  const mesh = legacyBackdrop(new THREE.Mesh(new THREE.PlaneGeometry(64, 48), material));
  mesh.renderOrder = 4; mesh.userData.asset = 'pixel-ground'; return mesh;
}
