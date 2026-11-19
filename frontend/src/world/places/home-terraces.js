// Sandstone terraces along the shoulders of Home Island. Elevation belongs only to the view.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {artSizes} from '../art.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, unprojectGround} from '../projection.js';
import {sandstoneFinishGlsl} from './home-relief.js';
import {surfaces} from './surfaces.js';

const COAST = surfaces.home_islet;
// Coast samples are spaced two degrees apart. The rear banks hug the cliff so the
// wall foundations have level ground in front. The southern banks face the sea.
const BANKS = [
  {first: 97, last: 106, foot: .935, back: .986, height: 3.05},
  {first: 116.5, last: 124.5, foot: .773, back: .963, height: 3.25},
  {first: 125, last: 135, foot: .891, back: .958, height: 2.355, shore: true},
  {first: 137, last: 146, foot: .921, back: .955, height: 1.875, shore: true},
  {first: 148, last: 156, foot: .826, back: .964, height: 3.495},
  {first: 166, last: 171, foot: .790, back: .946, height: 3.51},
  {first: 30, last: 37, foot: .985, back: .888, height: 1.92},
  {first: 55, last: 67, foot: .958, back: .835, height: 1.62},
];
const STONE = ['#c79c67', '#dbaf77', '#b88b60', '#d4ae7e', '#c59767'].map(hex => new THREE.Color(hex));
const MORTAR = new THREE.Color('#96734f'), RECESS = new THREE.Color('#765840');
const ENDS = [new THREE.Color('#aa8357'), new THREE.Color('#b99165')];
const TURF = new THREE.Color('#8bb943'), LIP = new THREE.Color('#b0d557'), ROOTS = new THREE.Color('#739e3a');
const GRASS_CREST = TURF.clone().lerp(LIP, .56);
const FOLIAGE = {
  97: [['birch', .56, .70, .49], ['shrub', .19, .64, .64], ['shrub', .74, .31, .49], ['flowers', .41, .31, .52]],
  116.5: [['shrub', .21, .73, .65], ['shrub', .27, .68, .51], ['grass-tuft', .56, .74, .56], ['shrub', .81, .71, .62],
    ['shrub', .37, .28, .41], ['flowers', .72, .34, .56]],
  125: [['grass-tuft', .16, .66, .43], ['shrub', .42, .74, .47], ['flowers', .72, .74, .37]],
  137: [['shrub', .68, .71, .42], ['flowers', .23, .58, .37], ['grass-tuft', .41, .63, .40]],
  148: [['shrub', .31, .68, .60], ['shrub', .38, .72, .51], ['grass-tuft', .66, .73, .62], ['shrub', .83, .70, .52],
    ['flowers', .15, .34, .60], ['shrub', .57, .32, .44]],
  166: [['birch', .65, .72, .51], ['shrub', .42, .67, .66], ['shrub', .54, .69, .47], ['flowers', .21, .29, .60],
    ['grass-tuft', .81, .29, .56]],
  30: [['shrub', .23, .72, .58], ['shrub', .35, .75, .42], ['grass-tuft', .71, .72, .62], ['flowers', .78, .33, .52]],
  55: [['grass-tuft', .25, .69, .62], ['shrub', .46, .72, .55], ['shrub', .63, .77, .64], ['flowers', .78, .32, .55]],
};
// Each garden is tucked into an existing end of a bank or onto the exposed turf.
const ROCK_GARDENS = {
  97: [.25, .78],
  116.5: [.82, -.16],
  125: [.30, .72],
  137: [.72, .68],
  148: [.15, -.19],
  166: [.28, .80],
  30: [.60, .72],
  55: [.63, .73],
};
const SHADOW = new THREE.Color('#344032');
const SUN = new THREE.Vector3(-.6, .71, .43).normalize();
const GROUND_CAST = new THREE.Vector2(-SUN.x, -SUN.z).normalize();
const STEP = .5;
const BLOCK_WIDTHS = [1.72, 2.24, 2.41, 1.68, 2.16, 1.52];
const BLOCK_BEVEL = [
  [.12, 0], [.86, 0], [1, .18], [1, .79], [.85, 1], [.14, 1], [0, .83], [0, .18],
];
const BEVEL_LIGHT = [-.22, -.19, -.08, .02, .28, .24, .09, -.07];
const RISER_BEVEL = [.10, .19, .25, .14, .26, .32, .23, .12];
// A narrow turn under the turf gives the grass a soil edge. The last point rejoins
// the original tread exactly, including the elevation used by the existing plantings.
const SOD_PROFILE = [
  [0, 0, -.22], [-.15, .23, -.20], [.05, .59, .12], [.39, .89, .23], [1, 1, .09],
];
const SOD_MATERIAL = [[2.9, ROOTS], [2.6, ROOTS], [2.0, GRASS_CREST], [1.48, TURF]];
// Each stop starts a band. The two faces have deep bases, lit shoulders and grass lips.
// A short incline at the back of the upper tread hides where it joins the old meadow.
const REAR_PROFILE = [
  [0, 0, -.15, RECESS], [.025, .052, -.24, STONE], [.054, .365, -.055, STONE],
  [.074, .48, .12, STONE], [.11, .515, .21, LIP], [.168, .585, .12, TURF],
  [.36, .565, .02, TURF], [.405, .576, -.13, RECESS], [.429, .62, -.23, STONE],
  [.450, .84, -.055, STONE], [.481, .93, .14, STONE], [.52, .977, .24, LIP],
  [.58, 1.032, .12, TURF], [.848, 1.01, .065, TURF], [.95, .805, -.01, TURF],
  [1, .42, -.12, TURF],
];
const FRONT_PROFILE = [
  [0, 0, -.15, RECESS], [.042, .058, -.22, STONE], [.074, .33, -.08, STONE],
  [.106, .515, .11, STONE], [.15, .55, .22, LIP], [.205, .621, .12, TURF],
  [.392, .625, .025, TURF], [.444, .636, -.08, RECESS], [.468, .688, -.10, STONE],
  [.499, .832, -.01, STONE], [.530, .936, .14, STONE], [.572, .969, .215, LIP],
  [.636, 1.038, .107, TURF], [.777, 1.01, .065, TURF], [.918, .694, .025, TURF],
  [1, .02, -.08, TURF],
];
// The back of each cove has a low stone course and a broad, sunlit shoulder.
const SHORE_PROFILE = [
  [0, 0, -.16, RECESS], [.025, .045, -.24, STONE], [.055, .273, -.07, STONE],
  [.095, .384, .13, STONE], [.143, .416, .22, LIP], [.213, .476, .09, TURF],
  [.56, .472, .045, TURF], [.78, .30, .015, TURF], [.90, .145, -.04, TURF],
  [1, .026, -.10, TURF],
];

