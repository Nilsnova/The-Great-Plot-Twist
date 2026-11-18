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

export function makeMooringRope(root, bollard, skiff) {
  const from = eye(bollard), to = eye(skiff);
  const slack = new Vector2().lerpVectors(from, to, .54).add(new Vector2(-.28, -.22));
  const rope = new Group();
  rope.name = 'home-mooring-rope';
  const curve = new QuadraticBezierCurve(from, slack, to);
  polygon(rope, ribbon(curve, .042), '#6d5141', 15, .92).raycast = () => {};
  polygon(rope, ribbon(curve, .017, .013), '#cbb084', 15.1, .86).raycast = () => {};
  root.add(rope);
  return rope;
}
