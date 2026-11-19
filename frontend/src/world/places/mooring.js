import {BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, ShaderMaterial, Vector3} from 'three';
import {MOORING_EYES} from '../../art/home-shore.js';
import {artSizes} from '../art.js';
import {seaGlsl, seaUniforms} from '../water.js';
import {createHomeLanding} from './home-landing.js';

const SEGMENTS = 12;
const INDICES = [];
for (let i = 0; i < SEGMENTS * 2; i += 2) INDICES.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);

function localEye(mesh) {
  const asset = mesh.userData.asset;
  const [width, height, foot] = artSizes[asset], [x, y] = MOORING_EYES[asset];
  return new Vector3(x / 16 - width / 2, (1 - foot) * height - y / 16, 0);
}

function strand(rope, color, order, opacity) {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setIndex(INDICES);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false, side: DoubleSide, toneMapped: false,
  }));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  rope.add(mesh);
  return position;
}

function mooringContact(root, stage, x, waterline) {
  const positions = [], uvs = [], kinds = [], indices = [];
  const originY = waterline - .14;
  function patch(atX, atY, width, depth, kind, shear = 0) {
    const first = kinds.length;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const y = (v - .5) * depth;
      positions.push(atX - x + (u - .5) * width + y * shear, atY - originY + y, 0);
      uvs.push(u, v);
      kinds.push(kind);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  const [near, far] = stage.userData.waterAxis;
  patch((near.x + far.x) / 2, (near.y + far.y) / 2 - .08, 3.9, Math.abs(near.y - far.y) + 1.1,
    2, (near.x - far.x) / (near.y - far.y));
  for (const foot of stage.userData.waterSupports) patch(foot.x, foot.y - .20, .93, 1.03, 1);
  patch(x, originY - .055, 3.7, 1.16, 0);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('contactKind', new BufferAttribute(new Float32Array(kinds), 1));
  geometry.setIndex(indices);
  const uniforms = {...seaUniforms, uWakePhase: {value: 0}, uWakeNight: {value: 0}, uHullDrift: {value: 0}};
  const material = new ShaderMaterial({uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float contactKind;
      uniform float uHullDrift;
      varying vec2 vWaterUv, vWorld;
      varying float vContactKind;
      void main() {
        vWaterUv = uv;
        vContactKind = contactKind;
        vec3 point = position;
        if (contactKind < .5) point.x += uHullDrift;
        vec4 world = modelMatrix * vec4(point, 1.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      ${seaGlsl}
      varying vec2 vWaterUv, vWorld;
      varying float vContactKind;
      uniform float uWakePhase, uWakeNight;

      float crest(float age) {
        float across = abs(vWaterUv.x - .5);
        float reach = .29 + .18 * age;
        float y = .66 - .32 * age - .23 * (1.0 - across * across * 4.0);
        float edge = 1.0 - smoothstep(reach - .12, reach, across);
        float line = 1.0 - smoothstep(.009, .034, abs(vWaterUv.y - y));
        float fade = smoothstep(0.0, .17, age) * (1.0 - smoothstep(.36, 1.0, age));
        return edge * line * fade;
      }

      void main() {
        float shore = smoothstep(.34, 1.40, coastDistance(vWorld));
        float phase = uWakePhase;
        float shade, lit = 0.0, reflection = 0.0;
        vec2 p = vWaterUv - .5;
        if (vContactKind < .5) {
          vec2 off = p - vec2(.01, .21);
          shade = .32 * (1.0 - smoothstep(.30, 1.0, length(off * vec2(2.43, 2.32))));
          if (uDetail > .5) {
            lit = .55 * max(crest(fract(phase)), .64 * crest(fract(phase + .5)));
            float distortion = sin(18.0 * off.y + phase * 3.1) * .07;
            float band = 1.0 - smoothstep(.013, .09, abs(off.y + .36 + off.x * off.x * 1.75 + distortion));
            reflection = band * (1.0 - smoothstep(.11, .44, abs(off.x))) * .21;
          }
        } else if (vContactKind < 1.5) {
          vec2 off = p - vec2(0.0, .19);
          shade = .33 * (1.0 - smoothstep(.19, 1.0, length(off * vec2(2.65, 2.26))));
          if (uDetail > .5) {
            float flow = sin(20.0 * p.y + phase * 4.0 + vWorld.x * 1.6);
            float stalk = 1.0 - smoothstep(.055, .25, abs(off.x + flow * .043));
            reflection = stalk * smoothstep(-.64, -.12, off.y) * (1.0 - smoothstep(-.11, .03, off.y)) * .33;
            float ring = abs(length(off * vec2(2.52, 2.75)) - (.71 + .07 * flow));
            lit = (1.0 - smoothstep(.021, .101, ring)) * (1.0 - smoothstep(-.02, .20, off.y)) * .44;
          }
        } else {
          float along = smoothstep(.0, .16, vWaterUv.y) * (1.0 - smoothstep(.86, 1.0, vWaterUv.y));
          float deck = 1.0 - smoothstep(.15, .49, abs(p.x - .07));
          shade = deck * along * .32;
        }
        vec3 dark = mix(vec3(.021, .126, .118), vec3(.008, .036, .05), uWakeNight);
        vec3 foam = mix(vec3(.51, .86, .78), vec3(.08, .27, .32), uWakeNight);
        vec3 gold = mix(vec3(.51, .37, .17), vec3(.11, .12, .09), uWakeNight);
        float viewLight = mix(1.0, .46, uWakeNight);
        float weight = shade + reflection * viewLight + lit * viewLight;
        vec3 colour = (dark * shade + (foam * lit + gold * reflection) * viewLight) / max(.001, weight);
        gl_FragColor = vec4(colour, min(.76, weight) * shore);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'home-mooring-water';
  mesh.position.set(x, originY, 0);
  mesh.renderOrder = 5;
  mesh.raycast = () => {};
  root.add(mesh);
  return mesh;
}

export function makeMooring(root, bollard, skiff) {
  const {x: restX, y: restY} = skiff.position;
  const shoreEye = localEye(bollard), cleat = localEye(skiff);
  const from = new Vector3(), to = new Vector3();
  const lastFrom = new Vector3(Infinity), lastTo = new Vector3(Infinity);
  const stage = createHomeLanding(root);
  const contact = mooringContact(root, stage, restX, restY);
  const rope = new Group();
  rope.name = 'home-mooring-rope';
  const shadow = strand(rope, '#6d5141', 15, .92), light = strand(rope, '#cbb084', 15.1, .86);
  root.add(rope);

  // The boat pivots on its waterline. Rebuild the two tiny strips in place so the rope follows the cleat.
  function drawRope() {
    bollard.updateMatrix();
    skiff.updateMatrix();
    from.copy(shoreEye).applyMatrix4(bollard.matrix);
    to.copy(cleat).applyMatrix4(skiff.matrix);
    if (from.equals(lastFrom) && to.equals(lastTo)) return;
    lastFrom.copy(from);
    lastTo.copy(to);
    const {x: toX, y: toY} = to;
    const bendX = from.x + (toX - from.x) * .54 - .28, bendY = from.y + (toY - from.y) * .54 - .22;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS, u = 1 - t, vertex = i * 2;
      const x = u * u * from.x + 2 * u * t * bendX + t * t * toX;
      const y = u * u * from.y + 2 * u * t * bendY + t * t * toY;
      const dx = u * (bendX - from.x) + t * (toX - bendX), dy = u * (bendY - from.y) + t * (toY - bendY);
      const length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      shadow.setXYZ(vertex, x + nx * .042, y + ny * .042, 0);
      shadow.setXYZ(vertex + 1, x - nx * .042, y - ny * .042, 0);
      light.setXYZ(vertex, x + nx * .017, y + ny * .017 + .013, 0);
      light.setXYZ(vertex + 1, x - nx * .017, y - ny * .017 + .013, 0);
    }
    shadow.needsUpdate = light.needsUpdate = true;
  }
  drawRope();
  let resting = true;
  return {
    prepareRender() { if (rope.visible) drawRope(); },
    setBattle(active) { skiff.visible = rope.visible = contact.visible = stage.visible = !active; },
    update(time, wind, still, night = 0) {
      contact.material.uniforms.uWakeNight.value = night;
      contact.material.uniforms.uWakePhase.value = still ? 0 : time * .56;
      if (still) {
        if (resting) return;
        skiff.position.x = restX;
        skiff.position.y = restY;
        skiff.rotation.z = 0;
      } else {
        if (!skiff.visible) return;
        const swell = Math.sin(time * 1.7);
        skiff.position.x = restX + Math.sin(time * 1.06) * .065;
        skiff.position.y = restY + swell * (.068 + wind * .046);
        skiff.rotation.z = Math.sin(time * 1.7 - .86) * (.027 + wind * .012);
      }
      contact.material.uniforms.uHullDrift.value = skiff.position.x - restX;
      resting = still;
    },
  };
}