function onTop(x, y) {
  const p = unprojectGround(x, y), coastX = p.x / COAST.rx, coastZ = p.z / COAST.rz;
  const a = Math.atan2(coastZ, coastX);
  const rim = 1 + .055 * Math.sin(a * 5 + COAST.seed) + .035 * Math.cos(a * 7);
  return Math.hypot(coastX, coastZ) < rim * .991;
}

function shelfPoint(row, foot, back, taper, rise, radius, elevation) {
  const reach = Math.min(.987, THREE.MathUtils.lerp(foot, back, .49 + (radius - .49) * Math.sqrt(taper)));
  const p = new THREE.Vector3(row.x * reach, taper * rise * elevation, row.z * reach);
  const ground = projectGround(p.x, p.z);
  // Clip the height against the dry silhouette as the top of a rear bank projects uphill.
  while (p.y > .012 && !onTop(ground.x, ground.y + p.y)) p.y *= .86;
  return p;
}

function castOffset(near, far, fade) {
  const direction = new THREE.Vector2(far.x - near.x, far.z - near.z).normalize();
  const reach = .38 + Math.max(0, direction.dot(GROUND_CAST)) * .56;
  return direction.multiplyScalar(reach * fade).addScaledVector(GROUND_CAST, .16 * fade);
}

