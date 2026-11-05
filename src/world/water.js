// One low-poly sea mesh. Weather drives wave height; quality changes its grid.
import * as THREE from 'three';
import { colors, QUALITY } from '../config.js';

export function waveHeight(x, z, time, wind) {
  const strength = 0.04 + wind * 0.18;
  return Math.sin(x * 0.38 + time * 1.3) * strength
    + Math.cos(z * 0.47 - time * 0.8) * strength * 0.65;
}
export function createWater(scene) {
  const material = new THREE.MeshStandardMaterial({
    color: colors.water, flatShading: true, roughness: 0.5, metalness: 0.2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  mesh.name = 'Animated low-poly sea'; scene.add(mesh);
  // A flat far sea hides the square edge of the small animated grid in fog.
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material);
  horizon.rotation.x = -Math.PI / 2; horizon.position.y = -0.42; scene.add(horizon);
  function setQuality(name) {
    mesh.geometry.dispose();
    const segments = QUALITY[name].waterSegments;
    mesh.geometry = new THREE.PlaneGeometry(230, 230, segments, segments);
    mesh.geometry.rotateX(-Math.PI / 2);
  }
  setQuality('high');
  return {
    mesh, setQuality,
    update(time, weather) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, waveHeight(positions.getX(i), positions.getZ(i), time, weather.wind));
      }
      positions.needsUpdate = true;
    },
  };
}
