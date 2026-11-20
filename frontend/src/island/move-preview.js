// The footprint under a building while it is moved (T36, flexible placement): a soft square with a
// bright rim on the ground, green where the cell is free, red where the server would refuse it, squashed
// by the shared ground projection. While a wall is moved, free spots on the grass edge glow on the
// ground so the player can place it along the single row. Used by world.js only.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {groundGeometry} from '../world/ground-transform.js';
import {WALL_PERIMETER_CELLS} from './wall-perimeter.js';

export const PREVIEW_COLOURS = Object.freeze({
  ok: {fill: 0x226050, rim: 0x9af2ca},
  refused: {fill: 0x823731, rim: 0xff9d85},
});
// Center the rim on the true footprint edge so it reads around the ghost's base.
const OUTSIDE = .56, INSIDE = .44;

export function makeFootprint(root) {
  const fill = new THREE.Mesh(groundGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({transparent: true, opacity: .36, depthTest: false, depthWrite: false}));
  const rimShape = new THREE.Shape([[-OUTSIDE, -OUTSIDE], [OUTSIDE, -OUTSIDE], [OUTSIDE, OUTSIDE], [-OUTSIDE, OUTSIDE]].map(([x, y]) => new THREE.Vector2(x, y)));
  rimShape.holes.push(new THREE.Path([[-INSIDE, -INSIDE], [-INSIDE, INSIDE], [INSIDE, INSIDE], [INSIDE, -INSIDE]]
    .map(([x, y]) => new THREE.Vector2(x, y))));
  const rim = new THREE.Mesh(groundGeometry(new THREE.ShapeGeometry(rimShape)), new THREE.MeshBasicMaterial({transparent: true, opacity: .95, depthTest: false, depthWrite: false}));
  for (const [mesh, order] of [[fill, 97], [rim, 98]]) { mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); }
  fill.name = 'island-move-footprint'; rim.name = 'island-move-footprint-rim';
  return {
    // preview: {x, z, size, ok} or null to hide it.
    show(preview) {
      const on = !!preview && Number.isFinite(preview.x) && Number.isFinite(preview.z) && preview.size > 0;
      fill.visible = rim.visible = on;
      if (!on) return;
      const point = projectPoint(preview.x, preview.z), colours = preview.ok ? PREVIEW_COLOURS.ok : PREVIEW_COLOURS.refused;
      for (const mesh of [fill, rim]) {
        mesh.position.set(point.x, point.y, 0); mesh.scale.set(preview.size, preview.size, 1);
      }
      fill.material.color.setHex(colours.fill);
      rim.material.color.setHex(colours.rim);
      fill.userData = {preview: {...preview}};
    },
    get shown() { return fill.visible ? {...fill.userData.preview} : null; },
  };
}

// One batch of ground markers for the free spots. It shares the wall footprint projection.
export function makeWallPerimeter(root) {
  const geometry = groundGeometry(new THREE.PlaneGeometry(1.2, 1.2));
  const material = new THREE.MeshBasicMaterial({color: 0xffe08a, transparent: true, opacity: .36, depthTest: false, depthWrite: false});
  const mesh = new THREE.InstancedMesh(geometry, material, WALL_PERIMETER_CELLS.length);
  const matrix = new THREE.Matrix4();
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'island-wall-perimeter'; mesh.renderOrder = 96; mesh.frustumCulled = false; mesh.visible = false;
  mesh.raycast = () => {};
  root.add(mesh);
  return {
    show(cells = []) {
      mesh.count = cells.length;
      mesh.visible = cells.length > 0;
      for (const [index, {x, z}] of cells.entries()) {
        const point = projectPoint(x, z);
        mesh.setMatrixAt(index, matrix.makeTranslation(point.x, point.y, 0));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    get shown() { return mesh.visible; },
  };
}
