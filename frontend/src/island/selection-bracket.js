// Selected tile corners are screen-facing strips, independent of paid Move state and collision.
import * as THREE from 'three';
import {projectGround} from '../world/projection.js';

function cornerGeometry(padding = 0) {
  const positions = [], indices = [], half = 1, arm = .64, width = .16;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * half, z = sz * half;
    for (const [ax, az, bx, bz] of [[x - sx * arm, z - sz * width, x, z], [x - sx * width, z - sz * arm, x, z]]) {
      const x0 = Math.min(ax, bx) - padding, x1 = Math.max(ax, bx) + padding;
      const z0 = Math.min(az, bz) - padding, z1 = Math.max(az, bz) + padding, first = positions.length / 3;
      // Clockwise XZ corners become positive XY winding under the shared ground projection.
      for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) {
        const p = projectGround(px, pz); positions.push(p.x, p.y, 0);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  return geometry;
}

export function makeSelectionBracket(root) {
  const group = new THREE.Group(); group.name = 'island-selection-bracket'; group.visible = false; root.add(group);
  const meshes = [[.055, 0x143b20, 200], [0, 0x78ff43, 201]].map(([padding, color, order]) => {
    const material = new THREE.MeshBasicMaterial({color, depthTest: false, depthWrite: false, toneMapped: false, transparent: true});
    const mesh = new THREE.Mesh(cornerGeometry(padding), material);
    mesh.name = padding ? 'selection-corner-outline' : 'selection-corner-green';
    mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {}; group.add(mesh); return mesh;
  });
  let disposed = false, lastX = null, lastZ = null;
  return {show(anchor) {
    if (disposed) return;
    group.visible = !!anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z);
    if (!group.visible) return;
    if (anchor.x !== lastX || anchor.z !== lastZ) {
      const p = projectGround(anchor.x, anchor.z); group.position.set(p.x, p.y, 0); lastX = anchor.x; lastZ = anchor.z;
    }
    group.userData.spotId = anchor.spotId;
  }, dispose() {
    if (disposed) return; disposed = true; group.visible = false; group.removeFromParent();
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }};
}
