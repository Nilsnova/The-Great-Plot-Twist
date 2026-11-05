// A small original explorer made of primitives. Reuse createCharacter for remotes.
import * as THREE from 'three';
import { box, cylinder, mesh } from '../world/primitives.js';

export function createCharacter() {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  box(body, [0.58, 0.62, 0.38], '#dfad61', [0, 1, 0]);
  box(body, [0.36, 0.48, 0.22], '#536c68', [0, 1.05, -0.28]);
  mesh(body, new THREE.SphereGeometry(0.3, 8, 6), '#d9af83', [0, 1.61, 0]);
  cylinder(body, 0.29, 0.32, 0.16, '#3e5357', [0, 1.85, 0], 8);
  cylinder(body, 0.43, 0.43, 0.055, '#3e5357', [0, 1.79, 0.03], 8);
  for (const x of [-0.1, 0.1]) box(body, [0.055, 0.055, 0.03], '#263c40', [x, 1.63, 0.273]);
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.39, 1.2, 0); body.add(arm);
    box(arm, [0.19, 0.52, 0.21], '#dfad61', [0, -0.24, 0]); limbs.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * 0.17, 0.7, 0); body.add(leg);
    box(leg, [0.23, 0.5, 0.24], '#3b555b', [0, -0.22, 0]);
    box(leg, [0.25, 0.16, 0.36], '#384146', [0, -0.56, 0.05]); limbs.push(leg);
  }
  let phase = 0;
  return { group, animate(delta, speed) {
    phase += delta * (speed > 4 ? 12 : 8);
    limbs.forEach((limb, i) => { limb.rotation.x = Math.sin(phase + (i < 2 ? 0 : Math.PI)) * Math.min(speed / 6, 0.55) * (i % 2 ? -1 : 1); });
    body.position.y = speed > 0 ? Math.abs(Math.sin(phase)) * 0.055 : 0;
  } };
}
