// Wind in the foliage without leaving the pixel grid: the upper rows of a tree sprite slide one or
// two whole native pixels sideways (never rotate or skew). One shared program for every tree; each
// tree's material only carries its own offset. Reduced motion passes a frozen clock, so trees rest.
import { artSizes } from './art.js';
let trees = 0;

export function swayMaterial(material, asset) {
  const widthPx = Math.max(1, Math.round((artSizes[asset]?.[0] ?? 1) * 16));
  const sway = { value: 0 };
  material.userData.sway = { uniform: sway, widthPx, seed: (trees++ * 2.399) % 6.283 };
  material.onBeforeCompile = shader => {
    shader.uniforms.uSway = sway;
    shader.fragmentShader = 'uniform float uSway;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec2 swayUv = vMapUv;
  if (vMapUv.y > .52) swayUv.x -= clamp(uSway, -1.0, 1.0) / ${widthPx.toFixed(1)};
  if (vMapUv.y > .76) swayUv.x -= (uSway - clamp(uSway, -1.0, 1.0)) / ${widthPx.toFixed(1)};
  diffuseColor *= texture2D( map, swayUv );
#endif`);
  };
  material.customProgramCacheKey = () => `wind-sway-${widthPx}`;
  material.needsUpdate = true;
  return material;
}
// Whole-pixel offset for this frame: calm air rests, a storm leans the crowns two pixels.
export function updateSway(material, time, wind = 0) {
  const data = material.userData.sway; if (!data) return;
  const gust = Math.sin(time * (1.1 + wind * 1.4) + data.seed) + Math.sin(time * 2.3 + data.seed * 1.7) * .35;
  data.uniform.value = Math.round(gust * Math.min(2, wind * 2.2) + (wind > .7 ? 1 : 0));
}
