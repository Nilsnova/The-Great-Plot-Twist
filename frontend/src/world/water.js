// The sea: one code-drawn shader under every place (clean cartoon water, see the fragment below). The coast comes from the
// place's own backdrop: its alpha is turned once into a small distance field (water.setCoast).
// The distance field and clock are shared with the beams (seaUniforms), so a sweeping light can
// catch the wave crests it crosses. Low quality draws no glints, rings or moving foam.
import * as THREE from 'three';
import { QUALITY } from '../config.js';
import {coastUvMatrix} from './ground-transform.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';

const FIELD_W = 256, FIELD_H = 192, FIELD_PX = 4; // one texel = 4 native pixels of a 64 x 48 backdrop
const BACKDROP = { width: 64, height: 48 };
const fieldCache = new Map();

// Shared by water and beams: one coast texture per app, refilled on every place change.
const coastTexture = new THREE.DataTexture(new Uint8Array(FIELD_W * FIELD_H).fill(255), FIELD_W, FIELD_H,
  THREE.RedFormat, THREE.UnsignedByteType);
// Linear on purpose: this is a distance field, not art. Interpolated distances give smooth foam lines
// and shallow contours.
coastTexture.magFilter = THREE.LinearFilter; coastTexture.minFilter = THREE.LinearFilter;
coastTexture.generateMipmaps = false; coastTexture.needsUpdate = true;
// v3 waves: how fast the sea's clock runs (1 normal; a boss finisher's slow motion sets it lower).
let seaPace = 1, seaClock = null, lastTime = null;
export function setSeaPace(value) { seaPace = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1; }
export const seaUniforms = {
  uSeaTime: { value: 0 }, uWind: { value: .2 }, uRain: { value: 0 }, uDetail: { value: 1 },
  uCoast: { value: coastTexture }, uCoastOn: { value: 0 }, uCoastUv: {value: new THREE.Matrix3()},
  uCoastRect: { value: new THREE.Vector4(-BACKDROP.width / 2, -BACKDROP.height / 2, BACKDROP.width, BACKDROP.height) },
};
// Distance to the nearest land in native pixels (255 = open sea), for any fragment shader.
export const seaGlsl = /* glsl */`
uniform float uSeaTime,uWind,uRain,uDetail,uCoastOn;uniform sampler2D uCoast;uniform vec4 uCoastRect;uniform mat3 uCoastUv;
float coastDistance(vec2 p){
  if(uCoastOn<.5)return 255.0;
  vec2 uv=(uCoastUv*vec3(p,1.0)).xy;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 255.0;
  return texture2D(uCoast,uv).r*255.0;
}`;

// Two-pass chamfer distance (in texels) from every water texel to the nearest land texel.
export function coastField(alpha, width = FIELD_W, height = FIELD_H) {
  const big = 1e6, d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = alpha[i] >= 128 ? 0 : big;
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? big : d[y * width + x]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }
  // Rows flip here: image row 0 is the top, texture row 0 the bottom.
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    out[(height - 1 - y) * width + x] = Math.min(255, Math.round(d[y * width + x] * FIELD_PX));
  return out;
}
function readField(image) {
  const key = image?.currentSrc || image?.src;
  if (key && fieldCache.has(key)) return fieldCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = FIELD_W; canvas.height = FIELD_H;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, FIELD_W, FIELD_H);
  const rgba = context.getImageData(0, 0, FIELD_W, FIELD_H).data, alpha = new Uint8Array(FIELD_W * FIELD_H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const field = coastField(alpha);
  if (key) fieldCache.set(key, field);
  return field;
}
// The place's ground plane: the 64 x 48 backdrop drawn under the scenery.
function findBackdrop(group) {
  let found = null;
  group?.traverse?.(object => {
    const parameters = object.geometry?.parameters, image = object.material?.map?.image;
    if (!found && parameters?.width === BACKDROP.width && parameters?.height === BACKDROP.height && image?.width) found = object;
  });
  return found;
}

