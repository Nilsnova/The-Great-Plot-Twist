// Follow/orbit camera with a four-second arrival shot, zoom and terrain clearance.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { groundHeight } from './collision.js';

export function createCamera(input, obstacles = []) {
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 300);
  const target = new THREE.Vector3(), desired = new THREE.Vector3();
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
  const opening = new THREE.Vector3(39, 29, 48), overviewTarget = new THREE.Vector3(-7, 4, 0);
  let yaw = 0.35, pitch = 0.48, distance = 15, arrival = 0, exploring = false;
  camera.position.copy(opening); camera.lookAt(overviewTarget);
  return { camera, get yaw() { return yaw; },
    pause() { exploring = false; },
    overview() { exploring = false; camera.position.copy(opening); camera.lookAt(overviewTarget); },
    start(skip = false) { exploring = true; if (skip) arrival = 4; },
    update(delta, player) {
      if (!exploring) return;
      arrival = Math.min(4, arrival + delta);
      yaw -= input.pointer.x * 0.005;
      pitch = clamp(pitch + input.pointer.y * 0.004, 0.2, 1.05);
      distance = clamp(distance + input.pointer.wheel * 0.012, 5, 26);
      target.copy(player).y += 1.25;
      desired.set(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance,
        player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
      desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 1.8);
      // Inside the cottage, a closer top-down view stays above the walls.
      if (Math.abs(player.x + 7) < 2.9 && Math.abs(player.z - 3) < 2.15) {
        desired.set(player.x + Math.sin(yaw) * 1.8, target.y + 6.5, player.z + Math.cos(yaw) * 1.8);
      }
      // Raise the camera if any terrain along its sightline hides the player.
      for (let i = 1; i <= 8; i++) {
        const fraction = i / 9;
        const x = target.x + (desired.x - target.x) * fraction;
        const z = target.z + (desired.z - target.z) * fraction;
        const lineY = target.y + (desired.y - target.y) * fraction;
        desired.y += Math.max(0, groundHeight(x, z) + 0.5 - lineY) / fraction;
      }
      // Pull in before a wall or tree; ignore the lifted-away cottage roof.
      direction.subVectors(desired, target);
      ray.set(target, direction.clone().normalize()); ray.far = direction.length(); ray.near = 0.35;
      const hit = ray.intersectObjects(obstacles.filter(object => object.visible), true)[0];
      if (hit) desired.copy(target).addScaledVector(ray.ray.direction, Math.max(1, hit.distance - 0.5));
      // Ease from the sea to the player, then follow without a hard camera snap.
      if (arrival < 4) {
        const blend = smoothstep(0, 4, arrival);
        camera.position.lerpVectors(opening, desired, blend);
        camera.lookAt(overviewTarget.clone().lerp(target, blend));
      } else { camera.position.lerp(desired, 1 - Math.exp(-delta * 8)); camera.lookAt(target); }
    },
  };
}
