// Sculpt the existing cliff facade under the beach. The painted shore masks every rendered face.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const SANDSTONE = ['#d5ad80', '#dfb68a', '#ce9c70', '#cda077', '#d2a77c'].map(color => new THREE.Color(color));
const PILLAR_JOINT = new THREE.Color('#7a6553');
const BLOCK_WIDTHS = [6.7, 4.9, 8.4, 5.5, 7.55, 4.1, 6.8];
const COURSE_TONES = [.41, .31, .21, -.21, -.043, .22, -.06, -.32];
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
  function triangle(a, b, c, tint, tones, depthBias, fraction) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    out.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(out) < 0) faceNormal.negate();
    const sun = Math.max(-.38, faceNormal.dot(SUN)) * .45;
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.74 + sun + tones[i], .23, 1.37);
      // The ground foot stays fixed while the rock's height and depth produce visible facets.
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + depthBias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      relief.push(-vertex.y, fraction[i]);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, topDepth, bottomDepth, depthBias = 0) {
    triangle(a, b, c, tint, [upper, upper, lower], depthBias, [topDepth, topDepth, bottomDepth]);
    triangle(a, c, d, tint, [upper, lower, lower], depthBias, [topDepth, bottomDepth, bottomDepth]);
  }
  const nearEnd = (rows.length - 1) / 2;
  // Recessed continuous stone fills the seams, so the face reads as one continuous shoreline.
  for (let i = 0; i < nearEnd; i++) {
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), PILLAR_JOINT, .15, -.12, 0, 1, -.74);
  }
  for (let start = 0, block = 0; start < nearEnd; block++) {
    const end = Math.min(nearEnd, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length]);
    const lean = Math.sin(block * 2.17), notch = Math.cos(block * 2.43);
    const tint = SANDSTONE[block % SANDSTONE.length];
    // A thick upper ledge drops into a shelf recess. Below it, a separate stone course projects
    // over the foot. Actual face normals shade the ledges as the coast curves around the coves.
    const levels = [
      {left: .012, right: .986, drop: 0, inset: .18},
      {left: .018 + .010 * lean, right: .987 + .007 * lean, drop: .105 + .036 * notch, inset: .018},
      {left: .025 - .014 * lean, right: .984 - .006 * lean, drop: .34 + .067 * notch, inset: 0},
      {left: .043 - .013 * lean, right: .959 - .013 * lean, drop: .43 + .062 * notch, inset: .25},
      {left: .037 - .016 * lean, right: .967 - .01 * lean, drop: .56 + .067 * notch, inset: .195},
      {left: .034 - .015 * lean, right: .971 - .012 * lean, drop: .665 + .052 * notch, inset: .028},
      {left: .048 - .015 * lean, right: .957 - .014 * lean, drop: .84 + .043 * notch, inset: .085},
      {left: .059 - .018 * lean, right: .94 - .015 * lean, drop: 1, inset: .31},
    ];
    const point = (level, across) => {
      const {left, right, drop, inset} = levels[level];
      const index = THREE.MathUtils.lerp(start, end, THREE.MathUtils.lerp(left, right, across));
      // The side facets slope back to the narrow seam between columns.
      const edgeLevel = level === 0 || level === levels.length - 1;
      const shoulder = edgeLevel ? 0 : Math.max(0, Math.abs(across - .49) - .30) * .77;
      const dip = edgeLevel ? 0 : (across - .5) * lean * .095;
      return stoneVertex(rows, index, drop + dip, inset + shoulder);
    };
    const leftEdge = .17 + .054 * lean, rightEdge = .73 + .079 * notch;
    const facets = [
      {left: 0, right: leftEdge, tone: .139},
      {left: leftEdge, right: rightEdge, tone: 0},
      {left: rightEdge, right: 1, tone: -.24},
    ];
    for (const facet of facets) {
      const sections = Math.max(1, Math.ceil((end - start) * (facet.right - facet.left)));
      for (let i = 0; i < sections; i++) {
        const a = THREE.MathUtils.lerp(facet.left, facet.right, i / sections);
        const b = THREE.MathUtils.lerp(facet.left, facet.right, (i + 1) / sections);
        for (let layer = 0; layer < levels.length - 1; layer++) {
          panel(point(layer, a), point(layer, b), point(layer + 1, b), point(layer + 1, a), tint,
            COURSE_TONES[layer] + facet.tone, COURSE_TONES[layer + 1] + facet.tone,
            levels[layer].drop, levels[layer + 1].drop);
        }
      }
    }
    start = end;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('shoreRelief', new THREE.Float32BufferAttribute(relief, 2));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec2 shoreRelief;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec2 vShoreRelief;
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
      varying vec2 vShoreRelief;
      void main() {
        vec2 logical = unprojectGround(vReliefPoint);
        vec2 shore = logical / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        // Preserve all of the visible, playable upper beach, including the existing shallow coves.
        if (length(shore) < rim * 1.012) discard;
        vec4 rock = texture2D(uCoastArt, vec2(logical.x / 64.0, -logical.y * ${LEGACY_DEPTH} / 48.0) + .5);
        if (rock.a < .78) discard;
        float grain = dot(rock.rgb, vec3(.30, .59, .11));
        float rockGrain = smoothstep(.06, .46, grain);
        float wet = smoothstep(.75, .98, vShoreRelief.y) * smoothstep(.45, 1.7, vShoreRelief.x);
        float course = vShoreRelief.y;
        float grainBreak = sin(logical.x * .88 + logical.y * .34) * .017
          + cos(logical.x * 2.13 - logical.y * .82) * .008;
        float recess = smoothstep(.30, .44, course + grainBreak) * (1.0 - smoothstep(.50, .63, course));
        float ledge = smoothstep(.49, .62, course + grainBreak) * (1.0 - smoothstep(.68, .79, course));
        vec3 stone = vStone * mix(.69, 1.26, rockGrain);
        stone = mix(stone, stone * vec3(.73, .69, .65), recess * .51);
        stone = mix(stone, stone * vec3(1.15, 1.08, .99), ledge * .70);
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
