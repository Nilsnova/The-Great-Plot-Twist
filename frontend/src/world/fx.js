// Effects for moments: spark bursts, expanding rings, light rays and soft bloom. All of them live in
// one geometry with one material (one draw call, nothing per frame on the CPU): every effect is
// written once into a slot with its start time, and the GPU moves and fades it. Sparks are soft
// round dots, rings are smooth antialiased lines, rays and bloom are smooth gradients. Additive, so gold stays the colour of light. Reduced motion: callers skip motion and
// use bloom alone; low quality halves every burst. Exposed on scene.userData.pixelFx by game.js.
import * as THREE from 'three';
import { pixelGlsl, toScreen } from './pixel-glsl.js';
import { settings } from '../config.js';

const SLOTS = 640, KIND = { spark: 0, ring: 1, rays: 2, bloom: 3 };
const vertex = /* glsl */`
attribute vec2 aCorner;attribute vec2 aOrigin;attribute vec3 aMotion;attribute vec4 aTiming;attribute vec3 aColour;
uniform float uTime;
varying vec2 vWorld;varying vec2 vCentre;varying float vAge;varying float vKind;varying float vSize;varying vec3 vColour;varying float vSeed;
void main(){
  float age=uTime-aTiming.x;vAge=age/aTiming.y;vKind=aTiming.w;vColour=aColour;vSize=aTiming.z;vSeed=aMotion.z;
  if(age<0.0||vAge>1.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  vec2 centre=aOrigin;float extent=aTiming.z;
  if(aTiming.w<.5){centre+=aMotion.xy*age+vec2(0.0,-aMotion.z*.5*age*age);extent=aTiming.z/24.0+.03;}
  vCentre=centre;
  vec2 world=centre+aCorner*extent;vWorld=world;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(world,0.0,1.0);
}`;
const fragment = /* glsl */`
${pixelGlsl}
uniform float uTime;
varying vec2 vWorld;varying vec2 vCentre;varying float vAge;varying float vKind;varying float vSize;varying vec3 vColour;varying float vSeed;
void main(){
  float fade=1.0-vAge,alpha=0.0;
  vec2 px=vWorld*16.0,q=vWorld-vCentre;float r=length(q*vec2(1.0,1.25)),aa=fwidth(r)+1e-4;
  if(vKind<.5){float rad=vSize/24.0;alpha=clamp(fade*1.1+.25,0.0,1.0)*(1.0-smoothstep(rad-aa,rad+aa,length(q)));}
  else if(vKind<1.5){
    float radius=vSize*(1.0-pow(1.0-vAge,2.2)),width=(vAge<.35?2.4:1.4)/16.0;
    alpha=clamp(fade*1.2,0.0,1.0)*(1.0-smoothstep(width*.5-aa,width*.5+aa,abs(r-radius)));
  }else if(vKind<2.5){
    float a=atan(q.y,q.x)+uTime*.35+vSeed*6.283,rays=.5+.5*cos(a*9.0),rays2=.5+.5*cos(a*5.0-uTime*.6);
    float reach=1.0-r/vSize,grow=min(1.0,vAge*5.0)*min(1.0,fade*3.0);
    alpha=pxSteps(pow(max(rays,rays2*.75),9.0)*reach*reach*grow*1.2,3.0,px)*.45;
  }else{
    float grow=min(1.0,vAge*6.0)*min(1.0,fade*2.5),glow=pow(max(0.0,1.0-r/vSize),1.6)*grow;
    alpha=pxSteps(glow*1.15,4.0,px)*.62;
  }
  if(alpha<=.003)discard;
  gl_FragColor=vec4(vColour*alpha,1.0);
  ${toScreen}
}`;

export function createPixelFx(scene) {
  const verts = SLOTS * 4, geometry = new THREE.BufferGeometry();
  const make = (size, name) => { const a = new THREE.BufferAttribute(new Float32Array(verts * size), size); a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, a); return a; };
  const corner = make(2, 'aCorner'), origin = make(2, 'aOrigin'), motion = make(3, 'aMotion'), timing = make(4, 'aTiming'), colour = make(3, 'aColour');
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  const index = [];
  for (let i = 0; i < SLOTS; i++) {
    const v = i * 4; index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], k) => corner.setXY(v + k, x, y));
    for (let k = 0; k < 4; k++) timing.setXYZW(v + k, -100, 1, 0, 0);
  }
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uTime: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'pixel-fx'; mesh.renderOrder = 950; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  let time = 0, next = 0, busyUntil = 0;
  const tint = new THREE.Color();
  function write(kind, x, y, { vx = 0, vy = 0, gravity = 0, size = 1, life = 1, delay = 0, colour: c = '#ffe08a', seed = Math.random() } = {}) {
    const slot = next; next = (next + 1) % SLOTS; tint.set(c);
    for (let k = 0; k < 4; k++) {
      const v = slot * 4 + k;
      origin.setXY(v, x, y); motion.setXYZ(v, vx, vy, kind === KIND.spark ? gravity : seed);
      timing.setXYZW(v, time + delay, life, size, kind); colour.setXYZ(v, tint.r, tint.g, tint.b);
    }
    busyUntil = Math.max(busyUntil, time + delay + life);
  }
  function flush() { for (const a of [origin, motion, timing, colour]) a.needsUpdate = true; mesh.visible = true; }
  return {
    mesh,
    // A burst of whole-pixel sparks. angle/spread in radians; speeds in world units per second.
    burst(x, y, { count = 30, colour = '#ffe08a', speed = [2, 6], angle = Math.PI / 2, spread = Math.PI * 2, gravity = 6, life = [.7, 1.5], size = [1, 2], delay = 0 } = {}) {
      if (settings.quality === 'low') count = Math.ceil(count / 2);
      for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - .5) * spread, s = speed[0] + Math.random() * (speed[1] - speed[0]);
        write(KIND.spark, x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity, colour, delay: delay + Math.random() * .08,
          life: life[0] + Math.random() * (life[1] - life[0]), size: Math.round(size[0] + Math.random() * (size[1] - size[0])) });
      }
      flush();
    },
    ring(x, y, { radius = 3, colour = '#f3e4b0', life = .9, delay = 0 } = {}) { write(KIND.ring, x, y, { size: radius, colour, life, delay }); flush(); },
    rays(x, y, { radius = 7, colour = '#e7b555', life = 5, delay = 0 } = {}) { write(KIND.rays, x, y, { size: radius, colour, life, delay }); flush(); },
    bloom(x, y, { radius = 3, colour = '#e9b75a', life = 2, delay = 0 } = {}) { write(KIND.bloom, x, y, { size: radius, colour, life, delay }); flush(); },
    get active() { return time < busyUntil; },
    update(delta) {
      if (!(delta > 0)) return;
      time += Math.min(delta, .1); material.uniforms.uTime.value = time;
      mesh.visible = time < busyUntil;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
