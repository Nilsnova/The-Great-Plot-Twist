// Three.js adapters for the pure ground projection; upright sprite geometry never uses these matrices.
import * as THREE from 'three';
import {projectGroundPlane, projectLegacyGround} from './projection.js';
function basisMatrix(project) {
  const x = project(1, 0), y = project(0, 1);
  return new THREE.Matrix4().set(x.x, y.x, 0, 0, x.y, y.y, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
export const groundShapeMatrix = () => basisMatrix(projectGroundPlane);
export function groundGeometry(geometry) { return geometry.applyMatrix4(groundShapeMatrix()); }
export function legacyBackdrop(mesh) {
  // MatrixAutoUpdate must stay off: quaternion/scale decomposition cannot preserve affine shear.
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(basisMatrix(projectLegacyGround));
  mesh.userData.legacyGround = true; return mesh;
}
export function coastUvMatrix(matrixWorld, width = 64, height = 48) {
  const determinant = matrixWorld.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) throw new Error('Invalid ground transform.');
  const inverse = matrixWorld.clone().invert().elements;
  return new THREE.Matrix3().set(inverse[0] / width, inverse[4] / width, inverse[12] / width + .5,
    inverse[1] / height, inverse[5] / height, inverse[13] / height + .5, 0, 0, 1);
}
