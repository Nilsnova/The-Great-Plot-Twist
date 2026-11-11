// A restrained selection of useful coastal art is placed in the active intro island.
import * as THREE from 'three';
import { placeArt } from './art.js';

export const decorationPlacements = [
  { id: 'crate', x: -8.9, z: 17.3, collider: { width: 0.8, depth: 0.8 } },
  { id: 'barrel', x: -9.5, z: 15.9, collider: { radius: 0.4 } },
  { id: 'rope-coil', x: -3.4, z: 18.3 },
  { id: 'lantern', x: -8.6, z: 5.7, collider: { radius: 0.18 } },
  { id: 'bench', x: -11.8, z: 4.2, collider: { width: 1.9, depth: 0.55 } },
  { id: 'buoy', x: -5.4, z: 23.8 },
  { id: 'driftwood', x: 10.8, z: 17.4 },
  { id: 'gull', x: -2.2, z: 21.8 },
];
export function createDecorations(art) {
  const group = new THREE.Group(), sprites = {};
  for (const item of decorationPlacements) sprites[item.id] = placeArt(group, art, item.id, item.x, item.z);
  const colliders = decorationPlacements.filter(item => item.collider).map(item => ({
    x: item.x, z: item.z, ...item.collider,
  }));
  const buoyBase = sprites.buoy.position.clone();
  return { group, colliders, update(time, weather) {
    sprites.buoy.position.y = (buoyBase.y + Math.sin(time * 1.1) * (0.035 + weather.wind * 0.1));
    sprites.buoy.rotation.z = 0;
  } };
}
