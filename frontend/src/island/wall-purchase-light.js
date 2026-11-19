// Lights the accepted wall's own ground cell through its existing textured batch.
import {Vector2} from 'three';
import {FOOTPRINTS} from './placement.js';
import {groundProjectionGlsl} from '../world/projection.js';

const CELL_EDGE = FOOTPRINTS.wall / 2;
const EDGE_BLEND = CELL_EDGE * .76;

const purchaseFragment = `uniform vec2 wallPurchaseAnchor;
uniform float wallPurchaseStrength;
varying vec2 wallPurchaseGround;

vec3 lightPurchasedWall(vec3 color, float alpha) {
  if (wallPurchaseStrength <= 0.0) return color;
  vec2 edge = abs(wallPurchaseGround - wallPurchaseAnchor);
  float share = 1.0 - smoothstep(${EDGE_BLEND.toFixed(2)}, ${CELL_EDGE.toFixed(2)}, max(edge.x, edge.y));
  vec3 brass = vec3(1.0, 0.77, 0.39) * alpha;
  return mix(color, brass, 0.64 * share * wallPurchaseStrength);
}`;

const portraitVertex = /* glsl */`
  wallPurchaseGround = wallGround;
  transformed.y = mix(projectGround(wallGround).y, transformed.y, wallPortraitScale);
`;

export function makeWallPurchaseLight() {
  const anchor = {value: new Vector2()};
  const strength = {value: 0};
  const portraitScale = {value: 1};
  return {
    setPortraitDepth(factor) { portraitScale.value = 1 / (factor ?? 1); },
    show(foot, amount) {
      strength.value = foot && amount > 0 ? amount : 0;
      if (strength.value) anchor.value.set(foot.x, foot.z);
    },
    install(material) {
      const compile = material.onBeforeCompile.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer);
        shader.uniforms.wallPurchaseAnchor = anchor;
        shader.uniforms.wallPurchaseStrength = strength;
        shader.uniforms.wallPortraitScale = portraitScale;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + groundProjectionGlsl +
            '\nattribute vec2 wallGround;\nvarying vec2 wallPurchaseGround;\nuniform float wallPortraitScale;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>' + portraitVertex);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + purchaseFragment)
          .replace('#include <opaque_fragment>',
            'outgoingLight = lightPurchasedWall(outgoingLight, diffuseColor.a);\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => 'cartoon-wall-purchase';
    },
  };
}
