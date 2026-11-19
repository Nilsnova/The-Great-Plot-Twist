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
  function timber(left, right, from, to, bottom, top, tint, side = longGrain, at = center) {
    const section = z => {
      const x = at(z), low = bottom(z), high = top(z);
      return {bl: [x + left, low, z], br: [x + right, low, z], tl: [x + left, high, z], tr: [x + right, high, z]};
    };
    const a = section(from), b = section(to);
    quad(a.tl, a.tr, b.tr, b.tl, tint);
    quad(a.bl, a.tl, b.tl, b.bl, side);
    quad(a.tr, a.br, b.br, b.tr, side);
    quad(b.tl, b.tr, b.br, b.bl, endGrain);
    quad(a.tr, a.tl, a.bl, a.br, endGrain);
  }

  function pile(x, z, top) {
    const sides = 7;
    const ring = (radius, y) => Array.from({length: sides}, (_, side) => {
      const angle = side * Math.PI * 2 / sides;
      return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
    });
    const base = ring(.145, .018), shoulder = ring(.14, top - .058), cap = ring(.117, top);
    const bandBase = ring(.15, top - .24), bandTop = ring(.15, top - .14);
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides, sun = index >= 2 && index <= 4;
      quad(base[index], base[next], shoulder[next], shoulder[index], sun ? '#b38655' : '#80563f');
      quad(shoulder[index], shoulder[next], cap[next], cap[index], sun ? '#d6a675' : '#a67653');
      quad(cap[index], cap[next], [x, top, z], cap[index], '#c99966');
      quad(bandBase[index], bandBase[next], bandTop[next], bandTop[index], sun ? '#ddbc86' : '#b5966a');
    }
  }

  function rail(side, start, end) {
    const at = (fraction, edge) => {
      const z = THREE.MathUtils.lerp(start, end, fraction);
      const x = center(z) + side * THREE.MathUtils.lerp(1.06, .74, fraction);
      const slack = Math.sin(Math.PI * fraction) * .14;
      return [x, height(z) + .55 - slack + edge, z];
    };
    for (let i = 0; i < 6; i++) {
      const from = i / 6, to = (i + 1) / 6;
      quad(at(from, 0), at(to, 0), at(to, .062), at(from, .062), '#8b6d48');
      quad(at(from, .035), at(to, .035), at(to, .062), at(from, .062), '#cfab74');
    }
    pile(center(start) + side * 1.06, start, height(start) + .735);
    pile(center(end) + side * .74, end, height(end) + .735);
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
  for (const side of [-1, 1]) rail(side, START + .31, far - .23);

  // A slack rope at the end of the dry landing makes the floating stage read as mooring scenery.
  const gate = far - .23;
  const knot = (fraction, offset) => [
    center(gate) + THREE.MathUtils.lerp(-.74, .74, fraction),
    height(gate) + .55 - Math.sin(Math.PI * fraction) * .15 + offset, gate,
  ];
  for (let i = 0; i < 5; i++) {
    quad(knot(i / 5, 0), knot((i + 1) / 5, 0), knot((i + 1) / 5, .067), knot(i / 5, .067), '#c7a776');
  }

  function mount(name, order) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide,
      transparent: true, forceSinglePass: true, depthTest: true, depthWrite: true, toneMapped: false});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.renderOrder = order; mesh.raycast = () => {};
    group.add(mesh);
    vertices.length = colors.length = 0;
    return mesh;
  }
  mount('home-timber-landing', 6);

  const stageStart = far + .11, stageEnd = stageStart + STEP * 10;
  const stageCenter = z => center(far) + (z - stageStart) * .17;
  const deckTop = () => .18, deckBottom = () => -.025;
  for (const offset of [-.66, .66]) {
    timber(offset - .08, offset + .08, stageStart, stageEnd + .02, () => -.18, deckBottom,
      longGrain, endGrain, stageCenter);
  }
  for (let i = 0; i < 10; i++) {
    const from = stageStart + STEP * i, to = from + STEP - .018;
    const left = i > 6 ? -1.78 + (i - 7) * .09 : -.88;
    const right = .86 + (i % 3) * .032;
    timber(left, right, from, to, deckBottom, deckTop, boards[(i + 2) % boards.length], longGrain, stageCenter);
  }
  for (const [offset, z] of [[-.74, stageStart + .24], [.74, stageStart + .24], [-1.56, stageEnd - .29], [.71, stageEnd - .29]]) {
    pile(stageCenter(z) + offset, z, .85);
  }
  return mount('home-mooring-stage', 7);
}
