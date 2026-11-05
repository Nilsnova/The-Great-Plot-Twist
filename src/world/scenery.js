// Seeded trees, rocks, flowers and a cliff fence. Island.js batches these props.
import * as THREE from 'three';
import { colors, layout } from '../config.js';
import { seededRandom } from '../core/math.js';
import { terrainHeight } from './terrain.js';
import { box, cylinder, mesh, postBetween } from './primitives.js';

export function createScenery() {
  const group = new THREE.Group(), random = seededRandom(71), colliders = [];
  const treeSpots = [[-15, -3], [-14, 3], [-12, -9], [-5, -11], [-2, -13],
    [0, -10], [17, -4], [16, 2], [11, 7], [-14, 9], [-10, -2]];
  for (const [x, z] of treeSpots) {
    const y = terrainHeight(x, z), height = 3.5 + random() * 1.4;
    cylinder(group, 0.16, 0.27, height, colors.darkWood, [x, y + height / 2, z], 6);
    for (let layer = 0; layer < 3; layer++) {
      mesh(group, new THREE.ConeGeometry(1.65 - layer * 0.36, 2.4, 6),
        layer % 2 ? '#6f8b67' : colors.grassDark, [x, y + 2.5 + layer * 0.9, z]);
    }
    colliders.push({ x, z, radius: 0.35 });
  }
  for (let i = 0; i < 60; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.75 + random() * 0.27;
    const x = Math.cos(angle) * 26 * radius, z = Math.sin(angle) * 23 * radius;
    if (z > 15 && x > -10 && x < 4) continue; // Keep the jetty landing clear.
    const y = terrainHeight(x, z);
    if (y < -0.6) continue;
    const rock = mesh(group, new THREE.DodecahedronGeometry(0.5 + random() * 0.8, 0),
      i % 2 ? colors.rock : '#a2a799', [x, y + 0.2, z]);
    rock.scale.set(1.4, 0.7 + random(), 1); rock.rotation.set(random(), random(), random());
  }
  for (let i = 0; i < 80; i++) {
    const x = random() * 35 - 17.5, z = random() * 28 - 14;
    if (terrainHeight(x, z) < 1.2 || Math.hypot(x, z - 2) < 7) continue;
    if (Object.values(layout).some(p => Math.hypot(x - p.x, z - p.z) < 5)) continue;
    const y = terrainHeight(x, z);
    mesh(group, new THREE.ConeGeometry(0.22, 0.65, 4), '#66845e', [x, y + 0.3, z]);
    if (i % 3 === 0) mesh(group, new THREE.IcosahedronGeometry(0.14), '#e3bc83', [x + 0.2, y + 0.5, z]);
  }
  const fence = [[5.5, -3], [7, -3.8], [8.5, -4.3], [10, -4.8], [11.5, -5.6]];
  for (let i = 0; i < fence.length; i++) {
    const [x, z] = fence[i], y = terrainHeight(x, z);
    box(group, [0.16, 1.1, 0.16], colors.wood, [x, y + 0.55, z]);
    if (i) {
      const [px, pz] = fence[i - 1];
      postBetween(group, [px, terrainHeight(px, pz) + 0.8, pz], [x, y + 0.8, z], 0.045, colors.wood);
    }
  }
  return { group, colliders };
}
