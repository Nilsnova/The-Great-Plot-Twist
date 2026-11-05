// Places illustrated buildings and keeps their simple logical collision footprints.
import * as THREE from 'three';
import { layout } from '../config.js';
import { placeArt } from './art.js';

export function getBuildingColliders() {
  const { x, z } = layout.cottage;
  return [
    { x: x - 3, z, width: 0.22, depth: 4.6 },
    { x, z: z - 2.2, width: 6, depth: 0.22 },
    { x: x + 3, z, width: 0.22, depth: 4.6 },
    { x: x - 1.95, z: z + 2.2, width: 2.1, depth: 0.22 },
    { x: x + 1.95, z: z + 2.2, width: 2.1, depth: 0.22 },
    { x: x + 2, z: z + 0.3, width: 1.4, depth: 1.6 },
    { ...layout.boathouse, width: 3.8, depth: 3.4 },
  ];
}
export function createBuildings(art) {
  const group = new THREE.Group(), { x, z } = layout.cottage;
  const exterior = placeArt(group, art, 'cottage', x, z + 2.2);
  const glow = placeArt(group, art, 'cottage-glow', x, z + 2.2); glow.renderOrder = 922;
  const interior = placeArt(group, art, 'cottage-interior', x, z + 2.2); interior.visible = false; interior.renderOrder = 70;
  placeArt(group, art, 'boathouse', layout.boathouse.x, layout.boathouse.z + 1.7);
  return { group, colliders: getBuildingColliders(), update(player, night) {
    const inside = Math.abs(player.x - x) < 2.75 && Math.abs(player.z - z) < 2.1;
    exterior.visible = !inside; interior.visible = inside;
    glow.visible = !inside && night > 0.02; glow.material.opacity = night * 0.85;
  } };
}
