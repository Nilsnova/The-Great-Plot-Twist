// One sweeping lighthouse beam, drawn above the night wash in four dithered steps of lamplight.
// Where it crosses the sea it catches the wave crests: sparkling dashes that read the shared coast
// field and sea clock from water.js. Reduced motion holds the beam still; low quality skips sparkles.
import * as THREE from 'three';
import {getPreferences,reducedMotion} from '../settings/preferences.js';
import { pixelGlsl, toScreen } from './pixel-glsl.js';
import {seaGlsl,seaUniforms} from './water.js';

const LENGTH = 31, SPREAD = 4.5; // also written into the shader as 31.0 and 4.5
const vertex = /* glsl */`varying vec2 vWorld;
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xy;gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragment = /* glsl */`
${pixelGlsl}${seaGlsl}
uniform float strength,uAngle;uniform vec3 highlight;uniform vec2 uOrigin;varying vec2 vWorld;
void main(){
  vec2 px=(vWorld*16.0),p=(px+.5)/16.0,q=p-uOrigin,dir=vec2(cos(uAngle),sin(uAngle));
  float along=dot(q,dir)/31.0,across=abs(dot(q,vec2(-dir.y,dir.x)));
  if(along<=0.0||along>1.0)discard;
  float edge=1.0-across/max(.02,along*4.5);
  if(edge<=0.0)discard;
  float core=pow(edge,.7)*pow(1.0-along,1.2);
  float level=pxSteps(core*1.2,4.0,px);
  vec3 colour=highlight;float alpha=level*.72*strength;
  // Wave crests caught by the beam out at sea.
  if(uDetail>.5&&level>0.0&&coastDistance(p)>3.0){
    vec2 cell=floor(px/vec2(6.0,3.0));float h=pxHash(cell+floor(uSeaTime*2.5+cell.x*.13));
    if(h>.8&&mod(px.y,3.0)==1.0&&mod(px.x,6.0)<(h>.93?3.0:2.0)){colour=mix(highlight,vec3(1.0),.55);alpha=min(1.0,alpha+.55*strength);}
  }
  if(alpha<=.003)discard;
  gl_FragColor=vec4(colour,alpha);
  ${toScreen}
}`;

export function createBeam(scene, x, y) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, LENGTH + .5, -SPREAD - .5, 0, LENGTH + .5, SPREAD + .5, 0], 3));
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { ...seaUniforms, strength: { value: 0 }, highlight: {value:new THREE.Color('#f3d58c')},
      uAngle: { value: 0 }, uOrigin: { value: new THREE.Vector2(x, y) } },
    vertexShader: vertex, fragmentShader: fragment,
  }));
  mesh.position.set(x, y, 0); mesh.renderOrder = 920; scene.add(mesh);
  const origin = new THREE.Vector3();
  return { mesh, update(time, night) {
    const uniforms = mesh.material.uniforms;
    mesh.rotation.z = reducedMotion()?-1.1:time * 0.18; uniforms.uAngle.value = mesh.rotation.z;
    uniforms.highlight.value.set(getPreferences().colourblind?'#d5f5ff':'#f3d58c'); uniforms.strength.value = night * 0.55;
    mesh.getWorldPosition(origin); uniforms.uOrigin.value.set(origin.x, origin.y);
    mesh.visible = night > 0.02;
  } };
}
