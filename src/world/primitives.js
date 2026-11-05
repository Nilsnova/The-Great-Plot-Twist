// Small readable primitive helpers. Static meshes merge by material in island.js.
import * as THREE from 'three';
import { colors } from '../config.js';

const materials = new Map();
export function material(color, glow = false) {
  const key = `${color}-${glow}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
    color, roughness: 0.88, flatShading: true,
    emissive: glow ? color : '#000000', emissiveIntensity: glow ? 1.8 : 0,
  }));
  return materials.get(key);
}
export function mesh(group, geometry, color, position = [0, 0, 0], glow = false) {
  const object = new THREE.Mesh(geometry, material(color, glow));
  object.position.set(...position);
  object.castShadow = !glow;
  object.receiveShadow = !glow;
  group.add(object);
  return object;
}
export const box = (group, size, color, position, glow) =>
  mesh(group, new THREE.BoxGeometry(...size), color, position, glow);
export const cylinder = (group, top, bottom, height, color, position, sides = 8) =>
  mesh(group, new THREE.CylinderGeometry(top, bottom, height, sides), color, position);
export function roof(group, width, depth, y) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(0, 1.7); shape.lineTo(width / 2, 0);
  shape.closePath();
  return mesh(group, new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false,
  }), colors.roof, [0, y, -depth / 2]);
}
export function postBetween(group, a, b, radius, color) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const object = cylinder(group, radius, radius, start.distanceTo(end), color, [0, 0, 0], 6);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return object;
}
