// Small sandstone bluffs behind Home's building lanes. Elevation belongs only to the view.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround, unprojectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const COAST = surfaces.home_islet;
// Bearings are the same two-degree coast samples as the beach. Breaks leave the west/east
// landings, the Smugglers cove in the north, and the two rear gun decks on clear level ground.
const BANKS = [
  [102, 110, .797, 1.27], [117, 125, .80, 1.56],
  [145, 154, .805, 1.60], [159, 171, .804, 1.49],
];
const STONE = ['#b39774', '#c3a47d', '#ad8968', '#c8a17a'].map(hex => new THREE.Color(hex));
const SOIL = new THREE.Color('#847058'), TURF = new THREE.Color('#8aae46');
const SHADOW = new THREE.Color('#37462c');
const SUN = new THREE.Vector3(-.56, .76, -.34).normalize();
const STEP = .5;
// Each cross-section is a collection of [radius position, elevation, face tone]. The grass
// tops are broad while the two stepped sandstone courses are steep and visibly beveled.
const PROFILE = [
  [0, 0, -.12], [.02, .06, -.26], [.055, .22, -.08], [.07, .44, .07],
  [.11, .52, .19], [.16, .56, -.05], [.40, .56, .12], [.435, .60, .02],
  [.47, .76, .06], [.49, .93, .15], [.55, 1, .16], [.94, .94, .02], [1, .78, -.12],
];

function onTop(x, y) {
  const p = unprojectGround(x, y), coastX = p.x / COAST.rx, coastZ = p.z / COAST.rz;
  const a = Math.atan2(coastZ, coastX);
  const rim = 1 + .055 * Math.sin(a * 5 + COAST.seed) + .035 * Math.cos(a * 7);
  return Math.hypot(coastX, coastZ) < rim * .991;
}

function shelfPoint(row, front, taper, rise, radius, elevation) {
  const reach = front + (.967 - front) * (.47 + (radius - .47) * Math.sqrt(taper));
  const p = new THREE.Vector3(row.x * reach, taper * rise * elevation, row.z * reach);
  const ground = projectGround(p.x, p.z);
  // Keep the seen shape inland too, since a vertical rise projects towards the far beach.
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
    const sun = .83 + .29 * Math.max(-.46, normal.dot(SUN));
    for (const [p, corner] of [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]]) {
      const ground = projectGround(p.x, p.z), light = sun + (corner < 2 ? lightA : lightB);
      positions.push(ground.x, ground.y + p.y, p.z * .03 + p.y * .09);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      materials.push(p.x, p.z, grass, opacity[corner]);
    }
  }

  for (const [first, last, front, height] of BANKS) {
    const width = last - first;
    const edgeOpacity = sample => THREE.MathUtils.smoothstep(Math.min(sample - first, last - sample), 0, 1.65);
    const shape = (sample, radius, elevation) => {
      const t = (sample - first) / width, shoulder = Math.min(1, t * 4.1, (1 - t) * 4.7);
      const taper = shoulder * shoulder * (3 - 2 * shoulder);
      // Per-stone shifts keep the shoulder and lip from forming mechanically straight stripes.
      const variation = Math.sin(sample * 1.43) * .06 + Math.cos(sample * .83) * .045;
      const base = front + .018 * Math.cos(sample * .91) + .026 * (1 - taper);
      const start = Math.floor(sample), mix = sample - start;
      const row = {x: THREE.MathUtils.lerp(coast[start].x, coast[start + 1].x, mix),
        z: THREE.MathUtils.lerp(coast[start].z, coast[start + 1].z, mix)};
      return shelfPoint(row, base, taper, height + variation, radius,
        elevation + taper * Math.sin(sample * 1.15 + radius * 2) * elevation * .045);
    };
    for (let i = first; i < last; i += STEP) {
      face(shape(i, -.17, 0), shape(i + STEP, -.17, 0), shape(i + STEP, .15, 0), shape(i, .15, 0),
        SHADOW, 0, 0, -1, [0, 0, edgeOpacity(i + STEP) * .29, edgeOpacity(i) * .29]);
    }
    for (let layer = PROFILE.length - 2; layer >= 0; layer--) {
      const [inner, high, innerTone] = PROFILE[layer];
      const [outer, back, outerTone] = PROFILE[layer + 1];
      const grassy = [4, 5, 6, 9, 10, 11].includes(layer), ledge = layer === 1;
      // Feather the back of the grass cap into the existing terrain. The lower retaining
      // faces remain opaque through their broad middle sections.
      const capInner = layer === 11 ? .58 : 1;
      const capOuter = layer === 11 ? 0 : layer === 10 ? .58 : 1;
      for (let i = first; i < last; i += STEP) {
        const a = shape(i, inner, high), b = shape(i + STEP, inner, high);
        const c = shape(i + STEP, outer, back), d = shape(i, outer, back);
        const tint = grassy ? TURF : ledge ? SOIL : STONE[Math.floor(i / 2) % STONE.length];
        const stagger = grassy ? .028 * Math.sin(i * .67) : .071 * Math.cos(i * 1.63 + layer * .32);
        const left = edgeOpacity(i), right = edgeOpacity(i + STEP);
        face(a, b, c, d, tint, innerTone + stagger, outerTone + stagger, grassy ? 1 : 0,
          [left * capInner, right * capInner, right * capOuter, left * capOuter]);
        // Broken seams terminate at the next ledge and vary in width instead of repeating.
        if ([2, 3, 8].includes(layer) && Number.isInteger(i) && i > first && i < last - 1 && (i + layer) % 2) {
          face(a, a.clone().lerp(b, .096), d.clone().lerp(c, .054), d, SOIL, .03, -.09, 0, [left, left, left, left]);
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
      void main() {
        vec2 shore = unprojectGround(vTerrain) / vec2(${COAST.rx.toFixed(1)}, ${COAST.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${COAST.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        if (length(shore) >= rim * .994) discard;
        vec2 samplePoint = vec2(vTerrace.x / 64.0, -vTerrace.y * ${LEGACY_DEPTH} / 48.0) * .64 + .5;
        vec3 source = texture2D(uCoastArt, samplePoint).rgb;
        float grain = smoothstep(.11, .43, dot(source, vec3(.27, .62, .11)));
        float veins = sin(vTerrace.x * 15.0 + vTerrain.y * 39.0 + sin(vTerrace.y * 3.0));
        vec3 stone = vTone * (mix(.84, 1.12, grain) + veins * .023);
        vec3 turf = mix(vTone, source, .37) * mix(.88, 1.14, grain);
        gl_FragColor = vec4(mix(stone, turf, max(0.0, vTerrace.z)), vTerrace.w);
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
