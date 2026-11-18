// One selected wall reuses its actual batch quads above foliage, borrowing the current material.
import * as THREE from 'three';

export function makeWallSelection(root) {
  let mesh = null, disposed = false;
  function clear() {
    if (!mesh) return;
    mesh.removeFromParent(); mesh.geometry.dispose(); mesh = null;
  }
  return {
    show(layers, material, spotId) {
      if (disposed) return;
      clear();
      if (!layers || !material) return;
      const positions = [], uvs = [], indices = [];
      // Retain ordinary painter order between the selected post and its connected surfaces.
      for (const [, layer] of [...layers].sort(([a], [b]) => a - b)) {
        const offset = positions.length / 3;
        positions.push(...layer.positions); uvs.push(...layer.uvs);
        indices.push(...layer.indices.map(index => index + offset));
      }
      if (!indices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
      mesh = new THREE.Mesh(geometry, material); mesh.name = 'island-selected-wall';
      mesh.userData.spotId = spotId; mesh.renderOrder = 199; mesh.frustumCulled = false;
      mesh.raycast = () => {}; root.add(mesh);
    },
    visible(value) { if (mesh) mesh.visible = value; },
    dispose() { if (disposed) return; disposed = true; clear(); },
  };
}
