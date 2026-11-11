// Day, dusk and night as one code-drawn wash over the whole page, plus drifting pixel fog banks.
// Dusk tints rose, night tints blue and darkens the far corners in two flat steps, so the warm
// light pools (light-pools.js) and beams read like lanterns in the dark. Fog banks are value noise
// quantised to two flat densities with clean edges that drift with the wind. update(hour, weather, time).
import * as THREE from 'three';
import { smoothstep, sunPosition } from '../core/math.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';

const washFragment = /* glsl */`
${pixelGlsl}
uniform vec3 uNightColour,uDuskColour;uniform float uNight,uDusk,uCloud;
varying vec2 vWorld;varying vec2 vScreen;
void main(){
  vec2 px=floor(vWorld*16.0);
  vec3 colour=mix(uNightColour,uDuskColour,uDusk*(1.0-uNight*.7));
  float alpha=uNight*.5+uDusk*.16+uCloud*.13;
  // Night vignette: only the far corners fall away, in two flat steps (no dithered rings).
  float edge=smoothstep(1.0,1.5,length(vScreen*vec2(1.0,1.15)));
  alpha+=pxSteps(edge,2.0,px)*.2*uNight;
  gl_FragColor=vec4(colour,clamp(alpha,0.0,.86));
  ${toScreen}
}`;
const fogFragment = /* glsl */`
${pixelGlsl}
uniform vec3 uFogDay,uFogNight;uniform float uFog,uNight,uTime,uWind;
varying vec2 vWorld;
void main(){
  vec2 px=floor(vWorld*16.0),p=(px+.5)/16.0;
  vec2 drift=vec2(uTime*(.18+uWind*.7),uTime*.04);
  float n=pxNoise((p+drift)*vec2(.08,.13))*.75+pxNoise((p-drift*.6)*vec2(.19,.27))*.25;
  // A flat haze plus a few broad banks in two flat densities with clean edges.
  float bank=smoothstep(.45,.8,n);
  float alpha=uFog*.17+pxBands(bank*(.35+uFog*.65),2.0,px,0.0)*uFog*.36;
  gl_FragColor=vec4(mix(uFogDay,uFogNight,uNight*.85),alpha);
  ${toScreen}
}`;

export function createSky(scene) {
  const plane = () => new THREE.PlaneGeometry(1000, 1000);
  const washMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: worldVertex, fragmentShader: washFragment,
    uniforms: { uNightColour: { value: new THREE.Color('#1b3350') }, uDuskColour: { value: new THREE.Color('#8a4f5c') },
      uNight: { value: 0 }, uDusk: { value: 0 }, uCloud: { value: 0 } } });
  const wash = new THREE.Mesh(plane(), washMaterial);
  wash.name = 'sky-wash'; wash.renderOrder = 900; wash.frustumCulled = false; scene.add(wash);
  const mistMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: worldVertex, fragmentShader: fogFragment,
    uniforms: { uFogDay: { value: new THREE.Color('#e4e7d1') }, uFogNight: { value: new THREE.Color('#5d6f85') },
      uFog: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 }, uWind: { value: 0 } } });
  const mist = new THREE.Mesh(plane(), mistMaterial);
  mist.name = 'sky-mist'; mist.renderOrder = 910; mist.frustumCulled = false; scene.add(mist);
  return { wash, mist, update(hour, weather, time = 0) {
    const sun = sunPosition(hour), night = 1 - smoothstep(-0.2, 0.25, sun.y);
    const dusk = 1 - smoothstep(0, .38, Math.abs(sun.y));
    const u = washMaterial.uniforms;
    u.uNight.value = night; u.uDusk.value = dusk; u.uCloud.value = weather.cloudCover;
    wash.visible = night * .5 + dusk * .16 + weather.cloudCover * .13 > .012; // skip a full-screen pass that would not show
    const m = mistMaterial.uniforms;
    m.uFog.value = weather.fog; m.uNight.value = night; m.uTime.value = time; m.uWind.value = weather.wind;
    mist.visible = weather.fog > .06;
    return night;
  } };
}
