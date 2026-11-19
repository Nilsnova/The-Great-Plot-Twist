// Sandstone terraces along the shoulders of Home Island. Elevation belongs only to the view.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, unprojectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const COAST = surfaces.home_islet;
// Coast samples are spaced two degrees apart. Each run goes from the visible stone foot
// to the tapered back of its grass cap. The southern runs face towards the sea.
const BANKS = [
  {first: 101, last: 108, foot: .771, back: .913, height: 2.5},
  {first: 116, last: 132, foot: .772, back: .891, height: 2.85},
  {first: 140, last: 155, foot: .815, back: .896, height: 2.82},
  {first: 162, last: 173, foot: .800, back: .912, height: 2.49},
  {first: 25, last: 34, foot: .942, back: .812, height: 1.63},
  {first: 55, last: 67, foot: .951, back: .847, height: 1.47},
];
const STONE = ['#b59772', '#c3a279', '#a48362', '#bea17d'].map(hex => new THREE.Color(hex));
const MORTAR = new THREE.Color('#735e4d'), RECESS = new THREE.Color('#87694d');
const TURF = new THREE.Color('#85ab41'), LIP = new THREE.Color('#a4bf53');
const SHADOW = new THREE.Color('#3e4a2d');
const SUN = new THREE.Vector3(-.55, .72, .41).normalize();
const STEP = .5;
// Each stop starts a band. The two faces have deep bases, lit shoulders and grass lips.
// A short incline at the back of the upper tread hides where it joins the old meadow.
const REAR_PROFILE = [
  [0, 0, -.14, RECESS], [.025, .055, -.25, STONE], [.051, .29, -.04, STONE],
  [.079, .42, .16, STONE], [.112, .48, .23, LIP], [.15, .505, .11, TURF],
  [.392, .513, .03, TURF], [.428, .532, -.10, RECESS], [.446, .604, -.20, STONE],
  [.464, .812, -.035, STONE], [.482, .923, .14, STONE], [.515, .978, .23, LIP],
  [.571, 1, .095, TURF], [.875, .99, .055, TURF], [.946, .857, -.01, TURF],
  [1, .62, -.11, TURF],
];
const FRONT_PROFILE = [
  [0, 0, -.13, RECESS], [.055, .06, -.22, STONE], [.086, .29, -.08, STONE],
  [.117, .46, .10, STONE], [.157, .525, .19, LIP], [.193, .564, .09, TURF],
  [.415, .581, .025, TURF], [.461, .591, -.055, RECESS], [.49, .65, -.08, STONE],
  [.52, .795, .01, STONE], [.544, .897, .10, STONE], [.574, .957, .155, LIP],
  [.64, 1, .08, TURF], [.748, .978, .06, TURF], [.905, .716, .025, TURF],
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

export function createHomeTerraces(root, coastArt) {
  const coast = cliffProfile(COAST), positions = [], colors = [], materials = [];
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  function face(a, b, c, d, tint, lightA, lightB, grass = 0, opacity = [1, 1, 1, 1]) {
    normal.subVectors(b, a).cross(edge.subVectors(d, a)).normalize();
    // Cross-sections progress clockwise and are authored from the inland foot to the far edge.
    if (normal.y < 0) normal.negate();
    const sun = .79 + .35 * Math.max(-.48, normal.dot(SUN));
    for (const [p, corner] of [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]]) {
      const ground = projectGround(p.x, p.z), light = sun + (corner < 2 ? lightA : lightB);
      positions.push(ground.x, ground.y + p.y, p.z * .03 + p.y * .09);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      materials.push(p.x, p.z, grass, opacity[corner]);
    }
  }

  for (const {first, last, foot, back, height} of BANKS) {
    const width = last - first;
    const profile = foot > back ? FRONT_PROFILE : REAR_PROFILE;
    const rows = [];
    for (let sample = first; sample <= last; sample += STEP) {
      const t = (sample - first) / width;
      const shoulder = Math.min(1, t * 6.3, (1 - t) * 6.9);
      const taper = shoulder * shoulder * (3 - 2 * shoulder);
      const start = Math.floor(sample), mix = sample - start;
      const row = {x: THREE.MathUtils.lerp(coast[start].x, coast[start + 1].x, mix),
        z: THREE.MathUtils.lerp(coast[start].z, coast[start + 1].z, mix)};
      const breadth = .011 * Math.cos(sample * .87) + .008 * Math.sin(sample * 1.92);
      const rise = height + Math.sin(sample * .92) * .09 + Math.cos(sample * 1.84) * .045;
      const point = (radius, elevation) => shelfPoint(row, foot + breadth, back + breadth * .31, taper, rise, radius,
        elevation * (1 + taper * Math.sin(sample * 1.11 + radius * 3) * .034));
      rows.push({sample, point, shape: profile.map(([radius, elevation]) => point(radius, elevation)),
        opacity: THREE.MathUtils.smoothstep(Math.min(sample - first, last - sample), 0, 1.36)});
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      face(a.point(-.285, 0), b.point(-.285, 0), b.point(.10, 0), a.point(.10, 0),
        SHADOW, 0, 0, -1, [0, 0, b.opacity * .44, a.opacity * .44]);
    }
    for (let layer = profile.length - 2; layer >= 0; layer--) {
      const [, , innerTone, band] = profile[layer], [, , outerTone] = profile[layer + 1];
      const grass = band === TURF || band === LIP;
      const lastSlope = profile.length - 2;
      const capInner = layer === lastSlope ? .57 : 1;
      const capOuter = layer === lastSlope ? 0 : layer === lastSlope - 1 ? .57 : 1;
      for (let i = 0; i < rows.length - 1; i++) {
        const left = rows[i], right = rows[i + 1];
        const a = left.shape[layer], b = right.shape[layer], c = right.shape[layer + 1], d = left.shape[layer + 1];
        // Joints and colour changes are offset in the upper course, like a fractured rock ledge.
        const courseOffset = layer < 7 ? 0 : .5;
        const stoneIndex = Math.floor((left.sample + courseOffset) / 1.5);
        const tint = band === STONE ? STONE[stoneIndex % STONE.length] : band;
        const variation = grass ? .025 * Math.sin(left.sample * .67) : .037 * Math.cos(stoneIndex * 1.71);
        face(a, b, c, d, tint, innerTone + variation, outerTone + variation, band === LIP ? 2 : Number(grass),
          [left.opacity * capInner, right.opacity * capInner, right.opacity * capOuter, left.opacity * capOuter]);
        const seam = (left.sample + courseOffset) % 1.5 === 0;
        if (band === STONE && seam && i > 0 && i < rows.length - 2) {
          const head = layer % 2 ? .062 : .117, heel = layer % 2 ? .106 : .071;
          face(a, a.clone().lerp(b, head), d.clone().lerp(c, heel), d, MORTAR, .01, -.12, 0,
            [left.opacity, left.opacity, left.opacity, left.opacity]);
        }
      }
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
        float seam = sin(height * 27.0 + sin(vTerrain.x * 2.1) + sin(vTerrain.x * 6.4) * .72);
        float crystal = noise2(vec2(vTerrain.x * 15.6, height * 19.3 + vTerrain.y * 3.9));
        float grainBreak = noise2(vec2(vTerrain.x * 4.8, height * 8.2));
        // Soft strata follow the height across the face. Local grains break the bright edges
        // into weathered sandstone rather than a single uniformly coloured panel.
        float sediment = smoothstep(.66, .985, seam + (grainBreak - .5) * .56);
        vec3 stone = vTone * (mix(.82, 1.09, grain) + (crystal - .5) * .15 + (grainBreak - .5) * .22);
        stone = mix(stone, stone * vec3(.77, .74, .72), sediment * .39);
        vec3 turf = mix(vTone, source, .41) * (mix(.91, 1.09, grain) + (crystal - .5) * .081);
        turf *= 1.0 + smoothstep(1.0, 2.0, vTerrace.z) * (.06 + .03 * seam);
        gl_FragColor = vec4(mix(stone, turf, clamp(vTerrace.z, 0.0, 1.0)), vTerrace.w);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'home-inland-terraces';
  mesh.renderOrder = 4.7;
  mesh.raycast = () => {};
  root.add(mesh);
  return mesh;
}
