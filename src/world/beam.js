// One flat, fading sweep of light, drawn above the night wash.
import * as THREE from 'three';

export function createBeam(scene, x, y) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 31, -4.5, 0, 31, 4.5, 0], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.9, 0.55, 1, 0.9, 0.55, 1, 0.9, 0.55], 3));
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 } },
    vertexShader: `varying vec2 point; void main() { point = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float strength; varying vec2 point;
      void main() { float along = clamp(point.x / 31.0, 0.0, 1.0);
        float edge = 1.0 - smoothstep(0.35, 1.0, abs(point.y) / max(0.01, along * 4.5));
        gl_FragColor = vec4(1.0, 0.88, 0.57, strength * edge * (1.0 - along)); }`,
  }));
  mesh.position.set(x, y, 0); mesh.renderOrder = 920; scene.add(mesh);
  return { update(time, night) {
    mesh.rotation.z = time * 0.18; mesh.material.uniforms.strength.value = night * 0.42;
    mesh.visible = night > 0.02;
  } };
}
