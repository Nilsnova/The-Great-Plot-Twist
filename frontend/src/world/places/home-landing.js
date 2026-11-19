import * as THREE from 'three';
import {projectGround} from '../projection.js';

// The southwest slipway sits west of the wall approach and keeps its original ground anchor.
const START = 18.65, STEP = .303, PLANKS = 7;
const center = z => -5.49 - (z - START) * .64;
const height = z => .044 + (z - START) * .135;
const halfWidth = i => THREE.MathUtils.lerp(1.43, 1.13, i / (PLANKS - 1));
const boards = ['#c99560', '#d6aa76', '#ae774d', '#cfa071', '#c28b5d', '#d1a16e', '#c38e5d'];
const endGrain = '#7e4e36', longGrain = '#a16843', darkGrain = '#81583a', lightGrain = '#e4b888';

// Build the dry slipway and floating stage as two painted meshes.
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

  function pile(x, z, top, offshore = false) {
    const sides = 8, width = offshore ? .235 : .185;
    const ring = (radius, y) => Array.from({length: sides}, (_, side) => {
      const angle = side * Math.PI * 2 / sides;
      return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
    });
    const base = ring(width * .8, offshore ? -.31 : .018);
    const shoulder = ring(width, top - .072), cap = ring(width * .79, top), heart = ring(width * .52, top + .001);
    const bands = [.20, .27, .34].map((distance, index) => {
      const edge = y => ring(width * 1.055, top - distance + y).map(([x, y, z], side) => (
        [x, y + .019 * Math.sin(side * Math.PI / 4 + index * .9), z]
      ));
      return [edge(0), edge(.051), edge(.068)];
    });
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides, sun = index >= 2 && index <= 4;
      quad(base[index], base[next], shoulder[next], shoulder[index], sun ? '#b38655' : '#80563f');
      quad(shoulder[index], shoulder[next], cap[next], cap[index], sun ? '#d6a675' : '#a67653');
      quad(cap[index], cap[next], heart[next], heart[index], sun ? '#c99966' : '#cf9964');
      quad(heart[index], heart[next], [x, top + .001, z], heart[index], '#e9b983');
      for (const [low, mid, high] of bands) {
        quad(low[index], low[next], mid[next], mid[index], sun ? '#d2ac73' : '#aa7e56');
        quad(mid[index], mid[next], high[next], high[index], sun ? '#efd2a0' : '#c79c71');
      }
    }
  }

  function rail(side, start, end) {
    const at = (fraction, edge) => {
      const z = THREE.MathUtils.lerp(start, end, fraction);
      const x = center(z) + side * THREE.MathUtils.lerp(1.27, 1, fraction);
      const slack = Math.sin(Math.PI * fraction) * .17;
      return [x, height(z) + .55 - slack + edge, z];
    };
    for (let i = 0; i < 6; i++) {
      const from = i / 6, to = (i + 1) / 6;
      quad(at(from, 0), at(to, 0), at(to, .062), at(from, .062), '#8b6d48');
      quad(at(from, .035), at(to, .035), at(to, .062), at(from, .062), '#cfab74');
    }
    pile(center(start) + side * 1.27, start, height(start) + .735);
    pile(center(end) + side, end, height(end) + .735);
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
    center(gate) + THREE.MathUtils.lerp(-1, 1, fraction),
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

  const stageStart = far + .02, stageStep = .32, stagePlanks = 18;
  const stageEnd = stageStart + stageStep * stagePlanks;
  const stageCenter = z => center(far) - (z - stageStart) * .51;
  const deckTop = () => .275, deckBottom = () => .045;
  // A short right berth projects beside the gangway. The main deck runs along the skiff.
  for (const offset of [-1.14, .91]) {
    timber(offset - .105, offset + .105, stageStart, stageEnd + .03, () => -.22, deckBottom,
      longGrain, endGrain, stageCenter);
  }
  for (let i = 0; i < stagePlanks; i++) {
    const from = stageStart + stageStep * i, to = from + stageStep - .022;
    const left = -1.34 - (i % 5) * .025;
    const berth = i >= 2 && i <= 6;
    const right = (berth ? 3.23 : 1.24) + (i % 3) * .046;
    timber(left, right, from, to, deckBottom, deckTop, boards[(i + 2) % boards.length], longGrain, stageCenter);
    const grain = (across, z, lift) => [stageCenter(z) + across, deckTop() + lift, z];
    const a = left + .17, b = .18 + Math.sin(i * 2.19) * .25;
    quad(grain(a, from + .076, .007), grain(b, from + .093, .007),
      grain(b - .16, from + .110, .007), grain(a + .08, from + .097, .007), lightGrain);
    quad(grain(b + .22, from + .188, .008), grain(right - .15, from + .173, .008),
      grain(right - .26, from + .208, .008), grain(b + .28, from + .213, .008), darkGrain);
  }
  const berthStart = stageStart + stageStep * 2, berthEnd = stageStart + stageStep * 7;
  timber(2.85, 3.05, berthStart - .02, berthEnd + .02, () => -.20, deckBottom,
    longGrain, endGrain, stageCenter);
  for (const [offset, z, top] of [
    [-1.16, stageStart + .23, .94], [1.05, stageStart + .24, .93],
    [3.10, berthStart + .21, 1.1], [3.04, berthEnd - .21, 1.13],
    [-1.17, stageStart + 2.58, 1.12], [1.03, stageStart + 2.74, .94],
    [-1.17, stageEnd - .22, 1.24], [1.06, stageEnd - .24, 1.19],
  ]) {
    pile(stageCenter(z) + offset, z, top, true);
  }
  return mount('home-mooring-stage', 7);
}
