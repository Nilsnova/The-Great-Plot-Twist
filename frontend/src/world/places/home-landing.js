import * as THREE from 'three';
import {projectGround} from '../projection.js';

// A small slipway cut into the southwest sand, alongside the skiff and west of the wall approach.
const START = 18.65, STEP = .303, PLANKS = 7;
const center = z => -5.49 - (z - START) * .64;
const height = z => .044 + (z - START) * .135;
const halfWidth = i => THREE.MathUtils.lerp(1.24, .83, i / (PLANKS - 1));
const boards = ['#c59258', '#d5a471', '#bc8950', '#d3a16a', '#c68e57', '#d7a06a', '#c6945c'];
const endGrain = '#7e4e36', longGrain = '#a16843', darkGrain = '#81583a', lightGrain = '#e4b888';

// Build one small, vertex-coloured mesh. The walking plane stays where it is.
export function createHomeLanding(group) {
  const vertices = [], colors = [], color = new THREE.Color();
  function quad(a, b, c, d, tint) {
    color.set(tint);
    for (const [x, y, z] of [a, b, c, a, c, d]) {
      const display = projectGround(x, z);
      vertices.push(display.x, display.y + y, z + y * .44);
      colors.push(color.r, color.g, color.b);
    }
  }
  function timber(left, right, from, to, bottom, top, tint, side = longGrain) {
    const section = z => {
      const x = center(z), low = bottom(z), high = top(z);
      return {bl: [x + left, low, z], br: [x + right, low, z], tl: [x + left, high, z], tr: [x + right, high, z]};
    };
    const a = section(from), b = section(to);
    quad(a.tl, a.tr, b.tr, b.tl, tint);
    quad(a.bl, a.tl, b.tl, b.bl, side);
    quad(a.tr, a.br, b.br, b.tr, side);
    quad(b.tl, b.tr, b.br, b.bl, endGrain);
    quad(a.tr, a.tl, a.bl, a.br, endGrain);
  }

  const far = START + STEP * PLANKS;
  for (const x of [-.68, .68]) {
    timber(x - .105, x + .105, START + .35, far + .009, () => .015, z => height(z) - .064, '#ab7850', '#927050');
  }
  timber(-.86, .86, far - .071, far + .018, z => height(z) - .19, z => height(z) + .014, '#c38f5a');
  for (let i = 0; i < PLANKS; i++) {
    const from = START + i * STEP, to = from + STEP - .024;
    const width = halfWidth(i);
    const left = -width + [0, .034, .011][i % 3], right = width - [.045, 0, .025][i % 3];
    timber(left, right, from, to, z => Math.max(.022, height(z) - .15), height, boards[i]);
    const fineGrain = (a, b, at, width, tint) => {
      const point = (x, z) => [center(z) + x, height(z) + .006, z];
      quad(point(a, at), point(b, at + .016), point(b, at + width), point(a, at + width + .013), tint);
    };
    const split = Math.sin(i * 1.8) * .29;
    fineGrain(left + .16, split, from + .054, .025, lightGrain);
    fineGrain(split + .34, right - .24, from + .156, .021, darkGrain);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide,
    transparent: true, forceSinglePass: true, depthTest: true, depthWrite: true, toneMapped: false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'home-timber-landing';
  mesh.renderOrder = 6;
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}
