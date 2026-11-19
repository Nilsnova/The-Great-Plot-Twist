import {BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, Vector2} from 'three';
import {MOORING_EYES} from '../../art/home-shore.js';
import {artSizes} from '../art.js';

const SEGMENTS = 12;
const INDICES = [];
for (let i = 0; i < SEGMENTS * 2; i += 2) INDICES.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);

function localEye(mesh) {
  const asset = mesh.userData.asset;
  const [width, height, foot] = artSizes[asset], [x, y] = MOORING_EYES[asset];
  return new Vector2(x / 16 - width / 2, (1 - foot) * height - y / 16);
}

function strand(rope, color, order, opacity) {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setIndex(INDICES);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false, side: DoubleSide, toneMapped: false,
  }));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  rope.add(mesh);
  return position;
}

export function makeMooring(root, bollard, skiff) {
  const {x: restX, y: restY} = skiff.position;
  const from = localEye(bollard).add(bollard.position), cleat = localEye(skiff);
  const rope = new Group();
  rope.name = 'home-mooring-rope';
  const shadow = strand(rope, '#6d5141', 15, .92), light = strand(rope, '#cbb084', 15.1, .86);
  root.add(rope);

  // The boat pivots on its waterline. Rebuild the two tiny strips in place so the rope follows the cleat.
  function drawRope() {
    const c = Math.cos(skiff.rotation.z), s = Math.sin(skiff.rotation.z);
    const toX = skiff.position.x + cleat.x * c - cleat.y * s;
    const toY = skiff.position.y + cleat.x * s + cleat.y * c;
    const bendX = from.x + (toX - from.x) * .54 - .28, bendY = from.y + (toY - from.y) * .54 - .22;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS, u = 1 - t, vertex = i * 2;
      const x = u * u * from.x + 2 * u * t * bendX + t * t * toX;
      const y = u * u * from.y + 2 * u * t * bendY + t * t * toY;
      const dx = u * (bendX - from.x) + t * (toX - bendX), dy = u * (bendY - from.y) + t * (toY - bendY);
      const length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      shadow.setXYZ(vertex, x + nx * .042, y + ny * .042, 0);
      shadow.setXYZ(vertex + 1, x - nx * .042, y - ny * .042, 0);
      light.setXYZ(vertex, x + nx * .017, y + ny * .017 + .013, 0);
      light.setXYZ(vertex + 1, x - nx * .017, y - ny * .017 + .013, 0);
    }
    shadow.needsUpdate = light.needsUpdate = true;
  }
  drawRope();
  let resting = true;
  return {
    setBattle(active) { skiff.visible = rope.visible = !active; },
    update(time, wind, still) {
      if (still) {
        if (resting) return;
        skiff.position.x = restX;
        skiff.position.y = restY;
        skiff.rotation.z = 0;
      } else {
        if (!skiff.visible) return;
        const swell = Math.sin(time * 1.7);
        skiff.position.x = restX + Math.sin(time * 1.06) * .065;
        skiff.position.y = restY + swell * (.068 + wind * .046);
        skiff.rotation.z = Math.sin(time * 1.7 - .86) * (.027 + wind * .012);
      }
      resting = still;
      drawRope();
    },
  };
}
