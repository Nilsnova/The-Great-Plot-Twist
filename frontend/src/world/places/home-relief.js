// Sculpt the existing cliff facade under the beach. The painted shore masks every rendered face.
import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const SANDSTONE = ['#ccaa7e', '#d7b484', '#c59d76', '#ca9f73', '#c2a484'].map(color => new THREE.Color(color));
const PILLAR_JOINT = new THREE.Color('#85694f');
const BLOCK_WIDTHS = [5.3, 3.85, 6.7, 4.35, 7.55, 5.2, 6.1];
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
  const positions = [], colors = [], drops = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), out = new THREE.Vector3();
  function triangle(a, b, c, tint, tones, depthBias) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    out.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(out) < 0) faceNormal.negate();
    const sun = Math.max(-.28, faceNormal.dot(SUN)) * .34;
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.73 + sun + tones[i], .29, 1.3);
      // The ground foot stays fixed while the rock's height and depth produce visible facets.
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + depthBias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      drops.push(-vertex.y);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, depthBias = 0) {
    triangle(a, b, c, tint, [upper, upper, lower], depthBias);
    triangle(a, c, d, tint, [upper, lower, lower], depthBias);
  }
  const nearEnd = (rows.length - 1) / 2;
  // Recessed continuous stone fills the seams, so the face reads as one continuous shoreline.
  for (let i = 0; i < nearEnd; i++) {
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), PILLAR_JOINT, .15, -.12, -.74);
  }
  for (let start = 0, block = 0; start < nearEnd; block++) {
    const end = Math.min(nearEnd, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length]);
    const lean = Math.sin(block * 2.17), notch = Math.cos(block * 2.43);
    const tint = SANDSTONE[block % SANDSTONE.length];
    // The sunlit shoulder meets a recessed ledge above the foot, within the painted contour.
    const levels = [
      {left: .012, right: .986, drop: 0, inset: .18},
      {left: .017 + .012 * lean, right: .983 + .011 * lean, drop: .15 + .052 * notch, inset: .058},
      {left: .027 - .014 * lean, right: .978 - .013 * lean, drop: .48 + .11 * notch, inset: 0},
      {left: .032 - .008 * lean, right: .972 - .011 * lean, drop: .62 + .058 * notch, inset: .022},
      {left: .041 - .014 * lean, right: .966 - .012 * lean, drop: .75 + .047 * notch, inset: .17},
      {left: .050 - .017 * lean, right: .946 - .016 * lean, drop: 1, inset: .33},
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
    const tints = [.36, .26, .084, .05, -.16, -.30];
    for (const facet of facets) {
      const sections = Math.max(1, Math.ceil((end - start) * (facet.right - facet.left)));
      for (let i = 0; i < sections; i++) {
        const a = THREE.MathUtils.lerp(facet.left, facet.right, i / sections);
        const b = THREE.MathUtils.lerp(facet.left, facet.right, (i + 1) / sections);
        for (let layer = 0; layer < levels.length - 1; layer++) {
          panel(point(layer, a), point(layer, b), point(layer + 1, b), point(layer + 1, a), tint,
            tints[layer] + facet.tone, tints[layer + 1] + facet.tone);
        }
      }
    }
    start = end;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('shoreDrop', new THREE.Float32BufferAttribute(drops, 1));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float shoreDrop;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying float vShoreDrop;
      void main() {
        vReliefPoint = position.xy;
        vStone = color;
        vShoreDrop = shoreDrop;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying float vShoreDrop;
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
        float rockGrain = smoothstep(.065, .43, grain);
        float tideShade = smoothstep(1.45, 3.07, vShoreDrop);
        vec3 shadedStone = vStone * mix(.72, 1.24, rockGrain) * mix(vec3(1.0), vec3(.81, .88, .94), tideShade * .76);
        gl_FragColor = vec4(mix(shadedStone, rock.rgb, .25), 1.0);
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
