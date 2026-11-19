import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

// Both faces use the painted coast silhouette. The nearest shore breaks into tall sandstone blocks.
const COURSES = [{start: 0, end: 1, offset: 0}, {start: 1, end: 2, offset: 3}];
const ROCK = ['#b69c77', '#cfb48b', '#a3947b', '#b8a184', '#bd9e70', '#a69278'].map(color => new THREE.Color(color));
const SANDSTONE = ['#c7a278', '#d1b38a', '#ba9972', '#c8a782', '#bfa27a'].map(color => new THREE.Color(color));
const PILLAR_JOINT = new THREE.Color('#a99070');
const BLOCK_WIDTHS = [5.7, 4.4, 6.6, 4.1, 7.2, 5.2, 6.9];
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

function joint(index, layer) {
  if (layer !== 1) return layer / 2;
  const phase = index * Math.PI * 2 / 180;
  return .49 + Math.cos(phase * 11 + 1.1) * .089 + Math.sin(phase * 23) * .059;
}

function homeCliffGeometry(rows = cliffProfile(surface)) {
  const positions = [], colors = [], sandstone = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), out = new THREE.Vector3();
  function triangle(a, b, c, tint, tones, sculpted, depthBias) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    out.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(out) < 0) faceNormal.negate();
    const sun = Math.max(-.28, faceNormal.dot(SUN)) * (sculpted ? .23 : .43);
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.73 + sun + tones[i], .29, 1.3);
      // The ground foot stays fixed while the rock's height and depth produce visible facets.
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + depthBias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      sandstone.push(sculpted ? 1 : 0);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, depthBias = 0) {
    triangle(a, b, c, tint, [upper, upper, lower], true, depthBias);
    triangle(a, c, d, tint, [upper, lower, lower], true, depthBias);
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
    // A projecting shoulder and a tapered foot make each column readable in the phone overview.
    const levels = [
      {left: .012, right: .986, drop: 0, inset: 0},
      {left: .017 + .012 * lean, right: .983 + .011 * lean, drop: .15 + .052 * notch, inset: -.18},
      {left: .027 - .014 * lean, right: .978 - .013 * lean, drop: .49 + .14 * notch, inset: -.32},
      {left: .035 - .014 * lean, right: .973 - .012 * lean, drop: .84 + .053 * notch, inset: -.07},
      {left: .043 - .017 * lean, right: .956 - .016 * lean, drop: 1, inset: .008},
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
      {left: 0, right: leftEdge, tone: .115},
      {left: leftEdge, right: rightEdge, tone: 0},
      {left: rightEdge, right: 1, tone: -.21},
    ];
    const tints = [.38, .25, .115, -.1, -.24];
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
  function courseBand(course, from, to, upper, lower, upperInset, lowerInset, tone, color) {
    const vertex = (index, fraction, inset) => stoneVertex(rows, index,
      THREE.MathUtils.lerp(joint(index, course.start), joint(index, course.end), fraction), inset);
    const a = vertex(from, upper, upperInset), b = vertex(to, upper, upperInset);
    const c = vertex(to, lower, lowerInset), d = vertex(from, lower, lowerInset);
    triangle(a, b, c, color, [tone, tone, tone], false, 0);
    triangle(a, c, d, color, [tone - .045, tone - .045, tone - .045], false, 0);
  }
  for (const course of COURSES) {
    for (let index = nearEnd; index < rows.length - 1; index++) {
      const next = index + 1, block = Math.floor((index + course.offset) / 5);
      const seam = (next + course.offset) % 5 === 0, finish = seam ? next - .25 - .09 * Math.cos(block * 1.14) : next;
      const color = ROCK[(block * 7 + course.offset) % ROCK.length];
      const bevel = .11 + .06 * Math.sin(block * 2.17 + course.offset);
      const face = .86 + .07 * Math.cos(block * 1.24 + course.offset);
      const inset = -.20 - .16 * Math.sin(block * 1.91 + .2);
      const variation = Math.sin(block * 1.44) * .13 - course.start * .15;
      courseBand(course, index, finish, 0, bevel, 0, inset, .21 + variation, color);
      courseBand(course, index, finish, bevel, face, inset, -.04, .025 + variation, color);
      courseBand(course, index, finish, face, 1, -.04, 0, -.22 + variation * .4, color);
      if (seam) courseBand(course, finish, next, 0, 1, 0, 0, -.29 + variation * .3, color);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('sandstone', new THREE.Float32BufferAttribute(sandstone, 1));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying float vSandstone;
      attribute float sandstone;
      void main() {
        vSandstone = sandstone;
        vReliefPoint = position.xy;
        vStone = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying float vSandstone;
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
        float rockGrain = smoothstep(.09, .41, grain);
        vec3 shadedStone = vStone * mix(mix(.68, 1.28, rockGrain), mix(.84, 1.17, rockGrain), vSandstone);
        gl_FragColor = vec4(mix(shadedStone, rock.rgb, mix(.48, .26, vSandstone)), 1.0);
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
