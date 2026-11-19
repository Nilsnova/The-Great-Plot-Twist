// Moving ground contact for Home figures. One batch follows the existing drawn ground pins.
import * as THREE from 'three';
import {projectGround} from './projection.js';
import {surfaceClass} from './places/surfaces.js';

const vertexShader = /* glsl */`
attribute vec4 footprint;
varying vec2 localPosition;
varying float strength;
void main() {
  localPosition = position.xy;
  strength = footprint.w;
  vec2 ground = footprint.xy + position.xy * vec2(.59, .26) * footprint.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(ground, 0.0, 1.0);
}`;

const fragmentShader = /* glsl */`
uniform vec3 shade;
varying vec2 localPosition;
varying float strength;
void main() {
  vec2 spread = localPosition + vec2(.18, -.04);
  float falloff = 1.0 - smoothstep(.25, .90, length(spread));
  vec2 planted = (localPosition + vec2(.26, -.16)) * vec2(1.22, 1.40);
  float foot = 1.0 - smoothstep(.12, .73, length(planted));
  gl_FragColor = vec4(shade, strength * (.24 * falloff + .32 * foot));
  #include <colorspace_fragment>
}`;

export function createActorContacts(root, name, capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const footprint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  footprint.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('footprint', footprint);
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms: {shade: {value: new THREE.Color('#303b28')}},
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 20.5;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.raycast = () => {};
  root.add(mesh);
  let count = 0;

  return {
    begin() { count = 0; },
    add(x, z, scale, opacity = 1) {
      const margin = 1 + .025 * scale;
      if (count >= capacity || !(opacity > 0) || !surfaceClass('home_islet', x * margin, z * margin)) return;
      const point = projectGround(x, z);
      footprint.setXYZW(count++, point.x + .15 * scale, point.y - .05 * scale, scale, opacity);
    },
    end() {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      if (!count) return;
      footprint.clearUpdateRanges();
      footprint.addUpdateRange(0, count * 4);
      footprint.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
