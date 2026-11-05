// The striped tower, iron door and rotating night beam. Exports cutscene anchors.
import * as THREE from 'three';
import { colors, layout } from '../config.js';
import { terrainHeight } from './terrain.js';
import { box, cylinder, mesh } from './primitives.js';

const { x, z } = layout.lighthouse;
const base = terrainHeight(x, z);
export const anchors = {
  stairwell: { x, y: base + 1.5, z },
  lamp_room: { x, y: base + 13.5, z },
};
export const stairwell = anchors.stairwell;
export const lamp_room = anchors.lamp_room;

export function createLighthouse() {
  const group = new THREE.Group(); group.position.set(x, base, z);
  cylinder(group, 2.45, 2.9, 0.5, colors.rock, [0, 0.25, 0], 12);
  cylinder(group, 1.35, 2.05, 11, colors.wall, [0, 5.8, 0], 12);
  cylinder(group, 1.62, 1.76, 2.1, '#b96e59', [0, 5.5, 0], 12);
  cylinder(group, 2.15, 1.4, 0.4, colors.iron, [0, 11.5, 0], 12);
  cylinder(group, 2.1, 2.1, 0.15, colors.iron, [0, 12.15, 0], 12);
  cylinder(group, 1.55, 1.55, 2.15, '#92b6ad', [0, 13.15, 0], 12);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    box(group, [0.08, 2.3, 0.08], colors.iron, [Math.sin(angle) * 1.6, 13.2, Math.cos(angle) * 1.6]);
    cylinder(group, 0.035, 0.035, 0.9, colors.iron,
      [Math.sin(angle) * 2.03, 12.05, Math.cos(angle) * 2.03], 5);
  }
  mesh(group, new THREE.TorusGeometry(2.03, 0.045, 4, 24), colors.iron, [0, 12.5, 0]).rotation.x = Math.PI / 2;
  cylinder(group, 0, 2.05, 1.65, '#59696a', [0, 15.05, 0], 12);
  cylinder(group, 0.05, 0.05, 1, colors.iron, [0, 16.15, 0], 6);
  box(group, [1.25, 2.5, 0.18], colors.iron, [0, 1.5, 1.96]);
  box(group, [0.12, 0.12, 0.18], colors.gold, [0.4, 1.5, 2.09], true);
  for (const height of [4, 8.5]) box(group, [0.38, 0.85, 0.14], colors.iron, [0, height, 1.85 - height * 0.06]);
  const lamp = mesh(group, new THREE.SphereGeometry(0.6, 12, 8), colors.gold, [0, 13.2, 0], true);
  // A translucent cone suggests scattering without expensive post-processing.
  const beamGeometry = new THREE.ConeGeometry(4.6, 42, 24, 1, true);
  beamGeometry.rotateZ(Math.PI / 2); beamGeometry.translate(21, 0, 0);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd89a', transparent: true, opacity: 0.06,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sweep = new THREE.Group(); sweep.position.y = 13.2; group.add(sweep);
  sweep.add(new THREE.Mesh(beamGeometry, beamMaterial));
  const glow = new THREE.PointLight(colors.gold, 10, 13, 2);
  glow.position.y = 13.2; group.add(glow); // Only the sun casts shadows.
  return {
    group, collider: { x, z, radius: 2.25 },
    update(time, night) {
      sweep.rotation.y = time * 0.23;
      sweep.visible = night > 0.08;
      beamMaterial.opacity = night * 0.075;
      lamp.material.emissiveIntensity = 1 + night * 3;
      glow.intensity = night * 12;
    },
  };
}
