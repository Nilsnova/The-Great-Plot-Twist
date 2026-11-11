// Continuous orthographic follow: tiny movements remain visible instead of sticking to a pixel grid.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';

export function createCamera(input) {
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, .1, 200);
  const start = projectPoint(-1, 10);
  camera.position.set(start.x, start.y + 3.1, 100); camera.lookAt(camera.position.x, camera.position.y, 0);
  camera.userData.viewHeight = 20;
  let exploring = false, targetZoom = 1, placeId = 'lighthouse_isle', reduce = false;
  return {camera, get yaw() { return 0; },
    setPlace(id, player) {
      placeId = id; targetZoom = 1; const point = projectPoint(player.x, player.z);
      camera.position.set(point.x, point.y + 3.1, 100);
      camera.zoom = 1; camera.updateProjectionMatrix();
    },
    pause() { exploring = false; },
    overview() { exploring = false; targetZoom = 1; camera.zoom = 1; camera.updateProjectionMatrix(); },
    start(reducedMotion = false) { exploring = true; reduce = reducedMotion === true; },
    update(delta, player) {
      if (!exploring || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, .1), wheel = input.pointer.wheel;
      if (Number.isFinite(wheel) && wheel) targetZoom = Math.max(1, Math.min(2, targetZoom - wheel / 1000));
      // ...and lean towards the fight: camera.userData.battleFocus is a small logical offset {x, z}.
      const lean = camera.userData.battleFocus, leanX = Number.isFinite(lean?.x) ? lean.x : 0, leanZ = Number.isFinite(lean?.z) ? lean.z : 0;
      const point = projectPoint(player.x + leanX, player.z + leanZ), blend = reduce ? 1 : 1 - Math.exp(-dt * 12);
      const headroom = placeId === 'lighthouse_isle' && Math.hypot(player.x - 9, player.z + 8) < 8 ? 4.2 : 3.1;
      camera.position.x += (point.x - camera.position.x) * blend;
      camera.position.y += (point.y + headroom - camera.position.y) * blend;
      // A pirate wave (lane P) may ask for a wider view while it runs: camera.userData.battleZoom (0.4-1).
      const battle = camera.userData.battleZoom, goal = Number.isFinite(battle) ? Math.max(.4, Math.min(1, battle)) : targetZoom;
      const zoom = reduce ? goal : camera.zoom + (goal - camera.zoom) * (1 - Math.exp(-dt * (Number.isFinite(battle) || camera.zoom < .98 ? 3 : 16)));
      if (Math.abs(zoom - camera.zoom) > .00001) {camera.zoom = zoom; camera.updateProjectionMatrix();}
    },
  };
}
