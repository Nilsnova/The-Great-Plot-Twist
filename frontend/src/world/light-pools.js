// Warm light pools at dusk and night: lanterns, lit windows, the harbor beacon and the class-demo
// lamps. One instanced mesh (one draw call) drawn additively above the night wash, so each pool
// cuts a dithered circle of lamplight out of the dark. Gold is for lights, so these are gold.
// set(places pools) on arrival, extra(key, pools) for owners such as the class demo.
import * as THREE from 'three';
import { pixelGlsl, toScreen } from './pixel-glsl.js';
import { projectPoint } from './art.js';

const MAX = 48;
// Pools per placed sprite: [dx, dz, radius, lift, kind]; kind 0 lies on the ground, 1 is a halo.
const SOURCES = {
  lantern: [[0, .1, 2.3, 0, 0], [0, 0, .9, 1.05, 1]],
  'harbour-office': [[-2.05, .9, 2.1, 0, 0], [2.05, .9, 2.1, 0, 0]],
  'harbour-beacon': [[0, 1.1, 3.2, 0, 0], [0, 0, 1.5, 4.81, 1]],
  cottage: [[-1.9, .6, 2.0, 0, 0], [1.9, .6, 2.0, 0, 0]],
  lighthouse: [[0, .4, 3.2, 0, 0], [0, 0, 1.7, 8.61, 1]],
  'islet-signal-station-lit': [[0, .6, 2.4, 0, 0]],
};

const vertex = /* glsl */`
attribute vec4 aPool;varying vec2 vWorld;varying vec4 vPool;varying float vMin;
void main(){vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=world.xy;
  vec4 centre=modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);vPool=vec4(centre.xy,aPool.xy);vMin=aPool.z;
  gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragment = /* glsl */`
${pixelGlsl}
uniform vec3 uColour;uniform float uStrength,uTime;
varying vec2 vWorld;varying vec4 vPool;varying float vMin;
void main(){
  vec2 px=floor(vWorld*16.0),p=(px+.5)/16.0,q=(p-vPool.xy)/vPool.z;
  if(vPool.w<.5)q.y/=.62;
  float r=length(q);if(r>1.0)discard;
  float flicker=1.0+.07*sin(uTime*6.3+vPool.x*3.1)+.04*sin(uTime*11.7+vPool.y*5.3);
  float glow=pow(1.0-r,1.35)*max(uStrength,vMin)*flicker;
  float level=pxSteps(glow*1.1,3.0,px);
  if(level<=0.0)discard;
  gl_FragColor=vec4(uColour*level*.3,1.0);
  ${toScreen}
}`;

export function createLightPools(scene) {
  const geometry = new THREE.PlaneGeometry(2, 2), material = new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uColour: { value: new THREE.Color('#ee9f45') }, uStrength: { value: 0 }, uTime: { value: 0 } } });
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  geometry.setAttribute('aPool', attribute);
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.name = 'light-pools'; mesh.count = 0; mesh.renderOrder = 912; mesh.frustumCulled = false; scene.add(mesh);
  let base = [];
  const extras = new Map(), matrix = new THREE.Matrix4();
  function rebuild() {
    const pools = [...base, ...[...extras.values()].flat()].slice(0, MAX);
    pools.forEach((pool, i) => {
      matrix.makeScale(pool.r, pool.r, 1).setPosition(pool.x, pool.y, 0); mesh.setMatrixAt(i, matrix);
      attribute.setXYZW(i, pool.r, pool.kind ?? 0, pool.min ?? 0, 0);
    });
    mesh.count = pools.length; mesh.instanceMatrix.needsUpdate = true; attribute.needsUpdate = true;
  }
  return {
    mesh,
    // Read the light sources of a newly attached place from its placed sprites.
    setPlace(group) {
      base = [];
      group?.traverse?.(object => {
        const asset = object.userData?.asset, ground = object.userData?.ground, sources = SOURCES[asset];
        if (!sources || !ground) return;
        for (const [dx, dz, r, lift, kind] of sources) {
          const point = projectPoint(ground.x + dx, ground.z + dz);
          base.push({ x: point.x, y: point.y + lift, r, kind });
        }
      });
      rebuild();
    },
    // Pools owned by someone else (drawn coordinates), e.g. lit class-demo lamps; [] removes them.
    // A pool's min keeps it glowing by day (0 = night only).
    extra(key, pools = []) { if (pools.length) extras.set(key, pools); else extras.delete(key); rebuild(); },
    get pools() { return mesh.count; },
    update(time, night) {
      const strength = Math.min(1, Math.max(0, (night - .12) / .5));
      material.uniforms.uStrength.value = strength; material.uniforms.uTime.value = time;
      mesh.visible = (strength > .01 || extras.size > 0) && mesh.count > 0;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); },
  };
}
