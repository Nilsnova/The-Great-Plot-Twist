// Close top-down view. Camera and zoom stay on whole native art pixels.
import * as THREE from 'three';
import { projectPoint } from '../world/art.js';
import { snapPixel } from '../pixel/catalog.js';

export function createCamera(input) {
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, .1, 200);
  const start = projectPoint(-1, 10);
  camera.position.set(start.x, snapPixel(start.y + 3.1), 100); camera.lookAt(camera.position.x, camera.position.y, 0);
  camera.userData.viewHeight = 20;
  let exploring = false, zoom = 1, wheel = 0, placeId = 'lighthouse_isle';
  return { camera, get yaw() { return 0; },
    setPlace(id, player) {
      placeId = id; zoom = 1; wheel = 0; const point = projectPoint(player.x, player.z);
      camera.position.set(snapPixel(point.x), snapPixel(point.y + 3.1), 100);
      camera.zoom = 1; camera.updateProjectionMatrix();
    },
    pause() { exploring = false; },
    overview() { exploring = false; camera.zoom = 1; camera.updateProjectionMatrix(); },
    start() { exploring = true; },
    update(delta, player) {
      if (!exploring) return;
      wheel += input.pointer.wheel;
      if (Math.abs(wheel) >= 120) { zoom = Math.max(1, Math.min(2, zoom + (wheel < 0 ? 1 : -1))); wheel = 0; }
      const point = projectPoint(player.x, player.z), blend = 1 - Math.exp(-delta * 7);
      const headroom = placeId === 'lighthouse_isle' && Math.hypot(player.x - 9, player.z + 8) < 8 ? 4.2 : 3.1;
      camera.position.x = snapPixel(camera.position.x + (point.x - camera.position.x) * blend);
      camera.position.y = snapPixel(camera.position.y + (point.y + headroom - camera.position.y) * blend);
      camera.zoom = zoom; camera.updateProjectionMatrix();
    },
  };
}