// The clean cartoon sea (GAME-V3.md §7): a smooth depth gradient from turquoise shallows to deep
// blue, intersecting ripples and restrained caustics, a white foam edge and broken surf that
// runs along the actual coast, soft sun flecks, rain rings and whitecaps. Every edge is
// antialiased with fwidth, so the sea stays clean at any resolution and zoom.
const fragment = /* glsl */`
${pixelGlsl}${seaGlsl}
uniform vec3 uDeep,uMid,uLight,uShallow,uShallow2,uFoam,uGlint,uStroke;
varying vec2 vWorld;
float band(float v,float edge){float w=fwidth(v)*.75+1e-4;return smoothstep(edge-w,edge+w,v);}
void main(){
  vec2 p=vWorld;float t=uSeaTime;
  float d=coastDistance(p)/16.0; // world units to the nearest land (16 = open sea)
  if(d < .02)discard; // land: the place's ground covers it
  // Depth: shallows hug the coast, the open sea deepens with a slow large-scale variation.
  float swell=sin(p.y*.55+sin(p.x*.13+t*.18)*1.4-t*(.35+uWind*.6))*.5+.5;
  float far=pxNoise(p*.045+vec2(t*.01,0.0));
  vec3 colour=mix(uMid,uDeep,smoothstep(.35,.9,far)*.85);
  colour=mix(colour,uLight,swell*.22);
  float shallow=1.0-smoothstep(.0,4.2,d+sin(p.x*.8+p.y*.5+t*.6)*.25);
  colour=mix(colour,uShallow,shallow*.85);
  colour=mix(colour,uShallow2,(1.0-smoothstep(.0,1.3,d))*.9);
  // Domain-warped, broken ripples avoid a regular grid of standing highlights.
  // The entire extra material branch is disabled by the existing low-quality uniform.
  if(uDetail>.5){
    vec2 drift=vec2(t*(.06+uWind*.06),-t*.045);
    float broad=pxNoise(p*.72+drift);
    float ripple=sin(p.y*4.0+p.x*.15+broad*5.0-t*(.4+uWind*.2));
    float broken=smoothstep(.35,.75,pxNoise(p*vec2(1.7,.65)-drift));
    float crest=(1.0-band(abs(ripple),.15))*broken*smoothstep(.5,2.0,d);
    colour=mix(colour,uDeep,(1.0-broad)*.065);
    colour=mix(colour,uStroke,crest*.24);
    vec2 q=p*2.6+vec2(broad,pxNoise(p*.8-drift))*.7;
    float cells=pxNoise(q+drift)+pxNoise(q*1.95-drift)*.2;
    float caustic=(1.0-band(abs(cells-.6),.02))*smoothstep(.6,1.2,d)*(1.0-smoothstep(1.5,3.0,d));
    colour=mix(colour,uShallow2,caustic*.055);
  }
  // The close edge is still in low quality; its extra movement and broken surf are high-only.
  float foamTime=uDetail>.5?t:0.0;
  float run=.5+.5*sin(foamTime*(.8+uWind*.5)+p.x*.21+p.y*.37);
  float edge=.18+sin(p.x*2.1+p.y*1.3+foamTime*1.2)*.045;
  float surf=.55+run*(.6+uWind*.5);
  if(uDetail>.5){
    float broken=smoothstep(.25,.7,pxNoise(p*1.4+vec2(foamTime*.08,-foamTime*.03)));
    colour=mix(colour,uFoam,(1.0-band(abs(d-surf),.06))*.8*broken*smoothstep(.0,.25,run));
  }
  colour=mix(colour,uFoam,1.0-band(d,edge));
  // Whitecaps on crests once the wind picks up.
  if(uDetail>.5&&uWind>.45){
    vec2 cell=floor(p/vec2(3.4,1.6));float cap=pxHash(cell+vec2(floor(t*.5),0.0));
    vec2 local=(p-cell*vec2(3.4,1.6)-vec2(1.7,.8))*vec2(1.0,2.2);
    float on=step(1.0-(uWind-.45)*.35,cap)*smoothstep(3.0,5.0,d);
    colour=mix(colour,uFoam,on*(1.0-band(length(local),.35))*.85);
  }
  // Reflected sun flecks are short soft ripples, without floating star-shaped marks.
  if(uDetail>.5){
    vec2 cell=floor(p/vec2(4.2,2.4));float h=pxHash(cell);vec2 local=p-(cell+vec2(.3+h*.4,.3+fract(h*7.0)*.4))*vec2(4.2,2.4);
    float blink=fract(h*13.7+t*(.18+h*.2)),life=smoothstep(.0,.04,blink)*(1.0-smoothstep(.04,.1,blink));
    float fleck=1.0-band(length(local*vec2(.8,3.4)),.13);
    colour=mix(colour,uGlint,fleck*life*step(.55,swell)*smoothstep(3.0,4.0,d));
  }
  // Rain: small rings open on the water and fade.
  if(uDetail>.5&&uRain>.01&&d>.3){
    vec2 rc=floor(p/vec2(.9,.56));float rt=t*1.6+pxHash(rc)*9.0,cycle=floor(rt),age=fract(rt);
    vec2 centre=(rc+vec2(.3,.3)+vec2(pxHash(rc+cycle),pxHash(rc-cycle))*.4)*vec2(.9,.56);
    float r=length((p-centre)*vec2(1.0,1.7)),radius=.05+age*.3;
    float ring=(1.0-band(abs(r-radius),.025))*step(pxHash(rc+cycle*1.7),uRain*.24)*(1.0-smoothstep(.2,.6,age));
    colour=mix(colour,uFoam,ring*.8);
  }
  gl_FragColor=vec4(colour,1.0);
  ${toScreen}
}`;

