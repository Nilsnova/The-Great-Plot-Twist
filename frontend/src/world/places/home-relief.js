// Rock relief is presentation only. Dry stone follows the approved painted coast mask.
import * as THREE from 'three';
import {APPROACH_DEPTH, cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const SANDSTONE = ['#d5ae82', '#ddb88d', '#caa079', '#cba17b', '#d5aa7f'].map(color => new THREE.Color(color));
const PILLAR_JOINT = new THREE.Color('#775e4b');
const SUBMERGED_STONE = new THREE.Color('#64877d');
const TURF = new THREE.Color('#86b746');
const SHOULDER_LEVELS = [[.06, 0, -.24], [.13, .17, -.14], [.23, .25, -.27], [.27, .39, .19],
  [.37, .82, .06], [.49, 1, .27], [.96, .97, .12], [1.28, .62, -.04], [1.45, .21, -.11], [1.58, 0, -.19]];
const SHELF_ARCS = [[25, 34], [55, 67]];
const BLOCK_WIDTHS = [5.2, 3.65, 6.4, 4.5, 6.1, 3.8, 4.9];
const COURSES = [
  {offset: 0, tint: .35, levels: [[0, .47, .2], [.11, .11, .38], [.29, .025, .07], [.375, .38, -.27]]},
  {offset: 2, tint: .20, levels: [[.32, .31, -.24], [.41, .17, .22], [.57, .02, .035], [.69, .43, -.25]]},
  {offset: 4, tint: .08, levels: [[.64, .39, -.16], [.73, .12, .18], [.91, .055, -.06], [1, .32, -.30]]},
];
const FACETS = [-.19, .05, -.25];
const surface = surfaces.home_islet;
const SUN = new THREE.Vector3(-.55, .75, -.35).normalize();

function interpolate(rows, index) {
  const left = Math.floor(index), mix = index - left, a = rows[left], b = rows[Math.min(left + 1, rows.length - 1)];
  return {x: THREE.MathUtils.lerp(a.x, b.x, mix), z: THREE.MathUtils.lerp(a.z, b.z, mix), depth: THREE.MathUtils.lerp(a.depth, b.depth, mix)};
}

function stoneVertex(rows, index, fraction, inset) {
  const {x, z, depth} = interpolate(rows, index);
  const radius = Math.hypot(x, z), sideX = x / radius, sideZ = z / radius;
  return new THREE.Vector3(x - sideX * inset, -depth * fraction, z - sideZ * inset);
}

function homeCliffGeometry(rows = cliffProfile(surface)) {
  const positions = [], colors = [], relief = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), out = new THREE.Vector3();
  function triangle(a, b, c, tint, tones, bias, fractions, region) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    out.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(out) < 0) faceNormal.negate();
    const sun = Math.max(-.48, faceNormal.dot(SUN)) * .49;
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.72 + sun + tones[i], .24, 1.45);
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + bias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      relief.push(-vertex.y, fractions[i], region);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, from, to, bias = 0, region = 0) {
    triangle(a, b, c, tint, [upper, upper, lower], bias, [from, from, to], region);
    triangle(a, c, d, tint, [upper, lower, lower], bias, [from, to, to], region);
  }
  const nearEnd = (rows.length - 1) / 2;
  for (let i = 0; i < nearEnd; i++) {
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), PILLAR_JOINT, .03, -.16, 0, 1, -.74);
    if (rows[i].depth <= APPROACH_DEPTH + .2 || rows[i + 1].depth <= APPROACH_DEPTH + .2) continue;
    // Lower ledges are visibly under the water and never enter the opaque coast or approach mask.
    const toe = sample => Math.max(0, Math.sin(sample * .63) + .55 * Math.cos(sample * .29));
    const left = toe(i), right = toe(i + 1);
    const a = stoneVertex(rows, i, .92, .04), b = stoneVertex(rows, i + 1, .92, .04);
    const c = stoneVertex(rows, i + 1, 1.11 + right * .08, -.25 - right * .31);
    const d = stoneVertex(rows, i, 1.11 + left * .08, -.25 - left * .31);
    const e = stoneVertex(rows, i + 1, 1.32 + right * .21, -.32 - right * .34);
    const f = stoneVertex(rows, i, 1.32 + left * .21, -.32 - left * .34);
    const tone = .30 + left * .20;
    panel(a, b, c, d, SUBMERGED_STONE, .19, tone, 0, .30, -.45, 1);
    panel(d, c, e, f, SUBMERGED_STONE, tone, -.32, .30, 1, -.45, 1);
  }

  // Each height has its own block rhythm. Alternating joints, width and bevel make courses read
  // as cut sandstone with shallow overhangs, even when the entire island is on a narrow screen.
  for (const {offset, tint, levels} of COURSES) {
    for (let start = 0, block = offset; start < nearEnd; block++) {
      const end = Math.min(nearEnd, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length] - (start === 0 ? offset * .31 : 0));
      const lean = Math.sin(block * 2.17), notch = Math.cos(block * 2.43);
      const pigment = SANDSTONE[block % SANDSTONE.length];
      const shoulders = [0, .155 + .065 * lean, .815 + .071 * notch, 1];
      function point(level, across) {
        const [drop, inset] = levels[level];
        const middle = Math.sin(across * Math.PI);
        const taper = Math.max(0, Math.abs(across - .5) - .30) * .82;
        const index = THREE.MathUtils.lerp(start, end, THREE.MathUtils.lerp(.016, .984, across));
        const tilt = Math.sin(block * .93 + level * .8) * .036 + (across - .5) * lean * .079;
        return stoneVertex(rows, index, THREE.MathUtils.clamp(drop + tilt * middle, 0, 1), inset + taper);
      }
      for (let side = 0; side < FACETS.length; side++) {
        const left = shoulders[side], right = shoulders[side + 1];
        const sections = Math.max(1, Math.ceil((end - start) * (right - left)));
        const facetTint = FACETS[side] * (1 + .25 * notch);
        for (let i = 0; i < sections; i++) {
          const a = THREE.MathUtils.lerp(left, right, i / sections);
          const b = THREE.MathUtils.lerp(left, right, (i + 1) / sections);
          for (let height = 0; height < levels.length - 1; height++) {
            const [from, , upper] = levels[height], [to, , lower] = levels[height + 1];
            panel(point(height, a), point(height, b), point(height + 1, b), point(height + 1, a),
              pigment, upper + facetTint + tint, lower + facetTint + tint, from, to);
          }
        }
      }
      start = end;
    }
  }
  // The narrow grass rim rises above the original ground at the rocky front shoulders. Its lower
  // edge meets the cliff, then it rolls back into the low meadow. It is underneath placeable art.
  function shoulderHeight(sample, depth) {
    const fromShelves = Math.min(...SHELF_ARCS.map(([start, end]) => Math.max(0, start - sample, sample - end)));
    const taper = THREE.MathUtils.smoothstep(depth, 1.35, 3.1);
    const relief = THREE.MathUtils.smoothstep(fromShelves, .1, 3.4);
    return taper * (.23 + relief * (1.09 + .20 * Math.sin(sample * .58)));
  }
  const rim = rows.slice(0, nearEnd + 1).map(({depth}, sample) => {
    const height = shoulderHeight(sample, depth) / depth;
    return SHOULDER_LEVELS.map(([reach, rise], level) => {
      const offset = reach * (1 + .13 * Math.sin(sample * .66) + .07 * Math.cos(sample * .32 + level * .32));
      return stoneVertex(rows, sample, -height * rise, offset);
    });
  });
  for (let i = 0; i < nearEnd; i++) {
    if (rows[i].depth < 1.35 && rows[i + 1].depth < 1.35) continue;
    for (let level = 0; level < SHOULDER_LEVELS.length - 1; level++) {
      const a = rim[i][level], b = rim[i + 1][level];
      const c = rim[i + 1][level + 1], d = rim[i][level + 1];
      const [, from, upper] = SHOULDER_LEVELS[level], [, to, lower] = SHOULDER_LEVELS[level + 1];
      const grass = level >= 5, sand = SANDSTONE[Math.floor((i + (level >= 2 ? 2 : 0)) / 3) % SANDSTONE.length];
      const tone = grass ? 0 : -.08 - Math.max(0, Math.sin(i * Math.PI * 2 / 3)) * .18;
      panel(a, b, c, d, grass ? TURF : sand, upper + tone, lower + tone, from, to, 1.2, grass ? 3 : 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('shoreRelief', new THREE.Float32BufferAttribute(relief, 3));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 shoreRelief;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      void main() {
        vReliefPoint = position.xy;
        vStone = color;
        vShoreRelief = shoreRelief;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      void main() {
        vec2 logical = unprojectGround(vReliefPoint);
        vec2 shore = logical / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        // Preserve all of the visible, playable upper beach, including the existing shallow coves.
        vec4 rock = texture2D(uCoastArt, vec2(logical.x / 64.0, -logical.y * ${LEGACY_DEPTH} / 48.0) + .5);
        if (vShoreRelief.z > 1.5) {
          if (length(shore) > rim || rock.a < .78) discard;
          float height = -vShoreRelief.x;
          float opacity = smoothstep(.015, .24, height);
          if (opacity < .02) discard;
          float freckles = sin(logical.x * 18.0 + sin(logical.y * 21.0)) * cos(logical.y * 32.0);
          if (vShoreRelief.z > 2.5) {
            float green = smoothstep(1.18, 1.47, (rock.g + .01) / (rock.r + .01));
            gl_FragColor = vec4(mix(vStone, rock.rgb, green * .58) * (.94 + freckles * .055), opacity);
          } else {
            float joint = 1.0 - smoothstep(.018, .067, abs(vShoreRelief.y - .25));
            gl_FragColor = vec4(vStone * (.94 + freckles * .032 - joint * .20), opacity);
          }
          #include <colorspace_fragment>
          return;
        }
        if (length(shore) < rim * 1.012) discard;
        if (vShoreRelief.z > .5) {
          if (rock.a >= .5) discard;
          float depth = vShoreRelief.y;
          float wave = sin(logical.x * 6.0 + logical.y * 3.0 + sin(logical.y * 4.2)) * .045;
          float opacity = (1.0 - smoothstep(.25, 1.0, depth + wave)) * .47;
          opacity *= 1.0 - smoothstep(.13, .5, rock.a);
          if (opacity < .01) discard;
          float surfaceLight = .88 + wave * 2.0;
          gl_FragColor = vec4(vStone * surfaceLight, opacity);
          #include <colorspace_fragment>
          return;
        }
        if (rock.a < .78) discard;
        float grain = dot(rock.rgb, vec3(.30, .59, .11));
        float rockGrain = smoothstep(.06, .46, grain);
        float wet = smoothstep(.75, .98, vShoreRelief.y) * smoothstep(.45, 1.7, vShoreRelief.x);
        float course = vShoreRelief.y;
        float grainBreak = sin(logical.x * .88 + logical.y * .34) * .017
          + cos(logical.x * 2.13 - logical.y * .82) * .008;
        float joint = min(abs(course + grainBreak - .36), abs(course + grainBreak - .67));
        float recess = 1.0 - smoothstep(.012, .061, joint);
        vec3 stone = vStone * mix(.75, 1.22, rockGrain);
        stone = mix(stone, stone * vec3(.69, .66, .62), recess * .61);
        // A broken trace of moss under the turf links the upper stone to the meadow. Shallow
        // beach approaches start too low for this transition and keep their warm sand.
        float tallFace = smoothstep(.20, .38, vShoreRelief.x);
        float mossCoverage = smoothstep(.51, .87, rockGrain + 4.0 * grainBreak);
        float moss = smoothstep(.06, .14, course) * (1.0 - smoothstep(.19, .28, course)) * tallFace * mossCoverage;
        stone = mix(stone, stone * vec3(.73, .94, .62), moss * .51);
        stone = mix(stone, stone * vec3(.61, .72, .78) + vec3(.004, .018, .023), wet * .75);
        gl_FragColor = vec4(mix(stone, rock.rgb, .17), 1.0);
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
