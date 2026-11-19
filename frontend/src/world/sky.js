// Evening colour and moving fog share the world view. Warm pools and beams stay clear through the dusk wash.
import * as THREE from 'three';
import { smoothstep, sunPosition } from '../core/math.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';

const washFragment = /* glsl */`
uniform vec3 uNightColour,uDuskColour;uniform float uNight,uDusk,uCloud;
varying vec2 vScreen;
void main(){
  float sunward=smoothstep(-.8,1.25,dot(vScreen,vec2(-.52,.75)));
  float edge=smoothstep(.58,1.4,length((vScreen-vec2(-.12,.14))*vec2(.88,1.05)));
  vec3 evening=mix(uNightColour,uDuskColour,uDusk*(.14+sunward*.72)*(1.0-uNight*.58));
  vec3 colour=mix(evening,uNightColour,.23*edge*uNight);
  float alpha=uNight*(.43+edge*.18)+uDusk*(.10+sunward*.11)+uCloud*.13;
  gl_FragColor=vec4(colour,clamp(alpha,0.0,.86));
  ${toScreen}
}`;
const fogFragment = /* glsl */`
${pixelGlsl}
uniform vec3 uFogDay,uFogNight;uniform float uFog,uNight,uTime,uWind;
varying vec2 vWorld;
void main(){
  vec2 p=vWorld;
  vec2 drift=vec2(uTime*(.18+uWind*.7),uTime*.04);
  vec2 current=vec2(p.x+p.y*.34,p.y);
  float n=pxNoise((current+drift)*vec2(.067,.16))*.72+pxNoise((p-drift*.6)*vec2(.15,.31))*.28;
  float bank=smoothstep(.37,.82,n)*(.36+uFog*.64);
  float alpha=uFog*(.145+.36*bank);
  gl_FragColor=vec4(mix(uFogDay,uFogNight,uNight*.85),alpha);
  ${toScreen}
}`;

export function createSky(scene) {
  const plane = () => new THREE.PlaneGeometry(1000, 1000);
  const washMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: worldVertex, fragmentShader: washFragment,
    uniforms: { uNightColour: { value: new THREE.Color('#17334c') }, uDuskColour: { value: new THREE.Color('#a3626a') },
      uNight: { value: 0 }, uDusk: { value: 0 }, uCloud: { value: 0 } } });
  const wash = new THREE.Mesh(plane(), washMaterial);
  wash.name = 'sky-wash'; wash.renderOrder = 900; wash.frustumCulled = false; scene.add(wash);
  const mistMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: worldVertex, fragmentShader: fogFragment,
    uniforms: { uFogDay: { value: new THREE.Color('#dae8df') }, uFogNight: { value: new THREE.Color('#596f91') },
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
