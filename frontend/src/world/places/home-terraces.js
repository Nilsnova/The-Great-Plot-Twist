// Sandstone terraces along the shoulders of Home Island. Elevation belongs only to the view.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {artSizes} from '../art.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, unprojectGround} from '../projection.js';
import {seaUniforms} from '../water.js';
import {averageStoneLight, paintedSandstoneGlsl, REAR_TURF, sandstoneFinishGlsl, weatheredSandstoneGlsl} from './home-relief.js';
import {surfaces} from './surfaces.js';

const COAST = surfaces.home_islet;
// Coast samples are spaced two degrees apart. The rear banks hug the cliff so the
// wall foundations have level ground in front. The southern banks face the sea.
const BANKS = [
  {first: 97, last: 106, foot: .935, back: .986, height: 2.54, shore: true, reserve: .071, crowns: [.37, .77]},
  {first: 116.5, last: 124.5, foot: .773, back: .963, height: 2.75},
  {first: 125, last: 135, foot: .891, back: .958, height: 2.08, shore: true, reserve: .022, crowns: [.30, .82]},
  {first: 137, last: 146, foot: .921, back: .955, height: 1.72, shore: true, reserve: .016, crowns: [.73, .25], stepBack: .119},
  {first: 148, last: 156, foot: .826, back: .964, height: 2.87},
  {first: 166, last: 171, foot: .790, back: .946, height: 3.58, reserve: .045},
  {first: 30, last: 37, foot: .985, back: .888, height: 2.18},
  {first: 55, last: 67, foot: .958, back: .835, height: 1.62},
  // These low grass shelves turn away from the side landings into the existing rock shoulders.
  {first: 96.55, last: 100.5, foot: .899, back: .792, height: .92, beach: true, curlsIntoSand: true},
  {first: 168.9, last: 174.2, foot: .917, back: .814, height: 1.26, beach: true},
  {first: 72.65, last: 78.9, foot: .987, back: .866, height: .93, beach: true, shoreBench: true},
  {first: 8.5, last: 17.35, foot: .986, back: .933, height: .95, beach: true, shoreBench: true, curlsIntoSand: true,
    widenedSeat: [15.72, 16.45, 16.92, 17.35, .050]},
];
// Tall caps emerge at unequal positions on their existing treads. Values are
// the centre and half-width along the bank, rise in world units and flat crown fraction.
const CRAGS = {
  30: [.51, .49, .97, .64],
  55: [.91, .25, .56, .72],
};
// Parts of the lowest southern stone courses continue down into the cliff face.
// Each span gives its centre and half-width in coast samples, then the depth below the old top.
const CLIFF_FOOTINGS = {30: [33.3, 2.15, .43], 55: [61.2, 3.94, .49]};
// Keep the upper forebanks at their old height over the bell and southwest gun.
const FRONT_CLEARANCE = {30: [31.03, 31.8, 35.14, 36.09], 55: [59.48, 60.85, 62.62, 64.03]};
const REAR_CRESTS = {
  97: [.40, .78, .37],
  116.5: [.36, .87],
  125: [.29, .79],
  137: [.72, .21],
  148: [.47, .86],
  166: [.64, .20, .56],
};
// Extra depth below the lower and upper grass shelves, in world units.
const REAR_RISE = {
  97: [.09, .26], 116.5: [.30, .76], 125: [.38, 1.06],
  137: [.26, .83], 148: [.32, .81], 166: [.11, .34],
};
const STONE = ['#c79c67', '#dbaf77', '#b88b60', '#d4ae7e', '#c59767'].map(hex => new THREE.Color(hex));
const REAR_STONE = ['#b89d7a', '#c6ae8e', '#a89175', '#c7a984', '#b8a28a'].map(hex => new THREE.Color(hex));
const REAR_BED = new THREE.Color('#80664f');
const STRATUM = .27;
const MORTAR = new THREE.Color('#96734f'), RECESS = new THREE.Color('#765840');
const ENDS = [new THREE.Color('#aa8357'), new THREE.Color('#b99165')];
const TURF = new THREE.Color('#8bb943'), LIP = new THREE.Color('#b0d557'), ROOTS = new THREE.Color('#739e3a');
const GRASS_CREST = TURF.clone().lerp(LIP, .56);
const HIGH_TURF = TURF.clone().lerp(ROOTS, .42);
const WORN_LEDGE = 4;
const RETURN_LEDGE = 4.5;
// These two shallow saddles join the backs of neighboring banks. The higher
// shelf ends and the open watchtower landing remain in their original places.
const REAR_SADDLES = [[120.25, 128.78], [142.94, 152.38]];
const WEST_COVE_JOIN = 128.46;
const EAST_COVE_JOIN = 143.19;
// The breaks preserve the dry platforms under the two corner guns.
const REAR_RETURNS = [
  {first: 104.02, last: 111.45, crest: .84, headland: [105.03, 105.92, 106.8, 108.08, .77]},
  {first: 115.8, last: 119.14, crest: .74},
  {first: 158.34, last: 168.25, crest: .83, headland: [162.44, 163.71, 166.52, 167.77, .83]},
];
const RETURN_PROFILE = [
  [0, 0, -.18, RECESS], [.032, .103, -.19, STONE], [.089, .333, -.05, STONE], [.146, .428, .09, ROOTS],
  [.238, .462, .095, TURF], [.443, .460, .025, TURF], [.485, .459, -.14, RECESS], [.514, .568, -.21, STONE],
  [.580, .824, -.035, STONE], [.641, .940, .085, ROOTS], [.729, 1, .10, TURF], [.872, .991, .055, TURF],
  [.943, .638, -.032, STONE], [1, 0, -.13, RECESS],
];
function between(sample, start, rise, fall, end) {
  return THREE.MathUtils.smoothstep(sample, start, rise) * (1 - THREE.MathUtils.smoothstep(sample, fall, end));
}
const WEST_SADDLE_PROFILE = [
  [0, 0, -.19, RECESS], [.029, .061, -.23, STONE], [.065, .303, -.05, STONE], [.104, .418, .06, ROOTS],
  [.163, .454, .13, GRASS_CREST], [.409, .454, .07, TURF], [.481, .452, -.13, RECESS],
  [.509, .552, -.20, STONE], [.544, .819, -.035, STONE], [.593, .932, .09, ROOTS],
  [.681, .980, .13, GRASS_CREST], [.870, .977, .08, TURF], [.950, .771, .03, TURF], [1, .02, -.18, RECESS],
];
// Two sandstone courses wrap around the socket. The grass seats widen towards
// the pine shelf and the seaward end falls away into the existing sand.
const EAST_SADDLE_PROFILE = [
  [0, 0, -.19, RECESS], [.032, .069, -.23, STONE], [.063, .312, -.08, STONE], [.096, .403, .04, STONE],
  [.141, .454, .09, ROOTS], [.191, .478, .15, GRASS_CREST], [.350, .482, .07, TURF], [.423, .480, .03, TURF],
  [.467, .461, -.14, RECESS], [.491, .552, -.21, STONE], [.534, .797, -.04, STONE], [.574, .917, .06, STONE],
  [.613, .955, .09, ROOTS], [.683, .981, .136, GRASS_CREST], [.874, .977, .076, TURF],
  [.953, .774, .008, TURF], [1, .0, -.19, RECESS],
];
const SADDLE_BED = new THREE.Color('#88715b');
const FOLIAGE = {
  97: [['birch', .56, .70, .49], ['shrub', .19, .64, .64], ['shrub', .74, .31, .49], ['flowers', .41, .31, .52]],
  116.5: [['shrub', .21, .73, .65], ['shrub', .27, .68, .51], ['grass-tuft', .56, .74, .56], ['shrub', .81, .71, .62],
    ['shrub', .37, .28, .41], ['flowers', .72, .34, .56], ['grass-tuft', .64, .27, .20]],
  125: [['grass-tuft', .16, .66, .43], ['shrub', .42, .74, .47], ['flowers', .72, .74, .37],
    ['grass-tuft', .36, .62, .22], ['grass-tuft', .59, .82, .24], ['grass-tuft', .51, .29, .21]],
  137: [['shrub', .68, .71, .42], ['flowers', .23, .58, .37], ['grass-tuft', .41, .63, .40],
    ['grass-tuft', .36, .77, .24], ['grass-tuft', .58, .33, .23]],
  148: [['shrub', .31, .68, .60], ['shrub', .38, .72, .51], ['grass-tuft', .66, .73, .62], ['shrub', .83, .70, .52],
    ['flowers', .15, .34, .60], ['shrub', .57, .32, .44], ['grass-tuft', .72, .31, .20], ['grass-tuft', .53, .81, .22]],
  166: [['birch', .65, .72, .51], ['shrub', .42, .67, .66], ['shrub', .54, .69, .47], ['flowers', .21, .29, .60],
    ['grass-tuft', .81, .29, .56]],
  30: [['shrub', .23, .72, .58], ['shrub', .35, .75, .42], ['grass-tuft', .71, .72, .62], ['flowers', .78, .33, .52]],
  55: [['grass-tuft', .25, .69, .62], ['shrub', .46, .72, .55], ['shrub', .63, .77, .64], ['flowers', .78, .32, .55]],
};
// Layered groups on the grass above the two beaches, from the higher north
// shoulders to the lower south benches. Use world coordinates to leave the
// original beach mouths, gun platforms and build markers between the groups.
const SIDE_TURF_PLANTS = [
  ['birch', -16.50, -11.98, .35, true], ['rock', -16.18, -11.91, .29, true],
  ['flowers', -16.61, -11.64, .28, true],

  ['home-broadleaf', -18.10, -8.62, .75], ['flowers', -18.24, -8.18, .46],
  ['grass-tuft', -17.73, -8.91, .45], ['shrub', -18.88, -8.73, .48],
  ['shrub', -17.65, -5.78, .52], ['flowers', -17.47, -5.58, .34], ['grass-tuft', -17.73, -6.01, .31],

  ['home-broadleaf', 15.42, -6.96, .67], ['flowers', 15.62, -6.83, .37], ['grass-tuft', 15.11, -7.04, .39],
  ['home-broadleaf', 17.60, -5.83, .73], ['rock', 17.37, -6.16, .25],
  ['flowers', 17.88, -5.41, .46], ['grass-tuft', 18.03, -5.25, .33], ['grass-tuft', 17.88, -5.09, .19],

  ['home-broadleaf', -16.72, 9.24, .77], ['shrub', -16.19, 9.79, .52],
  ['flowers', -16.06, 10.36, .52], ['grass-tuft', -16.57, 9.95, .45],
  ['rock', -16.44, 8.86, .29], ['grass-tuft', -15.89, 10.67, .30], ['grass-tuft', -16.39, 10.45, .22],

  ['home-broadleaf', 16.26, 6.88, .64], ['grass-tuft', 16.14, 7.29, .38], ['flowers', 16.12, 7.62, .28],
  ['home-broadleaf', 15.91, 9.31, .80], ['grass-tuft', 15.93, 8.77, .43],
  ['flowers', 15.56, 10.22, .53], ['rock', 15.72, 9.92, .30], ['grass-tuft', 15.36, 10.53, .22],
];
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
// Match the village cast when viewed from the normal camera, where positive Z runs down the screen.
const GROUND_CAST = new THREE.Vector2(.66, .75).normalize();
const SUN = new THREE.Vector3(-GROUND_CAST.x * .64, .77, -GROUND_CAST.y * .64).normalize();
const STEP = .5;
const BLOCK_WIDTHS = [1.72, 2.24, 2.41, 1.68, 2.16, 1.52];
const BLOCK_BEVEL = [
  [.12, 0], [.86, 0], [1, .18], [1, .79], [.85, 1], [.14, 1], [0, .83], [0, .18],
];
const STRATUM_OUTLINE = [
  [.11, .035], [.48, .015], [.82, .045], [.985, .19], [1, .62],
  [.84, .915], [.52, .98], [.20, .935], [0, .705], [.018, .245],
];
const RISER_BEVEL = [.10, .19, .25, .14, .26, .32, .23, .12];
// A narrow turn under the turf gives the grass a soil edge. The last point rejoins
// the original tread exactly, including the elevation used by the existing plantings.
const SOD_PROFILE = [
  [0, 0, -.22], [-.105, .23, -.20], [.083, .61, .12], [.43, .91, .23], [1, 1, .09],
];
const SOD_MATERIAL = [[2.9, ROOTS], [2.6, ROOTS], [2.0, GRASS_CREST], [1.48, TURF]];
// Height, radial offset, and light across a weathered shelf. A turned toe
// sits below the projecting brow, with a short landing recessed behind it.
const SCARP_PROFILE = [
  [0, 0, -.12], [.30, .021, -.13], [.46, -.045, -.27], [.54, -.142, -.08],
  [.586, -.156, .032], [.608, -.093, .055], [.628, .076, .057], [.669, .132, .028],
  [.81, .109, -.117], [1, 0, .012],
];
// Each stop starts a band. The two faces have deep bases, lit shoulders and grass lips.
// A short incline at the back of the upper tread hides where it joins the old meadow.
const REAR_PROFILE = [
  [0, 0, -.19, RECESS], [.015, .066, -.30, STONE], [.028, .352, -.085, STONE],
  [.044, .479, .15, STONE], [.063, .520, .25, LIP], [.095, .550, .15, TURF],
  [.332, .550, .055, TURF], [.392, .550, -.17, RECESS], [.405, .626, -.29, STONE],
  [.420, .815, -.07, STONE], [.438, .931, .16, STONE], [.458, .985, .28, LIP],
  [.499, 1.016, .14, TURF], [.908, 1.011, .065, TURF], [.963, .688, -.01, TURF],
  [1, .24, -.12, TURF],
];
const FRONT_PROFILE = [
  [0, 0, -.19, RECESS], [.019, .063, -.26, STONE], [.038, .333, -.08, STONE],
  [.054, .475, .15, STONE], [.075, .523, .24, LIP], [.112, .548, .14, TURF],
  [.347, .548, .051, TURF], [.404, .547, -.17, RECESS], [.418, .628, -.29, STONE],
  [.434, .817, -.05, STONE], [.457, .925, .16, STONE], [.489, .973, .28, LIP],
  [.530, 1.005, .14, TURF], [.815, .969, .065, TURF], [.924, .610, .025, TURF],
  [1, .02, -.08, TURF],
];
// Broad grass seats on short sandstone beds. The longest seat is at the low end.
const BEACH_PROFILE = [
  [0, 0, -.19, RECESS], [.027, .057, -.23, STONE], [.063, .235, -.09, STONE],
  [.105, .341, .02, STONE], [.132, .397, .12, LIP], [.182, .430, .066, TURF],
  [.409, .435, .025, TURF], [.458, .421, -.17, RECESS], [.483, .485, -.23, STONE],
  [.516, .651, -.08, STONE], [.547, .784, .05, STONE], [.575, .851, .14, LIP],
  [.636, .874, .061, TURF], [.842, .853, .027, TURF], [.939, .513, -.031, TURF],
  [1, 0, -.06, TURF],
];
// These lower approaches run along the water, with a single grassy bench
// atop a wide sandstone heel instead of two thin parallel lips.
const BEACH_BENCH_PROFILE = [
  [0, 0, -.24, RECESS], [.023, .062, -.25, STONE], [.072, .256, -.09, STONE],
  [.128, .578, .008, STONE], [.164, .764, .072, STONE], [.195, .839, .087, LIP],
  [.245, .876, .061, TURF], [.526, .879, .031, TURF], [.772, .845, -.013, TURF],
  [.880, .601, -.022, TURF], [1, 0, -.064, TURF],
];
// A wide cove platform supports two unequal rocky shoulders. The shoulders rise and
// fall along the shelf instead of forming a second continuous course of masonry.
const SHORE_TREAD_BACK = .463;
const SHORE_PROFILE = [
  [0, 0, -.20, RECESS], [.013, .061, -.28, STONE], [.023, .211, -.15, STONE],
  [.037, .315, .09, STONE], [.057, .363, .20, LIP], [.091, .395, .123, TURF],
  [.387, .395, .065, TURF], [SHORE_TREAD_BACK, .395, -.16, RECESS], [.475, .452, -.26, STONE],
  [.490, .591, -.048, STONE], [.507, .690, .13, STONE], [.530, .744, .24, LIP],
  [.567, .785, .13, TURF], [.924, .784, .061, TURF], [.973, .404, -.01, TURF],
  [1, .026, -.10, TURF],
];

