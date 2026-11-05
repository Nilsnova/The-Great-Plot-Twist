// A sand ribbon follows the terrain from the jetty past the cottage to the tower.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { colors } from '../config.js';

export function createPaths() {
  const points = [[-2, 19], [-2, 13], [-3, 9], [-5, 6], [-7, 5.5],
    [-4, 5.5], [0, 4], [3, 0], [4, -4], [6, -5], [9, -5.7]];
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const vertices = [], indices = [];
  for (let i = 0; i <= 100; i++) {
    const point = curve.getPoint(i / 100), tangent = curve.getTangent(i / 100);
    for (const side of [-1, 1]) {
      const x = point.x + tangent.z * side * 0.72;
      const z = point.z - tangent.x * side * 0.72;
      vertices.push(x, terrainHeight(x, z) + 0.06, z);
    }
    if (i < 100) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors.path, roughness: 1, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}
