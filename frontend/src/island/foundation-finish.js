import * as THREE from 'three';
import {sandstoneFinishGlsl} from '../world/places/home-relief.js';
import {groundProjectionGlsl} from '../world/projection.js';

export const FOOTING = {contact: -1, shadow: 0, tread: 1, riser: 2, retaining: 3, joint: 4};

export function foundationMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, side: THREE.DoubleSide, forceSinglePass: true,
    depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
      ${groundProjectionGlsl}
      attribute vec3 footingFinish;
      varying vec3 vFinish;
      varying vec3 vGround;
      varying vec4 vTint;
      void main() {
        vFinish = footingFinish;
        vGround = vec3(unprojectGround(position.xy - vec2(0.0, position.z)), position.z);
        vTint = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${sandstoneFinishGlsl}
      varying vec3 vFinish;
      varying vec3 vGround;
      varying vec4 vTint;

      vec4 finish(vec3 local, vec3 ground, vec4 tint) {
        if (local.z < ${FOOTING.tread - .5}) {
          if (local.z < ${FOOTING.shadow - .5}) {
            // Keep the ambient occlusion close to the stone and a little deeper on its lee side.
            vec2 foot = (local.xy - vec2(.09, .10)) * vec2(.93, 1.09);
            float contact = 1.0 - smoothstep(.27, .98, dot(foot, foot));
            float lee = smoothstep(-.45, .60, dot(local.xy, vec2(.39, .61)));
            float alpha = min(.85, tint.a * (.76 + contact * (.59 + .26 * lee)));
            return vec4(tint.rgb * mix(vec3(.96, .92, .83), vec3(.62, .57, .49), contact), alpha);
          }
          // Soft scattered light makes the longer roof cast a cooler, quieter shadow on the paving.
          float spread = smoothstep(.08, .50, tint.a);
          return vec4(tint.rgb * vec3(1.06, 1.15, 1.09), tint.a * mix(.67, .92, spread));
        }

        vec2 uv = local.xy;
        if (local.z < ${FOOTING.riser - .5}) {
          // Cut paver tops share the terrace palette. The opposed bevels catch the same daylight.
          vec3 grain = sandstoneGrain(ground.xy * vec2(4.4, 6.3));
          float detail = 1.0 - smoothstep(.6, 1.55, length(fwidth(ground.xy) * 6.3));
          float slope = clamp(dot(grain.yz, vec2(-.19, -.13)), -.17, .21);
          float glint = 1.0 - smoothstep(.02, .21, min(uv.x, uv.y));
          float bevel = smoothstep(.72, .99, max(uv.x, uv.y));
          vec3 stone = tint.rgb * (.96 + (grain.x - .5) * .28 + slope * detail + .19 * glint - .25 * bevel);
          return vec4(stone, tint.a);
        }

        if (local.z < ${FOOTING.joint - .5}) {
          // World-sized grain follows the cut face and the toe's lowest course takes reflected sea colour.
          vec2 course = vec2(ground.x * .93 + ground.y * .61, ground.z + ground.y * .08);
          vec3 stone = cutSandstone(tint.rgb, course, uv, .6);
          float foot = 1.0 - smoothstep(.035, .42, uv.y);
          float crown = smoothstep(.55, .92, uv.y);
          stone *= .89 + .18 * crown - .23 * foot;
          if (local.z > ${FOOTING.retaining - .5}) {
            float damp = 1.0 - smoothstep(.02, .68, uv.y);
            stone = mix(stone, stone * vec3(.65, .82, .82), damp * .72);
          }
          return vec4(stone, tint.a);
        }

        return vec4(tint.rgb * vec3(.79, .78, .76), tint.a);
      }

      void main() {
        gl_FragColor = finish(vFinish, vGround, vTint);
        #include <colorspace_fragment>
      }`,
  });
}
