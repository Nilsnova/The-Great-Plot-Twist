// Dense pixel forest clusters frame clear walking routes; foreground canopies fade.
import * as THREE from 'three';
import { placeArt } from './art.js';
import { terrainHeight } from './terrain.js';
import { seededRandom } from '../core/math.js';

export function createScenery(art) {
  const group = new THREE.Group(), colliders = [], trees = [], random = seededRandom(71);
  const spots = [[-16, -5], [-13.5, -6.4], [-15, -9.5], [-11, -10], [-5, -13], [-2, -12.4],
    [0, -13.5], [16, -3], [18, 1], [15, 3], [13, 6.8], [-15, 7], [-12.7, 8.5], [-16, 10],
    [-18, -2], [-15, -1], [-12, -3], [-18, 3], [-16, 4], [-18, 8], [-14, 11], [-11, 11],
    [-17, -8], [-13, -13], [-9, -14], [-7, -11], [-4, -16], [1, -16], [3, -13],
    [18, 4], [15, 7], [18, 8], [13, 10], [16, 11], [12, 14], [9, 15], [6.7, 16],
    [-13, 14], [-10, 14], [-16, -4], [-19, 1], [19, -1], [17, -5]];
  spots.forEach(([x, z], index) => {
    const tree = placeArt(group, art, ['birch', 'oak', 'pine', 'birch-tall'][index % 4], x, z, 1);
    tree.material = tree.material.clone(); trees.push(tree); colliders.push({ x, z, radius: 0.48 });
  });
  const clusters = [[-16, 0], [-15, 2], [-10, -5], [5, -13], [14, -8], [17, 7], [9, 11], [-10, 13]];
  clusters.forEach(([x, z], index) => placeArt(group, art, index % 3 ? 'shrub' : 'rock', x, z, 0.65 + random() * 0.4));
  for (let i = 0; i < 23; i++) {
    const x = random() * 38 - 19, z = random() * 31 - 15.5;
    if (terrainHeight(x, z) < 1.3 || Math.abs(x + 5) < 7 && z > 1) continue;
    placeArt(group, art, i % 3 ? 'flowers' : 'shrub', x, z, i % 3 ? 0.8 : 0.48);
  }
  for (const [x, z, size] of [[-20, 1, 0.9], [-18, 10, 0.7], [19, 5, 0.9], [19, -4, 0.6], [12, -16, 0.7], [-10, 18, 0.7]]) {
    placeArt(group, art, 'rock', x, z, size);
  }
  for (const [id, x, z] of [['fern', -9, 8], ['grass-tuft', 5.5, 8], ['mushrooms', -11, 9],
    ['grass-tuft', 1.5, 12], ['reeds', 8, 18], ['fern', 11, -3], ['mushrooms', -14, 1],
    ['grass-tuft', -4.5, 13], ['reeds', -12, 18], ['fern', 14, 9]]) placeArt(group, art, id, x, z);
  placeArt(group, art, 'sign', 0.5, 3.5, 0.8);
  return { group, colliders, update(time, wind, player) {
    trees.forEach((tree, index) => {
      tree.rotation.z = 0; // Native sprites stay aligned to the pixel grid.
      const base = tree.userData.ground;
      const hidesPlayer = Math.abs(player.x - base.x) < 1.8 && player.z < base.z && player.z > base.z - 7;
      tree.material.opacity = hidesPlayer ? 0.42 : 1;
    });
  } };
}
