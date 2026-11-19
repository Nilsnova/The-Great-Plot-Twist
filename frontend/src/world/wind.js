// Wind in the foliage: the crown of a tree sprite leans smoothly sideways, more towards the top (a
// gentle shear, the trunk stays put). One shared program for every tree; each tree's material only
// carries its own offset. Callers can return sprites to their authored pose by setting strength to zero.
import { artSizes } from './art.js';
import { premultiply } from '../art/textures.js';
let trees = 0;

export function swayMaterial(material, asset, {bendFrom = .3, phase = (trees++ * 2.399) % 6.283} = {}) {
  const widthPx = Math.max(1, Math.round((artSizes[asset]?.[0] ?? 1) * 16));
  const sway = { value: 0 };
  material.userData.sway = {uniform: sway, phase};
  const cartoon = !!material.userData.cartoon;
  material.onBeforeCompile = shader => {
    if (cartoon) premultiply(shader);
    shader.uniforms.uSway = sway;
    shader.fragmentShader = 'uniform float uSway;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec2 swayUv = vMapUv;
  swayUv.x -= uSway * smoothstep(${bendFrom.toFixed(2)}, 1.0, vMapUv.y) / ${widthPx.toFixed(1)};
  diffuseColor *= texture2D( map, swayUv );
#endif`);
  };
  material.customProgramCacheKey = () => `wind-sway-${widthPx}-${bendFrom}-${cartoon}`;
  material.needsUpdate = true;
  return material;
}
// The lean for this frame in logical px at the crown's top: calm air barely moves, a storm leans two.
export function updateSway(material, time, wind = 0, strength = 1) {
  const data = material.userData.sway; if (!data) return;
  if (!strength) { data.uniform.value = 0; return; }
  const gust = Math.sin(time * (1.1 + wind * 1.4) + data.phase) + Math.sin(time * 2.3 + data.phase * 1.7) * .35;
  data.uniform.value = strength * (gust * Math.min(2, .25 + wind * 2.2) + (wind > .7 ? 1 : 0));
}
