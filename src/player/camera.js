// Fixed illustrated view with a gentle arrival, map-follow and optional wheel zoom.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { projectPoint } from '../world/art.js';

export function createCamera(input) {
  const camera = new THREE.OrthographicCamera(-40, 40, 24, -24, 0.1, 200);
  camera.position.set(-6, 1, 100); camera.lookAt(-6, 1, 0);
  camera.userData.viewHeight = 48;
  let exploring = false, arrival = 0, zoom = 1.3;
  return { camera, get yaw() { return 0; },
    pause() { exploring = false; },
    overview() { exploring = false; camera.position.set(-6, 1, 100); camera.zoom = 1; camera.updateProjectionMatrix(); },
    start(skip = false) { exploring = true; if (skip) arrival = 4; },
    update(delta, player) {
      if (!exploring) return;
      arrival = Math.min(4, arrival + delta);
      zoom = clamp(zoom - input.pointer.wheel * 0.0015, 1, 2.15);
      const target = projectPoint(player.x, player.z);
      const inside = Math.abs(player.x + 7) < 2.75 && Math.abs(player.z - 3) < 2.1;
      const focusX = clamp(target.x, -6, 6);
      const focusY = inside ? target.y + 1.2 : clamp(target.y + 4.8, -1.5, 3);
      const focusZoom = inside ? Math.max(1.8, zoom) : zoom;
      const blend = smoothstep(0, 4, arrival);
      const desiredX = arrival < 4 ? -6 + (focusX + 6) * blend : focusX;
      const desiredY = arrival < 4 ? 1 + (focusY - 1) * blend : focusY;
      const follow = arrival < 4 ? 1 : 1 - Math.exp(-delta * 3.5);
      camera.position.x += (desiredX - camera.position.x) * follow;
      camera.position.y += (desiredY - camera.position.y) * follow;
      camera.zoom += (1 + (focusZoom - 1) * blend - camera.zoom) * Math.min(1, delta * 8);
      camera.updateProjectionMatrix();
    },
  };
}
