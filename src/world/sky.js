// Gradient sky, stars and one shadowed sun. Weather tints the sky and the light.
import * as THREE from 'three';
import { clamp, smoothstep, sunPosition, seededRandom } from '../core/math.js';

export function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,
    vertexShader: `varying vec3 direction;
      void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 direction; uniform vec3 topColor; uniform vec3 horizonColor;
      void main() { float h = pow(max(normalize(direction).y, 0.0), 0.65);
      gl_FragColor = vec4(mix(horizonColor, topColor, h), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; scene.add(sky);
  const hemisphere = new THREE.HemisphereLight('#d6e8e0', '#7d806c', 2.2);
  const sun = new THREE.DirectionalLight('#ffdab1', 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 35, bottom: -32, near: 1, far: 150 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.07;
  sun.shadow.camera.updateProjectionMatrix(); scene.add(sun, sun.target, hemisphere);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10), new THREE.MeshBasicMaterial({ color: '#ffd0a0', fog: false }));
  scene.add(sunDisc);
  const random = seededRandom(19), stars = [];
  for (let i = 0; i < 230; i++) {
    const theta = random() * Math.PI * 2, y = random() * 0.8 + 0.18;
    const radius = Math.sqrt(1 - y * y) * 145;
    stars.push(Math.cos(theta) * radius, y * 145, Math.sin(theta) * radius);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: '#e4ebdf', size: 0.24, transparent: true, depthWrite: false, fog: false,
  }));
  scene.add(starField); scene.fog = new THREE.FogExp2('#b8b5a1', 0.008);
  const nightTop = new THREE.Color('#172740'), dayTop = new THREE.Color('#779da9');
  const nightHorizon = new THREE.Color('#657786'), dayHorizon = new THREE.Color('#d3d9be');
  const sunset = new THREE.Color('#d99480'), cloudColor = new THREE.Color('#869a9c');
  return { sun, update(hour, weather) {
    const direction = sunPosition(hour);
    const day = smoothstep(-0.22, 0.3, direction.y), night = 1 - day;
    const dusk = 1 - smoothstep(0, 0.4, Math.abs(direction.y));
    uniforms.topColor.value.copy(nightTop).lerp(dayTop, day).lerp(cloudColor, weather.cloudCover * 0.45);
    uniforms.horizonColor.value.copy(nightHorizon).lerp(dayHorizon, day).lerp(sunset, dusk * (1 - weather.cloudCover));
    scene.fog.color.copy(uniforms.horizonColor.value);
    scene.fog.density = 0.004 + weather.fog * 0.033;
    // A cool, shadowed moon direction keeps midnight playable with the same light.
    sun.position.set(direction.x * 60, Math.max(0.16, Math.abs(direction.y)) * 65, direction.z * 60);
    sun.color.set(day > 0.45 ? '#ffe1b6' : '#9db9df');
    sun.intensity = (0.75 + day * 2.4) * (1 - weather.cloudCover * 0.66);
    hemisphere.intensity = (0.7 + day * 1.25) * (1 - weather.cloudCover * 0.38);
    sunDisc.position.set(direction.x * 110, direction.y * 110, direction.z * 110);
    sunDisc.visible = direction.y > -0.08 && weather.cloudCover < 0.85;
    starField.material.opacity = clamp(night - weather.cloudCover, 0, 1) * 0.85;
    return night;
  } };
}
