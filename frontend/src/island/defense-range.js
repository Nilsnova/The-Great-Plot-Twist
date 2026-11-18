// A ground annulus beneath shadows and sprites. The simulation supplies the radii.
import * as THREE from 'three';
import {groundGeometry} from '../world/ground-transform.js';
import {projectGround} from '../world/projection.js';
import fragmentShader from './defense-range.frag?raw';

const vertexShader = /* glsl */ `
varying vec2 logicalOffset;
void main() {
  logicalOffset = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export function makeDefenseRange(root, {combat = false} = {}) {
  const geometry = groundGeometry(new THREE.PlaneGeometry(2, 2));
  const uniforms = {
    tint: {value: new THREE.Color(combat ? 0x89e0cf : 0x8ee8dd)},
    strength: {value: combat ? new THREE.Vector3(.045, .50, .34) : new THREE.Vector3(.07, .62, .46)},
    edgeTint: {value: new THREE.Color(0xe5ce8c)},
    inner: {value: 0}, outer: {value: 1}, rimWidth: {value: 0},
    conditional: {value: 0}, conditionalWidth: {value: 0},
  };
  const material = new THREE.ShaderMaterial({uniforms, vertexShader, fragmentShader,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = combat ? 'pirates:defense-range' : 'island-defense-range'; mesh.renderOrder = 18; mesh.frustumCulled = false;
  mesh.visible = false; mesh.raycast = () => {}; root.add(mesh);
  let disposed = false, x, z, radius, minimum, edge;
  return {
    show(coverage) {
      if (disposed) return;
      const minRange = coverage?.minRange ?? 0;
      const range = Number.isFinite(coverage?.range) && coverage.range > minRange ? coverage.range : 0;
      const lit = combat && Number.isFinite(coverage?.litRange) && coverage.litRange > minRange
        && coverage.litRange !== range ? coverage.litRange : 0;
      mesh.visible = !!coverage && Number.isFinite(coverage.x) && Number.isFinite(coverage.z)
        && Number.isFinite(minRange) && minRange >= 0 && (range > 0 || lit > 0);
      if (!mesh.visible) { mesh.userData.spotId = null; return; }
      if (x !== coverage.x || z !== coverage.z) {
        x = coverage.x; z = coverage.z;
        const point = projectGround(x, z); mesh.position.set(point.x, point.y, 0);
      }
      if (radius !== range || minimum !== minRange || edge !== lit) {
        radius = range; minimum = minRange; edge = lit;
        const extent = Math.max(radius, edge);
        mesh.scale.set(extent, extent, 1);
        uniforms.inner.value = minimum / extent;
        uniforms.outer.value = radius / extent;
        uniforms.rimWidth.value = radius ? Math.min(.22, (radius - minimum) / 2) / extent : 0;
        uniforms.conditional.value = edge / extent;
        uniforms.conditionalWidth.value = edge ? Math.min(.18, (edge - minimum) / 2) / extent : 0;
      }
      mesh.userData.spotId = coverage.id;
    },
    get shown() { return mesh.visible; },
    dispose() {
      if (disposed) return; disposed = true;
      mesh.visible = false; mesh.removeFromParent(); geometry.dispose(); material.dispose();
    },
  };
}
