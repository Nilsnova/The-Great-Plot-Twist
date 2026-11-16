// The footprint under a building while it is moved (T36, flexible placement): a soft square with a
// bright rim on the ground, green where the cell is free, red where the server would refuse it, squashed
// like the ground (projectPoint's 0.72) and under everything that stands. While a wall is moved, its lanes
// (D056, wall-lanes.js: the cells where a wall stops pirates on their way to the heart) glow on the ground, so the
// player sees where a wall may go. Used by world.js only.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {WALL_LANE_ROWS} from './wall-lanes.js';

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

export const LANE_COLOUR = 0xffe08a;
const HALF_CELL = .25; // a lane cell is one grid cell (0.5 units) round its centre

// The wall lanes as one flat mesh on the ground (one quad per run of a row), built once; show(on) toggles it.
export function makeWallLanes(root, rows = WALL_LANE_ROWS) {
  const positions = [], index = [];
  for (const [z, ...runs] of rows) for (let i = 0; i < runs.length; i += 2) {
    const a = projectPoint(runs[i] - HALF_CELL, z - HALF_CELL), b = projectPoint(runs[i + 1] + HALF_CELL, z + HALF_CELL), n = positions.length / 3;
    positions.push(a.x, a.y, 0, b.x, a.y, 0, b.x, b.y, 0, a.x, b.y, 0);
    index.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: LANE_COLOUR, transparent: true, opacity: .3, depthTest: false, depthWrite: false}));
  mesh.name = 'island-wall-lanes'; mesh.renderOrder = 96; mesh.frustumCulled = false; mesh.visible = false;
  root.add(mesh);
  return {
    show(on) { mesh.visible = !!on; },
    get shown() { return mesh.visible; },
    get runs() { return index.length / 6; },
  };
}
