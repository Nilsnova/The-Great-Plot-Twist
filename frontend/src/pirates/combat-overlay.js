// Quiet cached range arcs and a danger pointer in the game's flat world projection. Used by render.js.
import * as THREE from 'three';
import { projectGround, projectGroundVector } from '../world/projection.js';
import { groundShapeMatrix } from '../world/ground-transform.js';

const ARC_COUNT = 12, ARC_ANGLE = Math.PI / 18, ARC_STEPS = 4;

// Separate short strips leave real gaps; every outer vertex still marks exactly one unit of range.
function rangeArcs(innerRadius) {
  const vertices = [];
  const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle), 0];
  for (let arc = 0; arc < ARC_COUNT; arc++) {
    const start = arc * Math.PI * 2 / ARC_COUNT - ARC_ANGLE / 2;
    for (let step = 0; step < ARC_STEPS; step++) {
      const a = start + step * ARC_ANGLE / ARC_STEPS, b = a + ARC_ANGLE / ARC_STEPS;
      vertices.push(...point(innerRadius, a), ...point(1, a), ...point(1, b),
        ...point(innerRadius, a), ...point(1, b), ...point(innerRadius, b));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}
export function createCombatOverlay(parent) {
  const root = new THREE.Group(); root.name = 'captain-combat-feedback'; parent.add(root);
  const backingGeometry = rangeArcs(.963), ringGeometry = rangeArcs(.98);
  const markerGeometry = new THREE.RingGeometry(.97, 1, 16, 1, -Math.PI / 24, Math.PI / 12);
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, -.6, .65, 0, -.6, -.65, 0], 3));
  const make = (name, geometry, color, order) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.renderOrder = order; mesh.frustumCulled = false;
    mesh.visible = false; root.add(mesh); return mesh;
  };
  const shadow = make('captain-range-backing', backingGeometry, 0x40382a, 92);
  const ring = make('captain-range-arcs', ringGeometry, 0xe8d7b1, 93);
  const target = make('captain-range-direction', markerGeometry, 0xf6e5bd, 94);
  const pointer = make('captain-danger-pointer', arrowGeometry, 0xff765e, 936);
  const rotation = new THREE.Matrix4(), projection = groundShapeMatrix(), scale = new THREE.Vector3();
  const rangeMeshes = [shadow, ring];
  for (const mesh of [shadow, ring, target]) mesh.matrixAutoUpdate = false;
  return {
    update({ range = null, danger = null, player = null } = {}) {
      for (const mesh of root.children) mesh.visible = false;
      if (range) {
        const at = projectGround(range.x, range.z); scale.set(range.radius, range.radius, 1);
        for (const mesh of rangeMeshes) {
          mesh.visible = true;
          mesh.matrix.copy(projection).scale(scale).setPosition(at.x, at.y, 0);
          mesh.matrixWorldNeedsUpdate = true;
          mesh.material.opacity = range.alpha * (mesh === shadow ? .56 : .86);
        }
        if (range.point && !range.melee) {
          const dx = range.point.x - range.x, dz = range.point.z - range.z;
          target.visible = Math.hypot(dx, dz) > .01;
          // Rotate in logical ground coordinates before projecting, keeping the true world radius.
          target.matrix.copy(projection).scale(scale)
            .multiply(rotation.makeRotationZ(Math.atan2(-dz, dx))).setPosition(at.x, at.y, 0);
          target.matrixWorldNeedsUpdate = true; target.material.opacity = range.alpha * .94;
        }
      }
      if (danger && player) {
        const at = projectGround(player.x, player.z), direction = projectGroundVector(danger.x - player.x, danger.z - player.z);
        const dx = direction.x, dy = direction.y;
        const length = Math.hypot(dx, dy);
        pointer.visible = length > .1;
        pointer.position.set(at.x + dx / (length || 1) * 2.8, at.y + dy / (length || 1) * 2.8 + .5, 0);
        pointer.rotation.z = Math.atan2(dy, dx);
        pointer.material.color.setHex(danger.critical ? 0xff6653 : 0xffbc66);
      }
    },
    dispose() {
      root.removeFromParent();
      for (const mesh of root.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
      root.clear();
    },
  };
}
