// The sea is a flat colour with sparse animated brush marks, not a 3D surface.
import * as THREE from 'three';
import { seededRandom } from '../core/math.js';
import { brushLines } from './primitives.js';
import { QUALITY } from '../config.js';

export function createWater(scene) {
  const group = new THREE.Group(), segments = [], random = seededRandom(208);
  for (let i = 0; i < 160; i++) {
    const x = random() * 155 - 77.5, y = random() * 90 - 45;
    const length = 0.6 + random() * 1.1;
    segments.push([[x, y], [x + length * 0.4, y + 0.08]],
      [[x + length * 0.4, y + 0.08], [x + length, y + 0.04]]);
  }
  const lines = brushLines(group, segments, '#b9ceba', 0, 0.55); scene.add(group);
  return { setQuality(name) { lines.geometry.setDrawRange(0, QUALITY[name].waveMarks * 4); },
    update(time, weather) {
      group.position.x = Math.sin(time * 0.15) * (0.15 + weather.wind * 0.35);
      group.position.y = Math.sin(time * 0.55) * (0.04 + weather.wind * 0.12);
      lines.material.opacity = 0.4 + Math.sin(time * 0.3) * 0.08;
    },
  };
}
