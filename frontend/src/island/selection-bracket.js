// Brass corners on the selected building's ground footprint.
import * as THREE from 'three';
import {projectGround} from '../world/projection.js';
import {groundGeometry} from '../world/ground-transform.js';

function cornerGeometry(padding = 0) {
  const positions = [], indices = [], half = 1, arm = .56, width = .13;
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

export function makeSelectionBracket(root, {support = false} = {}) {
  const group = new THREE.Group(); group.name = support ? 'house-support-target' : 'island-selection-bracket'; group.visible = false; root.add(group);
  // Draw before the buildings, so the back corners can tuck behind their bases.
  const meshes = [[.043, 0x51351d, 94], [0, 0xf9de95, 95]].map(([padding, color, order]) => {
    const material = new THREE.MeshBasicMaterial({color: support ? (padding ? 0x163735 : 0xb7f7d6) : color, depthTest: false, depthWrite: false,
      toneMapped: false, transparent: true, opacity: padding ? .86 : .98});
    const mesh = new THREE.Mesh(cornerGeometry(padding), material);
    mesh.name = padding ? 'selection-corner-outline' : 'selection-corner-brass';
    mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {}; group.add(mesh); return mesh;
  });
  const corners = meshes.map(mesh => mesh.geometry);
  let outline = null, disposed = false, lastX = null, lastZ = null, lastSize = 2;
  let structure = false, historical = false, overview = false;
  return {show(anchor, portrait = false) {
    if (disposed) return;
    group.visible = !!anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z);
    if (!group.visible) { group.userData.spotId = null; group.userData.level = null; return; }
    if (anchor.x !== lastX || anchor.z !== lastZ) {
      const p = projectGround(anchor.x, anchor.z); group.position.set(p.x, p.y, 0); lastX = anchor.x; lastZ = anchor.z;
    }
    const nextStructure = typeof anchor.kind === 'string' && anchor.kind !== 'wall';
    const nextOverview = portrait && !support && nextStructure && anchor.positionOnly !== true;
    const newOutline = nextOverview !== overview;
    const size = (nextStructure && Number.isFinite(anchor.size) && anchor.size > 0 ? anchor.size : 2) * (nextOverview ? 1.24 : 1);
    if (size !== lastSize) { group.scale.set(size / 2, size / 2, 1); lastSize = size; }
    if (nextStructure !== structure || newOutline) {
      structure = nextStructure;
      overview = nextOverview;
      // Deep foliage and the structure's own base still draw in front of its ground marker.
      meshes[0].renderOrder = structure && !support ? 69 : 94; meshes[0].material.opacity = structure ? .74 : .86;
      meshes[1].renderOrder = structure && !support ? 70 : 95; meshes[1].material.opacity = structure && !overview ? .88 : .98;
      if (overview && !outline) {
        outline = [[.83, 1.14], [.89, 1.08]].map(([inside, outside]) =>
          groundGeometry(new THREE.RingGeometry(inside, outside, 8, 1, Math.PI / 8)));
      }
      meshes.forEach((mesh, index) => { mesh.geometry = overview ? outline[index] : corners[index]; });
    }
    if ((anchor.positionOnly === true) !== historical || newOutline) {
      historical = anchor.positionOnly === true;
      meshes[0].material.color.setHex(historical ? 0x164449 : 0x51351d);
      meshes[1].material.color.setHex(historical ? 0xa5e2dc : overview ? 0xfff3bd : 0xf9de95);
    }
    group.userData.spotId = anchor.spotId;
    group.userData.level = Number.isSafeInteger(anchor.level) && anchor.level > 0 ? anchor.level : null;
  }, dispose() {
    if (disposed) return; disposed = true; group.visible = false; group.removeFromParent();
    for (const geometry of [...corners, ...(outline ?? [])]) geometry.dispose();
    for (const mesh of meshes) mesh.material.dispose();
  }};
}
