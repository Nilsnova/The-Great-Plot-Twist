import {BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Vector3} from 'three';
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

function hullRipples(root, x, waterline) {
  const uniforms = {...seaUniforms, uWakePhase: {value: 0}, uWakeNight: {value: 0}};
  const material = new ShaderMaterial({uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vWaterUv, vWorld;
      void main() {
        vWaterUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      ${seaGlsl}
      varying vec2 vWaterUv, vWorld;
      uniform float uWakePhase, uWakeNight;

      float crest(float age) {
        float across = abs(vWaterUv.x - .5);
        float reach = .28 + .19 * age;
        float y = .65 - .35 * age - .24 * (1.0 - across * across * 4.0);
        float edge = 1.0 - smoothstep(reach - .13, reach, across);
        float line = 1.0 - smoothstep(.012, .052, abs(vWaterUv.y - y));
        float fade = smoothstep(0.0, .17, age) * (1.0 - smoothstep(.36, 1.0, age));
        return edge * line * fade;
      }

      void main() {
        float shore = smoothstep(.32, 1.6, coastDistance(vWorld));
        float ripple = uDetail > .5 ? max(crest(fract(uWakePhase)), .64 * crest(fract(uWakePhase + .5))) : 0.0;
        // The hull darkens the water under its resting depth, with a short reflection just ahead of it.
        vec2 reflectionUv = vWaterUv - vec2(.51, .71);
        reflectionUv.x += sin(vWaterUv.y * 15.0 + uWakePhase * 3.14) * .028 * uDetail;
        float shade = 1.0 - smoothstep(.36, 1.0, length(reflectionUv * vec2(2.7, 2.28)));
        float lit = ripple * mix(.52, .25, uWakeNight);
        vec3 waterTint = mix(vec3(.38, .79, .68), vec3(.08, .29, .35), uWakeNight);
        vec3 hullTint = mix(vec3(.028, .17, .15), vec3(.012, .062, .084), uWakeNight);
        gl_FragColor = vec4(mix(hullTint, waterTint, smoothstep(.05, .35, lit)), max(shade * .24, lit) * shore);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(3.7, .92), material);
  mesh.name = 'home-mooring-water';
  mesh.position.set(x, waterline - .14, 0);
  mesh.renderOrder = 14.9;
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
  const contact = hullRipples(root, restX, restY);
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
      contact.position.x = skiff.position.x;
      resting = still;
    },
  };
}
