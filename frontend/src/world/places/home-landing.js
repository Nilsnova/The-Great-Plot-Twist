import * as THREE from 'three';
import {projectGround} from '../projection.js';

// The dry ramp leads down to the southwest mooring. The offshore timber is scenery.
const START = 18.38, STEP = .355, PLANKS = 7;
const center = z => -7.81 - (z - START) * .62;
const height = z => .045 + (z - START) * .104;
const halfWidth = i => THREE.MathUtils.lerp(1.24, .83, i / (PLANKS - 1));
const boards = ['#b57a42', '#c69155', '#a36a3d', '#c38b4f', '#b17743', '#d19c60', '#a66a3d'];
const endGrain = '#57382b', longGrain = '#805132', darkGrain = '#815535', lightGrain = '#ebba7c';

// Build one small, vertex-coloured mesh. The walking plane stays where it is.
export function createHomeLanding(group) {
  const vertices = [], colors = [], color = new THREE.Color();
  function quad(a, b, c, d, tint) {
    color.set(tint);
    for (const [x, y, z] of [a, b, c, a, c, d]) {
      const display = projectGround(x, z);
      vertices.push(display.x, display.y + y, z + y * 1.24);
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

  function pile(x, z, top, foot = .018) {
    const sides = 9;
    const ring = (radius, y) => Array.from({length: sides}, (_, side) => {
      const angle = side * Math.PI * 2 / sides;
      return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
    });
    const base = ring(.174, foot), shoulder = ring(.165, top - .067), cap = ring(.136, top);
    const wrap = [top - .28, top - .209, top - .138].map(y => [ring(.18, y), ring(.181, y + .045)]);
    const faces = ['#87502f', '#ad7040', '#c89054', '#d4a264', '#c38b4d', '#ae7446', '#845337', '#67402c', '#73492e'];
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      quad(base[index], base[next], shoulder[next], shoulder[index], faces[index]);
      quad(shoulder[index], shoulder[next], cap[next], cap[index], index < 5 ? '#e0af78' : '#a87853');
      quad(cap[index], cap[next], [x, top, z], cap[index], '#d5a574');
      for (const [low, high] of wrap) {
        quad(low[index], low[next], high[next], high[index], index < 5 ? '#f0cb83' : '#b88e55');
      }
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

  const stageStart = far + .055, stageSteps = 12, stageEnd = stageStart + STEP * stageSteps;
  const stageCenter = z => center(far) - (z - stageStart) * .29;
  const deckTop = () => .235, deckBottom = () => .087;
  for (const offset of [-.71, .71]) {
    timber(offset - .112, offset + .112, stageStart, stageEnd + .03, () => -.09, deckBottom,
      longGrain, endGrain, stageCenter);
  }
  for (let i = 0; i < stageSteps; i++) {
    const from = stageStart + STEP * i, to = from + STEP - .016;
    const left = i > 7 ? -1.84 + (i - 8) * .045 : -1.02;
    const right = .96 + (i % 3) * .027;
    timber(left, right, from, to, deckBottom, deckTop, boards[(i + 2) % boards.length], longGrain, stageCenter);
    const grain = (start, end, z) => {
      const point = (x, at) => [stageCenter(at) + x, deckTop() + .006, at];
      quad(point(start, z), point(end, z + .01), point(end, z + .025), point(start, z + .02), lightGrain);
    };
    grain(left + .075, right - .075, from + .022);
    grain(left + .18, -.12 + .26 * Math.sin(i * 1.8), from + .08);
    grain(.25, right - .09, from + .19);
  }
  // A strapped crate sits in the wider end of the stage, on the side away from the hull.
  const crateX = z => stageCenter(z) - 1.29, crateZ = stageEnd - .88;
  const crateBase = () => deckTop() + .012, crateLid = () => .77;
  timber(-.37, .36, crateZ - .29, crateZ + .25, crateBase, crateLid, '#cb9258', '#8c5a36', crateX);
  for (const height of [.35, .53, .7]) {
    timber(-.375, .365, crateZ - .295, crateZ + .255, () => height, () => height + .017,
      '#c99961', '#75482e', crateX);
  }
  for (const side of [-.24, .22]) {
    timber(side - .034, side + .034, crateZ - .303, crateZ + .261, crateBase, () => .795,
      '#645549', '#604a39', crateX);
    for (const y of [.42, .68]) {
      const x = crateX(crateZ + .264) + side, z = crateZ + .264;
      quad([x - .026, y, z], [x + .026, y, z], [x + .026, y + .036, z], [x - .026, y + .036, z], '#c59862');
    }
  }

  // The feet descend through the water. Only small foreground portions overlap the coast.
  for (const [offset, z, height] of [[-.87, stageStart + .28, .78], [.84, stageStart + .28, .84],
    [-.87, stageStart + 2.26, .72], [.84, stageStart + 2.26, .78],
    [-1.65, stageEnd - .35, .82], [.82, stageEnd - .35, .91]]) {
    pile(stageCenter(z) + offset, z, height, -.40);
  }

  return mount('home-mooring-stage', 7);
}
