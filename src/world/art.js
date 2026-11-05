// Loads our small original SVG drawings and places flat, bottom-anchored sprites.
import * as THREE from 'three';

export const artSizes = {
  cottage: [8.6, 8.03, 0.107], 'cottage-interior': [8.6, 8.03, 0.107],
  lighthouse: [6.6, 13.2, 0.077], boathouse: [6, 5.31, 0.096],
  birch: [4.7, 6.41, 0.07], pine: [4.2, 6.11, 0.072],
  explorer: [1.7, 2.67, 0.068], 'explorer-back': [1.7, 2.67, 0.068],
  jetty: [3.25, 6.5, 0.1], boat: [3.8, 2.63, 0.25],
  shrub: [2.6, 2.02, 0.12], rock: [2.8, 2.1, 0.15],
  flowers: [1.1, 1.18, 0.08], sign: [1.6, 2.22, 0.08],
};
for (const name of ['explorer', 'explorer-back']) {
  for (const frame of [1, 2]) artSizes[`${name}-walk-${frame}`] = artSizes[name];
}
export async function loadArt() {
  const loader = new THREE.TextureLoader(), materials = {};
  await Promise.all(Object.keys(artSizes).map(async name => {
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
  const [width, height, anchor] = artSizes[name];
  const geometry = new THREE.PlaneGeometry(width * scale, height * scale);
  geometry.translate(0, height * scale * (0.5 - anchor), 0);
  const mesh = new THREE.Mesh(geometry, art[name]);
  const point = projectPoint(x, z); mesh.position.set(point.x, point.y, 0);
  mesh.renderOrder = 100 + z; mesh.frustumCulled = false;
  mesh.userData = { asset: name, ground: { x, z } }; scene.add(mesh);
  return mesh;
}
