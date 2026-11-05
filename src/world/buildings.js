// The enterable cottage, desk and shore buildings. Returns simple wall colliders.
import * as THREE from 'three';
import { colors, layout } from '../config.js';
import { terrainHeight } from './terrain.js';
import { box, cylinder, roof } from './primitives.js';

export function createBuildings() {
  const group = new THREE.Group(), cottage = new THREE.Group();
  const { x, z } = layout.cottage, y = terrainHeight(x, z);
  cottage.position.set(x, y, z); group.add(cottage);
  const colliders = [];
  function wall(width, depth, px, pz) {
    box(cottage, [width, 2.8, depth], colors.wall, [px, 1.4, pz]);
    colliders.push({ x: x + px, z: z + pz, width, depth });
  }
  box(cottage, [6.3, 0.12, 4.7], colors.wood, [0, 0.05, 0]);
  wall(0.22, 4.6, -3, 0); wall(6, 0.22, 0, -2.2);
  // Two short front walls leave a generous, functional open doorway.
  wall(2.1, 0.22, -1.95, 2.2); wall(2.1, 0.22, 1.95, 2.2);
  wall(0.22, 4.6, 3, 0);
  box(cottage, [1.8, 0.5, 0.3], colors.darkWood, [0, 2.65, 2.22]);
  const cottageRoof = new THREE.Group(); cottage.add(cottageRoof);
  roof(cottageRoof, 6.9, 5.3, 2.8);
  for (let i = 0; i < 7; i++) {
    box(cottageRoof, [0.09, 0.08, 5.4], '#804f46', [i * 0.5 - 1.5, 4.52 - Math.abs(i - 3) * 0.25, 0]);
  }
  box(cottageRoof, [0.65, 2, 0.65], colors.rock, [-1.7, 4.15, -0.6]);
  box(cottageRoof, [0.85, 0.2, 0.85], colors.darkWood, [-1.7, 5.2, -0.6]);
  // Windows sit slightly in front of the walls; no textures are needed.
  for (const px of [-1.95, 1.95]) {
    box(cottage, [1.2, 1.2, 0.1], colors.darkWood, [px, 1.65, 2.35]);
    box(cottage, [0.95, 0.95, 0.12], colors.gold, [px, 1.65, 2.41], true);
    box(cottage, [0.055, 1, 0.14], colors.darkWood, [px, 1.65, 2.49]);
    box(cottage, [1, 0.055, 0.14], colors.darkWood, [px, 1.65, 2.49]);
    box(cottage, [1.4, 0.15, 0.45], colors.wood, [px, 0.99, 2.52]);
  }
  // Writing desk directly beneath the east window, reachable through the door.
  box(cottage, [0.12, 1.2, 1.5], colors.gold, [3.13, 1.65, 0.3], true);
  box(cottage, [1.4, 0.14, 1.6], colors.wood, [2, 1.05, 0.3]);
  for (const px of [1.5, 2.5]) for (const pz of [-0.25, 0.85]) {
    box(cottage, [0.12, 1, 0.12], colors.darkWood, [px, 0.5, pz]);
  }
  const paper = box(cottage, [0.6, 0.025, 0.8], '#fff0ce', [1.85, 1.14, 0.35]);
  paper.rotation.y = 0.16;
  cylinder(cottage, 0.12, 0.16, 0.18, colors.iron, [2.4, 1.2, -0.15]);
  box(cottage, [0.06, 0.5, 0.06], colors.darkWood, [2.4, 1.5, -0.15]);
  box(cottage, [0.7, 0.12, 0.65], colors.wood, [0.9, 0.6, 0.3]);
  box(cottage, [0.7, 0.6, 0.12], colors.wood, [0.9, 0.9, -0.02]);
  const shed = new THREE.Group(), shore = layout.boathouse;
  shed.position.set(shore.x, terrainHeight(shore.x, shore.z), shore.z);
  group.add(shed);
  box(shed, [3.8, 2.4, 3.4], '#79918b', [0, 1.2, 0]);
  roof(shed, 4.4, 4, 2.4);
  box(shed, [2.5, 2.1, 0.12], colors.darkWood, [0, 1.05, 1.76]);
  for (const px of [-0.75, 0.75]) box(shed, [0.06, 2, 0.12], colors.wood, [px, 1.05, 1.85]);
  colliders.push({ x: shore.x, z: shore.z, width: 3.8, depth: 3.4 });
  return { group, colliders, cottageRoof, cottageBounds: { x, z, width: 6, depth: 4.4 } };
}
