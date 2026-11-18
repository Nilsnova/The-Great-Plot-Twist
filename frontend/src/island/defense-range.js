// One planning-only annulus, below shadows and sprites. The simulation supplies both radii.
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
export function makeDefenseRange(root) {
  const geometry = groundGeometry(new THREE.PlaneGeometry(2, 2));
  const uniforms = { tint: {value: new THREE.Color(0x8ee8dd)}, inner: {value: 0}, rimWidth: {value: 0} };
  const material = new THREE.ShaderMaterial({uniforms, vertexShader, fragmentShader,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'island-defense-range'; mesh.renderOrder = 18; mesh.frustumCulled = false;
  mesh.visible = false; mesh.raycast = () => {}; root.add(mesh);
  let disposed = false, x, z, radius, minimum;
  return {
    show(coverage) {
      if (disposed) return;
      const minRange = coverage?.minRange ?? 0;
      mesh.visible = !!coverage && Number.isFinite(coverage.x) && Number.isFinite(coverage.z)
        && Number.isFinite(coverage.range) && Number.isFinite(minRange) && minRange >= 0 && coverage.range > minRange;
      if (!mesh.visible) { mesh.userData.spotId = null; return; }
      if (x !== coverage.x || z !== coverage.z) {
        x = coverage.x; z = coverage.z;
        const point = projectGround(x, z); mesh.position.set(point.x, point.y, 0);
      }
      if (radius !== coverage.range || minimum !== minRange) {
        radius = coverage.range; minimum = minRange;
        mesh.scale.set(radius, radius, 1);
        uniforms.inner.value = minimum / radius;
        uniforms.rimWidth.value = Math.min(.22, (radius - minimum) / 2) / radius;
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
