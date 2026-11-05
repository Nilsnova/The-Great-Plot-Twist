// Reusable paper islands and broad paths for composition review, not collision maps.
import * as THREE from 'three';
import { paintedBlob, polygon, brushLines } from '../world/primitives.js';
import { projectPoint } from '../world/art.js';
import { seededRandom } from '../core/math.js';

function ribbon(group, route, width, color, order) {
  const curve = new THREE.CatmullRomCurve3(route.map(([x, z]) => { const point = projectPoint(x, z); return new THREE.Vector3(point.x, point.y, 0); }));
  const points = curve.getPoints(40), left = [], right = [];
  points.forEach((point, i) => {
    const tangent = curve.getTangent(i / 40), side = new THREE.Vector2(-tangent.y, tangent.x).normalize().multiplyScalar(width / 2);
    left.push([point.x + side.x, point.y + side.y]); right.push([point.x - side.x, point.y - side.y]);
  });
  polygon(group, [...left, ...right.reverse()], color, order);
  for (const point of [points[0], points.at(-1)]) paintedBlob(group, point.x, point.y, width / 2, width / 2, color, order);
}
export function createLandscape(study) {
  const group = new THREE.Group(), { meadow, shade, sand } = study.palette;
  paintedBlob(group, 0, .3, 25.2, 11.6, '#779c91', 1, .6);
  paintedBlob(group, 0, .7, 24.3, 10.8, '#c2bf96', 2);
  paintedBlob(group, 0, 1, 23.6, 10.3, sand, 3);
  paintedBlob(group, 0, 1.35, 22.8, 9.3, meadow, 4);
  for (const [x, y, w, h] of [[-13, 4, 7, 3], [13, 2, 7, 3], [-2, 7, 6, 2]]) paintedBlob(group, x, y, w, h, shade, 5, .36);
  for (const [x, z, width, height] of study.beds || []) { const point = projectPoint(x, z); paintedBlob(group, point.x, point.y, width, height, '#a29870', 6, .75); }
  study.paths.forEach(route => { ribbon(group, route, 1.3, '#c1bc8c', 6); ribbon(group, route, 1.05, '#e4d4a5', 7); });
  for (const rope of study.ropes || []) {
    const points = rope.map(([x, z, height]) => { const point = projectPoint(x, z); return [point.x, point.y + height]; });
    brushLines(group, [points], '#d8bc7d', 121, .9);
  }
  const random = seededRandom(study.seed), marks = [];
  for (let i = 0; i < 125; i++) {
    const x = random() * 43 - 21.5, y = random() * 15 - 6.5;
    if ((x / 21) ** 2 + ((y - 1.4) / 8) ** 2 > 1) continue;
    marks.push([[x, y], [x + .12 + random() * .24, y + .035]]);
  }
  brushLines(group, marks, '#78936b', 8, .28);
  return group;
}
