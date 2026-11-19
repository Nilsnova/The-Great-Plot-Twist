import {Group, QuadraticBezierCurve, Vector2} from 'three';
import {MOORING_EYES} from '../../art/home-shore.js';
import {artSizes} from '../art.js';
import {polygon} from '../primitives.js';

function eye(mesh) {
  const asset = mesh.userData.asset;
  const [width, height, foot] = artSizes[asset], [x, y] = MOORING_EYES[asset];
  return new Vector2(mesh.position.x + x / 16 - width / 2, mesh.position.y + (1 - foot) * height - y / 16);
}

function ribbon(curve, halfWidth, lift = 0) {
  const left = [], right = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, {x, y} = curve.getPoint(t), tangent = curve.getTangent(t);
    const nx = -tangent.y * halfWidth, ny = tangent.x * halfWidth;
    left.push([x + nx, y + ny + lift]);
    right.push([x - nx, y - ny + lift]);
  }
  return left.concat(right.reverse());
}

// Sprites retain their proportions in portrait Fit. The rope ends follow their painted eyes.
function fitToEyes(mesh, from, to, bollard, skiff) {
  const position = mesh.geometry.getAttribute('position');
  const distance = to.clone().sub(from), length = distance.lengthSq();
  const startLift = from.y - bollard.position.y, endLift = to.y - skiff.position.y;
  const points = Array.from({length: position.count}, (_, index) => {
    const point = new Vector2(position.getX(index), position.getY(index));
    const share = Math.max(0, Math.min(1, point.clone().sub(from).dot(distance) / length));
    return {y: point.y, lift: startLift + (endLift - startLift) * share};
  });
  let last = 1;
  mesh.raycast = () => {};
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const depth = camera.userData.homePortraitDepth ?? 1;
    if (depth === last) return;
    for (const [index, point] of points.entries()) position.setY(index, point.y + point.lift * (1 / depth - 1));
    position.needsUpdate = true;
    last = depth;
  };
}

export function makeMooringRope(root, bollard, skiff) {
  const from = eye(bollard), to = eye(skiff);
  const slack = new Vector2().lerpVectors(from, to, .54).add(new Vector2(-.28, -.22));
  const rope = new Group();
  rope.name = 'home-mooring-rope';
  const curve = new QuadraticBezierCurve(from, slack, to);
  const line = polygon(rope, ribbon(curve, .042), '#6d5141', 15, .92);
  const highlight = polygon(rope, ribbon(curve, .017, .013), '#cbb084', 15.1, .86);
  for (const mesh of [line, highlight]) fitToEyes(mesh, from, to, bollard, skiff);
  root.add(rope);
  return rope;
}
