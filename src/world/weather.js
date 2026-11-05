// Public weather state plus simple illustrated rain. Integrations use setWeather.
import * as THREE from 'three';
import { clamp, seededRandom } from '../core/math.js';
import { QUALITY } from '../config.js';
import { projectPoint } from './art.js';

let current = { cloudCover: 0.05, rain: 0, fog: 0.02, wind: 0.18 };
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
export function setWeather(changes) { current = clampWeather(current, changes); return getWeather(); }
export const getWeather = () => ({ ...current });

export function createWeather(scene) {
  const random = seededRandom(24), count = QUALITY.high.rainCount;
  const drops = Array.from({ length: count }, () => ({ x: random() * 100 - 50, y: random() * 75 - 37.5 }));
  const positions = new Float32Array(count * 6), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: '#d4e4cd', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  rain.renderOrder = 930; rain.frustumCulled = false; scene.add(rain);
  return { update(delta, player, quality) {
    const weather = getWeather(), point = projectPoint(player.x, player.z);
    rain.visible = weather.rain > 0; rain.position.set(point.x, point.y, 0);
    geometry.setDrawRange(0, Math.floor(QUALITY[quality].rainCount * weather.rain) * 2);
    if (!rain.visible) return weather;
    drops.forEach((drop, i) => {
      drop.x += delta * weather.wind * 4; drop.y -= delta * 19;
      if (drop.x > 50) drop.x = -50; if (drop.y < -37.5) drop.y = 37.5;
      positions.set([drop.x, drop.y, 0, drop.x - 0.1 - weather.wind * 0.15, drop.y + 0.55, 0], i * 6);
    });
    geometry.attributes.position.needsUpdate = true; return weather;
  } };
}
