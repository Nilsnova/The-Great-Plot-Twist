// Sandstone terraces along the shoulders of Home Island. Elevation belongs only to the view.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {artSizes} from '../art.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, unprojectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const COAST = surfaces.home_islet;
// Coast samples are spaced two degrees apart. Each run goes from the visible stone foot
// to the tapered back of its grass cap. The southern runs face towards the sea.
const BANKS = [
  {first: 101, last: 108, foot: .771, back: .943, height: 2.5},
  {first: 116, last: 132, foot: .772, back: .927, height: 2.85},
  {first: 140, last: 155, foot: .815, back: .936, height: 2.82},
  {first: 162, last: 173, foot: .800, back: .947, height: 2.49},
  {first: 25, last: 34, foot: .942, back: .812, height: 1.63},
  {first: 55, last: 67, foot: .951, back: .847, height: 1.47},
];
const STONE = ['#bf9367', '#c69d72', '#b48762', '#cbab7e', '#c09b70'].map(hex => new THREE.Color(hex));
const MORTAR = new THREE.Color('#8d6d4e'), RECESS = new THREE.Color('#785d43');
const ENDS = [new THREE.Color('#9c7952'), new THREE.Color('#b08c61')];
const TURF = new THREE.Color('#8da936'), LIP = new THREE.Color('#a9bf4b'), ROOTS = new THREE.Color('#78a336');
const FOLIAGE = {
  101: [['birch', .56, .70, .49], ['shrub', .19, .64, .64], ['shrub', .74, .31, .49], ['flowers', .41, .31, .52]],
  116: [['shrub', .21, .73, .65], ['shrub', .27, .68, .51], ['grass-tuft', .56, .74, .56], ['shrub', .81, .71, .62],
    ['shrub', .37, .28, .41], ['flowers', .72, .34, .56]],
  140: [['shrub', .31, .68, .60], ['shrub', .38, .72, .51], ['grass-tuft', .66, .73, .62], ['shrub', .83, .70, .52],
    ['flowers', .15, .34, .60], ['shrub', .57, .32, .44]],
  162: [['birch', .65, .72, .51], ['shrub', .42, .67, .66], ['shrub', .54, .69, .47], ['flowers', .21, .29, .60],
    ['grass-tuft', .81, .29, .56]],
  25: [['shrub', .23, .72, .58], ['shrub', .35, .75, .42], ['grass-tuft', .71, .72, .62], ['flowers', .78, .33, .52]],
  55: [['grass-tuft', .25, .69, .62], ['shrub', .46, .72, .55], ['shrub', .63, .77, .64], ['flowers', .78, .32, .55]],
};
const SHADOW = new THREE.Color('#3e4a2d');
const SUN = new THREE.Vector3(-.6, .71, .43).normalize();
const STEP = .5;
const BLOCK_WIDTHS = [1.34, 1.96, 1.66, 1.50, 1.79, 1.23];
const BLOCK_BEVEL = [
  [.12, 0], [.86, 0], [1, .18], [1, .79], [.85, 1], [.14, 1], [0, .83], [0, .18],
];
const BEVEL_LIGHT = [-.22, -.19, -.08, .02, .28, .24, .09, -.07];
// Each stop starts a band. The two faces have deep bases, lit shoulders and grass lips.
// A short incline at the back of the upper tread hides where it joins the old meadow.
const REAR_PROFILE = [
  [0, 0, -.14, RECESS], [.025, .055, -.25, STONE], [.051, .29, -.04, STONE],
  [.079, .42, .16, STONE], [.108, .452, .215, LIP], [.165, .535, .12, TURF],
  [.392, .513, .03, TURF], [.428, .532, -.10, RECESS], [.446, .604, -.20, STONE],
  [.464, .812, -.035, STONE], [.482, .911, .14, STONE], [.514, .944, .24, LIP],
  [.579, 1.013, .12, TURF], [.875, .99, .055, TURF], [.946, .857, -.01, TURF],
  [1, .62, -.11, TURF],
];
const FRONT_PROFILE = [
  [0, 0, -.13, RECESS], [.055, .06, -.22, STONE], [.086, .29, -.08, STONE],
  [.117, .46, .10, STONE], [.154, .504, .22, LIP], [.201, .569, .12, TURF],
  [.415, .581, .025, TURF], [.461, .591, -.055, RECESS], [.49, .65, -.08, STONE],
  [.52, .795, .01, STONE], [.544, .897, .10, STONE], [.574, .936, .215, LIP],
  [.64, 1.01, .102, TURF], [.748, .978, .06, TURF], [.905, .716, .025, TURF],
  [1, .17, -.07, TURF],
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

// These short plants grow on the decorated treads. Use one batch per sprite material and
// paint the entire garden before any interactable upright objects, even when zoomed in.
function addTerraceFoliage(root, art, plantings) {
  for (const [name, plants] of plantings) {
    if (!art[name]) continue;
    const [width, height, foot] = artSizes[name];
    const positions = [], uv = [], indices = [];
    for (const [plant, scale] of plants.sort(([a], [b]) => a.z - b.z)) {
      const projected = projectGround(plant.x, plant.z);
      const half = width * scale * .5, bottom = projected.y + plant.y - height * scale * foot;
      const top = bottom + height * scale, base = positions.length / 3;
      positions.push(projected.x - half, bottom, 0, projected.x + half, bottom, 0,
        projected.x + half, top, 0, projected.x - half, top, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, art[name]);
    const order = {'birch': 0, shrub: 1, 'grass-tuft': 2, flowers: 3};
    mesh.name = `home-terrace-${name}`;
    mesh.renderOrder = 4.8 + order[name] * .01;
    mesh.raycast = () => {};
    root.add(mesh);
  }
}

export function createHomeTerraces(root, coastArt, art) {
  const coast = cliffProfile(COAST), positions = [], colors = [], materials = [];
  const plantings = new Map();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  function sunlight(a, b, d) {
    normal.subVectors(b, a).cross(edge.subVectors(d, a)).normalize();
    if (normal.y < 0) normal.negate();
    return .81 + .34 * Math.max(-.64, normal.dot(SUN));
  }
  function vertex(p, tint, light, grass, opacity) {
    const ground = projectGround(p.x, p.z);
    positions.push(ground.x, ground.y + p.y, p.z * .03 + p.y * .09);
    colors.push(tint.r * light, tint.g * light, tint.b * light);
    materials.push(p.x, p.z, grass, opacity);
  }
  function face(a, b, c, d, tint, lightA, lightB, grass = 0, opacity = [1, 1, 1, 1]) {
    const sun = sunlight(a, b, d);
    for (const [p, corner] of [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]]) {
      vertex(p, tint, sun + (corner < 2 ? lightA : lightB), grass, opacity[corner]);
    }
  }
  function stone(point, color, worn) {
    // A proud center and cut corners give every stone a lit top bevel and a shaded lower lip.
    const outer = BLOCK_BEVEL.map(([u, v]) => point(u, v, 0));
    const inner = BLOCK_BEVEL.map(([u, v]) => point(.10 + u * .8, .13 + v * .73, .019 + worn * .006));
    const center = point(.5, .5, .025 + worn * .008);
    for (let i = 0; i < outer.length; i++) {
      const next = (i + 1) % outer.length;
      const lip = BEVEL_LIGHT[i] + worn * .04;
      face(outer[i], outer[next], inner[next], inner[i], color, lip - .04, lip + .045);
      const light = sunlight(center, inner[i], inner[next]) + .02 + worn * .057;
      vertex(center, color, light, 0, 1);
      vertex(inner[i], color, light + BLOCK_BEVEL[i][1] * .11, 0, 1);
      vertex(inner[next], color, light + BLOCK_BEVEL[next][1] * .11, 0, 1);
    }
  }

  for (const {first, last, foot, back, height} of BANKS) {
    const front = foot > back, profile = front ? FRONT_PROFILE : REAR_PROFILE;
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
    const rows = [];
    for (let sample = start; sample <= finish; sample += STEP) {
      const point = samplePoint(sample);
      // The first edge of the sod hangs slightly over the top stone below.
      const shape = profile.map(([radius, elevation, , material]) =>
        point(radius - (material === LIP ? .031 + .006 * Math.sin(sample * 2.3) : 0), elevation));
      rows.push({sample, point, shape});
    }
    if (art) for (const [name, along, across, scale] of FOLIAGE[first]) {
      const sample = THREE.MathUtils.lerp(start, finish, along);
      const high = across > .50;
      const elevation = high ? (front ? .99 : 1) : (front ? .572 : .517);
      const plant = samplePoint(sample)(across, elevation);
      if (!plantings.has(name)) plantings.set(name, []);
      plantings.get(name).push([plant, scale]);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].point, b = rows[i + 1].point;
      face(a(-.26, 0), b(-.26, 0), b(.10, 0), a(.10, 0),
        SHADOW, 0, 0, -1, [0, 0, .44, .44]);
    }
    function heightAt(radius) {
      const next = profile.findIndex(([r]) => r >= radius);
      const [r0, h0] = profile[Math.max(0, next - 1)], [r1, h1] = profile[next];
      return THREE.MathUtils.lerp(h0, h1, r0 === r1 ? 0 : (radius - r0) / (r1 - r0));
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
      face(row.point(.08, 0), row.point(.83, 0), shadowRim(.83, 0), shadowRim(.08, 0),
        SHADOW, 0, 0, -1, [.29, .24, 0, 0]);
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
      // Two shorter courses use different widths and offsets, so their joints never form a grid.
      for (let course = 1; course >= 0; course--) {
        const bottom = course ? .46 : .035, top = course ? .965 : .43;
        const shift = course ? .61 : 0;
        let column = 0;
        for (let next = start - shift; next < finish; column++) {
          const width = BLOCK_WIDTHS[(column + from + (upper ? 2 : 0)) % BLOCK_WIDTHS.length];
          const left = Math.max(start + .014, next + .044), right = Math.min(finish - .014, next + width - .044);
          if (right - left > .19) {
            const worn = Math.sin(column * 2.41 + start * .77 + course * 1.9 + from);
            const groutRipple = .022 * worn;
            const point = (u, v, bulge) => across(THREE.MathUtils.lerp(left, right, u),
              THREE.MathUtils.lerp(bottom, top, v) + (1 - 2 * u) * groutRipple, bulge);
            stone(point, STONE[(column + course * 3 + from) % STONE.length], worn);
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
        const capInner = ring === lastSlope ? .57 : 1;
        const capOuter = ring === lastSlope ? 0 : ring === lastSlope - 1 ? .57 : 1;
        const tint = band === STONE ? MORTAR : band === LIP ? ROOTS : band;
        const turf = band === LIP ? 2 : Number(band === TURF);
        for (let i = 0; i < rows.length - 1; i++) {
          const {shape: left, sample} = rows[i], {shape: right} = rows[i + 1];
          const variation = .026 * Math.sin(sample * .89);
          face(left[ring], right[ring], right[ring + 1], left[ring + 1], tint,
            innerTone + variation, outerTone + variation, turf, [capInner, capInner, capOuter, capOuter]);
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
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}}, vertexColors: true, side: THREE.DoubleSide,
    forceSinglePass: true, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 terraceMaterial;
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
      void main() {
        vTerrace = terraceMaterial;
        vTone = color;
        vTerrain = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec4 vTerrace;
      varying vec3 vTone;
      varying vec2 vTerrain;
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
        vec2 shore = unprojectGround(vTerrain) / vec2(${COAST.rx.toFixed(1)}, ${COAST.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${COAST.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        if (length(shore) >= rim * .994) discard;
        vec2 samplePoint = vec2(vTerrace.x / 64.0, -vTerrace.y * ${LEGACY_DEPTH} / 48.0) * .64 + .5;
        vec3 source = texture2D(uCoastArt, samplePoint).rgb;
        float grain = smoothstep(.11, .43, dot(source, vec3(.27, .62, .11)));
        float height = vTerrain.y - projectGround(vTerrace.xy).y;
        float seam = sin(height * 11.0 + sin(vTerrain.x * 2.1) + sin(vTerrain.x * 6.4) * .72);
        float crystal = noise2(vec2(vTerrain.x * 15.6, height * 19.3 + vTerrain.y * 3.9));
        float grainBreak = noise2(vec2(vTerrain.x * 4.8, height * 8.2));
        // Soft strata follow the height across the face. Local grains break the bright edges
        // into weathered sandstone rather than a single uniformly coloured panel.
        float sediment = smoothstep(.66, .985, seam + (grainBreak - .5) * .56);
        vec3 stone = vTone * (mix(.90, 1.10, grain) + (crystal - .5) * .12 + (grainBreak - .5) * .13);
        stone = mix(stone, stone * vec3(.86, .83, .8), sediment * .22);
        // Golden leaf tips and moss pockets give the turf a softly planted edge.
        float lip = smoothstep(1.0, 2.0, vTerrace.z);
        float tufts = noise2(vec2(vTerrace.x * 29.0, vTerrace.y * 23.0));
        float moss = smoothstep(.35, .67, grainBreak);
        vec3 turfColor = mix(vTone, source, .23);
        turfColor = mix(turfColor, vec3(.49, .62, .14), lip * (.10 + moss * .15));
        vec3 turf = turfColor * (mix(.90, 1.12, grain) + (tufts - .5) * .19 + lip * .06);
        gl_FragColor = vec4(mix(stone, turf, clamp(vTerrace.z, 0.0, 1.0)), vTerrace.w);
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
