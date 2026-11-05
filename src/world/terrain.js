// One height function builds the island and grounds paths, buildings and players.
import * as THREE from 'three';
import { colors, layout } from '../config.js';
import { lerp, smoothstep } from '../core/math.js';

function naturalHeight(x, z) {
  const radius = Math.hypot(x / 26, z / 23);
  const land = Math.max(0, 1 - radius * radius);
  const hill = 4 * Math.exp(-((x - 9) ** 2 / 85 + (z + 8) ** 2 / 100));
  return -1.5 + 5.7 * land ** 1.25 + hill * land;
}

export function terrainHeight(x, z) {
  let height = naturalHeight(x, z);
  // Flat pads keep foundations and the cottage interior level.
  const pads = [[layout.cottage, 4.9, 3.7], [layout.lighthouse, 3.6, 3.6],
    [layout.boathouse, 2.9, 2.5]];
  for (const [point, width, depth] of pads) {
    const distance = Math.max(Math.abs(x - point.x) / width, Math.abs(z - point.z) / depth);
    height = lerp(naturalHeight(point.x, point.z), height, smoothstep(0.8, 1.3, distance));
  }
  return height;
}

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(64, 58, 80, 72);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const vertexColors = [];
  const sand = new THREE.Color(colors.sand);
  const grass = new THREE.Color(colors.grass);
  const rock = new THREE.Color(colors.rock);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const y = terrainHeight(x, z);
    positions.setY(i, y);
    const tint = y < 0.9 ? sand.clone() : grass.clone();
    const slope = Math.hypot(terrainHeight(x + 0.6, z) - y, terrainHeight(x, z + 0.6) - y);
    if (y > 1.2) tint.lerp(rock, smoothstep(0.38, 0.9, slope));
    tint.multiplyScalar(0.94 + 0.07 * Math.sin(x * 7.1 + z * 9.7));
    vertexColors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'Lighthouse Isle terrain';
  return mesh;
}