function onTop(x, y) {
  const p = unprojectGround(x, y), coastX = p.x / COAST.rx, coastZ = p.z / COAST.rz;
  const a = Math.atan2(coastZ, coastX);
  const rim = 1 + .055 * Math.sin(a * 5 + COAST.seed) + .035 * Math.cos(a * 7);
  return Math.hypot(coastX, coastZ) < rim * .991;
}

function shelfPoint(row, foot, back, taper, rise, radius, elevation, crestRoom) {
  const reach = Math.min(.987, THREE.MathUtils.lerp(foot, back, .49 + (radius - .49) * Math.sqrt(taper)));
  const p = new THREE.Vector3(row.x * reach, taper * rise * elevation, row.z * reach);
  return clipCrest(p, crestRoom);
}

function clipCrest(p, crestRoom) {
  p.shoreReach = crestRoom;
  const ground = projectGround(p.x, p.z);
  if (p.y > 0 && !onTop(ground.x, ground.y + p.y)) {
    // Find the old outline vertically above this dry foot. The high rear crests may
    // rise above the screen-space shoreline while still standing on the same land.
    let onLand = 0, beyondLand = p.y;
    for (let i = 0; i < 12; i++) {
      const trial = (onLand + beyondLand) * .5;
      if (onTop(ground.x, ground.y + trial)) onLand = trial;
      else beyondLand = trial;
    }
    p.y = Math.min(p.y, onLand + crestRoom);
  }
  return p;
}

function blendStone(a, b, amount) {
  const point = a.clone().lerp(b, amount);
  point.shoreReach = THREE.MathUtils.lerp(a.shoreReach ?? 0, b.shoreReach ?? 0, amount);
  return point;
}

function turfHeight(p, a, b, c) {
  const signedArea = (u, v, w) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
  const area = signedArea(a, b, c);
  if (Math.abs(area) < 1e-7) return -Infinity;
  const u = signedArea(b, c, p) / area, v = signedArea(c, a, p) / area, w = 1 - u - v;
  return Math.min(u, v, w) < -1e-5 ? -Infinity : u * a.y + v * b.y + w * c.y;
}

function rearTurfFaces(relief) {
  const {position, shoreRelief} = relief?.geometry?.attributes ?? {};
  if (!position || !shoreRelief) return [];
  const faces = [];
  for (let first = 0; first < position.count; first += 3) {
    if (shoreRelief.getZ(first) !== REAR_TURF) continue;
    const face = [first, first + 1, first + 2].map(index => {
      const y = -shoreRelief.getX(index);
      return {...unprojectGround(position.getX(index), position.getY(index) - y), y};
    });
    faces.push(face);
  }
  return faces;
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
    const order = {birch: 0, rock: 1, 'home-broadleaf': 1.5, shrub: 2, 'grass-tuft': 3, flowers: 4};
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

function addSideTurfContacts(root, plants) {
  const positions = [], colors = [], indices = [];
  const shade = new THREE.Color('#303a20');
  const segments = 12;
  function vertex(x, y, z, alpha) {
    const index = positions.length / 3;
    const projected = projectGround(x, z);
    positions.push(projected.x, projected.y + y, 0);
    colors.push(shade.r, shade.g, shade.b, alpha);
    return index;
  }
  for (const {x, z, width, depth, opacity, turfAt} of plants) {
    const height = turfAt(x, z);
    if (!Number.isFinite(height)) continue;
    const center = vertex(x, height, z, opacity), transparentCenter = vertex(x, height, z, 0);
    const onBench = (gx, gz) => {
      const y = turfAt(gx, gz);
      return Math.abs(y - height) < .23 ? y : NaN;
    };
    const inner = [], edge = [];
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const dx = Math.cos(angle) * width, dz = Math.sin(angle) * depth;
      let fraction = 1;
      // Taper the shadow within the turf if a leaf grows close to an exposed stone face.
      while (fraction > .15 && !Number.isFinite(onBench(x + dx * fraction, z + dz * fraction))) fraction *= .5;
      const innerX = x + dx * fraction * .51, innerZ = z + dz * fraction * .51;
      const edgeX = x + dx * fraction, edgeZ = z + dz * fraction;
      const innerY = onBench(innerX, innerZ), edgeY = onBench(edgeX, edgeZ);
      inner.push(Number.isFinite(innerY) ? vertex(innerX, innerY, innerZ, opacity * .59) : center);
      edge.push(Number.isFinite(edgeY) ? vertex(edgeX, edgeY, edgeZ, 0) : transparentCenter);
    }
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices.push(center, inner[i], inner[j], inner[i], edge[i], inner[j], edge[i], edge[j], inner[j]);
    }
  }
  if (!indices.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'home-terrace-plant-contacts';
  mesh.renderOrder = 4.79;
  mesh.raycast = () => {};
  root.add(mesh);
}

