// One planning-only annulus, below shadows and sprites. The simulation supplies both radii.
import * as THREE from 'three';
import {groundGeometry} from '../world/ground-transform.js';
import {projectGround} from '../world/projection.js';

const vertexShader = /* glsl */ `
varying vec2 logicalOffset;
void main() {
  logicalOffset = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = /* glsl */ `
varying vec2 logicalOffset;
uniform vec3 tint;
uniform float inner;
uniform float rimWidth;
void main() {
  float radius = length(logicalOffset);
  float aa = max(fwidth(radius) * 0.75, 0.0001);
  float outside = 1.0 - smoothstep(1.0 - aa, 1.0, radius);
  float inside = inner > 0.0 ? smoothstep(inner, inner + aa, radius) : 1.0;
  float outerRim = smoothstep(1.0 - rimWidth - aa, 1.0 - rimWidth + aa, radius);
  float innerRim = inner > 0.0 ? 1.0 - smoothstep(inner + rimWidth - aa, inner + rimWidth + aa, radius) : 0.0;
  gl_FragColor = vec4(tint, outside * inside * max(0.07, max(0.62 * outerRim, 0.46 * innerRim)));
  #include <colorspace_fragment>
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
