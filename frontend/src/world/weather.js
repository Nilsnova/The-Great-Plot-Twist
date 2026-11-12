// Public weather state plus code-drawn pixel rain. Integrations use setWeather.
import * as THREE from 'three';
import { clamp, smoothstep, sunPosition } from '../core/math.js';
import { QUALITY, settings } from '../config.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';
import { seaGlsl, seaUniforms } from './water.js';

let current = { cloudCover: 0.05, rain: 0, fog: 0.02, wind: 0.18 };
export const presets = {
  clear: { cloudCover: 0.05, rain: 0, fog: 0.05, wind: 0.12 },
  overcast: { cloudCover: 0.8, rain: 0, fog: 0.2, wind: 0.4 },
  storm: { cloudCover: 1, rain: 1, fog: 0.38, wind: 1 },
  fog: { cloudCover: 0.55, rain: 0, fog: 1, wind: 0.1 },
};
export function clampWeather(previous, changes = {}) {
  const next = { ...previous };
  for (const key of ['cloudCover', 'rain', 'fog', 'wind']) {
    if (Number.isFinite(changes?.[key])) next[key] = clamp(changes[key], 0, 1);
  }
  return next;
}
export function setWeather(changes) { current = clampWeather(current, changes); return getWeather(); }
export const getWeather = () => ({ ...current });

// Rain as one code-drawn pixel layer: slanted streaks a whole native pixel wide that lean with the
// wind, and small three-frame splashes on land (the sea draws its own rings in water.js). The drop
// count follows the rain value and the quality setting; low quality draws no splashes.
const rainFragment = /* glsl */`
${pixelGlsl}${seaGlsl}
uniform float uTime,uAmount,uLean,uSplash,uNight;uniform vec3 uDrop;
varying vec2 vWorld;
void main(){
  vec2 px=floor(vWorld*32.0),p=(px+.5)/32.0;float alpha=0.0;vec3 colour=uDrop;
  float sx=floor(px.x+px.y*uLean);
  if(mod(sx,3.0)==0.0){
    float lane=sx/3.0,h=pxHash1(lane*1.37+.11);
    float period=64.0+h*72.0,y=px.y+uTime*(580.0+h*220.0)+h*517.0,m=mod(y,period);
    float len=4.0+floor(h*5.0);
    if(m< len&&pxHash1(lane*3.17+floor(y/period)*7.1)< uAmount*.82)alpha=m<1.0?.62:m< len*.5?.42:.26;
  }
  if(uSplash>.5&&alpha==0.0&&coastDistance(p)<.5){
    vec2 cell=floor(px/vec2(11.0,7.0));float phase=uTime*2.6+pxHash(cell)*7.0,k=floor(phase),f=fract(phase);
    if(pxHash(cell+k*1.31)< uAmount*.55){
      vec2 o=px-(cell*vec2(11.0,7.0)+floor(vec2(pxHash(cell+k),pxHash(cell-k))*vec2(7.0,3.0))+vec2(2.0,2.0));
      float frame=floor(f*5.0);
      bool hit=frame==0.0&&o==vec2(0.0,1.0)
        ||frame==1.0&&(o==vec2(0.0)||o==vec2(-1.0,1.0)||o==vec2(1.0,1.0))
        ||frame==2.0&&(o==vec2(-2.0,0.0)||o==vec2(2.0,0.0)||o==vec2(-1.0,2.0)||o==vec2(1.0,2.0));
      if(hit)alpha=frame<2.0?.55:.3;
    }
  }
  if(alpha<=0.0)discard;
  gl_FragColor=vec4(colour*(1.0-uNight*.38),alpha);
  ${toScreen}
}`;

export function createWeather(scene) {
  const material = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: worldVertex, fragmentShader: rainFragment,
    uniforms: { ...seaUniforms, uTime: { value: 0 }, uAmount: { value: 0 }, uLean: { value: .2 }, uSplash: { value: 1 },
      uNight: { value: 0 }, uDrop: { value: new THREE.Color('#d2e3e2') } } });
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material);
  rain.name = 'rain'; rain.renderOrder = 930; rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  let time = 0;
  return { rain, update(delta, player, quality) {
    const weather = getWeather(), u = material.uniforms;
    rain.visible = weather.rain > 0;
    if (!rain.visible) return weather;
    time += Number.isFinite(delta) ? delta : 0;
    const scale = QUALITY[quality]?.rainCount / QUALITY.high.rainCount || 1;
    u.uTime.value = time; u.uAmount.value = weather.rain * scale; u.uLean.value = .15 + weather.wind * .5;
    u.uSplash.value = quality === 'low' ? 0 : 1;
    u.uNight.value = 1 - smoothstep(-0.2, 0.25, sunPosition(settings.hour).y);
    return weather;
  } };
}
