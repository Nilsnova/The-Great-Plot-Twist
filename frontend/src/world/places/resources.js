// A place owns its root, textures, materials, geometry and explicit subscriptions.
import * as THREE from 'three';
export async function loadBackdrop(path) {
  const texture = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${path}`);
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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  mesh.renderOrder = 4; group.add(mesh); return mesh;
}
