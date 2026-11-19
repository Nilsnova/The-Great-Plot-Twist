// Rock relief is presentation only. Dry stone follows the approved painted coast mask.
import * as THREE from 'three';
import {APPROACH_DEPTH, CLIFF_DEPTH, cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const STONES = ['#c1a783', '#c9ad8e', '#ada096', '#b39a7f', '#bba48b', '#a19a91'].map(color => new THREE.Color(color));
const BEDROCK = new THREE.Color('#6e6254');
const OUTCROP = new THREE.Color('#a3a098');
const SUBMERGED_STONE = new THREE.Color('#66887c');
const TURF = new THREE.Color('#91b949');
const BLOCK_WIDTHS = [4.1, 6, 4.8, 3.5, 5.1, 5.9, 3.8];
const ROCKY_ARCS = [[9, 36], [54, 81]];
const TERRACE_ARCS = [[25, 34], [55, 67]];
const CUT_CORNERS = [[.11, 0], [.80, 0], [1, .20], [.98, .78], [.82, 1], [.16, 1], [0, .84], [0, .18]];
const surface = surfaces.home_islet;
const SUN = new THREE.Vector3(-.61, .71, -.32).normalize();

// Height and tangent slopes from the same world-space grain. The slope lighting
// stays on the stone as the camera changes scale, with no extra texture or light.
export const sandstoneFinishGlsl = /* glsl */`
  float sandstoneHash(vec2 point) {
    vec3 seed = fract(vec3(point.xyx) * .1031);
    seed += dot(seed, seed.yzx + 33.33);
    return fract((seed.x + seed.y) * seed.z);
  }
  vec3 sandstoneGrain(vec2 point) {
    vec2 cell = floor(point), p = fract(point);
    vec2 weight = p * p * (3.0 - 2.0 * p);
    vec2 steepness = 6.0 * p * (1.0 - p);
    float a = sandstoneHash(cell), b = sandstoneHash(cell + vec2(1.0, 0.0));
    float c = sandstoneHash(cell + vec2(0.0, 1.0)), d = sandstoneHash(cell + vec2(1.0, 1.0));
    return vec3(mix(mix(a, b, weight.x), mix(c, d, weight.x), weight.y),
      steepness.x * mix(b - a, d - c, weight.y),
      steepness.y * mix(c - a, d - b, weight.x));
  }
  vec3 cutSandstone(vec3 base, vec2 point, vec2 cut, float laidFace) {
    vec3 slab = sandstoneGrain(point * vec2(1.9, 3.2));
    vec3 chip = sandstoneGrain(point * vec2(4.2, 7.4) + vec2(.58, 1.83));
    float grainLight = clamp(dot(slab.yz, vec2(-.16, .23)) + dot(chip.yz, vec2(-.075, .105)), -.32, .40);
    float deposit = smoothstep(.23, .78, slab.x * .79 + chip.x * .21);
    vec3 coarse = base * ((.85 + deposit * .27) * (1.0 + grainLight));

    // Weathered layers catch the sun along their broken upper edge.
    float phase = point.y * 1.71 + point.x * .19 + slab.x * .43;
    float separation = fract(phase);
    float aa = min(.10, fwidth(phase));
    float fractured = smoothstep(.45, .74, slab.x * .80 + chip.x * .20);
    float split = 1.0 - smoothstep(.050, .139 + aa, abs(separation - .52));
    float crest = 1.0 - smoothstep(.021, .069 + aa, abs(separation - .66));
    coarse *= 1.0 + fractured * (.21 * crest - .20 * split);

    // Lower joints are occluded. The two exposed shoulders roll into the cut.
    vec2 eroded = cut + (vec2(slab.x, chip.x) - .5) * vec2(.10, .10);
    float undercut = 1.0 - smoothstep(.018, .28, eroded.y);
    float heel = smoothstep(.69, 1.02, eroded.x);
    float shoulder = smoothstep(.06, .22, eroded.x) * (1.0 - smoothstep(.24, .46, eroded.x));
    float topLip = smoothstep(.62, .87, eroded.y) * (1.0 - smoothstep(.89, 1.0, eroded.y));
    // A broken planar change across the laid face, with a small bright rim above the cut.
    float cutAngle = mix(-.24, .22, chip.x);
    float ledge = eroded.y + (eroded.x - .5) * cutAngle - mix(.40, .59, slab.x);
    float ledgeLight = smoothstep(.006, .052, ledge) * (1.0 - smoothstep(.080, .23, ledge));
    float ledgeShade = smoothstep(-.18, -.065, ledge) * (1.0 - smoothstep(-.051, .008, ledge));
    float exposed = smoothstep(.11, .47, eroded.x) * (1.0 - smoothstep(.57, .91, eroded.x));
    float relief = .21 * shoulder + .23 * topLip - .20 * heel - .31 * undercut;
    relief += exposed * (.29 * ledgeLight - .22 * ledgeShade);
    coarse *= 1.0 + laidFace * relief;
    return coarse;
  }
`;

function stoneVertex(rows, index, fraction, inset) {
  const first = Math.floor(index), mix = index - first;
  const a = rows[first], b = rows[Math.min(first + 1, rows.length - 1)];
  const {lerp} = THREE.MathUtils;
  const x = lerp(a.x, b.x, mix), z = lerp(a.z, b.z, mix), depth = lerp(a.depth, b.depth, mix);
  const radius = Math.hypot(x, z);
  return new THREE.Vector3(x - x / radius * inset, -depth * fraction, z - z / radius * inset);
}

function sampleColumn(rows, widths, depths, across, drop) {
  const side = Math.max(0, widths.findIndex(value => value >= across) - 1);
  const row = Math.max(0, depths.findIndex(value => value >= drop) - 1);
  const u = (across - widths[side]) / (widths[side + 1] - widths[side]);
  const v = (drop - depths[row]) / (depths[row + 1] - depths[row]);
  const a = rows[row][side], b = rows[row][side + 1];
  const c = rows[row + 1][side + 1], d = rows[row + 1][side];
  // Sample the original two triangles, so the sculpt begins inside the existing facade.
  return u >= v ? a.clone().multiplyScalar(1 - u).addScaledVector(b, u - v).addScaledVector(c, v)
    : a.clone().multiplyScalar(1 - v).addScaledVector(c, u).addScaledVector(d, v - u);
}

function homeCliffGeometry(rows = cliffProfile(surface)) {
  const positions = [], colors = [], relief = [], cuts = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), exterior = new THREE.Vector3();
  function sunlight(a, b, c) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    exterior.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(exterior) < 0) faceNormal.negate();
    return Math.max(-.43, faceNormal.dot(SUN)) * .57;
  }
  function triangle(a, b, c, tint, tones, bias, fractions, region, sun = sunlight(a, b, c), cut) {
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.77 + sun + tones[i], .24, 1.44);
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + bias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      relief.push(-vertex.y, fractions[i], region);
      cuts.push(cut?.[i][0] ?? 0, cut?.[i][1] ?? 0, cut ? 1 : 0);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, from, to, bias = 0, region = 0, cut) {
    const sun = (sunlight(a, b, c) + sunlight(a, c, d)) / 2;
    const [left, right] = cut ?? [];
    triangle(a, b, c, tint, [upper, upper, lower], bias, [from, from, to], region, sun,
      cut && [[left, 1 - from], [right, 1 - from], [right, 1 - to]]);
    triangle(a, c, d, tint, [upper, lower, lower], bias, [from, to, to], region, sun,
      cut && [[left, 1 - from], [right, 1 - to], [left, 1 - to]]);
  }

  function carveColumn(grid, widths, depths, {rockDepth, block, span, turn, bevel}) {
    const courses = rockDepth > 2.35 ? [0, .34 + turn * .07, .69 + bevel * .063, 1] : [0, .52 + turn * .082, 1];
    const shoreClearance = .055;
    const relief = .62 + .38 * THREE.MathUtils.smoothstep(rockDepth, 1.45, 2.74);
    const range = (edge, u) => edge === 0 || edge === 1 ? edge : edge + (u - .5) * .12 * turn
      + .019 * Math.sin(u * 4.6 + edge * 9.4 + block * 1.73);
    for (let row = 0; row < courses.length - 1; row++) {
      const twoStones = (row === 1 && span > 3.3) || (row === 0 && span > 5.35 && block % 2 === 0);
      const columns = twoStones ? [0, .53 + Math.cos(block * 2.81 + row * 1.53) * .10, 1] : [0, 1];
      for (let column = 0; column < columns.length - 1; column++) {
        const seed = block * 2.37 + row * 1.29 + column * 4.91;
        // Keep a narrow apron of the original curved facade all around the sculpt.
        const left = columns[column] + (column === 0 ? shoreClearance : .031);
        const right = columns[column + 1] - (column === columns.length - 2 ? shoreClearance : .031);
        const toe = row === courses.length - 2 ? .098 + .044 * bevel : .032;
        const pigment = STONES[(block + row * 2 + column * 3) % STONES.length];
        const at = (uv, recess) => {
          const [u, v] = uv;
          const taper = v * toe;
          const across = THREE.MathUtils.lerp(left + taper, right - taper, u);
          const ceiling = range(courses[row], across) + (row === 0 ? shoreClearance : .012);
          const floor = range(courses[row + 1], across) - (row === courses.length - 2 ? shoreClearance : .017);
          const drop = THREE.MathUtils.lerp(ceiling, floor, v);
          const point = sampleColumn(grid, widths, depths, across, drop);
          // This axis is orthogonal to the view. Recesses change depth and normals, not the silhouette.
          const retreat = Math.min(recess * relief, Math.max(0, CLIFF_DEPTH + point.y) / LEGACY_DEPTH);
          point.y -= retreat * LEGACY_DEPTH;
          point.z -= retreat;
          return {point, drop, uv: [u, 1 - v]};
        };
        const outline = CUT_CORNERS.map(([u, v], i) => [
          THREE.MathUtils.clamp(u + .047 * Math.sin(seed + i * 2.25), 0, 1),
          THREE.MathUtils.clamp(v + .075 * Math.sin(seed * .71 + i * 1.73), 0, 1),
        ]);
        const rim = outline.map((uv, i) => at(uv, .23 + .044 * Math.cos(seed + i)));
        const shoulder = outline.map(([u, v], i) => at([.135 + .73 * u, .18 + .64 * v],
          .038 + .041 * (.5 + .5 * Math.sin(seed + i * 1.47))));
        const peak = at([.46 + .10 * Math.sin(seed), .51 + .105 * Math.cos(seed)], .006);
        function facet(a, b, c, tones) {
          triangle(a.point, b.point, c.point, pigment, tones, 0, [a.drop, b.drop, c.drop], 0, undefined,
            [a.uv, b.uv, c.uv]);
        }
        for (let i = 0; i < rim.length; i++) {
          const next = (i + 1) % rim.length;
          const upper = (rim[i].uv[1] + rim[next].uv[1]) * .5;
          const edgeTone = -.12 + upper * .25;
          facet(rim[i], rim[next], shoulder[next], [edgeTone - .07, edgeTone - .07, edgeTone + .055]);
          facet(rim[i], shoulder[next], shoulder[i], [edgeTone - .07, edgeTone + .055, edgeTone + .055]);
          facet(peak, shoulder[i], shoulder[next], [.065, edgeTone * .34, edgeTone * .34]);
        }
      }
    }
  }

  // A continuous dark bed shows only where separate columns taper away from one another.
  const nearEnd = (rows.length - 1) / 2;
  for (let i = 0; i < nearEnd; i++) {
    if (Math.max(rows[i].depth, rows[i + 1].depth) <= APPROACH_DEPTH + .025) continue;
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), BEDROCK, .03, -.18, 0, 1, -.67);
  }

  for (const [first, last] of ROCKY_ARCS) {
    for (let start = first, block = first; start < last; block++) {
      const end = Math.min(last, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length]);
      const turn = Math.sin(block * 2.17), bevel = Math.cos(block * 2.43);
      const pigment = STONES[block % STONES.length];
      const across = [0, .18 + turn * .075, .76 + bevel * .085, 1];
      const split = .66 + bevel * .13;
      const face = [
        [0, .16, .21], [.12 - bevel * .05, .02, .27], [split, .005, -.06],
        [.88 + turn * .035, .04, -.12], [1, .25, -.25],
      ];
      // A column keeps a broad main face. Its shoulders alternate in width and the foot fans out.
      const point = (level, side) => {
        const [drop, inset] = face[level], u = across[side];
        const joint = side === 0 || side === 3;
        const crease = Math.sin(block * 2.3 + level * 1.6 + u * 1.8);
        const edgeCut = joint ? .21 + .06 * bevel + .075 * crease : 0;
        const lean = (drop - .2) * turn * .43 + crease * (joint ? .19 : .075);
        const sample = THREE.MathUtils.clamp(THREE.MathUtils.lerp(start, end,
          THREE.MathUtils.lerp(.015, .985, u)) + lean, first, last);
        return stoneVertex(rows, sample, drop, inset + edgeCut);
      };
      const middle = (start + end) / 2;
      const rockDepth = THREE.MathUtils.lerp(rows[Math.floor(middle)].depth, rows[Math.ceil(middle)].depth, middle % 1);
      const sculpted = rockDepth > 1.45 && end - start > 2.15;
      const seam = sculpted ? pigment.clone().lerp(BEDROCK, .28 + .30 * THREE.MathUtils.smoothstep(rockDepth, 1.45, 2.74)) : pigment;
      const grid = face.map((_, level) => across.map((_, side) => point(level, side)));
      for (let level = 0; level < face.length - 1; level++) {
        const [from, , upper] = face[level], [to, , lower] = face[level + 1];
        for (let side = 0; side < across.length - 1; side++) {
          const tone = [-.04, .045, -.17][side];
          panel(grid[level][side], grid[level][side + 1], grid[level + 1][side + 1], grid[level + 1][side],
            seam, upper + tone, lower + tone, from, to, sculpted ? -.53 : 0, 0,
            sculpted ? undefined : [across[side], across[side + 1]]);
        }
      }
      if (sculpted) carveColumn(grid, across, face.map(([drop]) => drop), {rockDepth, block, span: end - start, turn, bevel});

      if (rockDepth > 1.8 && end - start > 1.8) {
        // Individual low stones break the foot of the columns. Water softens their edges and colour.
        const half = Math.min(1.55, (end - start) * .32), toe = middle + .32 * turn;
        const inset = -.24 - (.13 + .10 * bevel);
        const top = stoneVertex(rows, toe, 1.07, inset * .78);
        const left = stoneVertex(rows, toe - half, 1.29, inset);
        const right = stoneVertex(rows, toe + half, 1.33, inset - .16);
        const ridge = stoneVertex(rows, toe, 1.34, inset - .46);
        const foot = stoneVertex(rows, toe - .22 * turn, 1.55 + bevel * .11, inset - .51);
        function underwaterFace(a, b, c, tones, depths) {
          // The outline disappears into the shallows around the raised centre of each stone.
          const coverage = [a, b, c].map(point => [point === ridge ? 1 : 0, 0]);
          triangle(a, b, c, SUBMERGED_STONE, tones, -.43, depths, 1, undefined, coverage);
        }
        underwaterFace(left, top, ridge, [-.08, .41, .15], [.48, 0, .36]);
        underwaterFace(top, right, ridge, [.41, -.1, .065], [0, .54, .36]);
        underwaterFace(left, ridge, foot, [-.08, .10, -.3], [.48, .36, 1]);
        underwaterFace(ridge, right, foot, [.055, -.1, -.3], [.36, .54, 1]);

        // Grass rolls back into the meadow above short, independent stone shoulders.
        // The low seam next to an interior terrace remains clear for its own rockwork.
        const fromTerrace = Math.min(...TERRACE_ARCS.map(([left, right]) => Math.max(0, left - middle, middle - right)));
        if (fromTerrace > 1.4) {
          const capHeight = .54 + THREE.MathUtils.smoothstep(fromTerrace, 1.4, 4.3) * (.76 + .12 * bevel);
          const turfDepth = .81 + .15 * turn;
          const crest = [[.034, 0], [.11, .38], [.25, .69], [.43, 1], [turfDepth, .94], [turfDepth + .45, .42], [turfDepth + .69, 0]];
          const cut = THREE.MathUtils.lerp(start, end, .47 + turn * .10);
          const shoulders = end - start > 3.5 ? [[start, cut], [cut, end]] : [[start, end]];
          for (const [piece, [from, to]] of shoulders.entries()) {
            const lean = Math.sin(block * 1.71 + piece * 2.43);
            const faceStone = STONES[(block + piece * 2) % STONES.length];
            const cap = crest.map(([inset, rise], level) => across.map((u, side) => {
              const outer = side === 0 || side === 3;
              const tuck = outer ? .21 + .095 * Math.sin(level + side + lean) : 0;
              const sample = THREE.MathUtils.lerp(from + .095, to - .095, u);
              const height = capHeight * rise * (outer ? .50 + .074 * lean : 1 + .07 * lean * (level - 2));
              return stoneVertex(rows, sample, -height / rockDepth, inset + tuck);
            }));
            for (let level = 0; level < crest.length - 1; level++) {
              const grass = level >= 2, baseTone = [-.18, .17, .14, .08, -.055, -.105][level];
              for (let side = 0; side < across.length - 1; side++) {
                const tone = [-.13, .08, -.18][side] + .08 * lean;
                panel(cap[level][side], cap[level][side + 1], cap[level + 1][side + 1], cap[level + 1][side],
                  grass ? TURF : faceStone, baseTone + tone, baseTone + tone - .085, level, level + 1, .9, grass ? 3 : 2,
                  grass ? [across[side], across[side + 1]] : undefined);
              }
            }
          }
        }
      }
      start = end;
    }
  }

  // Broken boulder clusters frame the sandy cove. Their bases stay on the old top, outside
  // the entrance lane, and their bevels cast enough contrast to read beside the larger cliff.
  const boulders = [
    {sample: 33.9, radius: 1.33, inset: .67, height: 1.87, pigment: OUTCROP},
    {sample: 35.2, radius: .69, inset: .61, height: .75, pigment: STONES[5]},
    {sample: 55.1, radius: 1.21, inset: .67, height: 1.75, pigment: OUTCROP},
    {sample: 53.9, radius: .64, inset: .56, height: .68, pigment: STONES[3]},
    {sample: 21.7, radius: 1.65, inset: .13, height: 1.49, foot: .99, pigment: OUTCROP},
    {sample: 26.1, radius: 1.43, inset: .14, height: 1.21, foot: .98, pigment: STONES[1]},
    {sample: 61.5, radius: 1.71, inset: .16, height: 1.46, foot: .98, pigment: OUTCROP},
    {sample: 71.9, radius: 1.32, inset: .15, height: 1.26, foot: .99, pigment: STONES[1]},
  ];
  const outline = [[-.85, -.43], [.13, -.60], [.94, -.31], [.82, .31], [.21, .58], [-.68, .50]];
  const rings = [
    {scale: 1.03, level: 0, lean: 0, highlight: -.23},
    {scale: 1, level: .22, lean: 0, highlight: -.10},
    {scale: .78, level: .82, lean: -.08, highlight: .045},
    {scale: .54, level: .99, lean: -.13, highlight: .23},
  ];
  for (const {sample, radius, inset, height, foot = 0, pigment} of boulders) {
    const coastDepth = stoneVertex(rows, sample, -1, inset).y;
    const region = foot > 0 ? 0 : 2, bias = 1.32;
    const crownDepth = foot * .38;
    const rim = rings.map(({scale, level, lean}) => outline.map(([arc, reach]) =>
      stoneVertex(rows, sample + (arc * scale + lean) * radius,
        foot - height * (level + level * .079 * reach) / coastDepth, Math.max(.035, inset + reach * scale))));
    for (let ring = 0; ring < rim.length - 1; ring++) {
      const {highlight: upper} = rings[ring], {highlight: lower} = rings[ring + 1];
      for (let edge = 0; edge < outline.length; edge++) {
        const next = (edge + 1) % outline.length;
        panel(rim[ring][edge], rim[ring][next], rim[ring + 1][next], rim[ring + 1][edge],
          pigment, upper, lower, foot * (1 - rings[ring].level * .62), foot * (1 - rings[ring + 1].level * .62), bias, region);
      }
    }
    const peak = stoneVertex(rows, sample - .13 * radius, foot - height / coastDepth, inset + .11);
    const crown = rim[rim.length - 1];
    for (let edge = 0; edge < outline.length; edge++) {
      triangle(crown[edge], crown[(edge + 1) % outline.length], peak, pigment, [.18, .19, .25], bias,
        [crownDepth, crownDepth, crownDepth], region);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('shoreRelief', new THREE.Float32BufferAttribute(relief, 3));
  geometry.setAttribute('shoreCut', new THREE.Float32BufferAttribute(cuts, 3));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 shoreRelief;
      attribute vec3 shoreCut;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      varying vec3 vShoreCut;
      void main() {
        vReliefPoint = position.xy;
        vStone = color;
        vShoreRelief = shoreRelief;
        vShoreCut = shoreCut;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      ${sandstoneFinishGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      varying vec3 vShoreCut;
      void main() {
        vec2 logical = unprojectGround(vReliefPoint);
        vec2 shore = logical / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        vec2 layers = vec2(logical.x + logical.y * .26, -vShoreRelief.x + logical.y * .12);
        // Preserve all of the visible, playable upper beach, including the existing shallow coves.
        vec4 rock = texture2D(uCoastArt, vec2(logical.x / 64.0, -logical.y * ${LEGACY_DEPTH} / 48.0) + .5);
        float sandPigment = smoothstep(.065, .24, rock.r - rock.g);
        if (vShoreRelief.z > 1.5) {
          if (length(shore) > rim || rock.a < .78) discard;
          float height = -vShoreRelief.x;
          float opacity = smoothstep(.015, .24, height);
          if (opacity < .02) discard;
          float pore = sandstoneGrain(logical * vec2(14.0, 17.0)).x - .5;
          float weather = sandstoneGrain(logical * vec2(2.8, 4.0)).x - .5;
          if (vShoreRelief.z > 2.5) {
            float green = smoothstep(1.13, 1.44, (rock.g + .01) / (rock.r + .01));
            // Paint the shoulder into the existing lawn at both ends and along its inward slope.
            // The closed cap and its original alpha still cover the same pixels.
            float across = vShoreCut.x;
            float ends = smoothstep(.0, .27, across) * (1.0 - smoothstep(.73, 1.0, across));
            float inner = smoothstep(3.10, 5.65, vShoreRelief.y);
            float crest = 1.0 - smoothstep(2.95, 4.68, vShoreRelief.y);
            vec3 turf = mix(vStone, rock.rgb, green * .68);
            turf = mix(turf, rock.rgb * (1.0 + crest * .16), green * .67);
            turf *= 1.01 + pore * .09 + weather * .14;
            float seam = green * (1.0 - ends * (1.0 - inner));
            gl_FragColor = vec4(mix(turf, rock.rgb, seam), opacity);
          } else {
            vec3 shoulder = cutSandstone(vStone * (.95 + weather * .24), layers, vec2(.5), 0.0);
            // Let the ground's sand colour collect in the foot of the same raised shoulder.
            float silt = sandPigment * (1.0 - smoothstep(.12, .68, height + weather * .23));
            shoulder = mix(shoulder, rock.rgb * (.93 + pore * .10), .91 * silt);
            gl_FragColor = vec4(shoulder, opacity);
          }
          #include <colorspace_fragment>
          return;
        }
        if (length(shore) < rim * 1.003) discard;
        if (vShoreRelief.z > .5) {
          if (rock.a >= .5) discard;
          float depth = vShoreRelief.y;
          float wave = sin(logical.x * 6.0 + logical.y * 3.0 + sin(logical.y * 4.2)) * .045;
          float opacity = (1.0 - smoothstep(.25, 1.0, depth + wave)) * .47;
          opacity *= 1.0 - smoothstep(.13, .5, rock.a);
          opacity *= smoothstep(.04, .74, vShoreCut.x);
          if (opacity < .01) discard;
          float surfaceLight = .88 + wave * 2.0;
          gl_FragColor = vec4(vStone * surfaceLight, opacity);
          #include <colorspace_fragment>
          return;
        }
        if (rock.a < .78) discard;
        float grain = dot(rock.rgb, vec3(.30, .59, .11));
        float rockGrain = smoothstep(.06, .46, grain);
        float depth = vShoreRelief.y;
        float grainBreak = sin(logical.x * 1.74 + logical.y * .83) * .14
          + cos(logical.x * 4.23 - logical.y * 3.23) * .07;
        float damp = smoothstep(.53, 1.0, depth + grainBreak) * smoothstep(.45, 1.7, vShoreRelief.x);
        vec3 stone = vStone * (mix(.86, 1.13, rockGrain) + grainBreak * .13);
        stone = cutSandstone(stone, layers, vShoreCut.xy, vShoreCut.z);
        float cap = (1.0 - smoothstep(.07, .28, depth)) * smoothstep(.11, .51, dot(vStone, vec3(.30, .58, .12)));
        stone = mix(stone, stone * vec3(1.19, 1.09, 1.02), cap);
        float overhang = (1.0 - smoothstep(.001, .082, depth)) * vShoreCut.z;
        stone *= 1.0 - overhang * .28;
        float moss = smoothstep(.62, .84, rockGrain + grainBreak * .7)
          * (1.0 - smoothstep(.04, .26, depth)) * .52;
        stone = mix(stone, stone * vec3(.82, 1.05, .67), moss);
        stone = mix(stone, stone * vec3(.48, .65, .74) + vec3(.007, .025, .039), damp * .82);
        float tide = smoothstep(.67, .84, depth + grainBreak) * (1.0 - smoothstep(.85, .99, depth)) * damp;
        stone += tide * vec3(.006, .020, .023);
        float settledSand = sandPigment * (1.0 - smoothstep(.15, .78, vShoreRelief.x + grainBreak));
        gl_FragColor = vec4(mix(stone, rock.rgb, .10 + .59 * settledSand), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(homeCliffGeometry(), material);
  mesh.name = 'home-coast-relief';
  mesh.renderOrder = 4.5;
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}
