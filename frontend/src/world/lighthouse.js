// Illustrated lighthouse, gold lantern glow, night sweep and logical story anchors.
import * as THREE from 'three';
import { layout } from '../config.js';
import { terrainHeight } from './terrain.js';
import { placeArt, projectPoint } from './art.js';
import { paintedBlob } from './primitives.js';
import { createBeam } from './beam.js';

const { x, z } = layout.lighthouse, base = terrainHeight(x, z);
export const anchors = { stairwell: { x, y: base + 1.5, z }, lamp_room: { x, y: base + 13.5, z } };
export const stairwell = anchors.stairwell;
export const lamp_room = anchors.lamp_room;
// Cutscenes can use these drawn positions directly with the fixed orthographic camera.
const drawnBase = projectPoint(x, z + 2.6);
export const cameraAnchors = {
  stairwell: { x, y: drawnBase.y + 1.2, z: 100 },
  lamp_room: { x, y: drawnBase.y + 8.61, z: 100 },
};
export function createLighthouse(scene, art) {
  // The illustrated door, rather than the rear wall, meets the path's stand point.
  const frontZ = z + 2.6;
  const sprite = placeArt(scene, art, 'lighthouse', x, frontZ);
  const point = projectPoint(x, frontZ), lampY = point.y + 8.61;
  const glow = paintedBlob(scene, x, lampY, 0.78, 0.5, '#f3d58c', 925, 0);
  const halo = paintedBlob(scene, x, lampY, 1.3, 0.85, '#f3d58c', 924, 0);
  const beam = createBeam(scene, x, lampY);
  return { sprite, collider: { x, z, radius: 2.25 }, update(time, night) {
    glow.material.opacity = night * 0.9; halo.material.opacity = night * 0.18;
    beam.update(time, night);
  } };
}
