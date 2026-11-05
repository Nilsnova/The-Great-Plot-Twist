// A single cone with soft edges. Lighthouse.js rotates it and sets night strength.
import * as THREE from 'three';

export function createBeam() {
  const geometry = new THREE.ConeGeometry(2.5, 34, 24, 1, true);
  geometry.rotateZ(Math.PI / 2); geometry.translate(17, 0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0 }, color: { value: new THREE.Color('#ffc978') } },
    vertexShader: `
      varying float along; varying vec3 viewNormal; varying vec3 toCamera;
      void main() {
        along = 1.0 - uv.y;
        viewNormal = normalMatrix * normal;
        vec4 point = modelViewMatrix * vec4(position, 1.0);
        toCamera = -point.xyz;
        gl_Position = projectionMatrix * point;
      }`,
    fragmentShader: `
      uniform float strength; uniform vec3 color;
      varying float along; varying vec3 viewNormal; varying vec3 toCamera;
      void main() {
        // Face-on surfaces glow; the silhouette and far end fade away.
        float edge = pow(abs(dot(normalize(viewNormal), normalize(toCamera))), 1.5);
        float fade = pow(1.0 - along, 1.5);
        gl_FragColor = vec4(color, strength * edge * fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geometry, material);
}
