// Loads our small original SVG drawings and places flat, bottom-anchored sprites.
import * as THREE from 'three';
import { artSizes, islandArtIds } from '../assets/catalog.js';
export { artSizes } from '../assets/catalog.js';

export async function loadArt(names = islandArtIds) {
  if (!Array.isArray(names)) throw new Error('Art names must be an array.');
  const ids = [...new Set(names)];
  for (const id of ids) if (!Object.hasOwn(artSizes, id)) throw new Error(`Unknown drawing: ${id}`);
  const loader = new THREE.TextureLoader(), materials = {};
  await Promise.all(ids.map(async name => {
    const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}art/${name}.svg`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    materials[name] = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
      depthTest: false, depthWrite: false, toneMapped: false });
  }));
  return materials;
}
export function projectPoint(x, z) { return { x, y: -z * 0.72 }; }
export function placeArt(scene, art, name, x, z, scale = 1) {
  if (!Object.hasOwn(artSizes, name) || !Object.hasOwn(art, name)) throw new Error(`Load drawing before placing it: ${name}`);
  const [width, height, anchor] = artSizes[name];
  const geometry = new THREE.PlaneGeometry(width * scale, height * scale);
  geometry.translate(0, height * scale * (0.5 - anchor), 0);
  const mesh = new THREE.Mesh(geometry, art[name]);
  const point = projectPoint(x, z); mesh.position.set(point.x, point.y, 0);
  mesh.renderOrder = 100 + z; mesh.frustumCulled = false;
  mesh.userData = { asset: name, ground: { x, z } }; scene.add(mesh);
  return mesh;
}
