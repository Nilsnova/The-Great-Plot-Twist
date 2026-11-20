// Rock relief is presentation only. Dry stone follows the approved painted coast mask.
import * as THREE from 'three';
import {APPROACH_DEPTH, CLIFF_DEPTH, cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, projectedCoastBounds, unprojectGround} from '../projection.js';
import {seaUniforms} from '../water.js';
import {surfaces} from './surfaces.js';

const STONES = ['#cda778', '#d6b383', '#bba185', '#bc936a', '#d8b486', '#aa9781'].map(color => new THREE.Color(color));
const BEDROCK = new THREE.Color('#655246');
const OUTCROP = new THREE.Color('#bbab91');
const SUBMERGED_STONE = new THREE.Color('#66887c');
const TURF = new THREE.Color('#91b949');
const BLOCK_WIDTHS = [3.30, 4.60, 3.85, 2.95, 4.95, 3.57, 4.17];
const ROCKY_ARCS = [[9, 36], [54, 81]];
// The two front headlands are groups of unequal slabs. Each spans part of the old
// coast profile with a crown, foot, sideways lean, and sandstone palette index.
const HEADLANDS = [
  [11.5, 14.41, .12, .92, -.33, 1],
  [14.66, 16.88, .16, .82, .25, 0],
  [17.35, 20.20, .03, .83, .32, 5],
  [20.47, 23.8, .018, .77, -.37, 2],
  [16.9, 21.8, .72, .98, -.30, 3],
  [24.35, 26.92, .068, .92, -.20, 2],
  [27.15, 29.4, .025, .77, -.52, 0],
  [29.1, 32.3, .16, .98, .45, 4],
  [32.3, 34.4, .31, .90, -.31, 5],
  [55.7, 59.4, .20, .97, .54, 1],
  [59.65, 61.64, .04, .86, -.36, 5],
  [61.88, 64.2, .082, .86, .29, 2],
  [60.9, 63.4, .73, 1, .24, 3],
  [63.62, 67.2, .75, .98, -.30, 3],
  [64.60, 68.1, .07, .87, .62, 2],
  [68.6, 71.25, .08, 1, -.18, 1],
  [72, 74.73, .08, .86, -.77, 4],
  [75.02, 78.6, .15, .89, -.26, 5],
];
const HEADLAND_BEDS = [[11.1, 34.7], [55.2, 79.1]];
const RECESSED_BED = .25;
const TERRACE_ARCS = [[25, 34], [55, 67]];
const REAR_STONE = 4, REAR_TURF = 5, INTERTIDAL_STONE = 6, TIDAL_CONTACT = 7;
// Uneven groups flank the four sandy approaches. Values give the coast sample,
// half-span, outward reach, exposed height and sandstone colour of each rock.
const TIDAL_ROCKS = [
  [19.8, 1.29, 1.42, 1.04, 5], [21.6, 1.75, .68, 2.04, 2], [23.9, .93, .52, .98, 0],
  [68.1, 1.04, .81, .97, 3], [69.75, 1.97, .68, 1.91, 1], [73.5, .85, 1.24, .79, 2],
  [103.5, 1.34, 1.12, 1.24, 2], [106.9, 1.82, .71, 1.63, 0],
  [111.4, 1.16, 1.09, 1.05, 5], [113.7, 2.13, .65, 2.02, 2],
  [156.4, .97, 1.27, .82, 2], [159.25, 1.95, .76, 1.78, 1],
  [162.6, 1.43, .78, 1.41, 5], [167.25, 1.25, .98, 1.14, 0],
];
const TIDAL_OCHRE = new THREE.Color('#b29376');
const TIDAL_SLATE = new THREE.Color('#79848b');
const TIDAL_SHADOW = new THREE.Color('#18383b');
const TIDAL_OUTLINE = [[-.98, -.24], [-.62, -.72], [.39, -.68], [1.04, -.20],
  [.83, .49], [.13, .79], [-.67, .56]];