export function createWater(scene) {
  const colours = { uDeep: '#08677e', uMid: '#078f9d', uLight: '#35b7c1', uShallow: '#38c9bc', uShallow2: '#9be3cb', uFoam: '#f4fffa', uGlint: '#e6fff5', uStroke: '#72d8d4' };
  const uniforms = { ...seaUniforms };
  for (const [key, value] of Object.entries(colours)) uniforms[key] = { value: new THREE.Color(value) };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: worldVertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), material);
  mesh.name = 'sea'; mesh.renderOrder = -10; mesh.frustumCulled = false; scene.add(mesh);
  let detail = 1;
  return {
    mesh,
    setQuality(name) { detail = QUALITY[name]?.waveMarks >= 160 ? 1 : 0; seaUniforms.uDetail.value = detail; },
    // Read the coast of the place just attached; without a readable backdrop the sea stays open.
    setCoast(group) {
      const backdrop = findBackdrop(group);
      try {
        if (!backdrop) throw new Error('no backdrop');
        coastTexture.image.data.set(readField(backdrop.material.map.image));
        backdrop.updateWorldMatrix(true, false);
        const origin = new THREE.Vector3().setFromMatrixPosition(backdrop.matrixWorld);
        seaUniforms.uCoastUv.value.copy(coastUvMatrix(backdrop.matrixWorld, BACKDROP.width, BACKDROP.height));
        seaUniforms.uCoastRect.value.set(origin.x - BACKDROP.width / 2, origin.y - BACKDROP.height / 2, BACKDROP.width, BACKDROP.height);
        seaUniforms.uCoastOn.value = 1;
      } catch { coastTexture.image.data.fill(255); seaUniforms.uCoastOn.value = 0; }
      coastTexture.needsUpdate = true;
    },
    update(time, weather) {
      // The sea's own clock: real time × seaPace (a boss finisher slows the water, src/pirates/finisher/scene.js).
      const step = Number.isFinite(lastTime) && time >= lastTime ? time - lastTime : 0;
      lastTime = time; seaClock = time === 0 ? 0 : (seaClock === null ? time : seaClock + step * seaPace);
      seaUniforms.uSeaTime.value = seaClock; seaUniforms.uWind.value = weather.wind ?? .2;
      seaUniforms.uRain.value = weather.rain ?? 0;
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}
