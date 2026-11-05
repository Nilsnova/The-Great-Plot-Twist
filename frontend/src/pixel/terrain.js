// One pre-baked pixel backdrop uses the canonical land mask and drawn organic paths.
import * as THREE from 'three';
export function createPixelTerrain(loadedTexture) {
  const texture = loadedTexture ?? new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}pixel/ground.png`);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  mesh.renderOrder = 4; mesh.userData.asset = 'pixel-ground'; return mesh;
}
