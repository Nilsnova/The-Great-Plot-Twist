// The footprint under a building while it is moved (T36, flexible placement): a soft square with a
// bright rim on the ground, green where the cell is free, red where the server would refuse it, squashed
// like the ground (projectPoint's 0.72) and under everything that stands. Used by world.js only.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';

export const PREVIEW_COLOURS = Object.freeze({ok: 0x3fa04d, refused: 0xe2463b});
const RIM = 0.08; // the rim's width as a share of the square

export function makeFootprint(root) {
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent: true, opacity: .28, depthTest: false, depthWrite: false}));
  const rimShape = new THREE.Shape([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => new THREE.Vector2(x, y)));
  rimShape.holes.push(new THREE.Path([[-.5 + RIM, -.5 + RIM], [-.5 + RIM, .5 - RIM], [.5 - RIM, .5 - RIM], [.5 - RIM, -.5 + RIM]]
    .map(([x, y]) => new THREE.Vector2(x, y))));
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), new THREE.MeshBasicMaterial({transparent: true, opacity: .95, depthTest: false, depthWrite: false}));
  for (const [mesh, order] of [[fill, 97], [rim, 98]]) { mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); }
  fill.name = 'island-move-footprint'; rim.name = 'island-move-footprint-rim';
  return {
    // preview: {x, z, size, ok} or null to hide it.
    show(preview) {
      const on = !!preview && Number.isFinite(preview.x) && Number.isFinite(preview.z) && preview.size > 0;
      fill.visible = rim.visible = on;
      if (!on) return;
      const point = projectPoint(preview.x, preview.z), colour = preview.ok ? PREVIEW_COLOURS.ok : PREVIEW_COLOURS.refused;
      for (const mesh of [fill, rim]) {
        mesh.position.set(point.x, point.y, 0); mesh.scale.set(preview.size, preview.size * .72, 1); mesh.material.color.setHex(colour);
      }
      fill.userData = {preview: {...preview}};
    },
    get shown() { return fill.visible ? {...fill.userData.preview} : null; },
  };
}
