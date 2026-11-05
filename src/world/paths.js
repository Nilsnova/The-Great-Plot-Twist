// Broad sand paths connect the shore, cottage and lighthouse in the flat map.
import * as THREE from 'three';
import { projectPoint } from './art.js';
import { polygon } from './primitives.js';
import { colors } from '../config.js';

function ribbon(group, points, width, color, order) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const left = [], right = [];
  for (let i = 0; i <= 70; i++) {
    const point = curve.getPoint(i / 70), tangent = curve.getTangent(i / 70);
    for (const [side, target] of [[-1, left], [1, right]]) {
      const projected = projectPoint(point.x + tangent.z * width * side, point.z - tangent.x * width * side);
      target.push([projected.x, projected.y]);
    }
  }
  polygon(group, [...left, ...right.reverse()], color, order);
}
export function createPaths() {
  const group = new THREE.Group();
  const paths = [
    [[-2, 18], [-2, 13], [-3, 9], [-4, 6], [0, 4], [3, 0], [4, -4], [6, -5], [9, -5.2]],
    [[-4, 6], [-5.5, 6.2], [-7, 5.2]],
    [[-2, 16.5], [-4.4, 17], [-7, 16.8]],
  ];
  for (const points of paths) {
    ribbon(group, points, 0.85, '#b8bd8c', 8);
    ribbon(group, points, 0.69, colors.path, 9);
  }
  return group;
}
