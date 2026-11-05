// Follow/orbit camera with a four-second arrival shot, zoom and terrain clearance.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { groundHeight } from './collision.js';

export function createCamera(input) {
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 300);
  const target = new THREE.Vector3(), desired = new THREE.Vector3();
  const opening = new THREE.Vector3(43, 31, 53), overviewTarget = new THREE.Vector3(0, 4, 0);
  let yaw = 0.35, pitch = 0.48, distance = 15, arrival = 0, exploring = false;
  camera.position.copy(opening); camera.lookAt(overviewTarget);
  return { camera, get yaw() { return yaw; },
    start(skip = false) { exploring = true; if (skip) arrival = 4; },
    update(delta, player) {
      if (!exploring) { camera.lookAt(overviewTarget); return; }
      arrival = Math.min(4, arrival + delta);
      yaw -= input.pointer.x * 0.005;
      pitch = clamp(pitch + input.pointer.y * 0.004, 0.2, 1.05);
      distance = clamp(distance + input.pointer.wheel * 0.012, 5, 26);
      target.copy(player).y += 1.25;
      desired.set(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance,
        player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
      desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 1.8);
      // Ease from the sea to the player, then follow without a hard camera snap.
      if (arrival < 4) {
        const blend = smoothstep(0, 4, arrival);
        camera.position.lerpVectors(opening, desired, blend);
        camera.lookAt(overviewTarget.clone().lerp(target, blend));
      } else { camera.position.lerp(desired, 1 - Math.exp(-delta * 8)); camera.lookAt(target); }
    },
  };
}
