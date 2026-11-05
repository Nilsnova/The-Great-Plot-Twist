// Public weather API plus one rain particle system. Real APIs can call setWeather.
import * as THREE from 'three';
import { clamp, seededRandom } from '../core/math.js';
import { QUALITY } from '../config.js';

let current = { cloudCover: 0.12, rain: 0, fog: 0.1, wind: 0.18 };
export const presets = {
  clear: { cloudCover: 0.05, rain: 0, fog: 0.05, wind: 0.12 },
  overcast: { cloudCover: 0.8, rain: 0, fog: 0.2, wind: 0.4 },
  storm: { cloudCover: 1, rain: 1, fog: 0.38, wind: 1 },
  fog: { cloudCover: 0.55, rain: 0, fog: 1, wind: 0.1 },
};
export function clampWeather(previous, changes = {}) {
  const next = { ...previous };
  for (const key of ['cloudCover', 'rain', 'fog', 'wind']) {
    if (Number.isFinite(changes?.[key])) next[key] = clamp(changes[key], 0, 1);
  }
  return next;
}
export function setWeather(changes) {
  current = clampWeather(current, changes);
  return getWeather();
}
export const getWeather = () => ({ ...current });

export function createWeather(scene) {
  const random = seededRandom(24), count = QUALITY.high.rainCount;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = random() * 55 - 27.5;
    positions[i + 1] = random() * 30;
    positions[i + 2] = random() * 55 - 27.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: '#d5e8e5', size: 0.075, transparent: true, opacity: 0.65, depthWrite: false,
  }));
  rain.frustumCulled = false; scene.add(rain);
  return { update(delta, player, quality) {
    const weather = getWeather(); rain.visible = weather.rain > 0;
    geometry.setDrawRange(0, Math.floor(QUALITY[quality].rainCount * weather.rain));
    rain.position.set(player.x, 0, player.z);
    if (!rain.visible) return weather;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += delta * weather.wind * 5;
      positions[i + 1] -= delta * 19;
      if (positions[i] > 27.5) positions[i] = -27.5;
      if (positions[i + 1] < 0) positions[i + 1] = 30;
    }
    geometry.attributes.position.needsUpdate = true;
    return weather;
  } };
}
