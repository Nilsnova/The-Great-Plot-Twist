// A transparent ink wash turns the illustrated page from day to dusk and night.
import * as THREE from 'three';
import { smoothstep, sunPosition } from '../core/math.js';

export function createSky(scene) {
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({
    color: '#203e54', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  wash.renderOrder = 900; scene.add(wash);
  const mist = wash.clone(); mist.material = wash.material.clone();
  mist.material.color.set('#e4e7d1'); mist.renderOrder = 910; scene.add(mist);
  return { update(hour, weather) {
    const sun = sunPosition(hour), night = 1 - smoothstep(-0.2, 0.25, sun.y);
    wash.material.opacity = night * 0.53 + weather.cloudCover * 0.13;
    mist.material.opacity = weather.fog * 0.26;
    return night;
  } };
}
