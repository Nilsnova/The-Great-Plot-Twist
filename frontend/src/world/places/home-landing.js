import * as THREE from 'three';
import {projectGround} from '../projection.js';

// The dry ramp leads down to the southwest mooring. The offshore timber is scenery.
const START = 18.38, STEP = .355, PLANKS = 7;
const center = z => -7.81 - (z - START) * .62;
const height = z => .045 + (z - START) * .104;
const halfWidth = i => THREE.MathUtils.lerp(1.24, .83, i / (PLANKS - 1));
const boards = ['#b57a42', '#c69155', '#a36a3d', '#c38b4f', '#b17743', '#d19c60', '#a66a3d'];
const endGrain = '#57382b', longGrain = '#805132', darkGrain = '#815535', lightGrain = '#ebba7c';

const TOP = 1, SIDE = 2, PILE = 3, END = 4;
const ACROSS = [0, 0, 255, 255], UPRIGHT = [0, 255, 255, 0];
const TOP_FIRST = [255, 0, 0, 255], TOP_PAIR = [255, 255, 0, 0], CUT_RING = [255, 255, 0, 255];
const FLAT = [0, 0, 0, 0];

function shadeTimber(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 woodFinish;
        varying vec4 vTimber;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTimber = vec4(position.x, position.z, woodFinish.y / 255.0, woodFinish.x);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vTimber;

        // Larger, uneven fibres remain visible in the overview. Fine seams fade with distance.
        float woodFibre(float lengthwise, float across, float seed) {
          float warp = sin(lengthwise * 2.9 + seed) * .17 + sin(lengthwise * 5.3 - seed) * .08;
          float grain = across + warp;
          float width = clamp(fwidth(grain), .012, .38);
          float slit = 1.0 - smoothstep(.05, .05 + width, abs(fract(grain) - .5));
          float shortFibre = .5 + .5 * sin(lengthwise * 4.25 + seed * 3.14 + across * .67);
          return .104 * sin(grain * 6.283) + .085 * sin(grain * 3.7 + seed) - slit * (.06 + .08 * shortFibre);
        }

        vec3 finishWood(vec3 base) {
          vec2 p = vTimber.xy;
          float edge = vTimber.z;
          float surface = vTimber.w;
          if (surface < .5) return base;
          if (surface < 1.5) {
            float fibre = woodFibre(p.x, edge * 2.05, floor(p.y * 2.818) * .83);
            float bevel = .22 * (1.0 - smoothstep(.05, .23, edge)) - .23 * smoothstep(.74, .98, edge);
            float glaze = .11 * sin(p.x * 1.55 + p.y * .73);
            return base * (1.003 + fibre + bevel + glaze);
          }
          if (surface < 2.5) {
            float fibre = woodFibre(p.y, edge * 2.2, p.x * .83);
            return base * (.77 + .27 * edge + fibre);
          }
          if (surface < 3.5) {
            float height = edge * (255.0 / 127.0) - .4;
            float fibre = woodFibre(height * 1.7, p.x * 9.3, p.y * .9);
            float wet = 1.0 - smoothstep(-.20, .092, height);
            float tide = 1.0 - smoothstep(.02, .072, abs(height - .019));
            vec3 wood = base * (1.0 + fibre);
            vec3 soaked = wood * vec3(.46, .64, .64);
            return mix(mix(wood, soaked, wet), vec3(.19, .44, .39), tide * (.23 + .13 * sin(p.x * 18.0)));
          }
          float rings = .16 * sin(edge * 19.0 + sin(p.x * 9.3) * .89 + p.y * 1.9);
          return base * (.90 + .21 * edge + rings);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = finishWood(diffuseColor.rgb);`);
  };
}

// The deck keeps its original two meshes and support bounds.
export function createHomeLanding(group) {
  const vertices = [], colors = [], finishes = [], color = new THREE.Color();
  function quad(a, b, c, d, tint, surface = 0, edges = FLAT) {
    color.set(tint);
    const corners = [a, b, c, d];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z] = corners[index], display = projectGround(x, z);
      vertices.push(display.x, display.y + y, z + y * 1.24);
      colors.push(color.r, color.g, color.b);
      finishes.push(surface, edges[index]);
    }
  }
  function timber(left, right, from, to, bottom, top, tint, side = longGrain, at = center) {
    const section = z => {
      const x = at(z), low = bottom(z), high = top(z);
      return {bl: [x + left, low, z], br: [x + right, low, z], tl: [x + left, high, z], tr: [x + right, high, z]};
    };
    const a = section(from), b = section(to);
    quad(a.tl, a.tr, b.tr, b.tl, tint, TOP, ACROSS);
    quad(a.bl, a.tl, b.tl, b.bl, side, SIDE, UPRIGHT);
    quad(a.tr, a.br, b.br, b.tr, side, SIDE, TOP_FIRST);
    quad(b.tl, b.tr, b.br, b.bl, endGrain, END, TOP_PAIR);
    quad(a.tr, a.tl, a.bl, a.br, endGrain, END, TOP_PAIR);
  }

  function pile(x, z, top, foot = .018) {
    const sides = 9;
    const ring = (radius, y) => Array.from({length: sides}, (_, side) => {
      const angle = side * Math.PI * 2 / sides;
      return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
    });
    const base = ring(.174, foot), shoulder = ring(.165, top - .067), cap = ring(.136, top);
    const wrap = [top - .28, top - .209, top - .138].map(y => [ring(.18, y), ring(.181, y + .045)]);
    const elevation = y => Math.round((y + .4) * 127);
    const low = elevation(foot), high = elevation(top - .067), grain = [low, low, high, high];
    const faces = ['#87502f', '#ad7040', '#c89054', '#d4a264', '#c38b4d', '#ae7446', '#845337', '#67402c', '#73492e'];
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      quad(base[index], base[next], shoulder[next], shoulder[index], faces[index], PILE, grain);
      quad(shoulder[index], shoulder[next], cap[next], cap[index], index < 5 ? '#e0af78' : '#a87853');
      quad(cap[index], cap[next], [x, top, z], cap[index], '#d5a574', END, CUT_RING);
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
    geometry.setAttribute('woodFinish', new THREE.Uint8BufferAttribute(finishes, 2));
    const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide,
      transparent: true, forceSinglePass: true, depthTest: true, depthWrite: true, toneMapped: false});
    shadeTimber(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.renderOrder = order; mesh.raycast = () => {};
    group.add(mesh);
    vertices.length = colors.length = finishes.length = 0;
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