// These short plants grow on the decorated treads. Use one batch per sprite material and
// paint the entire garden before any interactable upright objects, even when zoomed in.
function addTerraceFoliage(root, art, plantings) {
  for (const [name, plants] of plantings) {
    if (!art[name]) continue;
    const [width, height, foot] = artSizes[name];
    const positions = [], uv = [], indices = [], feet = [];
    for (const [plant, scale] of plants.sort(([a], [b]) => a.z - b.z)) {
      const projected = projectGround(plant.x, plant.z);
      const footY = projected.y + plant.y;
      feet.push(footY);
      const half = width * scale * .5, bottom = footY - height * scale * foot;
      const top = bottom + height * scale, base = positions.length / 3;
      positions.push(projected.x - half, bottom, 0, projected.x + half, bottom, 0,
        projected.x + half, top, 0, projected.x - half, top, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    const displayPosition = new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', displayPosition);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, art[name]);
    const order = {birch: 0, rock: 1, shrub: 2, 'grass-tuft': 3, flowers: 4};
    mesh.name = `home-terrace-${name}`;
    mesh.renderOrder = 4.8 + order[name] * .01;
    let previousDepth = 1;
    mesh.onBeforeRender = (_, _scene, camera) => {
      const depth = camera.userData.homePortraitDepth ?? 1;
      if (depth === previousDepth) return;
      // The portrait lens extends the ground. Keep upright sprite proportions around each foot.
      for (let i = 0; i < displayPosition.count; i++) {
        const footY = feet[Math.floor(i / 4)];
        displayPosition.setY(i, footY + (positions[i * 3 + 1] - footY) / depth);
      }
      displayPosition.needsUpdate = true;
      previousDepth = depth;
    };
    mesh.raycast = () => {};
    root.add(mesh);
  }
}

export function createHomeTerraces(root, coastArt, art) {
  const coast = cliffProfile(COAST), positions = [], colors = [], materials = [], surfaceDetails = [];
  const plantings = new Map();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  function sunlight(a, b, d) {
    normal.subVectors(b, a).cross(edge.subVectors(d, a)).normalize();
    if (normal.y < 0) normal.negate();
    return .81 + .34 * Math.max(-.64, normal.dot(SUN));
  }
  function vertex(p, tint, light, grass, opacity, detail, recessed = false) {
    const ground = projectGround(p.x, p.z);
    positions.push(ground.x, ground.y + p.y, p.z * .03 + p.y * .09);
    colors.push(tint.r * light, tint.g * light, tint.b * light);
    materials.push(p.x, p.z, grass, opacity);
    // Stone uses cut coordinates, turf uses cross-slope and end fade, and
    // shadow strips use the distance from the foot plus a ground-plane offset.
    if (detail) surfaceDetails.push(detail[0], detail[1], detail[2] ?? (recessed ? 2 : 1));
    else surfaceDetails.push(0, 0, 0);
  }
  function face(a, b, c, d, tint, lightA, lightB, grass = 0, opacity = [1, 1, 1, 1], detail, recessed) {
    const sun = (sunlight(a, b, c) + sunlight(a, c, d)) * .5;
    for (const [p, corner] of [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]]) {
      vertex(p, tint, sun + (corner < 2 ? lightA : lightB), grass, opacity[corner], detail?.[corner], recessed);
    }
  }
  function stone(point, color, worn, underTurf, split = false) {
    // The original block outline stays put. Rolling the inner rim towards its
    // crown opens broader bevels along the riser and makes the cut change with the grain.
    const outer = BLOCK_BEVEL.map(([u, v]) => point(u, v, 0));
    const innerCut = BLOCK_BEVEL.map(([u, v]) => [.10 + u * .8, .13 + v * .73]);
    const inner = innerCut.map(([u, v]) => point(u, v, .024 + worn * .008));
    const center = point(.5, .5, .039 + worn * .011);
    let crown = [.5, .5], fold;
    if (split) {
      const turn = worn < 0 ? -1 : 1;
      const ridge = turn < 0 ? 6 : 3;
      const lean = .11 + Math.abs(worn) * .08;
      center.lerp(inner[ridge], lean);
      crown = innerCut[ridge].map(coord => THREE.MathUtils.lerp(.5, coord, lean));
      for (let i = 0; i < inner.length; i++) {
        const roll = RISER_BEVEL[(i + turn + 8) % 8] + .05 * Math.abs(worn);
        inner[i].lerp(center, roll);
        innerCut[i] = innerCut[i].map((coord, axis) => THREE.MathUtils.lerp(coord, crown[axis], roll));
      }
      const favorLeft = .5 + worn * .19;
      const upperShoulder = inner[4].clone().lerp(inner[5], favorLeft);
      const lowerFace = outer[0].clone().lerp(outer[1], favorLeft);
      const ledge = center.clone().lerp(upperShoulder, .52);
      const pocket = center.clone().lerp(lowerFace, .35 + Math.abs(worn) * .12);
      const ledgeUV = crown.map((coord, axis) => THREE.MathUtils.lerp(coord,
        THREE.MathUtils.lerp(innerCut[4][axis], innerCut[5][axis], favorLeft), .52));
      const pocketUV = crown.map((coord, axis) => THREE.MathUtils.lerp(coord,
        THREE.MathUtils.lerp(BLOCK_BEVEL[0][axis], BLOCK_BEVEL[1][axis], favorLeft), .35 + Math.abs(worn) * .12));
      fold = {left: turn < 0 ? 6 : 7, right: turn < 0 ? 2 : 3, ledge, pocket, ledgeUV, pocketUV};
    }
    function facet(peak, a, b, peakUV, aUV, bUV, shade, aTone = aUV[1], bTone = bUV[1]) {
      const light = sunlight(peak, a, b) + .02 + worn * .057 + shade;
      vertex(peak, color, light, 0, 1, peakUV, underTurf);
      vertex(a, color, light + aTone * .11, 0, 1, aUV, underTurf);
      vertex(b, color, light + bTone * .11, 0, 1, bUV, underTurf);
    }
    for (let i = 0; i < outer.length; i++) {
      const next = (i + 1) % outer.length;
      const [u0, v0] = BLOCK_BEVEL[i], [u1, v1] = BLOCK_BEVEL[next];
      const alongGrain = (v0 + v1) * .5 - .55 + (u0 + u1 - 1) * worn * .38;
      const splitLight = split ? THREE.MathUtils.clamp(alongGrain, -.53, .39) * .32 : 0;
      const lip = BEVEL_LIGHT[i] + worn * .04 + splitLight;
      face(outer[i], outer[next], inner[next], inner[i], color, lip - .04, lip + .045,
        0, undefined, [BLOCK_BEVEL[i], BLOCK_BEVEL[next], innerCut[next], innerCut[i]], underTurf);
      const raised = fold && i >= fold.right && i < fold.left;
      const peak = fold ? raised ? fold.ledge : fold.pocket : center;
      const peakUV = fold ? raised ? fold.ledgeUV : fold.pocketUV : crown;
      const shade = fold ? (raised ? .105 + splitLight * .34 : -.10 + splitLight * .40) : 0;
      facet(peak, inner[i], inner[next], peakUV, innerCut[i], innerCut[next], shade, v0, v1);
    }
    if (fold) {
      // The high shelf and the lower facet share the same off-center hinge.
      const {left, right, ledge, pocket, ledgeUV, pocketUV} = fold;
      facet(ledge, inner[left], center, ledgeUV, innerCut[left], crown, .121);
      facet(ledge, center, inner[right], ledgeUV, crown, innerCut[right], .092);
      facet(pocket, inner[right], center, pocketUV, innerCut[right], crown, -.117);
      facet(pocket, center, inner[left], pocketUV, crown, innerCut[left], -.088);
    }
  }

  for (const {first, last, foot, back, height, shore} of BANKS) {
    const front = foot > back;
    const profile = shore ? SHORE_PROFILE : front ? FRONT_PROFILE : REAR_PROFILE;
    const sandContact = shore ? 4 : 0;
    // The terrace ends close in stone where an old ramp began. Keep them away from the adjoining lanes.
    const start = first + (front ? 1 : 1.5), finish = last - (front ? 1 : 1.5);
    function samplePoint(sample) {
      const edgeDistance = Math.min(sample - start, finish - sample);
      const shoulder = THREE.MathUtils.smoothstep(edgeDistance, 0, 1.8);
      const taper = .70 + shoulder * .3;
      const index = Math.floor(sample), blend = sample - index;
      const row = {x: THREE.MathUtils.lerp(coast[index].x, coast[index + 1].x, blend),
        z: THREE.MathUtils.lerp(coast[index].z, coast[index + 1].z, blend)};
      const breadth = .009 * Math.cos(sample * .87) + .006 * Math.sin(sample * 1.92);
      const rise = height + Math.sin(sample * .92) * .09 + Math.cos(sample * 1.84) * .045;
      return (radius, elevation) => shelfPoint(row, foot + breadth, back + breadth * .31, taper, rise, radius,
        elevation * (1 + taper * Math.sin(sample * 1.11 + radius * 3) * .027));
    }
    const sodRings = profile.flatMap((entry, ring) => entry[3] === LIP ? [ring] : []);
    // Map the existing treads from the sod rim to the base of the next rise. The surface
    // shade can roll across the full shoulder while the authored shape and plant feet stay fixed.
    const treads = new Map();
    for (const [tier, sodRing] of sodRings.entries()) {
      const from = sodRing + 1;
      let to = from;
      while (to < profile.length - 1 && profile[to][3] === TURF) to++;
      const outer = profile[from][0], inner = profile[to][0];
      const across = ring => (profile[ring][0] - outer) / (inner - outer);
      for (let ring = from; ring < to; ring++) {
        treads.set(ring, {from: across(ring), to: across(ring + 1), recessed: tier === 0});
      }
    }
    const rows = [];
    for (let sample = start; sample <= finish; sample += STEP) {
      const point = samplePoint(sample);
      const overhang = .031 + .006 * Math.sin(sample * 2.3);
      const shape = profile.map(([radius, elevation, , material]) => point(radius - (material === LIP ? overhang : 0), elevation));
      const sod = Object.fromEntries(sodRings.map(ring => {
        const [from, low] = profile[ring], [to, high] = profile[ring + 1];
        const curl = .025 * Math.sin(sample * 3.4 + ring) + .014 * Math.cos(sample * 6.7);
        return [ring, [shape[ring], ...SOD_PROFILE.slice(1, -1).map(([across, rise]) =>
          point(THREE.MathUtils.lerp(from - overhang, to, across + curl), THREE.MathUtils.lerp(low, high, rise))),
        shape[ring + 1]]];
      }));
      const endFade = THREE.MathUtils.smoothstep(Math.min(sample - start, finish - sample), 0, 1.8);
      rows.push({sample, point, shape, sod, endFade});
    }
    function heightAt(radius) {
      const next = profile.findIndex(([r]) => r >= radius);
      const [r0, h0] = profile[Math.max(0, next - 1)], [r1, h1] = profile[next];
      return THREE.MathUtils.lerp(h0, h1, r0 === r1 ? 0 : (radius - r0) / (r1 - r0));
    }
    if (art) {
      const addPlant = (name, along, across, scale) => {
        const sample = THREE.MathUtils.lerp(start, finish, along);
        const plant = samplePoint(sample)(across, heightAt(across));
        if (!plantings.has(name)) plantings.set(name, []);
        plantings.get(name).push([plant, scale]);
      };
      FOLIAGE[first].forEach(entry => addPlant(...entry));
      const [along, across] = ROCK_GARDENS[first];
      // Contrast the warm courses with gray stones and tucked foliage, like a natural rock garden.
      addPlant('rock', along, across, front ? .65 : .82);
      addPlant('rock', along + .08, across - .074, .40);
      addPlant('grass-tuft', along - .035, across - .106, .54);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const {point: a, endFade: fadeA} = rows[i], {point: b, endFade: fadeB} = rows[i + 1];
      const farA = a(-.26, 0), farB = b(-.26, 0), nearB = b(.10, 0), nearA = a(.10, 0);
      const castA = castOffset(nearA, farA, .52 + .48 * fadeA);
      const castB = castOffset(nearB, farB, .52 + .48 * fadeB);
      face(farA, farB, nearB, nearA, SHADOW, 0, 0, -1, [0, 0, .58, .58],
        [[sandContact, castA.x, castA.y], [sandContact, castB.x, castB.y],
          [sandContact + 1, castB.x, castB.y], [sandContact + 1, castA.x, castA.y]]);
    }
    for (const [side, row] of [rows[0], rows.at(-1)].entries()) {
      // Return the stone courses around the exposed ends. The backs dissolve into the meadow.
      for (let i = profile.length - 2; i >= 0; i--) {
        const a = row.shape[i], b = row.shape[i + 1];
        const floorA = a.clone().setY(0), floorB = b.clone().setY(0);
        const opacity = THREE.MathUtils.smoothstep(1 - profile[i][0], .04, .29);
        face(floorA, floorB, b, a, ENDS[side], -.15, .06, 0, [opacity, opacity, opacity, opacity]);
      }
      const direction = side ? 1 : -1;
      const shadowRim = samplePoint(row.sample + direction * .37);
      const nearA = row.point(.08, 0), nearB = row.point(.83, 0);
      const farB = shadowRim(.83, 0), farA = shadowRim(.08, 0);
      const castA = castOffset(nearA, farA, .76), castB = castOffset(nearB, farB, .56);
      face(nearA, nearB, farB, farA, SHADOW, 0, 0, -1, [.43, .31, 0, 0],
        [[sandContact + 3, castA.x, castA.y], [sandContact + 3, castB.x, castB.y],
          [sandContact + 2, castB.x, castB.y], [sandContact + 2, castA.x, castA.y]]);
      for (let course = 1; course >= 0; course--) {
        const rowOffset = course ? .15 : 0;
        const lower = course ? .49 : .07, upper = course ? .94 : .46;
        for (let block = 0; block <= 3; block++) {
          const left = Math.max(.035, block * .239 - rowOffset + .011);
          const right = Math.min(.863, (block + 1) * .239 - rowOffset - .011);
          if (right - left < .07) continue;
          const tint = STONE[(side + course + block + 1) % STONE.length].clone().lerp(ENDS[side], .47);
          const point = (u, v, bulge) => {
            const radius = THREE.MathUtils.lerp(left, right, u);
            const height = heightAt(radius) * THREE.MathUtils.lerp(lower, upper, v);
            return samplePoint(row.sample + direction * bulge * 2.1)(radius, height);
          };
          stone(point, tint, Math.cos(block * 2.41 + row.sample * .77));
        }
      }
    }
    function rockCourse(from, to, upper) {
      const span = profile.slice(from, to + 1);
      const low = span[0][1], high = span.at(-1)[1];
      function across(sample, v, bulge) {
        const h = THREE.MathUtils.lerp(low, high, v);
        const index = Math.max(1, span.findIndex(([, height]) => height >= h));
        const [r0, h0] = span[index - 1], [r1, h1] = span[index];
        return samplePoint(sample)(THREE.MathUtils.lerp(r0, r1, (h - h0) / (h1 - h0)) - bulge, h);
      }
      // A massive lower plinth carries the finer, staggered stone courses above it.
      const courses = upper ? [[.46, .965, .61, 1], [.035, .43, 0, 0]] : [[.036, .963, 0, 0]];
      const grout = upper ? .044 : .049;
      for (const [bottom, top, shift, course] of courses) {
        let column = 0;
        for (let next = start - shift; next < finish; column++) {
          const width = BLOCK_WIDTHS[(column + from + (upper ? 2 : 0)) % BLOCK_WIDTHS.length] * (upper ? 1 : .91);
          const left = Math.max(start + .014, next + grout), right = Math.min(finish - .014, next + width - grout);
          if (right - left > .19) {
            const worn = Math.sin(column * 2.41 + start * .77 + course * 1.9 + from);
            const groutRipple = .022 * worn;
            const point = (u, v, bulge) => across(THREE.MathUtils.lerp(left, right, u),
              THREE.MathUtils.lerp(bottom, top, v) + (1 - 2 * u) * groutRipple, bulge);
            stone(point, STONE[(column + course * 3 + from) % STONE.length], worn, !upper || course === 1, !upper);
          }
          next += width;
        }
      }
    }
    for (let layer = profile.length - 2; layer >= 0; layer--) {
      const band = profile[layer][3];
      let bottom = layer;
      while (band === STONE && profile[bottom - 1]?.[3] === STONE) bottom--;
      for (let ring = layer; ring >= bottom; ring--) {
        const [, , innerTone] = profile[ring], [, , outerTone] = profile[ring + 1];
        const lastSlope = profile.length - 2;
        const capInner = ring === lastSlope ? .74 : 1;
        const capOuter = ring === lastSlope ? 0 : ring === lastSlope - 1 ? .74 : 1;
        const tint = band === STONE ? MORTAR : band;
        const turf = Number(band === TURF);
        const tread = treads.get(ring);
        for (let i = 0; i < rows.length - 1; i++) {
          const {shape: left, sample, sod: leftSod, endFade: fadeLeft} = rows[i];
          const {shape: right, sod: rightSod, endFade: fadeRight} = rows[i + 1];
          const variation = .026 * Math.sin(sample * .89);
          if (band === LIP) {
            const a = leftSod[ring], b = rightSod[ring];
            for (let strip = SOD_MATERIAL.length - 1; strip >= 0; strip--) {
              const [sodMaterial, sodTint] = SOD_MATERIAL[strip];
              const shade = SOD_PROFILE[strip][2] + variation;
              const light = SOD_PROFILE[strip + 1][2] + variation;
              face(a[strip], b[strip], b[strip + 1], a[strip + 1], sodTint, shade, light, sodMaterial);
            }
            continue;
          }
          const treadDetail = tread && [[tread.from, fadeLeft], [tread.from, fadeRight], [tread.to, fadeRight], [tread.to, fadeLeft]];
          face(left[ring], right[ring], right[ring + 1], left[ring + 1], tint,
            innerTone + variation, outerTone + variation, turf, [capInner, capInner, capOuter, capOuter], treadDetail, tread?.recessed);
        }
      }
      if (band === STONE) rockCourse(bottom, layer + 1, layer > 5);
      layer = bottom;
    }

  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('terraceMaterial', new THREE.Float32BufferAttribute(materials, 4));
  geometry.setAttribute('surfaceDetail', new THREE.Float32BufferAttribute(surfaceDetails, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}}, vertexColors: true, side: THREE.DoubleSide,
    forceSinglePass: true, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 terraceMaterial;
      attribute vec3 surfaceDetail;
      ${groundProjectionGlsl}
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
      varying vec3 vSurface;
      void main() {
        vec2 groundOffset = vec2(0.0);
        if (terraceMaterial.z < -.5) {
          // Only the soft painted projection extends. The stone, grass and their feet stay fixed.
          groundOffset = surfaceDetail.yz * (1.0 - mod(surfaceDetail.x, 2.0));
        }
        vTerrace = terraceMaterial;
        vTerrace.xy += groundOffset;
        vTone = color;
        vTerrain = position.xy + projectGround(groundOffset);
        vSurface = surfaceDetail;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vTerrain, position.z, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      ${sandstoneFinishGlsl}
      uniform sampler2D uCoastArt;
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
      varying vec3 vSurface;
      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2(vec2 p) {
        vec2 cell = floor(p), offset = fract(p);
        vec2 fade = offset * offset * (3.0 - 2.0 * offset);
        return mix(mix(hash2(cell), hash2(cell + vec2(1, 0)), fade.x),
          mix(hash2(cell + vec2(0, 1)), hash2(cell + vec2(1, 1)), fade.x), fade.y);
      }
      void main() {
        vec2 floorPoint = unprojectGround(vTerrain);
        vec2 shore = floorPoint / vec2(${COAST.rx.toFixed(1)}, ${COAST.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${COAST.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        if (length(shore) >= rim * .994) discard;
        vec2 samplePoint = vec2(vTerrace.x / 64.0, -vTerrace.y * ${LEGACY_DEPTH} / 48.0) * .64 + .5;
        vec3 source = texture2D(uCoastArt, samplePoint).rgb;
        float grain = smoothstep(.11, .43, dot(source, vec3(.27, .62, .11)));
        float height = vTerrain.y - projectGround(vTerrace.xy).y;
        float grainBreak = noise2(vec2(vTerrain.x * 4.8, height * 8.2));
        vec2 floorUv = vec2(floorPoint.x / 64.0, -floorPoint.y * ${LEGACY_DEPTH} / 48.0) + .5;
        if (vTerrace.z < -.5) {
          // Let skylight cool the original grass under the banks. The sun-facing side has a
          // tighter shadow, and the opposite side has a longer falloff across the same strip.
          vec3 meadow = texture2D(uCoastArt, floorUv).rgb;
          float towardStone = mod(vSurface.x, 2.0);
          float contact = smoothstep(.51, .90, towardStone);
          float direction = min(1.0, length(vSurface.yz) * 1.55);
          float falloff = smoothstep(mix(.23, .01, direction), .75, towardStone);
          float grass = smoothstep(.015, .085, meadow.g - meadow.r);
          float shade = (.29 + direction * .34) * falloff * grass + .52 * contact;
          float edgeFade = mix(1.0, .72, step(1.5, mod(vSurface.x, 4.0)));
          vec3 soil = mix(meadow * vec3(.49, .60, .60), vTone, .15 * contact);
          if (vSurface.x >= 4.0) {
            // Sand pressed against the shelves picks up warm stone dust and a few sunlit grains.
            float grit = noise2(floorPoint * vec2(9.6, 14.2));
            float skirt = smoothstep(.10, .83, towardStone + (grit - .5) * .22);
            float sand = (1.0 - grass) * skirt;
            vec3 loam = meadow * mix(vec3(.63, .51, .38), vec3(.81, .70, .59), grit);
            soil = mix(soil, loam, sand);
            shade += sand * (.19 + direction * .19) * (1.0 - contact * .29);
          }
          gl_FragColor = vec4(soil, min(.87, shade * edgeFade));
          #include <colorspace_fragment>
          return;
        }
        if (vTerrace.z < .5) {
          vec3 stone = vTone * mix(.91, 1.10, grain);
          vec2 layers = vec2(vTerrace.x + vTerrace.y * .36, height + vTerrace.y * .13);
          float cut = min(vSurface.z, 1.0);
          stone = cutSandstone(stone, layers, vSurface.xy, cut);
          // Tight earth contact grounds the lower stone bevel and the uncut mortar.
          float rootShadow = (1.0 - smoothstep(.015, .21, height)) * .25;
          float patina = smoothstep(.50, .83, grainBreak) * (1.0 - smoothstep(.08, .37, vSurface.y));
          float sodShade = step(1.5, vSurface.z) * smoothstep(.68, .98, vSurface.y);
          float corners = smoothstep(.19, .48, abs(vSurface.x - .5));
          float toe = (1.0 - smoothstep(.03, .27, vSurface.y)) * corners * cut;
          stone = mix(stone, stone * vec3(.70, .78, .65), sodShade * (.48 + grainBreak * .22));
          stone = mix(stone, stone * vec3(.82, .94, .72), .48 * patina * cut);
          stone *= 1.0 - rootShadow - toe * (.12 + grainBreak * .06);
          gl_FragColor = vec4(stone, vTerrace.w);
          #include <colorspace_fragment>
          return;
        }
        // Low grass clumps follow the tread while the sculpted lip casts a dark, rooted overhang.
        float lip = smoothstep(1.0, 2.0, vTerrace.z);
        float underside = smoothstep(2.28, 2.88, vTerrace.z);
        vec2 sward = vTerrace.xy * vec2(4.2, 5.3);
        float patches = noise2(sward * .43);
        float tufts = noise2(sward * 3.8 + vec2(patches));
        float tips = noise2(vTerrace.xy * vec2(23.0, 32.0) + vec2(height * 3.6));
        float moss = smoothstep(.35, .67, grainBreak);
        vec3 turfColor = mix(vTone, source, .27 - underside * .12);
        turfColor = mix(turfColor, vec3(.37, .46, .081), lip * (.12 + moss * .13) * (1.0 - underside));
        turfColor = mix(turfColor, vec3(.115, .136, .041), underside * (.39 + tufts * .18));
        // Broad smooth shoulders catch light up front. At the base of the next rise a
        // broken band of moss and short grass makes the lower shelf read as a separate step.
        float wobble = noise2(vTerrace.xy * .92) - .5;
        float across = vSurface.x + wobble * .18 + (patches - .5) * .06;
        float shoulder = smoothstep(-.13, .13, across) * (1.0 - smoothstep(.47, .91, across)) * vSurface.y;
        float wallPocket = noise2(sward * vec2(.48, .22));
        float recess = step(1.5, vSurface.z) * smoothstep(.57 - wallPocket * .08, 1.0, across);
        turfColor = mix(turfColor, vec3(.425, .553, .105), shoulder * .43);
        turfColor = mix(turfColor, vec3(.123, .193, .047), recess * (.31 + .12 * wallPocket + .07 * moss));
        float meadowGrain = (tips - .5) * .12 + (tufts - .5) * .18 + (patches - .5) * .19;
        float leafLight = lip * (1.0 - underside) * smoothstep(.56, .87, tufts * .59 + tips * .41) * .16;
        float shoulderLight = shoulder * (.25 + (tufts - .5) * .13) - recess * (.22 + wallPocket * .09);
        vec3 turf = turfColor * (mix(.89, 1.12, grain) + meadowGrain + leafLight + shoulderLight);
        vec3 meadow = texture2D(uCoastArt, floorUv).rgb;
        float seamBlend = (1.0 - smoothstep(.12, .83, vTerrace.w)) * smoothstep(-.02, .12, meadow.g - meadow.r);
        turf = mix(turf, meadow, seamBlend * .88);
        gl_FragColor = vec4(turf, vTerrace.w);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'home-inland-terraces';
  mesh.renderOrder = 4.7;
  mesh.raycast = () => {};
  root.add(mesh);
  if (art) addTerraceFoliage(root, art, plantings);
  return mesh;
}
