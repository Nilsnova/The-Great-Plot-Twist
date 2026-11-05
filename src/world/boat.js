// A wooden jetty and open rowing boat. Wind and water gently rock the hull.
import * as THREE from 'three';
import { colors, layout } from '../config.js';
import { box, postBetween } from './primitives.js';
import { batchStatic } from './island.js';
import { waveHeight } from './water.js';

export function createBoat(scene) {
  const pier = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    box(pier, [1.9, 0.16, 0.36], i % 3 ? colors.wood : '#9c7e5b', [-2, 0.95, 16.6 + i * 0.38]);
  }
  for (const x of [-2.8, -1.2]) for (const z of [18, 21, 24.8]) {
    box(pier, [0.18, 2, 0.18], colors.darkWood, [x, 0.35, z]);
  }
  scene.add(batchStatic(pier));
  const boat = new THREE.Group();
  // A pointed polygon, with a separate inner floor, leaves the hull visibly open.
  const outline = [[0, -1.9], [-0.75, -0.9], [-0.7, 1.3], [-0.4, 1.65], [0.4, 1.65], [0.7, 1.3], [0.75, -0.9]];
  const floor = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? floor.lineTo(x, z) : floor.moveTo(x, z)); floor.closePath();
  const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(floor), new THREE.MeshStandardMaterial({
    color: '#728d86', side: THREE.DoubleSide, roughness: 1,
  }));
  floorMesh.rotation.x = Math.PI / 2; boat.add(floorMesh);
  for (let i = 0; i < outline.length; i++) {
    const [x, z] = outline[i], [nx, nz] = outline[(i + 1) % outline.length];
    const plank = box(boat, [Math.hypot(nx - x, nz - z), 0.6, 0.12], '#b3bda5', [(x + nx) / 2, 0.25, (z + nz) / 2]);
    plank.rotation.y = -Math.atan2(nz - z, nx - x);
    postBetween(boat, [x, 0.6, z], [nx, 0.6, nz], 0.055, colors.wood);
  }
  for (const z of [-0.65, 0.65]) box(boat, [1.35, 0.13, 0.3], colors.wood, [0, 0.45, z]);
  postBetween(boat, [-0.9, 0.7, 0.6], [1.3, 0.7, -0.7], 0.04, colors.wood);
  box(boat, [0.28, 0.07, 0.6], colors.wood, [1.3, 0.7, -0.7]).rotation.y = -0.8;
  const floatingBoat = batchStatic(boat);
  floatingBoat.position.set(layout.boat.x, 0.15, layout.boat.z); floatingBoat.rotation.y = -0.12;
  scene.add(floatingBoat);
  return { update(time, weather) {
    floatingBoat.position.y = 0.18 + waveHeight(layout.boat.x, layout.boat.z, time, weather.wind);
    floatingBoat.rotation.z = Math.sin(time * 1.4) * (0.025 + weather.wind * 0.08);
    floatingBoat.rotation.x = Math.cos(time * 0.9) * (0.025 + weather.wind * 0.05);
  } };
}
