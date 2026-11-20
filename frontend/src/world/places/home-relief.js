// Rock relief is presentation only. Dry stone follows the approved painted coast mask.
import * as THREE from 'three';
import {APPROACH_DEPTH, CLIFF_DEPTH, cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const STONES = ['#c69e71', '#d1ae7c', '#bda081', '#ba9068', '#d3ad7d', '#b29d81'].map(color => new THREE.Color(color));
const BEDROCK = new THREE.Color('#6a5644');
const OUTCROP = new THREE.Color('#b8a78b');
const SUBMERGED_STONE = new THREE.Color('#66887c');
const TURF = new THREE.Color('#91b949');
const BLOCK_WIDTHS = [3.30, 4.60, 3.85, 2.95, 4.95, 3.57, 4.17];
const ROCKY_ARCS = [[9, 36], [54, 81]];
// The two front headlands are groups of unequal slabs. Each spans part of the old
// coast profile with a crown, foot, sideways lean, and sandstone palette index.
const HEADLANDS = [
  [11.5, 16.7, .13, .90, -.47, 1],
  [17.35, 23.8, .015, .74, .38, 5],
  [16.5, 21.8, .70, .98, -.30, 3],
  [24.35, 29.4, .03, .88, -.68, 2],
  [29.1, 32.3, .19, .98, .71, 4],
  [32.3, 34.4, .31, .90, -.31, 5],
  [55.7, 59.4, .20, .97, .54, 1],
  [59.65, 64.2, .05, .80, -.46, 5],
  [60.9, 67.2, .71, 1, .24, 3],
  [64.60, 68.1, .07, .87, .62, 2],
  [68.6, 71.25, .08, 1, -.18, 1],
  [72, 78.6, .12, .83, -1.45, 4],
];
const HEADLAND_BEDS = [[11.1, 34.7], [55.2, 79.1]];
const RECESSED_BED = .25;
const TERRACE_ARCS = [[25, 34], [55, 67]];
const REAR_STONE = 4, REAR_TURF = 5;
// Separate shoulders root the existing high shelves in the rear coast. The
// central landing remains open between the western and eastern groups.
const REAR_HEADLANDS = [
  {from: 119.6, to: 123.7, reach: 1.48, height: 1.04, lean: .17, stone: 3, grass: false},
  {from: 121.7, to: 127.2, reach: 2.05, height: 1.82, lean: -.15, stone: 5, grass: true},
  {from: 145.95, to: 151.75, reach: 1.02, height: 1.76, footTurn: .33, landingCut: .66, lean: -.14, stone: 2, grass: true},
  {from: 148.8, to: 152.55, reach: 1.41, height: 1.03, lean: -.18, stone: 5, grass: false},
];
const REAR_OUTLINE = [[0, .39], [.19, .064], [.55, 0], [.85, .16], [1, .49], [.88, .85], [.59, 1], [.16, .82]];
// Above-ground turf clearances for the southeast and southwest wall footings.
const WALL_FOOTING_ARCS = [[21, 25], [71, 74.5]];
const CUT_CORNERS = [[.09, .02], [.56, 0], [.84, .035], [1, .21], [.98, .75], [.83, .97],
  [.43, 1], [.12, .93], [0, .74], [.018, .24]];
const surface = surfaces.home_islet;
const SUN = new THREE.Vector3(-.61, .71, .30).normalize();

/** Share sunlight across a stone's connected faces so each bevel rolls into the crown. */
export function averageStoneLight(faces, pointOf, sunlight) {
  const corners = new Map();
  for (const face of faces) {
    const light = sunlight(...face.map(pointOf));
    for (const corner of face) {
      const result = corners.get(corner) ?? {sum: 0, count: 0};
      result.sum += light;
      result.count++;
      corners.set(corner, result);
    }
  }
  return new Map(Array.from(corners, ([corner, {sum, count}]) => [corner, sum / count]));
}

function clearShoulderSpans(shoulders) {
  for (const [left, right] of WALL_FOOTING_ARCS) {
    shoulders = shoulders.flatMap(([start, end]) => {
      if (end <= left || start >= right) return [[start, end]];
      return [[start, left], [right, end]].filter(([from, to]) => to - from > .5);
    });
  }
  return shoulders;
}

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
    float grainLight = clamp(dot(slab.yz, vec2(-.105, .16)) + dot(chip.yz, vec2(-.052, .070)), -.23, .30);
    float deposit = smoothstep(.23, .78, slab.x * .79 + chip.x * .21);
    vec3 coarse = base * ((.85 + deposit * .27) * (1.0 + grainLight));

    // Weathered layers catch the sun along their broken upper edge.
    float phase = point.y * 1.42 + point.x * .14 + slab.x * .36;
    float separation = fract(phase);
    float aa = min(.10, fwidth(phase));
    float fractured = smoothstep(.45, .74, slab.x * .80 + chip.x * .20);
    float split = 1.0 - smoothstep(.050, .139 + aa, abs(separation - .52));
    float crest = 1.0 - smoothstep(.021, .069 + aa, abs(separation - .66));
    coarse *= 1.0 + fractured * (.13 * crest - .12 * split);

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

export const weatheredSandstoneGlsl = /* glsl */`
  vec3 weatheredSandstone(vec3 base, vec2 point, vec2 cut, float face) {
    vec3 bed = sandstoneGrain(point * vec2(.85, 1.60));
    vec3 dust = sandstoneGrain(point * vec2(5.6, 8.8) + vec2(.73, .62));
    float weathering = (bed.x - .5) * .29 + (dust.x - .5) * .14;
    float pore = dot(dust.yz, vec2(-.031, .045));
    vec2 bevel = (cut - .5) * 2.0 + (vec2(bed.x, dust.x) - .5) * .11;
    vec2 curve = bevel * (.28 + .72 * bevel * bevel);
    float sun = dot(curve, vec2(-.21, .24));
    float shadow = smoothstep(.55, 1.01, -bevel.y);
    // Rounded faces catch a wide highlight. Weathered beds leave a shallow broken line.
    float level = point.y * 1.37 + point.x * .087 + bed.x * .29;
    float stratum = fract(level);
    float seam = abs(stratum - .43);
    float edge = min(.24, fwidth(level));
    float fractured = smoothstep(.27, .69, bed.x * .78 + dust.x * .22);
    float layer = (1.0 - smoothstep(.017, .093 + edge, seam)) * fractured;
    float bedRim = smoothstep(.44, .52, stratum) * (1.0 - smoothstep(.56, .735, stratum)) * fractured;
    float iron = smoothstep(.27, .67, bed.x + .16 * bedRim);
    vec3 pigment = base * mix(vec3(.942, .979, 1.017), vec3(1.09, 1.02, .901), iron);
    vec3 finish = pigment * (1.024 + weathering + pore + .12 * bedRim - .13 * layer
      + face * (sun - .16 * shadow));
    return mix(finish, finish * vec3(1.13, 1.04, .947), face * max(0.0, sun) * 1.54);
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
      const rear = region >= REAR_STONE;
      const display = projectGround(vertex.x, rear ? vertex.z : vertex.z - vertex.y / LEGACY_DEPTH);
      if (rear) display.y += vertex.y;
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + bias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      relief.push(-vertex.y, fractions[i], region);
      cuts.push(cut?.[i][0] ?? 0, cut?.[i][1] ?? 0, cut ? 1 : 0);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, from, to, bias = 0, region = 0, cut, bedLight) {
    const sun = bedLight ?? (sunlight(a, b, c) + sunlight(a, c, d)) / 2;
    const [left, right] = cut ?? [];
    triangle(a, b, c, tint, [upper, upper, lower], bias, [from, from, to], region, sun,
      cut && [[left, 1 - from], [right, 1 - from], [right, 1 - to]]);
    triangle(a, c, d, tint, [upper, lower, lower], bias, [from, to, to], region, sun,
      cut && [[left, 1 - from], [right, 1 - to], [left, 1 - to]]);
  }

  function carveColumn(grid, widths, depths, {rockDepth, block, span, turn, bevel}) {
    // Broad foundation slabs carry smaller exposed shelves. Vary the break between neighboring columns.
    const courses = rockDepth > 1.84 ? [0, .39 + turn * .105, 1] : [0, 1];
    const shoreClearance = .032;
    const relief = .62 + .38 * THREE.MathUtils.smoothstep(rockDepth, 1.45, 2.74);
    const range = (edge, u) => edge === 0 || edge === 1 ? edge : edge + (u - .5) * .15 * turn
      + .025 * Math.sin(u * 5.2 + edge * 9.4 + block * 1.73);
    for (let row = 0; row < courses.length - 1; row++) {
      const twoStones = courses.length > 2 && span > 3.4 && (row === 0 ? bevel > -.36 : turn < -.6);
      const columns = twoStones ? [0, .53 + Math.cos(block * 2.81 + row * 1.53) * .16, 1] : [0, 1];
      for (let column = 0; column < columns.length - 1; column++) {
        const seed = block * 2.37 + row * 1.29 + column * 4.91;
        // The narrow weathered bedding stays visible between the face of each slab.
        const left = columns[column] + (column === 0 ? shoreClearance : .014);
        const right = columns[column + 1] - (column === columns.length - 2 ? shoreClearance : .014);
        const toe = row === courses.length - 2 ? .086 + .051 * bevel : .025;
        const pigment = STONES[(block + row * 2 + column * 3) % STONES.length];
        const at = (uv, recess) => {
          const [u, v] = uv;
          const taper = v * toe;
          const across = THREE.MathUtils.lerp(left + taper, right - taper, u);
          const ceiling = range(courses[row], across) + (row === 0 ? shoreClearance : .009);
          const floor = range(courses[row + 1], across) - (row === courses.length - 2 ? shoreClearance : .011);
          const drop = THREE.MathUtils.lerp(ceiling, floor, v);
          const point = sampleColumn(grid, widths, depths, across, drop);
          // This axis is orthogonal to the view. Recesses change depth and normals, not the silhouette.
          const retreat = Math.min(recess * relief, Math.max(0, CLIFF_DEPTH + point.y) / LEGACY_DEPTH);
          point.y -= retreat * LEGACY_DEPTH;
          point.z -= retreat;
          return {point, drop, uv: [u, 1 - v]};
        };
        const outline = CUT_CORNERS.map(([u, v], i) => [
          THREE.MathUtils.clamp(u + .034 * Math.sin(seed + i * 2.25), 0, 1),
          THREE.MathUtils.clamp(v + .058 * Math.sin(seed * .71 + i * 1.73), 0, 1),
        ]);
        const rim = outline.map(([u, v], i) => at([u, v], .27 + .095 * v + .052 * Math.cos(seed + i)));
        const bevelWidth = .21 + bevel * .065;
        const shoulder = outline.map(([u, v], i) => at([bevelWidth + (.86 - bevelWidth) * u, .22 + .60 * v],
          .031 + .058 * v + .041 * (.5 + .5 * Math.sin(seed + i * 1.47))));
        const center = at([.50 + .13 * Math.sin(seed), .49 + .13 * Math.cos(seed)], .006);
        const facets = [];
        for (let i = 0; i < rim.length; i++) {
          const next = (i + 1) % rim.length;
          facets.push([rim[i], rim[next], shoulder[next]], [rim[i], shoulder[next], shoulder[i]],
            [center, shoulder[i], shoulder[next]]);
        }
        const daylight = averageStoneLight(facets, corner => corner.point, sunlight);
        const lip = new Set(rim);
        for (const [a, b, c] of facets) {
          const tones = [a, b, c].map(corner => daylight.get(corner) * .91 + (corner.uv[1] - .44) * .22
            - (lip.has(corner) ? .088 : 0));
          triangle(a.point, b.point, c.point, pigment, tones, 0, [a.drop, b.drop, c.drop], 0, 0, [a.uv, b.uv, c.uv]);
        }
      }
    }
  }

  function carveHeadland([from, to, top, foot, lean, pigment]) {
    const tint = STONES[pigment].clone().lerp(OUTCROP, .56);
    const outline = [[.10, .11], [.52, .025], [.80, .07], [.97, .25],
      [.94, .72], [.80, .925], [.37, 1], [.14, .90], [.025, .61], [0, .29]];
    const point = (u, v, inset, retreat, grade) => {
      const taper = .07 * v * v;
      const along = THREE.MathUtils.lerp(taper, 1 - taper, u);
      const sample = THREE.MathUtils.clamp(THREE.MathUtils.lerp(from, to, along) + lean * (v - .43), from, to);
      const depth = THREE.MathUtils.lerp(top + .10 * (1 - u) + .06 * lean * u, foot, v);
      const position = stoneVertex(rows, sample, depth, inset);
      // Keep the outer projection on the old face while changing each rock's bevel normals.
      const recess = Math.min(retreat, (CLIFF_DEPTH + position.y) / LEGACY_DEPTH);
      position.y -= recess * LEGACY_DEPTH;
      position.z -= recess;
      return {position, depth, grade, cut: [u, 1 - v]};
    };
    const joints = outline.map(([u, v]) => point(u, v, .12 + .12 * v, .31 + .12 * v, -.10));
    const shoulder = .14 + (lean + 1) * .09;
    const face = outline.map(([u, v]) => point(
      THREE.MathUtils.lerp(shoulder, .83 + lean * .09, u),
      .35 + v * .49 + (u - .5) * lean * .21, .025 + .042 * v, .04 + .06 * u, .025,
    ));
    const crown = point(.50 + lean * .105, .49, .025, .02, .035);
    const facets = [];
    for (let edge = 0; edge < joints.length; edge++) {
      const next = (edge + 1) % joints.length;
      const ledge = [.26, .29, .15, -.10, -.14, -.08, -.055, -.045, .075, .15][edge];
      facets.push({corners: [joints[edge], joints[next], face[next]], ledge},
        {corners: [joints[edge], face[next], face[edge]], ledge},
        {corners: [crown, face[edge], face[next]], ledge: -.02});
    }
    const daylight = averageStoneLight(facets.map(({corners}) => corners), corner => corner.position, sunlight);
    for (const {corners, ledge} of facets) {
      const [a, b, c] = corners.map(corner => corner.position);
      const light = sunlight(a, b, c) * .34;
      const tones = corners.map(corner => corner.grade + daylight.get(corner) * .66 + ledge);
      triangle(a, b, c, tint, tones, .21, corners.map(corner => corner.depth), 0, light,
        corners.map(corner => corner.cut));
    }
  }

  function carveRearHeadland({from, to, reach, height, lean, stone, grass, footTurn = 0, landingCut = 0}) {
    const color = STONES[stone].clone().lerp(OUTCROP, .65).lerp(BEDROCK, .12);
    const center = stoneVertex(rows, (from + to) * .5, 0, reach * .49);
    center.y = height * .42;
    const tiers = [
      [1, 1, 0, -.22], [.97, .96, .20, -.11], [.84, .76, .55, -.04],
      [.62, .59, .90, .065], [.43, .47, 1, .14],
    ];
    const point = (along, across, rise, grade) => {
      const sample = THREE.MathUtils.lerp(from, to, THREE.MathUtils.clamp(along, 0, 1));
      // The eastern toe tapers towards the wall sockets while its seaward heel
      // supports the whole rock face above the saddle.
      const taper = landingCut * (1 - THREE.MathUtils.smoothstep(along, .38, .60));
      const vertex = stoneVertex(rows, sample, 0, .10 + across * reach * (1 - taper));
      const shoulder = 1 - THREE.MathUtils.smoothstep(Math.abs(along - .50 - lean), .05, .48);
      vertex.y = height * rise * (.42 + .58 * shoulder) * (1 + .12 * Math.sin(along * 9.2 + lean));
      return {vertex, grade, cut: [along, rise]};
    };
    const rings = tiers.map(([length, width, rise, grade]) => {
      return REAR_OUTLINE.map(([u, v], i) => {
        const foot = footTurn * (1 - rise) ** 2 * THREE.MathUtils.smoothstep(v, .34, .82);
        return point(
          .5 + (u - .5) * length * (1 - foot) + foot * .5 + lean * rise * rise + .04 * rise * Math.sin(i * 3.1 + rise * 7),
          .47 + (v - .47) * width + rise * (.052 * v + .084 * Math.cos(i * 2.9 + rise * 5)),
          rise * (1 + .115 * Math.sin(v * 7.2 + u * 4 + lean)), grade,
        );
      });
    });
    const facets = [];
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const [lower, upper] = [rings[ring], rings[ring + 1]];
      for (let i = 0; i < lower.length; i++) {
        const next = (i + 1) % lower.length;
        const layer = grass && ring === rings.length - 2 && i < 6 ? REAR_TURF : REAR_STONE;
        facets.push({points: [lower[i], lower[next], upper[next]], layer},
          {points: [lower[i], upper[next], upper[i]], layer});
      }
    }
    const top = rings.at(-1), peak = point(.5 + lean, .48, .995, .15);
    for (let i = 0; i < top.length; i++) {
      facets.push({points: [top[i], top[(i + 1) % top.length], peak], layer: grass ? REAR_TURF : REAR_STONE});
    }
    const light = (a, b, c) => {
      faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      exterior.copy(a).add(b).add(c).addScaledVector(center, -3);
      if (faceNormal.dot(exterior) < 0) faceNormal.negate();
      return Math.max(-.53, faceNormal.dot(SUN)) * .49;
    };
    const daylight = averageStoneLight(facets.map(({points}) => points), vertex => vertex.vertex, light);
    for (const {points, layer} of facets) {
      const [a, b, c] = points.map(corner => corner.vertex);
      const tones = points.map(corner => corner.grade + daylight.get(corner) * .58);
      triangle(a, b, c, layer === REAR_TURF ? TURF : color, tones, .67, [0, 0, 0], layer,
        light(a, b, c) * .40, points.map(corner => corner.cut));
    }
  }

  const isHeadland = sample => HEADLAND_BEDS.some(([from, to]) => sample >= from && sample <= to);
  // A continuous dark bed shows only where separate columns taper away from one another.
  const nearEnd = (rows.length - 1) / 2;
  for (let i = 0; i < nearEnd; i++) {
    if (Math.max(rows[i].depth, rows[i + 1].depth) <= APPROACH_DEPTH + .025) continue;
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), BEDROCK, .03, -.18, 0, 1, -.67,
      isHeadland(i + .5) ? RECESSED_BED : 0);
  }

  for (const [first, last] of ROCKY_ARCS) {
    for (let start = first, block = first; start < last; block++) {
      const end = Math.min(last, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length]);
      const turn = Math.sin(block * 2.17), bevel = Math.cos(block * 2.43);
      const pigment = STONES[block % STONES.length];
      const across = [0, .19 + turn * .095, .77 + bevel * .083, 1];
      const split = .74 + bevel * .09;
      const face = [
        [0, .15, .26], [.12 - bevel * .05, .02, .23], [split, .045, -.045],
        [.91 + turn * .027, .05, -.16], [1, .23, -.22],
      ];
      // A column keeps a broad main face. Its shoulders alternate in width and the foot fans out.
      const point = (level, side) => {
        const [drop, inset] = face[level], u = across[side];
        const joint = side === 0 || side === 3;
        const crease = Math.sin(block * 2.3 + level * 1.6 + u * 1.8);
        const edgeCut = joint ? .27 + .078 * bevel + .087 * crease : 0;
        const lean = (drop - .2) * turn * .43 + crease * (joint ? .19 : .075);
        const sample = THREE.MathUtils.clamp(THREE.MathUtils.lerp(start, end,
          THREE.MathUtils.lerp(.015, .985, u)) + lean, first, last);
        return stoneVertex(rows, sample, drop, inset + edgeCut);
      };
      const middle = (start + end) / 2;
      const rockDepth = THREE.MathUtils.lerp(rows[Math.floor(middle)].depth, rows[Math.ceil(middle)].depth, middle % 1);
      const headland = isHeadland(middle);
      const sculpted = !headland && rockDepth > 1.45 && end - start > 2.15;
      const recessed = headland || sculpted;
      const seam = recessed ? pigment.clone().lerp(BEDROCK, .21 + .20 * THREE.MathUtils.smoothstep(rockDepth, 1.45, 2.74)) : pigment;
      const grid = face.map((_, level) => across.map((_, side) => point(level, side)));
      // The recess is continuous behind the sculpted faces. Share light across its narrow seams.
      const bedLight = recessed ? sunlight(grid[1][1], grid[1][2], grid[2][2]) * .72 : undefined;
      for (let level = 0; level < face.length - 1; level++) {
        const [from, , upper] = face[level], [to, , lower] = face[level + 1];
        for (let side = 0; side < across.length - 1; side++) {
          const tone = [.04, .018, -.105][side];
          panel(grid[level][side], grid[level][side + 1], grid[level + 1][side + 1], grid[level + 1][side],
            seam, upper + tone, lower + tone, from, to, recessed ? -.53 : 0, headland ? RECESSED_BED : 0,
            recessed ? undefined : [across[side], across[side + 1]], bedLight);
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
          for (const [piece, [from, to]] of clearShoulderSpans(shoulders).entries()) {
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

  HEADLANDS.forEach(carveHeadland);
  REAR_HEADLANDS.forEach(carveRearHeadland);
  // Broken boulder clusters frame the sandy cove. Their bases stay on the old top, outside
  // the entrance lane, and their bevels cast enough contrast to read beside the larger cliff.
  const boulders = [
    {sample: 33.9, radius: 1.33, inset: .67, height: 1.87, pigment: OUTCROP},
    {sample: 35.2, radius: .69, inset: .61, height: .75, pigment: STONES[5]},
    {sample: 55.1, radius: 1.21, inset: .67, height: 1.75, pigment: OUTCROP},
    {sample: 53.9, radius: .64, inset: .56, height: .68, pigment: STONES[3]},
  ];
  const outline = [[-.85, -.43], [.13, -.60], [.94, -.31], [.82, .31], [.21, .58], [-.68, .50]];
  const rings = [
    {scale: 1.03, level: 0, lean: 0, highlight: -.23},
    {scale: 1, level: .22, lean: 0, highlight: -.10},
    {scale: .78, level: .82, lean: -.08, highlight: .045},
    {scale: .54, level: .99, lean: -.13, highlight: .23},
  ];
  for (const {sample, radius, inset, height, pigment} of boulders) {
    const coastDepth = stoneVertex(rows, sample, -1, inset).y;
    const rim = rings.map(({scale, level, lean}) => outline.map(([arc, reach]) =>
      stoneVertex(rows, sample + (arc * scale + lean) * radius,
        -height * (level + level * .079 * reach) / coastDepth, Math.max(.035, inset + reach * scale))));
    const levels = rim.map((rock, i) => rock.map(point => ({point, grade: rings[i].highlight})));
    const facets = [];
    for (let ring = 0; ring < levels.length - 1; ring++) {
      const upper = levels[ring], lower = levels[ring + 1];
      for (let edge = 0; edge < outline.length; edge++) {
        const next = (edge + 1) % outline.length;
        facets.push([upper[edge], upper[next], lower[next]], [upper[edge], lower[next], lower[edge]]);
      }
    }
    const peak = {point: stoneVertex(rows, sample - .13 * radius, -height / coastDepth, inset + .11), grade: .245};
    const crown = levels.at(-1);
    for (let edge = 0; edge < outline.length; edge++) {
      facets.push([crown[edge], crown[(edge + 1) % outline.length], peak]);
    }
    const daylight = averageStoneLight(facets, corner => corner.point, sunlight);
    for (const facet of facets) {
      const [a, b, c] = facet.map(corner => corner.point);
      const tones = facet.map(corner => corner.grade * .89 + daylight.get(corner) * .72);
      triangle(a, b, c, pigment, tones, 1.32, [0, 0, 0], 2, 0);
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
      ${weatheredSandstoneGlsl}
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
        if (vShoreRelief.z > 3.5) {
          float height = -vShoreRelief.x;
          vec2 foot = unprojectGround(vReliefPoint - vec2(0.0, height));
          vec2 anchor = foot / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
          float bearing = atan(anchor.y, anchor.x);
          float edge = 1.0 + .055 * sin(bearing * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(bearing * 7.0);
          if (length(anchor) > edge) discard;
          float grain = sandstoneGrain(foot * vec2(5.6, 8.1)).x;
          vec3 color = vStone;
          if (vShoreRelief.z > 4.5) {
            float surfaceGrain = sandstoneGrain(foot * vec2(15.0, 21.0)).x;
            float rooted = smoothstep(.87, .98, vShoreCut.y);
            color *= mix(vec3(.83, .89, .69), vec3(1.08, 1.04, .89), rooted);
            color *= .91 + grain * .15 + surfaceGrain * .10;
          } else {
            color = weatheredSandstone(color, layers, vShoreCut.xy, .76);
            vec3 fracture = sandstoneGrain(layers * vec2(2.8, 4.1));
            float unevenLight = clamp(dot(fracture.yz, vec2(-.092, .13)), -.10, .16);
            float side = smoothstep(.30, .69, vShoreCut.x);
            color *= mix(vec3(1.13, 1.081, 1.03), vec3(.96, 1.0, 1.034), side) * (1.0 + unevenLight);
            float topLight = smoothstep(.54, .94, vShoreCut.y);
            float contact = 1.0 - smoothstep(.04, .35, height);
            color *= .90 + .17 * grain + .11 * topLight - .34 * contact;
          }
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
          return;
        }
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
            vec3 shoulder = weatheredSandstone(vStone * (.96 + weather * .16), layers, vec2(.5), 0.0);
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
        vec3 stone = vStone * (mix(.91, 1.12, rockGrain) + grainBreak * .102);
        stone = weatheredSandstone(stone, layers, vShoreCut.xy, vShoreCut.z);
        // Wide top shoulders receive warm light. The narrow side and lower return are cooler.
        vec2 cut = vShoreCut.xy + vec2(-grainBreak * .24, grainBreak * .19);
        float sunlitLedge = smoothstep(.52, .86, cut.y) * (1.0 - smoothstep(.89, 1.02, cut.y));
        float warmShoulder = smoothstep(.046, .21, cut.x) * (1.0 - smoothstep(.27, .56, cut.x));
        float coldSide = smoothstep(.66, 1.0, cut.x);
        float bedShade = 1.0 - smoothstep(.025, .29, cut.y);
        vec3 faceLight = vec3(.38, .29, .17) * sunlitLedge + vec3(.20, .14, .08) * warmShoulder;
        faceLight -= vec3(.24, .20, .14) * coldSide + vec3(.29, .24, .18) * bedShade;
        stone *= 1.0 + faceLight * vShoreCut.z;
        // Coarse mineral flakes catch light along their chipped edges. Fade the smallest edges as
        // the camera pulls back so seams stay visible without crawling across the screen.
        vec2 strata = vec2(layers.x * 4.8 + layers.y * 1.64, layers.y * 6.1);
        vec3 flakes = sandstoneGrain(strata);
        vec2 footprint = fwidth(strata);
        float detail = 1.0 - smoothstep(.24, .72, max(footprint.x, footprint.y));
        float grainSeed = sandstoneHash(floor(strata));
        vec2 flake = fract(strata) - vec2(.5, .34 + grainSeed * .31);
        float split = flake.y + flake.x * (grainSeed - .42) * 1.6;
        float taper = (1.0 - smoothstep(.12, .36, abs(flake.x))) * smoothstep(.41, .76, grainSeed);
        float antialias = min(.11, fwidth(split));
        float pore = (1.0 - smoothstep(.010, .046 + antialias, abs(split))) * taper;
        float chip = smoothstep(.012, .046, split) * (1.0 - smoothstep(.061, .134, split)) * taper;
        float rake = clamp(dot(flakes.yz, vec2(-.065, .082)), -.13, .17);
        float minerals = smoothstep(.31, .69, flakes.x);
        vec3 mineralLight = mix(vec3(.91, .95, 1.04), vec3(1.09, 1.07, 1.03), minerals);
        mineralLight *= 1.0 + detail * (rake + .16 * chip - .16 * pore);
        stone *= mix(vec3(1.0), mineralLight, mix(.57, 1.0, vShoreCut.z));
        float cap = (1.0 - smoothstep(.07, .28, depth)) * smoothstep(.11, .51, dot(vStone, vec3(.30, .58, .12)));
        stone = mix(stone, stone * vec3(1.19, 1.09, 1.02), cap);
        float overhang = (1.0 - smoothstep(.001, .082, depth)) * vShoreCut.z;
        stone *= 1.0 - overhang * .19;
        // Sand reflects warm daylight into recessed joints. Keep the turf overhang and wet toe dark.
        float reflected = smoothstep(.055, .23, depth) * (1.0 - smoothstep(.72, .96, depth));
        float recess = 1.0 - smoothstep(.11, .35, dot(vStone, vec3(.30, .58, .12)));
        float dust = reflected * recess * (.83 + .19 * rockGrain + .27 * grainBreak);
        stone += dust * vec3(.143, .101, .068) * (1.0 + .17 * chip * detail);
        float moss = smoothstep(.62, .84, rockGrain + grainBreak * .7)
          * (1.0 - smoothstep(.04, .26, depth)) * .52;
        stone = mix(stone, stone * vec3(.82, 1.05, .67), moss);
        stone = mix(stone, stone * vec3(.49, .63, .71) + vec3(.014, .029, .034), damp * .78);
        float tidemark = depth + grainBreak + (flakes.x - .5) * .065;
        float tide = smoothstep(.68, .82, tidemark) * (1.0 - smoothstep(.86, .99, tidemark)) * damp;
        stone += tide * vec3(.009, .029, .035) * (1.0 + .65 * chip * detail);
        float settledSand = sandPigment * (1.0 - smoothstep(.15, .78, vShoreRelief.x + grainBreak));
        if (vShoreRelief.z > .0) {
          stone *= mix(vec3(.76, .82, .86), vec3(1.0), settledSand * .47);
          float dockSide = smoothstep(0.0, 4.0, -logical.x);
          stone += vec3(.026, .015, .006) * dockSide * reflected * (.28 + .72 * rockGrain);
        }
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