export function createHomeTerraces(root, coastArt, art) {
  const coast = cliffProfile(COAST), positions = [], colors = [], materials = [], surfaceDetails = [];
  const plantings = new Map();
  const sideTreads = [];
  let eastShoulder, westShoulder, drawEastShoulder, drawWestShoulder;
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  function sideTurfHeight(x, z) {
    const point = {x, z};
    let surface = -Infinity;
    for (const [a, b, c, d] of sideTreads) {
      surface = Math.max(surface, turfHeight(point, a, b, c), turfHeight(point, a, c, d));
    }
    return surface;
  }
  function sunlight(a, b, d) {
    normal.subVectors(b, a).cross(edge.subVectors(d, a)).normalize();
    if (normal.y < 0) normal.negate();
    return .84 + .43 * Math.max(-.68, normal.dot(SUN));
  }
  function vertex(p, tint, light, grass, opacity, detail, recessed = false) {
    const ground = projectGround(p.x, p.z);
    positions.push(ground.x, ground.y + p.y, p.z * .03 + p.y * .09);
    colors.push(tint.r * light, tint.g * light, tint.b * light);
    materials.push(p.x, p.z, grass, opacity * (p.joinOpacity ?? 1));
    // Stone uses cut coordinates, turf uses cross-slope and end fade, and
    // shadow strips use the distance from the foot plus a ground-plane offset.
    if (detail) surfaceDetails.push(detail[0], detail[1], detail[2] ?? (recessed ? 2 : 1));
    else surfaceDetails.push(0, 0, 0);
    surfaceDetails.push(p.shoreReach ?? 0);
  }
  function face(a, b, c, d, tint, lightA, lightB, grass = 0, opacity = [1, 1, 1, 1], detail, recessed) {
    const sun = (sunlight(a, b, c) + sunlight(a, c, d)) * .5;
    for (const [p, corner] of [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]]) {
      vertex(p, tint, sun + (corner < 2 ? lightA : lightB), grass, opacity[corner], detail?.[corner], recessed);
    }
  }

  function scarpSection(low, high, sample, ring, eastern) {
    const rise = high.y - low.y;
    const run = Math.hypot(high.x - low.x, high.z - low.z);
    // The east cove's bed is narrower, so smaller exposed heights still take
    // a shallow bevel without changing any grass or shoreline anchor.
    const exposed = THREE.MathUtils.smoothstep(rise - run * 1.15, eastern ? .034 : .12, eastern ? .177 : .45);
    const worn = .60 + .32 * Math.sin(sample * 2.87 + ring) + .08 * Math.cos(sample * 7.1);
    const riseOffset = .083 * Math.sin(sample * 2.23 + ring * .7) * exposed;
    const points = SCARP_PROFILE.map(([height, extension]) => {
      if (height === 0) return low;
      if (height === 1) return high;
      const point = blendStone(low, high, height + Math.sin(Math.PI * height) * riseOffset);
      const length = Math.hypot(point.x, point.z);
      const reach = 1 + extension * exposed * worn / length;
      point.x *= reach;
      point.z *= reach;
      point.joinOpacity = THREE.MathUtils.lerp(low.joinOpacity ?? 1, high.joinOpacity ?? 1, height);
      return clipCrest(point, point.shoreReach);
    });
    return {points, exposed};
  }
  function stone(point, color, worn, underTurf, split = false) {
    // The original block outline stays put. Rolling the inner rim towards its
    // crown opens broader bevels along the riser and makes the cut change with the grain.
    const outer = BLOCK_BEVEL.map(([u, v]) => point(u, v, 0));
    const innerCut = BLOCK_BEVEL.map(([u, v]) => [.10 + u * .8, .13 + v * .73]);
    const inner = innerCut.map(([u, v]) => point(u, v, .049 + worn * .013));
    let center = point(.5, .5, .084 + worn * .018);
    let crown = [.5, .5], fold;
    if (split) {
      const turn = worn < 0 ? -1 : 1;
      const ridge = turn < 0 ? 6 : 3;
      const lean = .11 + Math.abs(worn) * .08;
      center = blendStone(center, inner[ridge], lean);
      crown = innerCut[ridge].map(coord => THREE.MathUtils.lerp(.5, coord, lean));
      for (let i = 0; i < inner.length; i++) {
        const roll = RISER_BEVEL[(i + turn + 8) % 8] + .05 * Math.abs(worn);
        inner[i] = blendStone(inner[i], center, roll);
        innerCut[i] = innerCut[i].map((coord, axis) => THREE.MathUtils.lerp(coord, crown[axis], roll));
      }
      const favorLeft = .5 + worn * .19;
      const upperShoulder = blendStone(inner[4], inner[5], favorLeft);
      const lowerFace = blendStone(outer[0], outer[1], favorLeft);
      const ledge = blendStone(center, upperShoulder, .52);
      const pocket = blendStone(center, lowerFace, .35 + Math.abs(worn) * .12);
      const ledgeUV = crown.map((coord, axis) => THREE.MathUtils.lerp(coord,
        THREE.MathUtils.lerp(innerCut[4][axis], innerCut[5][axis], favorLeft), .52));
      const pocketUV = crown.map((coord, axis) => THREE.MathUtils.lerp(coord,
        THREE.MathUtils.lerp(BLOCK_BEVEL[0][axis], BLOCK_BEVEL[1][axis], favorLeft), .35 + Math.abs(worn) * .12));
      fold = {left: turn < 0 ? 6 : 7, right: turn < 0 ? 2 : 3, ledge, pocket, ledgeUV, pocketUV};
    }
    const facets = [];
    function facet(a, b, c, aUV, bUV, cUV) {
      facets.push({points: [a, b, c], coordinates: [aUV, bUV, cUV]});
    }
    for (let i = 0; i < outer.length; i++) {
      const next = (i + 1) % outer.length;
      facet(outer[i], outer[next], inner[next], BLOCK_BEVEL[i], BLOCK_BEVEL[next], innerCut[next]);
      facet(outer[i], inner[next], inner[i], BLOCK_BEVEL[i], innerCut[next], innerCut[i]);
      const raised = fold && i >= fold.right && i < fold.left;
      const peak = fold ? raised ? fold.ledge : fold.pocket : center;
      const peakUV = fold ? raised ? fold.ledgeUV : fold.pocketUV : crown;
      facet(peak, inner[i], inner[next], peakUV, innerCut[i], innerCut[next]);
    }
    if (fold) {
      // The high shelf and the lower facet share the same off-center hinge.
      const {left, right, ledge, pocket, ledgeUV, pocketUV} = fold;
      facet(ledge, inner[left], center, ledgeUV, innerCut[left], crown);
      facet(ledge, center, inner[right], ledgeUV, crown, innerCut[right]);
      facet(pocket, inner[right], center, pocketUV, innerCut[right], crown);
      facet(pocket, center, inner[left], pocketUV, crown, innerCut[left]);
    }
    const daylight = averageStoneLight(facets.map(({points}) => points), point => point, sunlight);
    const seam = new Set(outer);
    for (const {points, coordinates} of facets) {
      for (const [i, point] of points.entries()) {
        const uv = coordinates[i];
        const light = .83 + (daylight.get(point) - .82) * .9 + (uv[1] - .46) * .21
          + worn * .037 - (seam.has(point) ? .071 : 0);
        vertex(point, color, light, 0, 1, uv, underTurf);
      }
    }
  }
  function stratum(point, color, lean, underTurf) {
    // Roll out of the original bedding in two shallow steps before the face.
    // The roof and heel still meet at an uneven fracture under the grass.
    const outline = STRATUM_OUTLINE.map(([u, v]) => [u, v + (u - .5) * lean * .10]);
    const near = outline.map(([u, v]) => point(u, v, 0));
    const bevel = outline.map(([u, v]) => [.025 + u * .950, .048 + v * .904]);
    const shoulders = outline.map(([u, v]) => [.073 + u * .854, .131 + v * .738]);
    const rim = bevel.map(([u, v]) => point(u, v, .013 + .007 * v));
    const face = shoulders.map(([u, v]) => point(u, v, .027 + .019 * v));
    const roofUV = [.52 + lean * .14, .605 - lean * .07], heelUV = [.44 - lean * .12, .36 + lean * .06];
    const roof = point(...roofUV, .057), heel = point(...heelUV, .010);
    const facets = [];
    const add = (a, b, c, auv, buv, cuv) => facets.push({points: [a, b, c], uv: [auv, buv, cuv]});
    for (let i = 0; i < near.length; i++) {
      const next = (i + 1) % near.length;
      add(near[i], near[next], rim[next], outline[i], outline[next], bevel[next]);
      add(near[i], rim[next], rim[i], outline[i], bevel[next], bevel[i]);
      add(rim[i], rim[next], face[next], bevel[i], bevel[next], shoulders[next]);
      add(rim[i], face[next], face[i], bevel[i], shoulders[next], shoulders[i]);
      const upper = i >= 3 && i < 8;
      add(upper ? roof : heel, face[i], face[next], upper ? roofUV : heelUV, shoulders[i], shoulders[next]);
    }
    add(roof, face[8], heel, roofUV, shoulders[8], heelUV);
    add(roof, heel, face[3], roofUV, heelUV, shoulders[3]);
    const light = averageStoneLight(facets.map(({points}) => points), corner => corner, sunlight);
    const seam = new Set(near);
    for (const {points, uv} of facets) {
      const local = sunlight(...points);
      for (const [i, corner] of points.entries()) {
        const faceLight = .79 * light.get(corner) + .21 * local + .16 * (uv[i][1] - .5)
          - (seam.has(corner) ? .063 : 0);
        vertex(corner, color, faceLight, STRATUM, 1, uv[i], underTurf);
      }
    }
  }

  // Low exposed bedding continues around both outside shoulders; the original
  // north landing stays between the two main coves.
  for (const {first, last, crest, headland} of REAR_RETURNS) {
    const sections = Math.ceil((last - first) / STEP);
    const [shoulderStart, climb, crown, shoulderEnd, crestLift] = headland ?? [first, first + 1, last - 1, last, 0];
    const rows = Array.from({length: sections + 1}, (_, section) => {
      const sample = THREE.MathUtils.lerp(first, last, section / sections);
      const index = Math.floor(sample), blend = sample - index;
      const x = THREE.MathUtils.lerp(coast[index].x, coast[index + 1].x, blend);
      const z = THREE.MathUtils.lerp(coast[index].z, coast[index + 1].z, blend);
      const taper = THREE.MathUtils.smoothstep(Math.min(sample - first, last - sample), 0, 2.15);
      // Leave room on the old dry top for both corner guns and their platforms.
      const nearGun = first < 120
        ? between(sample, 107.3, 109.45, 115.55, 118)
        : 1 - THREE.MathUtils.smoothstep(sample, 159.25, 162.4);
      const shoulder = crestLift ? between(sample, shoulderStart, climb, crown, shoulderEnd) : 0;
      const width = THREE.MathUtils.lerp(.061 + taper * (.026 + .010 * Math.sin(sample * .99)), .009, nearGun);
      const height = crest * taper * (.82 + .16 * Math.sin(sample * .96) + .08 * Math.cos(sample * 2.39))
        + crestLift * shoulder;
      const points = RETURN_PROFILE.map(([radius, rise]) => {
        const reach = .990 - (1 - radius) * width;
        return clipCrest(new THREE.Vector3(x * reach, height * rise, z * reach), (.29 + .54 * shoulder) * radius * taper);
      });
      // The narrow stone noses carry silt; moss grows in the wider hollows.
      const moss = taper * THREE.MathUtils.smoothstep(width, .018, .075);
      return {points, moss};
    });
    for (let ring = RETURN_PROFILE.length - 2; ring >= 0; ring--) for (let i = 0; i < sections; i++) {
      const {points: a, moss: mossA} = rows[i], {points: b, moss: mossB} = rows[i + 1];
      const [, rise, tone, layer] = RETURN_PROFILE[ring], [, nextRise] = RETURN_PROFILE[ring + 1];
      const sod = layer === ROOTS || layer === TURF;
      const tint = sod ? layer === ROOTS ? ROOTS : HIGH_TURF : layer === RECESS ? SADDLE_BED : REAR_STONE[3];
      const u = i / sections, v = (i + 1) / sections;
      const detail = sod ? [[u, mossA], [v, mossB], [v, mossB], [u, mossA]]
        : [[u, rise], [v, rise], [v, nextRise], [u, nextRise]];
      face(a[ring], b[ring], b[ring + 1], a[ring + 1], tint, tone, tone + .024,
        sod ? RETURN_LEDGE : 0, undefined, detail);
    }
    if (headland) {
      // Where the turf treads gain height, their stone breaks into short
      // overlapping beds. The lower joints sit beneath the larger upper blocks.
      const courses = [[7, 10, .97, .62], [0, 3, 1.28, .19]];
      for (const [floor, roof, spacing, offset] of courses) {
        let left = shoulderStart - offset;
        for (let column = 0; left < shoulderEnd; column++) {
          const lean = Math.sin(first + column * 2.91 + floor);
          const right = left + spacing * (1 + .27 * lean);
          const begin = Math.max(shoulderStart + .14, left + .035);
          const end = Math.min(shoulderEnd - .18, right - .032);
          if (end - begin > .24) {
            const point = (u, v, bevel) => {
              const station = (THREE.MathUtils.lerp(begin, end, u) - first) / (last - first) * sections;
              const i = Math.floor(station), a = rows[i].points, b = rows[i + 1].points;
              const level = THREE.MathUtils.lerp(floor, roof, .013 + v * .957 + lean * .021 * Math.sin(Math.PI * u));
              const ring = Math.floor(level);
              const low = blendStone(a[ring], b[ring], station - i);
              const high = blendStone(a[ring + 1], b[ring + 1], station - i);
              const p = blendStone(low, high, level - ring);
              const bulge = 1 - .083 * bevel;
              p.x *= bulge;
              p.z *= bulge;
              return clipCrest(p, p.shoreReach);
            };
            const pigment = REAR_STONE[(column + floor + Math.floor(first)) % REAR_STONE.length];
            stratum(point, pigment.clone().lerp(REAR_BED, floor ? .20 : .30), lean, true);
          }
          left = right;
        }
      }
    }
  }

  for (const [start, finish] of REAR_SADDLES) {
    const east = start > 140;
    const profile = east ? EAST_SADDLE_PROFILE : WEST_SADDLE_PROFILE;
    const stations = Math.ceil((finish - start) / (east ? .25 : .40));
    const rows = Array.from({length: stations + 1}, (_, station) => {
      const along = station / stations;
      const sample = THREE.MathUtils.lerp(start, finish, along);
      const index = Math.floor(sample), fraction = sample - index;
      const x = THREE.MathUtils.lerp(coast[index].x, coast[index + 1].x, fraction);
      const z = THREE.MathUtils.lerp(coast[index].z, coast[index + 1].z, fraction);
      const anchor = .36 + .64 * THREE.MathUtils.smoothstep(Math.min(along, 1 - along), 0, .23);
      if (east) {
        // The sandstone turns around the last northern wall footing. Both steep
        // ends spread into dry decorative ground away from that corner.
        const landwardLimit = Math.min(-19.11 / z, 8.17 / x);
        const shoulder = THREE.MathUtils.smoothstep(sample, 144.49, 145.74)
          * (1 - THREE.MathUtils.smoothstep(sample, 150.46, finish));
        const width = .995 - Math.max(.917 - .042 * shoulder, landwardLimit);
        const westernShelf = THREE.MathUtils.smoothstep(sample, 143.15, 144.54)
          * (1 - THREE.MathUtils.smoothstep(sample, 145.92, 147.58));
        const easternShelf = THREE.MathUtils.smoothstep(sample, 146.65, 148.42)
          * (1 - THREE.MathUtils.smoothstep(sample, 150.29, finish));
        const beachFold = .62 + .38 * THREE.MathUtils.smoothstep(sample, start, 144.64);
        const foundation = .77 + .05 * Math.cos(sample * 1.63);
        const rise = anchor * beachFold * (foundation + .96 * westernShelf + .91 * easternShelf);
        const lean = .037 * Math.sin(sample * 2.61) + .019 * Math.cos(sample * 4.13);
        return profile.map(([radius, height]) => {
          const cut = radius + Math.sin(Math.PI * radius) * lean * (1 - .5 * height);
          const reach = .995 - width * (1 - cut);
          const brokenBedding = 1 + height * (.021 * Math.sin(sample * 2.06 + radius * 4.1));
          const room = beachFold * (.16 + .96 * radius);
          return clipCrest(new THREE.Vector3(x * reach, rise * height * brokenBedding, z * reach), room);
        });
      }
      // These two courses come out of the seam between the west headland and
      // the cove. They taper down before meeting the sand in the landing.
      const joiningApron = THREE.MathUtils.smoothstep(sample, 120.50, 121.98)
        * (1 - THREE.MathUtils.smoothstep(sample, 125.09, 128.23));
      const width = .993 - (.907 - .080 * joiningApron);
      const beachFold = 1 - .61 * THREE.MathUtils.smoothstep(sample, 126.51, finish);
      const rise = 1.82 * anchor * beachFold * (.93 + .06 * Math.sin(sample * 1.40) + .025 * Math.cos(sample * 2.5));
      return profile.map(([radius, height]) => {
        const taper = anchor + (1 - anchor) * .52;
        const reach = .993 - width * (1 - radius) * taper;
        const room = beachFold * (.17 + .86 * radius);
        return clipCrest(new THREE.Vector3(x * reach, rise * height, z * reach), room);
      });
    });
    if (east) eastShoulder = rows;
    else westShoulder = rows;
    const turn = Math.ceil((EAST_COVE_JOIN + .18 - start) / (finish - start) * stations);
    function drawShoulder(afterCove = false) {
      for (let ring = profile.length - 2; ring >= 0; ring--) {
        for (let i = 0; i < rows.length - 1; i++) {
          if (east && afterCove !== (i >= turn)) continue;
          const a = rows[i], b = rows[i + 1];
          const [, level, tone, layer] = profile[ring];
          const turf = layer === ROOTS || layer === GRASS_CREST || layer === TURF;
          const material = turf ? layer : layer === RECESS ? SADDLE_BED : REAR_STONE[2];
          const seam = .031 * Math.sin(i * .58 + ring * .94);
          const right = (i + 1) / stations, left = i / stations;
          const nextLevel = profile[ring + 1][1];
          face(a[ring], b[ring], b[ring + 1], a[ring + 1], material, tone + seam, tone - .028,
            turf ? layer === ROOTS ? 2.63 : 1.6 : 0, undefined,
            [[left, level], [right, level], [right, nextLevel], [left, nextLevel]]);
        }
      }
      if (east && !afterCove) return;
      // The irregular joints in the upper course sit over whole stones below.
      const courses = east ? [
        [8, 12, [[.086, .318, .94], [.304, .550, .89], [.536, .764, .97], [.749, .961, .83]]],
        [0, 4, [[.062, .247, .86], [.235, .449, .94], [.432, .668, .90], [.654, .841, .98], [.829, .972, .83]]],
      ] : [
        [6, 9, [[.035, .326, .89], [.314, .563, .98], [.549, .771, .87], [.763, .968, .79]]],
        [0, 3, [[.016, .232, .84], [.219, .479, .97], [.461, .699, .88], [.685, .962, .82]]],
      ];
      for (const [floor, brow, masses] of courses) for (const [index, [from, to, top]] of masses.entries()) {
        const point = (u, v, bevel) => {
          const along = THREE.MathUtils.lerp(from, to, u) * stations;
          const station = Math.min(Math.floor(along), stations - 1);
          const across = floor + (brow - floor) * THREE.MathUtils.clamp(v * top + .09 * u * (index % 2 ? 1 : -1), .015, .996);
          const ring = Math.floor(across);
          const a = rows[station], b = rows[station + 1];
          const foot = blendStone(a[ring], b[ring], along - station);
          const head = blendStone(a[ring + 1], b[ring + 1], along - station);
          const p = blendStone(foot, head, across - ring);
          p.x *= 1 - bevel * .037;
          p.z *= 1 - bevel * .037;
          return p;
        };
        const shade = REAR_STONE[(index + floor + (east ? 3 : 1)) % REAR_STONE.length];
        const color = shade.clone().lerp(SADDLE_BED, .27);
        stratum(point, color, index % 2 ? -.60 : .61, true);
      }
    }
    if (east) {
      drawEastShoulder = () => drawShoulder(true);
      drawShoulder();
    } else drawWestShoulder = drawShoulder;
  }

  function shoulderHeight(rows, point) {
    let height = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      for (let ring = 0; ring < a.length - 1; ring++) {
        height = Math.max(height, turfHeight(point, a[ring], b[ring], b[ring + 1]),
          turfHeight(point, a[ring], b[ring + 1], a[ring + 1]));
      }
    }
    return height;
  }

  function westSaddlePoint(sample, radius) {
    const [start, finish] = REAR_SADDLES[0];
    const along = (sample - start) / (finish - start) * (westShoulder.length - 1);
    const section = Math.floor(along), sectionBlend = along - section;
    const ring = Math.max(1, WEST_SADDLE_PROFILE.findIndex(([r]) => r >= radius));
    const [near] = WEST_SADDLE_PROFILE[ring - 1], [far] = WEST_SADDLE_PROFILE[ring];
    const a = westShoulder[section], b = westShoulder[section + 1];
    const left = blendStone(a[ring - 1], b[ring - 1], sectionBlend);
    const right = blendStone(a[ring], b[ring], sectionBlend);
    return blendStone(left, right, (radius - near) / (far - near));
  }

  for (const bank of BANKS) {
    const {first, last, foot, back, height, shore, beach, shoreBench, curlsIntoSand,
      widenedSeat, reserve = 0, crowns, stepBack = 0} = bank;
    const front = foot > back;
    const side = beach || first === 97 || first === 166;
    const foregroundPad = FRONT_CLEARANCE[first];
    const [footCenter, footWidth, footDepth] = CLIFF_FOOTINGS[first] ?? [0, 1, 0];
    const [cragCenter, cragWidth, cragRise, crownWidth] = CRAGS[first] ?? [0, 1, 0, .27];
    const profile = shore ? SHORE_PROFILE.map(([radius, elevation, tone, material]) => {
      // The narrower eastern cove retains space for the lower turf beside the beach.
      const spread = radius < SHORE_TREAD_BACK ? radius / SHORE_TREAD_BACK : (1 - radius) / (1 - SHORE_TREAD_BACK);
      return [radius + stepBack * spread, elevation, tone, material];
    }) : shoreBench ? BEACH_BENCH_PROFILE : beach ? BEACH_PROFILE : front ? FRONT_PROFILE : REAR_PROFILE;
    const sandContact = shore ? 4 : 0;
    const sodRings = profile.flatMap((entry, ring) => entry[3] === LIP ? [ring] : []);
    const lowerSod = profile[sodRings[0] + 1][0];
    const upperSod = profile[(sodRings[1] ?? sodRings[0]) + 1][0];
    const upperToe = profile.find(([radius, , , material]) => radius > 0 && material === RECESS)?.[0];
    const upperBack = profile.at(-3)[0];
    const crests = REAR_CRESTS[first];
    const [lowerRise, upperRise] = REAR_RISE[first] ?? [0, 0];
    const strength = crests?.[2] ?? 1;
    // The terrace ends close in stone where an old ramp began. Keep them away from the adjoining lanes.
    const trim = beach ? 0 : front ? 1 : 1.5;
    const start = first + trim, finish = last - trim;
    const westTreeBank = first === 116.5;
    const westCove = first === 125;
    const westTreads = westCove ? [[0, 0], [lowerSod, .163], [upperToe, .481], [upperSod, .681], [upperBack, .870], [1, 1]] : null;
    const meetsEastShoulder = first === 137;
    const taperEnd = westTreeBank || westCove || meetsEastShoulder;
    const endHeightFactor = westTreeBank ? .56 : .16;
    const taperLength = westTreeBank ? 1.68 : 1.87;
    // Leave the west cove beside the landing. Continue the other cove along its
    // bedding plane until its unplanted end meets the planted eastern shoulder.
    const visibleEnd = westCove ? finish - .16 : meetsEastShoulder ? finish + .68 : finish;
    function samplePoint(sample, atPlant = false) {
      const edgeDistance = Math.min(sample - start, finish - sample);
      const shoulder = THREE.MathUtils.smoothstep(edgeDistance, 0, 1.8);
      const taper = .70 + shoulder * .3;
      const index = Math.floor(sample), blend = sample - index;
      const row = {x: THREE.MathUtils.lerp(coast[index].x, coast[index + 1].x, blend),
        z: THREE.MathUtils.lerp(coast[index].z, coast[index + 1].z, blend)};
      const breadth = .009 * Math.cos(sample * .87) + .006 * Math.sin(sample * 1.92);
      // The two outer shoulders gain height beside the gun and bell pads.
      const frontRise = foregroundPad ? .26 * (1 - between(sample, ...foregroundPad)) : 0;
      const rise = height + frontRise + Math.sin(sample * .92) * .09 + Math.cos(sample * 1.84) * .045;
      // The beach ends and the exposed end below the west tree recede into
      // their original ground. The opposite shoulders keep their full rise.
      const endDistance = westCove ? visibleEnd - sample : sample - start;
      const endSlope = beach ? THREE.MathUtils.smoothstep(edgeDistance, .015, 1.50) : taperEnd
        ? THREE.MathUtils.lerp(endHeightFactor, 1, THREE.MathUtils.smoothstep(endDistance, .06, taperLength)) : 1;
      const tipCurve = curlsIntoSand ? 1 - THREE.MathUtils.smoothstep(sample - start, .61, shoreBench ? 2 : 1.48) : 0;
      const westHeel = curlsIntoSand && !shoreBench ? between(sample - start, .91, 1.51, 2.03, 2.73) : 0;
      const originalFoot = foot + breadth;
      const extraWidth = widenedSeat ? between(sample, ...widenedSeat.slice(0, 4)) * widenedSeat[4] : 0;
      const rim = beach ? originalFoot + (back - extraWidth - originalFoot + breadth * .31)
        * (.30 + .70 * endSlope) * (1 - .34 * tipCurve)
        : back + breadth * .31;
      const shelfFoot = originalFoot - reserve * shoulder;
      const along = (sample - start) / (finish - start);
      // Keep a long bedding plane underneath, with the upper seat rounding into its returns.
      const crestTaper = crests ? .69 + .31 * THREE.MathUtils.smoothstep(edgeDistance, 0, 1.30) : 1;
      // The birch bank returns to the old height beside the first north wall socket.
      const room = westTreeBank ? 1 - THREE.MathUtils.smoothstep(along, .68, .87) : 1;
      const cliffSupport = 1 - THREE.MathUtils.smoothstep(Math.abs(sample - footCenter), footWidth * .31, footWidth);
      const cragLift = cragRise * (1 - THREE.MathUtils.smoothstep(Math.abs(along - cragCenter), cragWidth * crownWidth, cragWidth));
      const crown = crowns && Math.max(
        1 - THREE.MathUtils.smoothstep(Math.abs(along - crowns[0]), .135, .35),
        .73 * (1 - THREE.MathUtils.smoothstep(Math.abs(along - crowns[1]), .078, .202)));
      const mass = crests && (.34 + .66 * Math.max(
        1 - THREE.MathUtils.smoothstep(Math.abs(along - crests[0]), .184, .349),
        .80 * (1 - THREE.MathUtils.smoothstep(Math.abs(along - crests[1]), .133, .273))));
      return (radius, elevation, stoneFoot = false) => {
        if (atPlant && reserve) {
          // Regrade the plant foot at its original world anchor as the shelf broadens towards the meadow.
          const squeeze = Math.sqrt(taper);
          const reach = THREE.MathUtils.lerp(originalFoot, rim, .49 + (radius - .49) * squeeze);
          radius = .49 + ((reach - shelfFoot) / (rim - shelfFoot) - .49) / squeeze;
          elevation = heightAt(radius);
        }
        const wornEnd = shore ? (1 - shoulder) * (1 - THREE.MathUtils.smoothstep(radius, .23, .56)) : 0;
        const ripple = crests ? .014 : .027;
        const irregularity = 1 + taper * Math.sin(sample * 1.11 + radius * 3) * ripple - wornEnd * .21;
        const shoulderCut = shore ? Math.max(0, elevation - .39) * (.61 - .55 * crown) : 0;
        let lift = 0, crestRoom = 0;
        if (crests && elevation > 0) {
          const falloff = (1 - THREE.MathUtils.smoothstep(radius, upperBack, 1))
            * (.79 + .21 * shoulder) * strength;
          const lower = THREE.MathUtils.smoothstep(radius, .014, lowerSod) * falloff;
          const upper = THREE.MathUtils.smoothstep(radius, upperToe, upperSod) * falloff * crestTaper;
          const lowerDepth = THREE.MathUtils.smoothstep(radius, lowerSod, upperToe);
          const capDepth = THREE.MathUtils.smoothstep(radius, upperSod, upperSod + (1 - upperSod) * .67);
          lift = (.29 + .20 * mass + room * lowerRise * .85) * lower + (.15 + (1.07 + room * upperRise * .88) * mass) * upper;
          // The distant edge of a grass seat can break the painted silhouette
          // higher than its lip so the top still has depth after clipping.
          const lowerRoom = (.05 + .22 * lowerDepth + room * lowerRise * .12) * lower;
          const crestSpan = meetsEastShoulder ? .43 : .64;
          const upperRoom = .40 + .24 * mass + .15 * room * upperRise + crestSpan * capDepth;
          crestRoom = Math.min(1.38, THREE.MathUtils.lerp(lowerRoom, upperRoom, upper));
        }
        // The southern cap rises from its existing stone foot and lower shelf.
        const cap = cragLift * THREE.MathUtils.smoothstep(elevation, .640, .963);
        const lowerBench = foregroundPad && elevation > 0 ? (.29 + .095 * Math.sin(sample * 1.55))
          * THREE.MathUtils.smoothstep(radius, .018, .12)
          * (1 - THREE.MathUtils.smoothstep(radius, .345, .495)) : 0;
        const roundedCrest = elevation - Math.max(0, elevation - .47) * (1 - crestTaper);
        const raised = (roundedCrest - shoulderCut) * irregularity + (lift + lowerBench) / (taper * rise) + cap / rise;
        // The landing-facing tips curl down to their sandstone heel. The inner
        // grassy seat tapers sooner, stretching the seam diagonally at the shore.
        const tipSeat = tipCurve * THREE.MathUtils.smoothstep(radius, .11, .79);
        const point = shelfPoint(row, shelfFoot, rim, taper, rise, radius,
          raised * endSlope * (1 - .52 * tipSeat), crestRoom * endSlope);
        if (beach) {
          // Silt and meadow hide the worn west heel just before the landing.
          // Only the lowest stone sinks, leaving the wide grass seat intact.
          const buriedHeel = stoneFoot ? westHeel * (1 - THREE.MathUtils.smoothstep(radius, .093, .172)) : 0;
          point.y *= 1 - .38 * buriedHeel;
          point.joinOpacity = THREE.MathUtils.smoothstep(edgeDistance - .73 * tipSeat, .10, 1.24) * (1 - .51 * buriedHeel);
        }
        if (westTreads && !atPlant && sample < WEST_COVE_JOIN && radius >= 0 && radius <= 1 && elevation > 0) {
          // Pair each lip and tread with its counterpart. Looking up height at
          // the old radial position would drag a grass face down the next riser.
          const index = Math.max(1, westTreads.findIndex(([r]) => r >= radius));
          const [from, saddleFrom] = westTreads[index - 1], [to, saddleTo] = westTreads[index];
          const saddleRadius = THREE.MathUtils.lerp(saddleFrom, saddleTo, (radius - from) / (to - from));
          const saddle = westSaddlePoint(sample, saddleRadius);
          const fold = 1 - THREE.MathUtils.smoothstep(sample, start + .10 * radius, WEST_COVE_JOIN);
          point.lerp(saddle, fold);
          clipCrest(point, Math.max(crestRoom, saddle.shoreReach * fold));
          point.joinOpacity = THREE.MathUtils.smoothstep(sample, start, start + .68);
        }
        const eastJoin = atPlant ? 143.54 : EAST_COVE_JOIN;
        if (meetsEastShoulder && sample > eastJoin) {
          const startFold = eastJoin + .27 * radius + .13 * Math.sin(radius * Math.PI);
          const fold = THREE.MathUtils.smoothstep(sample, startFold, visibleEnd);
          // Swing the whole cross-section around the wall pad. The lower toe and
          // seaward shoulder keep separate roots as the courses turn into the hill.
          const originalToe = THREE.MathUtils.lerp(shelfFoot, rim, .49 * (1 - Math.sqrt(taper)));
          const toe = Math.max(originalToe, -19.13 / row.z);
          const back = Math.max(rim, toe + .028);
          const across = Math.max(0, (point.z / row.z - originalToe) / (rim - originalToe));
          const bend = THREE.MathUtils.smoothstep(sample, eastJoin, 144.24);
          const turned = THREE.MathUtils.lerp(toe, back, across);
          const reach = THREE.MathUtils.lerp(point.z / row.z, turned, bend);
          point.x = row.x * reach;
          point.z = row.z * reach;
          if (point.y > 0) point.y = THREE.MathUtils.lerp(point.y, Math.max(0, shoulderHeight(eastShoulder, point) - .032), fold);
          clipCrest(point, Math.max(crestRoom, 1.38 * fold));
        }
        if (stoneFoot && footDepth && cliffSupport > 0) {
          // Pull the existing bottom bevel into bedrock and let its upper edge stay put.
          const join = cliffSupport * (1 - THREE.MathUtils.smoothstep(radius, -.014, .111));
          point.x = THREE.MathUtils.lerp(point.x, row.x * .998, join);
          point.z = THREE.MathUtils.lerp(point.z, row.z * .998, join);
          point.y -= footDepth * join;
          // Negative allowance denotes a foot below the visible shore, rather than a raised crest.
          point.shoreReach = -footDepth * join;
        }
        return point;
      };
    }
    // Shade each tread from its sod rim to the base of the next rise.
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
    const sections = Math.ceil((visibleEnd - start) / STEP);
    for (let section = 0; section <= sections; section++) {
      const sample = Math.min(start + STEP * section, visibleEnd);
      const point = samplePoint(sample);
      const fringe = crests || beach ? .010 * Math.sin(sample * 4.63 + first) + .007 * Math.cos(sample * 8.93) : 0;
      const lipRise = crests || beach ? .012 * Math.sin(sample * 5.09 + first) + .005 * Math.cos(sample * 9.43) : 0;
      const overhang = Math.max(.009, .031 + .006 * Math.sin(sample * 2.3) + (shore ? .014 * Math.cos(sample * 1.36) : 0) + fringe);
      const shape = profile.map(([radius, elevation, , material]) =>
        point(radius - (material === LIP ? overhang : 0), elevation + (material === LIP ? lipRise : 0), material === STONE || material === RECESS));
      const sod = Object.fromEntries(sodRings.map(ring => {
        const [from, low] = profile[ring], [to, high] = profile[ring + 1];
        const curl = .025 * Math.sin(sample * 3.4 + ring) + .014 * Math.cos(sample * 6.7)
          + (shore ? .035 * Math.sin(sample * 1.07 + ring) : 0);
        return [ring, [shape[ring], ...SOD_PROFILE.slice(1, -1).map(([across, rise]) =>
          point(THREE.MathUtils.lerp(from - overhang, to, across + curl), THREE.MathUtils.lerp(low + lipRise, high, rise))),
        shape[ring + 1]]];
      }));
      const endFade = THREE.MathUtils.smoothstep(Math.min(sample - start, finish - sample), 0, 1.8);
      rows.push({sample, point, shape, sod, endFade});
    }
    if (side) for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].shape, b = rows[i + 1].shape;
      for (const ring of treads.keys()) sideTreads.push([a[ring], b[ring], b[ring + 1], a[ring + 1]]);
    }
    function heightAt(radius) {
      const next = profile.findIndex(([r]) => r >= radius);
      const [r0, h0] = profile[Math.max(0, next - 1)], [r1, h1] = profile[next];
      return THREE.MathUtils.lerp(h0, h1, r0 === r1 ? 0 : (radius - r0) / (r1 - r0));
    }
    if (art && FOLIAGE[first]) {
      const addPlant = (name, along, across, scale) => {
        const sample = THREE.MathUtils.lerp(start, finish, along);
        const plant = samplePoint(sample, true)(across, heightAt(across));
        if (side && across >= 0) {
          const floor = sideTurfHeight(plant.x, plant.z);
          if (Number.isFinite(floor)) plant.y = floor;
        } else if (crests && across >= 0) {
          // Settle the existing anchor on the same triangles that draw the grassy tread.
          let floor = -Infinity;
          for (let i = 0; i < rows.length - 1; i++) {
            const a = rows[i].shape, b = rows[i + 1].shape;
            for (const ring of treads.keys()) {
              floor = Math.max(floor, turfHeight(plant, a[ring], b[ring], b[ring + 1]),
                turfHeight(plant, a[ring], b[ring + 1], a[ring + 1]));
            }
          }
          if (Number.isFinite(floor)) plant.y = floor;
        }
        if (westCove && sample < WEST_COVE_JOIN) plant.y = Math.max(plant.y, shoulderHeight(westShoulder, plant));
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
      if ((westCove && side === 0) || (meetsEastShoulder && side === 1)) continue;
      // Return the stone courses around the exposed ends. The backs dissolve into the meadow.
      const rootedEnd = first === 97 || (westTreeBank && side === 0);
      const heel = rootedEnd ? ENDS[side].clone().lerp(REAR_BED, .48) : ENDS[side];
      for (let i = profile.length - 2; i >= 0; i--) {
        const a = row.shape[i], b = row.shape[i + 1];
        const floorA = a.clone().setY(0), floorB = b.clone().setY(0);
        const opacity = THREE.MathUtils.smoothstep(1 - profile[i][0], .04, .29);
        const contact = westTreeBank && side === 0 ? opacity * .60 : opacity;
        face(floorA, floorB, b, a, heel, -.15, .06, 0, [contact, contact, opacity, opacity]);
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
          const palette = front && !beach ? STONE : REAR_STONE;
          const tint = palette[(side + course + block + 1) % palette.length].clone().lerp(front ? ENDS[side] : REAR_BED, front ? .47 : .42);
          const point = (u, v, bulge) => {
            const radius = THREE.MathUtils.lerp(left, right, u);
            const height = heightAt(radius) * THREE.MathUtils.lerp(lower, upper, v);
            return samplePoint(row.sample + direction * bulge * 2.1)(radius, height);
          };
          const worn = Math.cos(block * 2.41 + row.sample * .77);
          if (front && !beach) stone(point, tint, worn);
          else stratum(point, tint, worn, course === 1);
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
        return samplePoint(sample)(THREE.MathUtils.lerp(r0, r1, (h - h0) / (h1 - h0)) - bulge, h, front && !upper);
      }
      if (shore) {
        // Short beds follow the shoulder instead of stretching one stone across the cove.
        // The upper courses break at different offsets so the joints rise through the rock.
        const beds = upper ? [[.49, .980, .70], [.018, .465, .09]] : [[.026, .971, .43]];
        for (const [bed, [bottom, top, stagger]] of beds.entries()) {
          let left = start - stagger;
          for (let column = 0; left < visibleEnd; column++) {
            const width = BLOCK_WIDTHS[(column + bed * 3 + Math.floor(first)) % BLOCK_WIDTHS.length]
              * (upper ? .82 : 1.12);
            const right = left + width;
            const begin = Math.max(start + .015, left + .045);
            const end = Math.min(visibleEnd - .016, right - .041);
            if (end - begin > .16) {
              const lean = Math.sin(column * 2.73 + bed * 1.38 + first);
              const point = (u, v, bulge) => {
                const sample = THREE.MathUtils.lerp(begin, end, u)
                  + lean * .061 * Math.sin(u * Math.PI) * (v - .5);
                const fracture = (u - .5) * lean * .032;
                const level = THREE.MathUtils.clamp(THREE.MathUtils.lerp(bottom, top, v) + fracture, 0, 1);
                return across(sample, level, bulge * (upper ? .77 : .86));
              };
              const pigment = REAR_STONE[(column + bed * 2 + Math.floor(first)) % REAR_STONE.length];
              stratum(point, pigment.clone().lerp(REAR_BED, upper ? .09 + bed * .07 : .20), lean, true);
            }
            left = right;
          }
        }
        return;
      }
      // A massive lower plinth carries the finer, staggered stone courses above it.
      const courses = upper ? [[.46, .965, .61, 1], [.035, .43, 0, 0]]
        : front ? [[.39, .973, .72, 1], [.025, .364, 0, 0]] : [[.036, .963, 0, 0]];
      const grout = front ? (upper ? .044 : .049) : upper ? .039 : .045;
      for (const [bottom, top, shift, course] of courses) {
        let column = 0;
        for (let next = start - shift; next < finish; column++) {
          const scale = front ? (upper ? 1 : .91) : upper ? 1.06 : 1.35;
          const width = BLOCK_WIDTHS[(column + from + (upper ? 2 : 0)) % BLOCK_WIDTHS.length] * scale;
          const left = Math.max(start + .014, next + grout), right = Math.min(finish - .014, next + width - grout);
          if (right - left > .19) {
            const worn = Math.sin(column * 2.41 + start * .77 + course * 1.9 + from);
            const groutRipple = (front ? .022 : .053) * worn;
            const point = (u, v, bulge) => across(THREE.MathUtils.lerp(left, right, u),
              THREE.MathUtils.clamp(THREE.MathUtils.lerp(bottom, top, v) + (1 - 2 * u) * groutRipple, 0, 1), bulge);
            const palette = front && !beach ? STONE : REAR_STONE;
            const pigment = palette[(column + course * 3 + from) % palette.length];
            if (front && !beach) stone(point, pigment, worn, !upper || course === 1, !upper);
            else stratum(point, beach ? pigment.clone().lerp(REAR_BED, .39) : pigment, worn, !upper || course === 1);
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
        const tint = band === STONE ? (front && !beach ? MORTAR : shore ? REAR_STONE[2] : REAR_BED)
          : band === TURF && (crests || beach) ? HIGH_TURF : band;
        const tread = treads.get(ring);
        const wornLedge = shore && ring === sodRings[0];
        const turf = wornLedge ? WORN_LEDGE : Number(band === TURF);
        for (let i = 0; i < rows.length - 1; i++) {
          const {shape: left, sample, sod: leftSod, endFade: fadeLeft} = rows[i];
          const {shape: right, sample: nextSample, sod: rightSod, endFade: fadeRight} = rows[i + 1];
          const variation = .026 * Math.sin(sample * .89);
          // The old turf seats stop before the bed folds into the next ledge.
          // Expose the eroded sandstone wherever the bedding bends down sharply.
          const erodedReturn = meetsEastShoulder && sample >= 144.12 + .19 * Math.sin(ring * 2.1);
          if (erodedReturn && (band === LIP || band === TURF)) {
            const cut = [[0, .50], [1, .47], [1, .78], [0, .81]];
            face(left[ring], right[ring], right[ring + 1], left[ring + 1], REAR_STONE[2],
              -.105 + variation, -.14 + variation, STRATUM, undefined, cut, true);
            continue;
          }
          if (band === LIP) {
            const a = leftSod[ring], b = rightSod[ring];
            for (let strip = SOD_MATERIAL.length - 1; strip >= 0; strip--) {
              const [sodMaterial, sodTint] = SOD_MATERIAL[strip];
              const tone = variation - (beach ? .066 : 0);
              const shade = SOD_PROFILE[strip][2] + tone;
              const light = SOD_PROFILE[strip + 1][2] + tone;
              if ((westCove || meetsEastShoulder) && strip === SOD_MATERIAL.length - 1) {
                const near = scarpSection(a[strip], a[strip + 1], sample, ring, meetsEastShoulder);
                const far = scarpSection(b[strip], b[strip + 1], nextSample, ring, meetsEastShoulder);
                if (Math.max(near.exposed, far.exposed) > .20) {
                  // Continue the main scarp through staggered, solid stone
                  // shelves, leaving the actual upper sod at its old anchors.
                  const color = REAR_STONE[3].clone().lerp(REAR_STONE[1], .27 + .24 * Math.sin(sample * 1.91)).lerp(REAR_BED, .34);
                  for (let ledge = SCARP_PROFILE.length - 2; ledge >= 0; ledge--) {
                    const [lower, , tone] = SCARP_PROFILE[ledge], [upper, , upperTone] = SCARP_PROFILE[ledge + 1];
                    const u = .16 + .06 * Math.sin(sample * 3.31), v = .85 + .05 * Math.cos(sample * 2.19);
                    const joints = [[u, lower], [v, lower], [v, upper], [u, upper]];
                    face(near.points[ledge], far.points[ledge], far.points[ledge + 1], near.points[ledge + 1],
                      color, tone + variation, upperTone + variation, STRATUM, undefined, joints, ledge >= 7);
                  }
                  continue;
                }
              }
              // Only the sheltered underside of a worn cove edge shows exposed sediment.
              const surface = wornLedge && strip < 2 ? WORN_LEDGE : sodMaterial;
              const grass = beach && strip >= 2 ? HIGH_TURF : sodTint;
              face(a[strip], b[strip], b[strip + 1], a[strip + 1], grass, shade, light, surface);
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
    // The saddle reaches into the cleft over the low end of the western ledge.
    if (westTreeBank) drawWestShoulder();
    // The lifted shoulder covers the rock that turns under its high shelf.
    if (meetsEastShoulder) drawEastShoulder();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('terraceMaterial', new THREE.Float32BufferAttribute(materials, 4));
  geometry.setAttribute('surfaceDetail', new THREE.Float32BufferAttribute(surfaceDetails, 4));
  const homeStone = coastArt.userData.homeStone;
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}, uDetail: seaUniforms.uDetail,
      uHomeStone: {value: homeStone ?? coastArt}, uHomeStoneReady: {value: homeStone ? 1 : 0}},
    vertexColors: true, side: THREE.DoubleSide,
    forceSinglePass: true, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 terraceMaterial;
      attribute vec4 surfaceDetail;
      ${groundProjectionGlsl}
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
      varying vec4 vSurface;
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
      ${weatheredSandstoneGlsl}
      ${paintedSandstoneGlsl}
      uniform sampler2D uCoastArt;
      uniform float uDetail;
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
      varying vec4 vSurface;
      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2(vec2 p) {
        vec2 cell = floor(p), offset = fract(p);
        vec2 fade = offset * offset * (3.0 - 2.0 * offset);
        return mix(mix(hash2(cell), hash2(cell + vec2(1, 0)), fade.x),
          mix(hash2(cell + vec2(0, 1)), hash2(cell + vec2(1, 1)), fade.x), fade.y);
      }
      float turfGrain(vec2 p) {
        vec2 footprint = fwidth(p);
        float unresolved = smoothstep(.48, 1.26, max(footprint.x, footprint.y));
        return mix(noise2(p), .5, unresolved);
      }
      float grassStrokes(vec2 p) {
        vec2 cell = floor(p), local = fract(p);
        float variation = hash2(cell + vec2(1.37, 2.61));
        float tip = .55 + .34 * variation;
        float rise = smoothstep(.11, .23, local.y) * (1.0 - smoothstep(tip - .15, tip, local.y));
        float lean = (variation - .5) * .53 * local.y;
        float blade = abs(local.x - .48 + lean);
        float softness = min(.16, fwidth(p.x) * .55);
        float stroke = 1.0 - smoothstep(.04, .12 + softness, blade + local.y * .055);
        return stroke * rise * smoothstep(.18, .59, variation) * (1.0 - smoothstep(.30, .78, max(fwidth(p.x), fwidth(p.y))));
      }
      float shortRockSeam(vec2 layers, float grain) {
        float seamHeight = layers.y * 1.86 + .14 * sin(layers.x * .87) + .09 * grain;
        float bed = floor(seamHeight);
        float alongBed = layers.x * .99 + mod(bed, 2.0) * .51;
        float seamSeed = hash2(vec2(floor(alongBed), bed));
        float across = fract(alongBed);
        float section = smoothstep(.04, .13, across) * (1.0 - smoothstep(.59 + seamSeed * .17, .91, across));
        float level = fract(seamHeight);
        float brokenBed = level - (.47 + .19 * seamSeed + .14 * (across - .5));
        float lineWidth = min(.13, fwidth(seamHeight));
        float alongCut = across - (.16 + .20 * seamSeed + (level - .5) * .21);
        float cutReach = smoothstep(.18, .31, level) * (1.0 - smoothstep(.44, .71, level));
        float crossCut = cutReach * (1.0 - smoothstep(.015, .043 + lineWidth * .18, abs(alongCut)));
        return max(section * (1.0 - smoothstep(.022, .066 + lineWidth, abs(brokenBed))), crossCut * .59);
      }
      void main() {
        vec2 floorPoint = unprojectGround(vTerrain);
        vec2 shore = floorPoint / vec2(${COAST.rx.toFixed(1)}, ${COAST.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${COAST.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        if (length(shore) >= rim * .994 && abs(vSurface.w) < .015) discard;
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
          float contact = smoothstep(.47, .90, towardStone);
          float direction = min(1.0, length(vSurface.yz) * 1.55);
          float falloff = smoothstep(mix(.23, .01, direction), .75, towardStone);
          float grass = smoothstep(.015, .085, meadow.g - meadow.r);
          float shade = (.29 + direction * .34) * falloff * grass + .59 * contact;
          float edgeFade = mix(1.0, .72, step(1.5, mod(vSurface.x, 4.0)));
          vec3 soil = mix(meadow * vec3(.49, .60, .60), vTone, .15 * contact);
          if (vSurface.x >= 4.0) {
            // Sand pressed against the shelves picks up warm stone dust and a few sunlit grains.
            float grit = noise2(floorPoint * vec2(9.6, 14.2));
            float skirt = smoothstep(.045, .78, towardStone + (grit - .5) * .17);
            float sand = (1.0 - grass) * skirt;
            vec3 loam = meadow * mix(vec3(.65, .56, .44), vec3(.82, .73, .61), grit);
            soil = mix(soil, loam, sand);
            shade = mix(shade, .44 * contact + (.17 + direction * .13) * skirt, 1.0 - grass);
          }
          gl_FragColor = vec4(soil, min(.87, shade * edgeFade));
          #include <colorspace_fragment>
          return;
        }
        vec3 ground = vec3(vTerrace.x, height, vTerrace.y);
        vec3 slopeNormal = cross(dFdx(ground), dFdy(ground));
        vec3 faceNormal = abs(slopeNormal) * inversesqrt(max(dot(slopeNormal, slopeNormal), 1e-12));
        if (vTerrace.z < .5) {
          vec3 stone = vTone * mix(.91, 1.10, grain);
          vec2 layers = vec2(vTerrace.x + vTerrace.y * .36, height + vTerrace.y * .13);
          float cut = min(vSurface.z, 1.0);
          if (vTerrace.z > .15) stone = cutSandstone(stone, layers, vSurface.xy, cut);
          else stone = weatheredSandstone(stone, layers, vSurface.xy, cut);
          // The joined foot crosses the old grass edge. Give it a narrow contact
          // at the turf and the same warm stone colour below, with full coverage.
          float cliffFoot = smoothstep(.025, .24, -vSurface.w);
          float earthShadow = (1.0 - smoothstep(.025, .29, height)) * .31;
          float rockContact = (1.0 - smoothstep(.018, .12, abs(height))) * .14;
          float rootShadow = mix(earthShadow, rockContact, cliffFoot);
          float patina = smoothstep(.50, .83, grainBreak) * (1.0 - smoothstep(.08, .37, vSurface.y));
          float sodShade = step(1.5, vSurface.z) * smoothstep(.57, .96, vSurface.y);
          float corners = smoothstep(.19, .48, abs(vSurface.x - .5));
          float toe = (1.0 - smoothstep(.03, .27, vSurface.y)) * corners * cut;
          float shoulder = smoothstep(.50, .82, vSurface.y) * (1.0 - smoothstep(.86, 1.0, vSurface.y));
          float foot = (1.0 - smoothstep(.06, .49, vSurface.y)) * cut;
          stone = mix(stone, stone * vec3(.70, .78, .65), sodShade * (.48 + grainBreak * .22));
          stone = mix(stone, stone * vec3(.82, .94, .72), .48 * patina * cut);
          float bevelShadow = (foot * .175 + toe * (.12 + grainBreak * .06)) * (1.0 - .45 * cliffFoot);
          stone *= 1.0 + shoulder * cut * .23 - rootShadow - bevelShadow;
          // Stone leading into the ledge is warm, with cooler sky reflected in
          // the narrow returns. Large face values remain legible when zoomed out.
          float returnPlane = smoothstep(.35, .88, faceNormal.x) * (1.0 - faceNormal.y);
          float bevelLight = smoothstep(.30, .77, faceNormal.y) * shoulder * cut;
          vec3 returnTint = vTerrace.z > .15 ? vec3(.84, .91, 1.027) : vec3(.71, .83, 1.055);
          stone *= mix(vec3(1.0), returnTint, returnPlane * (.73 + cut * .19));
          stone *= 1.0 + bevelLight * .19;
          if (cliffFoot > 0.0) {
            vec4 cliff = texture2D(uCoastArt, floorUv);
            float underRim = cliffFoot * smoothstep(.035, .26, -height) * smoothstep(.78, .98, cliff.a);
            vec3 bedrock = weatheredSandstone(cliff.rgb, layers, vSurface.xy, cut * .55);
            stone = mix(stone, bedrock, underRim * .55);
          }
          if (vTerrace.y < 0.0) {
            // Break up the taller rear faces at close zoom, and keep the beveled edges warm.
            vec2 frequency = vec2(4.2, 6.4);
            float resolved = 1.0 - smoothstep(.43, .96, length(fwidth(layers) * frequency));
            vec3 cutGrain = sandstoneGrain(layers * frequency);
            float facets = clamp(dot(cutGrain.yz, vec2(-.16, .12)), -.19, .21);
            float cleanEdge = (1.0 - smoothstep(.06, .25, vSurface.x)) * smoothstep(.26, .78, vSurface.y);
            stone *= 1.0 + (facets + (cutGrain.x - .5) * .14) * resolved * cut;
            stone += stone * vec3(.17, .11, .063) * cleanEdge * cut;

            // The large sandstone planes catch warm light between short, broken beds.
            float seam = shortRockSeam(layers, grainBreak);
            float wetRoot = sodShade * smoothstep(.37, .92, vSurface.y + .22 * (grainBreak - .5));
            float warmBed = seam * smoothstep(.35, .75, grainBreak);
            stone *= mix(vec3(1.0), vec3(1.19, 1.07, .89), .69 + .21 * grainBreak);
            stone *= 1.0 - seam * (.30 + .14 * grainBreak) - wetRoot * .34;
            stone += stone * vec3(.16, .076, .023) * warmBed;
          }
          if (uDetail > .5) {
            vec2 strata = vec2(layers.x / 5.70 + .36, .11 + height * .209 + (vTerrace.y * .013 + .15) * .15);
            stone = paintedSandstone(stone, strata, .48 + cut * .32);
          }
          gl_FragColor = vec4(stone, vTerrace.w);
          #include <colorspace_fragment>
          return;
        }
        // Low grass clumps follow the tread while the sculpted lip casts a dark, rooted overhang.
        bool wornLedge = vTerrace.z >= ${WORN_LEDGE.toFixed(1)};
        float turfKind = wornLedge ? 1.0 : vTerrace.z;
        float lip = smoothstep(1.0, 2.0, turfKind);
        float underside = smoothstep(2.28, 2.88, turfKind);
        float highBank = smoothstep(7.0, 12.5, -vTerrace.y);
        float westSpur = smoothstep(15.5, 18.2, -vTerrace.x) * (1.0 - smoothstep(2.0, 5.0, abs(vTerrace.y + 8.5)));
        highBank = max(highBank, westSpur);
        // Grass wraps the low beach benches as well as the higher rear treads.
        vec2 side = abs(vTerrace.xy);
        float beachGrass = smoothstep(13.8, 16.8, side.x) * smoothstep(4.6, 6.4, side.y)
          * (1.0 - smoothstep(10.5, 14.8, side.y));
        float grassBank = max(highBank, beachGrass * .69);
        vec2 sward = vTerrace.xy * vec2(4.2, 5.3);
        float patches = noise2(sward * .43);
        float tufts = turfGrain(sward * 3.8 + vec2(patches));
        float tips = turfGrain(vTerrace.xy * vec2(23.0, 32.0) + vec2(height * 3.6));
        float moss = smoothstep(.35, .67, grainBreak);
        vec3 turfColor = mix(vTone, source, .27 - underside * .12);
        turfColor = mix(turfColor, vec3(.37, .46, .081), lip * (.12 + moss * .13) * (1.0 - underside));
        turfColor = mix(turfColor, vec3(.115, .136, .041), underside * (.39 + tufts * .18));
        float grassClumps = smoothstep(.28, .77, .68 * patches + .32 * tufts);
        vec3 rearTurf = mix(vec3(.106, .201, .037), vec3(.343, .465, .107), grassClumps);
        turfColor = mix(turfColor, rearTurf, grassBank * (.27 + .36 * lip) * (1.0 - underside));
        // Broad smooth shoulders catch light up front. At the base of the next rise a
        // broken band of moss and short grass makes the lower shelf read as a separate step.
        float wobble = noise2(vTerrace.xy * .92) - .5;
        float across = vSurface.x + wobble * .18 + (patches - .5) * .06;
        float shoulder = smoothstep(-.14, .12, across) * (1.0 - smoothstep(.57, .92, across)) * vSurface.y;
        float wallPocket = noise2(sward * vec2(.48, .22));
        float recess = step(1.5, vSurface.z) * smoothstep(.62 - wallPocket * .08, 1.0, across);
        turfColor = mix(turfColor, vec3(.433, .558, .104), shoulder * (.53 - .13 * grassBank - .05 * beachGrass));
        turfColor = mix(turfColor, vec3(.111, .177, .052), recess * (.37 + .14 * wallPocket + .08 * moss));
        vec2 bladeField = vec2(vTerrain.x * 8.8 + .61 * vTerrace.y, vTerrain.y * 12.3 - .42 * vTerrace.x);
        float strokes = grassStrokes(bladeField) * grassBank * (1.0 - underside);
        float meadowGrain = (tips - .5) * .12 + (tufts - .5) * .18 + (patches - .5) * .19 + strokes * .25;
        float leafLight = lip * (1.0 - underside) * smoothstep(.56, .87, tufts * .59 + tips * .41) * .16;
        float shoulderLight = shoulder * (.25 + (tufts - .5) * .13) - recess * (.22 + wallPocket * .09);
        vec3 turf = turfColor * (mix(.89, 1.12, grain) + meadowGrain + leafLight + shoulderLight);
        if (wornLedge) {
          // The thin tread is exposed sandstone with irregular low moss in its hollows.
          float growth = noise2(vTerrace.xy * vec2(.79, .68)) * .79 + tufts * .21;
          float mossDensity = vTerrace.z >= ${RETURN_LEDGE.toFixed(1)} ? vSurface.y * .83 : .80;
          float cover = smoothstep(.41, .71, growth) * mossDensity;
          vec3 sediment = vec3(.47, .338, .169) * (.74 + .24 * grain + (patches - .5) * .13);
          turf = mix(sediment, turf * .89, cover);
        }
        // Grass stays on the seats, with a narrow rooted lip above exposed sandstone.
        float flatness = faceNormal.y;
        float scarp = highBank * (1.0 - smoothstep(.58 + (patches - .5) * .08, .84, flatness));
        float rootLip = highBank * smoothstep(1.81, 2.67, turfKind);
        turf *= mix(vec3(1.0), vec3(.76, .82, .65), rootLip * (.52 + .22 * tufts));
        float rootedMoss = rootLip * smoothstep(.48, .78, patches * .54 + tufts * .46);
        turf = mix(turf, vec3(.127, .199, .052), rootedMoss * .40);
        float exposedRoots = highBank * lip * (1.0 - underside) * smoothstep(.56, .88, wallPocket);
        turf = mix(turf, vec3(.219, .192, .094), exposedRoots * .32);
        if (scarp > .001) {
          vec3 normal = slopeNormal * (slopeNormal.y < 0.0 ? -1.0 : 1.0)
            * inversesqrt(max(dot(slopeNormal, slopeNormal), 1e-12));
          float facingSun = dot(normal, vec3(-.423, .771, -.478));
          vec2 rockLayers = vec2(vTerrace.x + vTerrace.y * .36, height + vTerrace.y * .13);
          float seam = shortRockSeam(rockLayers, grainBreak);
          vec3 sandstone = mix(vec3(.237, .149, .074), vec3(.489, .366, .228), .20 + .51 * grain + .28 * patches);
          sandstone *= .95 + .23 * facingSun + .13 * (grainBreak - .5) - .36 * seam;
          float featheredMoss = lip * (1.0 - underside) * smoothstep(.42, .81, patches * .66 + tufts * .34);
          turf = mix(turf, sandstone, scarp * (.98 - .22 * featheredMoss));
        }
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
  if (art) {
    const contacts = [];
    const crowns = rearTurfFaces(root.getObjectByName('home-coast-relief'));
    const crownHeight = (x, z) => {
      const ground = {x, z};
      return crowns.reduce((height, face) => Math.max(height, turfHeight(ground, ...face)), -Infinity);
    };
    for (const [name, x, z, scale, cliffCrown] of SIDE_TURF_PLANTS) {
      if (!art[name]) continue;
      const turfAt = cliffCrown ? crownHeight : sideTurfHeight;
      const y = turfAt(x, z);
      if (y < .12) continue;
      if (!plantings.has(name)) plantings.set(name, []);
      plantings.get(name).push([{x, y, z}, scale]);
      if (name === 'birch') {
        contacts.push({x, z, width: scale * 1.5, depth: scale * .73, opacity: .54, turfAt});
      } else if ((name === 'home-broadleaf' || name === 'shrub') && scale >= .50) {
        contacts.push({x: x + .12 * scale, z: z + .19 * scale, width: scale * .94, depth: scale * .52, opacity: .51, turfAt});
      }
    }
    addSideTurfContacts(root, contacts);
    addTerraceFoliage(root, art, plantings);
  }
  return mesh;
}