// Low stones carry two high shelves into the flank on either side. The
// shallow landings remain open between the groups.
const REAR_HEADLANDS = [
  {from: 100.75, to: 105.15, reach: 1.39, height: 1.07, lean: -.11, stone: 5, grass: false},
  {from: 103.8, to: 109.4, reach: 1.88, height: 1.71, lean: .12, stone: 1, grass: true},
  {from: 119.6, to: 123.7, reach: 1.48, height: 1.04, lean: .17, stone: 3, grass: false},
  {from: 121.7, to: 127.2, reach: 2.05, height: 1.82, lean: -.15, stone: 5, grass: true},
  {from: 146.14, to: 151.78, reach: 1.02, height: 1.36, footTurn: .33, landingCut: .66, lean: .08, stone: 2, grass: false, recess: .35},
  {from: 148.8, to: 152.55, reach: 1.41, height: 1.03, lean: -.18, stone: 5, grass: false},
  {from: 162.80, to: 167.8, reach: 1.82, height: 1.63, lean: -.11, stone: 2, grass: true},
  {from: 167.25, to: 170.1, reach: 1.37, height: .96, lean: .07, stone: 3, grass: false},
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
  vec3 cliffFinish(vec3 color, vec2 point, vec2 cut, vec3 bed, vec3 mineral, float face) {
    // Fractures travel across the face at different angles and stop inside the rock.
    float band = point.y * 1.06 + point.x * .23 + (bed.x - .5) * .37 + (mineral.x - .5) * .09;
    float edge = fract(band) - .46;
    float antiAlias = min(.18, fwidth(band));
    float broken = smoothstep(.30, .70, bed.x * .73 + mineral.x * .27);
    float joint = (1.0 - smoothstep(.021, .097 + antiAlias, abs(edge))) * broken;
    float lip = smoothstep(.012, .069, edge) * (1.0 - smoothstep(.079, .21 + antiAlias, edge)) * broken;
    float lean = point.x * .52 - point.y * .30 + (bed.x - .5) * .49;
    float split = abs(fract(lean) - .51);
    float fault = (1.0 - smoothstep(.037, .133 + min(.17, fwidth(lean)), split))
      * smoothstep(.28, .64, bed.x * .38 + mineral.x * .62);

    float across = cut.x + (mineral.x - .5) * .08;
    float bottom = (1.0 - smoothstep(.019, .32, cut.y)) * smoothstep(.51, 1.0, across);
    float side = smoothstep(.69, .99, across) * smoothstep(.18, .7, cut.y + .16 * bed.x);
    float shoulder = smoothstep(.031, .19, across) * (1.0 - smoothstep(.28, .56, across))
      * smoothstep(.31, .84, cut.y);
    float weight = .45 + .55 * face;
    float shade = clamp(weight * (.58 * joint + .35 * fault + .26 * side + .35 * bottom), 0.0, .76);
    float sunlight = weight * (.43 * lip + .38 * shoulder);
    float mineralSlope = clamp(dot(bed.yz, vec2(-.093,.12)) + dot(mineral.yz, vec2(-.029,.041)), -.15, .18);
    vec3 shaded = color * mix(vec3(1.0), vec3(.47, .56, .68), shade);
    return shaded * (1.0 + mineralSlope + sunlight * vec3(.68, .45, .24));
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
    return cliffFinish(coarse, point, cut, slab, chip, laidFace);
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
    finish = mix(finish, finish * vec3(1.13, 1.04, .947), face * max(0.0, sun) * 1.54);
    return cliffFinish(finish, point, cut, bed, dust, face);
  }
`;

export const paintedSandstoneGlsl = /* glsl */`
  uniform sampler2D uHomeStone;
  uniform float uHomeStoneReady;
  vec3 paintedSandstone(vec3 stone, vec2 uv, float coverage) {
    if (uHomeStoneReady < .5) return stone;
    vec3 sandstone = texture2D(uHomeStone, uv).rgb;
    // Keep the native face's colour and daylight, with the painted cuts
    // and short facets supplying the contrast inside each stone.
    float surfaceLight = dot(sandstone, vec3(.30, .58, .12));
    float facets = clamp(surfaceLight / .30, .41, 1.54);
    vec3 pigment = mix(vec3(.87, .94, 1.062), vec3(1.09, 1.022, .94), smoothstep(.16, .48, surfaceLight));
    return mix(stone, stone * pigment * facets, coverage);
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
  const coastBounds = projectedCoastBounds(rows);
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
      let display = projectGround(vertex.x, rear ? vertex.z : vertex.z - vertex.y / LEGACY_DEPTH);
      if (rear) display.y += vertex.y;
      if (region >= INTERTIDAL_STONE) {
        // Tuck the hidden back of the stone behind the dry edge. Its visible
        // faces and wash stay within the existing Fit view.
        const shore = unprojectGround(display.x, display.y);
        const x = shore.x / surface.rx, z = shore.z / surface.rz;
        const bearing = Math.atan2(z, x);
        const edge = 1.021 + .055 * Math.sin(bearing * 5 + surface.seed) + .035 * Math.cos(bearing * 7);
        const stretch = Math.max(1, edge / Math.hypot(x, z));
        display = projectGround(shore.x * stretch, shore.z * stretch);
        display.x = THREE.MathUtils.clamp(display.x, coastBounds.minX, coastBounds.maxX);
        display.y = THREE.MathUtils.clamp(display.y, coastBounds.minY, coastBounds.maxY);
      }
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
    const twist = Math.sin(from * 1.26);
    const outline = [[.06, .10], [.47, .025], [.85, .05], [.975, .17], [.99, .77],
      [.88, .94], [.49, 1], [.12, .94], [.02, .76], [.012, .22]];
    const upperBedding = .36 + twist * .09;
    const lowerBedding = .68 - .069 * Math.cos(from * 2.41);
    const layers = foot - top > .63
      ? [[.012, upperBedding - .031], [upperBedding + .016, lowerBedding - .029], [lowerBedding + .023, .988]]
      : [[.018, upperBedding + .10], [upperBedding + .157, .982]];
    for (const [course, [ceiling, floor]] of layers.entries()) {
      const foundation = course === layers.length - 1;
      const jog = .07 * Math.sin(from * 2.14 + 1.52 * course);
      const tint = STONES[(pigment + course * 2) % STONES.length].clone()
        .lerp(OUTCROP, foundation ? .14 : .06).lerp(BEDROCK, foundation ? .29 : .065);
      const point = (u, v, inset, retreat, tone) => {
        const base = THREE.MathUtils.lerp(ceiling, floor, v);
        const taper = (.024 + .022 * Math.abs(lean)) * v * v;
        const across = THREE.MathUtils.lerp(taper, 1 - taper, u);
        const strike = lean * .32 * (base - .47);
        const sample = THREE.MathUtils.clamp(THREE.MathUtils.lerp(from, to, across + jog) + strike, from, to);
        const joint = .045 * twist * (u - .5) + .021 * Math.sin(from + course + u * Math.PI);
        const depth = THREE.MathUtils.lerp(top, foot, THREE.MathUtils.clamp(base + joint, 0, 1));
        const position = stoneVertex(rows, sample, depth, inset);
        const recess = Math.min(retreat, (CLIFF_DEPTH + position.y) / LEGACY_DEPTH);
        position.y -= recess * LEGACY_DEPTH;
        position.z -= recess;
        return {position, depth, tone, cut: [u, 1 - v]};
      };
      const rim = outline.map(([u, v], i) => point(u, v, .076 + .09 * v, .46 + .10 * v,
        i < 3 ? -.095 : -.245));
      const turn = .14 + Math.abs(lean) * .072;
      const face = outline.map(([u, v]) => point(
        THREE.MathUtils.lerp(turn, .844, u), .14 + .71 * v + (u - .5) * lean * .053,
        .018 + .018 * v, .023 + .089 * u, .044 - .033 * v,
      ));
      const crown = point(.52 + twist * .09, .37 + lean * .031, .016, .009, .104);
      const facets = [];
      for (let side = 0; side < rim.length; side++) {
        const next = (side + 1) % rim.length;
        const shade = side < 3 || side === 9 ? .30 : side >= 4 && side <= 7 ? -.25 : -.20;
        facets.push({corners: [rim[side], rim[next], face[next]], shade},
          {corners: [rim[side], face[next], face[side]], shade},
          {corners: [crown, face[side], face[next]], shade: side >= 3 && side <= 6 ? -.07 : .03});
      }
      const daylight = averageStoneLight(facets.map(({corners}) => corners), corner => corner.position, sunlight);
      for (const {corners, shade} of facets) {
        const [a, b, c] = corners.map(corner => corner.position);
        const tones = corners.map(corner => corner.tone + daylight.get(corner) * .43 + shade);
        triangle(a, b, c, tint, tones, .21, corners.map(corner => corner.depth), 0,
          sunlight(a, b, c) * .50, corners.map(corner => corner.cut));
      }
    }
  }

  function carveRearHeadland({from, to, reach, height, lean, stone, grass, footTurn = 0, landingCut = 0, recess = 0}) {
    const color = STONES[stone].clone().lerp(OUTCROP, .65).lerp(BEDROCK, .12 + recess);
    const center = stoneVertex(rows, (from + to) * .5, 0, reach * .49);
    center.y = height * .42;
    const tiers = [
      [1, 1, 0, -.22], [.985, .98, .17, -.095], [.942, .93, .45, -.025],
      [.894, .883, .53, .065], [.836, .81, .59, -.125], [.804, .78, .86, .036],
      [.737, .714, .955, .105], [.683, .665, 1, .15],
    ];
    const point = (along, across, rise, grade) => {
      const sample = THREE.MathUtils.lerp(from, to, THREE.MathUtils.clamp(along, 0, 1));
      // The eastern toe tapers towards the wall sockets while its seaward heel
      // supports the whole rock face above the saddle.
      const taper = landingCut * (1 - THREE.MathUtils.smoothstep(along, .38, .60));
      const vertex = stoneVertex(rows, sample, 0, .10 + across * reach * (1 - taper));
      const shoulder = 1 - THREE.MathUtils.smoothstep(Math.abs(along - .50 - lean), .185, .48);
      vertex.y = height * rise * (.54 + .46 * shoulder) * (1 + .08 * Math.sin(along * 9.2 + lean));
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

  function carveTidalRock([sample, radius, reach, rise, pigment]) {
    const seed = sample * 1.17, turn = Math.sin(seed * 1.04), breakAt = Math.cos(seed * .78);
    // Only the near side exposes the full drop below the painted beach.
    const rear = sample > 90;
    const depth = rear ? .18 : .91;
    const bed = stoneVertex(rows, sample, depth, -reach);
    const color = TIDAL_SLATE.clone().lerp(TIDAL_OCHRE, .38 + .23 * turn).lerp(STONES[pigment], .22);
    const shoulder = .77 + .14 * breakAt;
    const levels = [
      [1.03, 0, -.05, -.29], [1, .15, -.035, -.18],
      [shoulder, .55 + .08 * turn, .05, -.15],
      [shoulder - (rear ? .05 : .12), .81, .21, .09],
      [rear ? .59 + .08 * turn : .37 + .14 * turn, rear ? .94 : 1, rear ? .18 : .29, .22],
    ];
    const rings = levels.map(([width, height, lean, tone], level) => TIDAL_OUTLINE.map(([along, radial], side) => {
      const fracture = Math.sin(seed + side * 2.89 + level * .83);
      const span = along * width + turn * lean + (.035 + height * .065) * fracture;
      const facet = 1 + .22 * Math.sin(seed * .64 + side * 2.5);
      const inset = -reach + radial * width * facet * (.54 + radius * .16) + breakAt * lean;
      const point = stoneVertex(rows, sample + radius * span, 0, inset);
      point.y = bed.y + rise * height * (1 + .18 * breakAt * along + .14 * fracture);
      return {point, tone, height, cut: [(along + 1.06) * .47, height]};
    }));
    const skirt = rings[0].map(({point}) => {
      const outer = bed.clone().lerp(point, 1.45);
      outer.y = bed.y -.035;
      return outer;
    });
    for (let side = 0; side < skirt.length; side++) {
      const next = (side + 1) % skirt.length;
      panel(rings[0][side].point, rings[0][next].point, skirt[next], skirt[side],
        TIDAL_SHADOW, .11, -.04, 0, 1, .10, TIDAL_CONTACT);
    }
    const facets = [];
    for (let ring = 0; ring < levels.length - 1; ring++) {
      const [bottom, top] = [rings[ring], rings[ring + 1]];
      for (let side = 0; side < bottom.length; side++) {
        const next = (side + 1) % bottom.length;
        const shade = .095 * Math.cos(seed + side * 1.31);
        facets.push({corners: [bottom[side], bottom[next], top[next]], shade},
          {corners: [bottom[side], top[next], top[side]], shade});
      }
    }
    const summit = {point: stoneVertex(rows, sample + .41 * turn, 0, -reach + .21 * breakAt),
      tone: .20, height: 1, cut: [.55, 1]};
    summit.point.y = bed.y + rise * (rear ? .985 + .035 * turn : 1.02 + .07 * turn);
    const top = rings.at(-1);
    for (let i = 0; i < top.length; i++) {
      facets.push({corners: [top[i], top[(i + 1) % top.length], summit], shade: .075});
    }

    const light = (a, b, c) => {
      faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      exterior.copy(a).add(b).add(c).addScaledVector(bed, -3);
      exterior.y -= rise * 1.35;
      if (faceNormal.dot(exterior) < 0) faceNormal.negate();
      return THREE.MathUtils.clamp(faceNormal.dot(SUN) * .60, -.37, .53);
    };
    const daylight = averageStoneLight(facets.map(({corners}) => corners), corner => corner.point, light);
    for (const {corners, shade} of facets) {
      const [a, b, c] = corners.map(corner => corner.point);
      const tones = corners.map(corner => corner.tone + .28 * daylight.get(corner) + shade);
      triangle(a, b, c, color, tones, .54, corners.map(corner => corner.height), INTERTIDAL_STONE,
        .84 * light(a, b, c), corners.map(corner => corner.cut));
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
          // The two shelves below the east pine roll into the meadow. Keep their
          // roots at the old coast. Only lower the upper face, away from the cannon.
          const eastShelf = middle > 12.85 && middle < 20.75;
          const capHeight = (.54 + THREE.MathUtils.smoothstep(fromTerrace, 1.4, 4.3) * (.76 + .12 * bevel))
            * (eastShelf && middle < 15.8 ? .69 : 1);
          const turfDepth = .81 + .15 * turn;
          const crest = [[.034, 0], [.11, .38], [.25, .69], [.43, 1], [turfDepth, .94], [turfDepth + .45, .42], [turfDepth + .69, 0]];
          const cut = THREE.MathUtils.lerp(start, end, .47 + turn * .10);
          const shoulders = end - start > 3.5 ? [[start, cut], [cut, end]] : [[start, end]];
          for (const [piece, [from, to]] of clearShoulderSpans(shoulders).entries()) {
            const lean = Math.sin(block * 1.71 + piece * 2.43);
            const sandstone = STONES[(block + piece * 2) % STONES.length];
            const faceStone = eastShelf ? sandstone.clone().lerp(BEDROCK, .31) : sandstone;
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
  TIDAL_ROCKS.forEach(carveTidalRock);
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
  const homeStone = coastArt.userData.homeStone;
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}, uSeaTime: seaUniforms.uSeaTime,
      uWind: seaUniforms.uWind, uDetail: seaUniforms.uDetail,
      uHomeStone: {value: homeStone ?? coastArt}, uHomeStoneReady: {value: homeStone ? 1 : 0}},
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
      ${paintedSandstoneGlsl}
      uniform sampler2D uCoastArt;
      uniform float uSeaTime, uWind, uDetail;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      varying vec3 vShoreCut;
      vec3 approachCliffFaces(vec3 stone, vec2 ground, float height, float contact, float strength) {
        if (strength <= .001) return stone;
        // Offset and kink each face along the bank so the seams never make a grid.
        float shoreRun = ground.y + abs(ground.x) * .28;
        float across = shoreRun * .72;
        float column = floor(across);
        float seed = sandstoneHash(vec2(column, sign(ground.x) * 1.91));
        float bevel = mix(-.17, .19, seed);
        float hinge = (height - .57) * bevel;
        float stepSide = max(0.0, height - .52) * (seed - .5) * .22;
        float mineral = sandstoneGrain(vec2(shoreRun * 3.25, height * 4.2)).x;
        float face = fract(across) - mix(.27, .67, seed) + hinge + stepSide + (mineral - .5) * .085;
        float edge = min(.082, fwidth(face));
        float opening = (.024 + seed * .038) * (1.10 - .22 * smoothstep(.13, 1.12, height));
        float cleavage = (1.0 - smoothstep(opening * .47, opening + edge, abs(face)));
        float side = smoothstep(.012, .096, face) * (1.0 - smoothstep(.14, .249, face));
        float sun = smoothstep(-.23, -.082, face) * (1.0 - smoothstep(-.064, -.011, face));
        float toe = sandstoneGrain(vec2(shoreRun * 1.61, height * 3.23)).x;
        float dark = strength * max(cleavage * .73 + side * .24, contact * (toe * .42 + .13));
        stone *= mix(vec3(1.0), vec3(.39, .44, .47), dark);
        return stone * (1.0 + strength * sun * vec3(.35, .24, .095) * (.42 + seed * .58));
      }
      void main() {
        vec2 logical = unprojectGround(vReliefPoint);
        vec2 shore = logical / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        vec2 layers = vec2(logical.x + logical.y * .26, -vShoreRelief.x + logical.y * .12);
        // Preserve all of the visible, playable upper beach, including the existing shallow coves.
        vec4 rock = texture2D(uCoastArt, vec2(logical.x / 64.0, -logical.y * ${LEGACY_DEPTH} / 48.0) + .5);
        float sandPigment = smoothstep(.065, .24, rock.r - rock.g);
        if (vShoreRelief.z > 6.5) {
          if (rock.a >= .64) discard;
          float outward = vShoreRelief.y;
          float wash = (1.0 - smoothstep(.0, .95, outward)) * .70;
          float foam = 0.0;
          if (uDetail > .5) {
            float phase = uSeaTime * (.76 + .31 * uWind) + logical.x * .72 + logical.y * 1.11;
            float run = .5 + .5 * sin(phase);
            float crest = .34 + .24 * run;
            float breakup = sandstoneGrain(logical * vec2(3.3, 4.7) + vec2(uSeaTime * .18, 0.0)).x;
            float edge = outward - crest + (breakup - .5) * .14;
            float core = (1.0 - smoothstep(.041, .17, abs(edge))) * smoothstep(.36, .71, breakup);
            float scattering = (1.0 - smoothstep(.024, .105, abs(edge - .16))) * smoothstep(.55, .79, breakup);
            foam = max(core, scattering * .72) * (.52 + .44 * run);
          }
          // The white tip passes over the persistent dark water at the stone.
          float base = wash * (1.0 - foam);
          float opacity = base + foam;
          if (opacity < .035) discard;
          vec3 whitewater = mix(vec3(.42, .69, .70), vec3(.86, .99, .96), foam);
          gl_FragColor = vec4((vStone * base + whitewater * foam) / opacity, opacity);
          #include <colorspace_fragment>
          return;
        }
        if (vShoreRelief.z > 5.5) {
          if (length(shore) < rim * 1.003) discard;
          float aboveWater = vShoreRelief.y;
          vec2 mineralPoint = vec2(logical.x + logical.y * .31, -vShoreRelief.x);
          vec3 grain = sandstoneGrain(mineralPoint * vec2(3.0, 4.6));
          vec3 stone = weatheredSandstone(vStone, mineralPoint, vShoreCut.xy, .64);
          if (uDetail > .5 && logical.y < -1.0) {
            stone = paintedSandstone(stone, vec2(mineralPoint.x / 5.9 + .21, .12 + aboveWater * .69), .66);
          }
          float stain = 1.0 - smoothstep(.10, .46, aboveWater + (grain.x - .5) * .19);
          stone = mix(stone, stone * vec3(.50, .61, .69) + vec3(.009, .025, .032), stain * .87);
          float mineral = vShoreCut.y - .46 + (vShoreCut.x - .5) * .21 + (grain.x - .5) * .12;
          float cutEdge = min(.085, fwidth(mineral));
          float joint = 1.0 - smoothstep(.02, .080 + cutEdge, abs(mineral));
          float aboveJoint = smoothstep(.02, .095, mineral) * (1.0 - smoothstep(.095, .23, mineral));
          float rimGlow = smoothstep(.77, 1.0, aboveWater) * (.6 + .4 * grain.x);
          stone *= 1.0 + rimGlow * .15 - joint * (.15 + .19 * grain.x) + .22 * aboveJoint
            + dot(grain.yz, vec2(-.075, .088));
          gl_FragColor = vec4(stone, 1.0);
          #include <colorspace_fragment>
          return;
        }
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
            vec2 meadowUv = vec2(foot.x / 64.0, -foot.y * ${LEGACY_DEPTH} / 48.0) + .5;
            vec3 meadow = texture2D(uCoastArt, meadowUv).rgb;
            float turf = smoothstep(.010, .13, meadow.g - meadow.r);
            float crown = smoothstep(.83, .985, vShoreCut.y + (grain - .5) * .14);
            float clumps = sandstoneGrain(foot * vec2(2.0, 2.8)).x;
            float blades = sandstoneGrain(foot * vec2(15.0, 21.0)).x;
            color = mix(color, meadow, turf * .57);
            color = mix(color * vec3(.61, .76, .56), color * vec3(1.03, 1.00, .94), crown);
            color *= .87 + grain * .15 + clumps * .24 + blades * .09;
          } else {
            color = weatheredSandstone(color, layers, vShoreCut.xy, .76);
            vec3 fracture = sandstoneGrain(layers * vec2(2.8, 4.1));
            float unevenLight = clamp(dot(fracture.yz, vec2(-.092, .13)), -.10, .16);
            float side = smoothstep(.30, .69, vShoreCut.x);
            color *= mix(vec3(1.13, 1.081, 1.03), vec3(.96, 1.0, 1.034), side) * (1.0 + unevenLight);
            // Bedding and cracked columns follow the fixed face through the bevel.
            float bed = vShoreCut.y * 2.8 + (fracture.x - .5) * .16;
            float bedCourse = floor(bed);
            float seamHeight = abs(fract(bed) - .49);
            float along = (foot.x + foot.y * .23) * .81 + bedCourse * .59 + fracture.x * .12;
            float seamSide = abs(fract(along) - .50);
            float bedding = (1.0 - smoothstep(.045, .139 + min(.12, fwidth(bed)), seamHeight));
            float split = (1.0 - smoothstep(.025, .086 + min(.1, fwidth(along)), seamSide));
            float cut = max(bedding * .72, split * smoothstep(.18, .65, fracture.x));
            float shelfLight = smoothstep(.020, .141, fract(bed) - .51)
              * (1.0 - smoothstep(.15, .39, fract(bed) - .51));
            color *= mix(vec3(1.0), vec3(.44, .48, .53), cut * .68);
            color *= 1.0 + shelfLight * vec3(.28, .17, .075);
            float topLight = smoothstep(.54, .94, vShoreCut.y);
            float contact = 1.0 - smoothstep(.04, .35, height);
            float flank = smoothstep(.65, .82, abs(anchor.x)) * smoothstep(.23, .39, -anchor.y);
            color = approachCliffFaces(color, foot, height, contact, flank);
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
            float eastShelf = smoothstep(.30, .46, angle) * (1.0 - smoothstep(.72, .85, angle));
            if (eastShelf > .0) {
              // Exposed stone along the planted side takes both the cut-stone
              // grain and the colour of the turf where the shoulder rejoins it.
              if (uDetail > .5) shoulder = paintedSandstone(shoulder,
                vec2(layers.x / 5.70 + .36, .32 + height * .28), .66 * eastShelf);
              float grass = smoothstep(.045, .165, rock.g - rock.r + weather * .035);
              float roots = 1.0 - smoothstep(.28, .83, height + weather * .21);
              shoulder = mix(shoulder, rock.rgb * (.80 + pore * .15), eastShelf * grass * (.59 + roots * .31));
            }
            float flank = smoothstep(.71, .91, abs(shore.x)) * smoothstep(.23, .41, shore.y);
            vec2 foot = logical - vec2(0.0, vShoreRelief.x / ${LEGACY_DEPTH});
            shoulder = approachCliffFaces(shoulder, foot, height, 1.0 - smoothstep(.18, .72, height), flank);
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
        float sunlitLedge = smoothstep(.61, .87, cut.y) * (1.0 - smoothstep(.94, 1.04, cut.y));
        float warmShoulder = smoothstep(.047, .25, cut.x) * (1.0 - smoothstep(.32, .65, cut.x));
        float coldSide = smoothstep(.64, .91, cut.x);
        float bedShade = 1.0 - smoothstep(.025, .32, cut.y);
        float cleavage = max(1.0 - smoothstep(.025, .117, cut.x), smoothstep(.88, .995, cut.x))
          * smoothstep(.16, .62, cut.y + .09 * grainBreak);
        vec3 faceLight = vec3(.38, .29, .17) * sunlitLedge + vec3(.20, .14, .08) * warmShoulder;
        faceLight -= vec3(.31, .26, .19) * coldSide + vec3(.32, .27, .21) * bedShade
          + vec3(.37, .32, .26) * cleavage;
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
        if (uDetail > .5 && vShoreCut.z > .5) {
          vec2 uv = vec2(layers.x / 6.35 + .31, .85 - vShoreRelief.x * .22);
          stone = paintedSandstone(stone, uv, (.57 - .19 * damp) * vShoreCut.z);
        }
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
        float flank = smoothstep(.71, .89, abs(shore.x)) * smoothstep(.23, .44, shore.y);
        vec2 foot = logical - vec2(0.0, vShoreRelief.x / ${LEGACY_DEPTH});
        stone = approachCliffFaces(stone, foot, 1.40 - 1.29 * depth, damp, flank);
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
