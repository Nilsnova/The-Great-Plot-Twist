// One ground highlight for the most recent confirmed wall purchase.
import * as THREE from 'three';
import {groundGeometry} from '../world/ground-transform.js';
import {projectGround} from '../world/projection.js';

const SECONDS = .72, STILL_SECONDS = .55;

export function makeWallFeedback(root) {
  let mesh = null, current = null, elapsed = 0;

  function clear() {
    current = null;
    if (mesh) mesh.visible = false;
  }

  function update(dt, paused, reduced) {
    if (!current) return;
    mesh.visible = !paused;
    if (paused) return;
    elapsed += dt;
    const duration = reduced ? STILL_SECONDS : SECONDS;
    if (elapsed >= duration) { clear(); return; }
    const progress = elapsed / duration;
    const scale = reduced ? 1.04 : .94 + .18 * progress;
    mesh.scale.set(scale, scale, 1);
    mesh.material.opacity = reduced ? .72 : .82 * (1 - progress);
  }

  return {
    get current() { return current; },
    show(spotId, level, {x, z}, reduced) {
      if (!mesh) {
        const geometry = groundGeometry(new THREE.RingGeometry(.84, 1.12, 32));
        const material = new THREE.MeshBasicMaterial({color: 0xffd875, transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
        mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'island-wall-feedback';
        // Above the painted ground and below the upright sprites, independent of their painter order.
        mesh.renderOrder = 60;
        mesh.raycast = () => {};
        root.add(mesh);
      }
      const point = projectGround(x, z);
      mesh.position.set(point.x, point.y, 0);
      current = {spotId, level, x, z};
      elapsed = 0;
      update(0, false, reduced);
    },
    update, clear,
    dispose() {
      clear();
      if (!mesh) return;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    },
  };
}
