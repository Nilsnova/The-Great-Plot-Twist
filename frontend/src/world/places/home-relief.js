import * as THREE from 'three';
import {cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

// Each course has a lit bevel, a rock face, and a recessed seam. Its base and crown sit on
// the same profile as the backdrop so the water, camera bounds, and playable beach share a coast.
const COURSES = [{start: 0, end: 1, offset: 0}, {start: 1, end: 2, offset: 3}];
const ROCK = ['#b69c77', '#cfb48b', '#a3947b', '#b8a184', '#bd9e70', '#a69278'].map(color => new THREE.Color(color));
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

export function homeCliffGeometry(rows = cliffProfile(surface)) {
  const positions = [], colors = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), out = new THREE.Vector3();
  function triangle(a, b, c, tint, brightness) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    out.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(out) < 0) faceNormal.negate();
    const light = THREE.MathUtils.clamp(.73 + Math.max(-.28, faceNormal.dot(SUN)) * .43 + brightness, .29, 1.3);
    for (const vertex of [a, b, c]) {
      // Pre-project the volume into the existing orthographic scene. Its origin and projected
      // foot remain fixed while the independent height and depth distinguish the cliff faces.
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
    }
  }
  function courseBand(course, from, to, upper, lower, upperInset, lowerInset, tone, color) {
    const vertex = (index, fraction, inset) => stoneVertex(rows, index,
      THREE.MathUtils.lerp(joint(index, course.start), joint(index, course.end), fraction), inset);
    const a = vertex(from, upper, upperInset), b = vertex(to, upper, upperInset);
    const c = vertex(to, lower, lowerInset), d = vertex(from, lower, lowerInset);
    triangle(a, b, c, color, tone);
    triangle(a, c, d, color, tone - .045);
  }
  for (const course of COURSES) {
    for (let index = 0; index < rows.length - 1; index++) {
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
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      void main() {
        vReliefPoint = position.xy;
        vStone = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
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
        vec3 shadedStone = vStone * mix(.68, 1.28, smoothstep(.09, .41, grain));
        gl_FragColor = vec4(mix(shadedStone, rock.rgb, .48), 1.0);
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
