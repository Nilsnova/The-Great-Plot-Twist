// The sea: one code-drawn pixel shader under every place. Flat wave bands in three teal tones,
// two clean shallow bands and crisp 1-px foam lines that follow the actual coast, sparse sun glints, rain
// rings and storm whitecaps, all quantised to the native pixel grid. The coast comes from the
// place's own backdrop: its alpha is turned once into a small distance field (water.setCoast).
// The distance field and clock are shared with the beams (seaUniforms), so a sweeping light can
// catch the wave crests it crosses. Low quality draws no glints, rings or moving foam.
import * as THREE from 'three';
import { QUALITY } from '../config.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';

const FIELD_W = 256, FIELD_H = 192, FIELD_PX = 4; // one texel = 4 native pixels of a 64 x 48 backdrop
const BACKDROP = { width: 64, height: 48 };
const fieldCache = new Map();

// Shared by water and beams: one coast texture per app, refilled on every place change.
const coastTexture = new THREE.DataTexture(new Uint8Array(FIELD_W * FIELD_H).fill(255), FIELD_W, FIELD_H,
  THREE.RedFormat, THREE.UnsignedByteType);
// Linear on purpose: this is a distance field, not art. Interpolated distances give smooth one-pixel
// foam and shallow contours; every fragment still snaps to the native pixel before it samples.
coastTexture.magFilter = THREE.LinearFilter; coastTexture.minFilter = THREE.LinearFilter;
coastTexture.generateMipmaps = false; coastTexture.needsUpdate = true;
export const seaUniforms = {
  uSeaTime: { value: 0 }, uWind: { value: .2 }, uRain: { value: 0 }, uDetail: { value: 1 },
  uCoast: { value: coastTexture }, uCoastOn: { value: 0 },
  uCoastRect: { value: new THREE.Vector4(-BACKDROP.width / 2, -BACKDROP.height / 2, BACKDROP.width, BACKDROP.height) },
};
// Distance to the nearest land in native pixels (255 = open sea), for any fragment shader.
export const seaGlsl = /* glsl */`
uniform float uSeaTime,uWind,uRain,uDetail,uCoastOn;uniform sampler2D uCoast;uniform vec4 uCoastRect;
float coastDistance(vec2 p){
  if(uCoastOn<.5)return 255.0;
  vec2 uv=(p-uCoastRect.xy)/uCoastRect.zw;
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

const fragment = /* glsl */`
${pixelGlsl}${seaGlsl}
uniform vec3 uDeep,uMid,uLight,uShallow,uShallow2,uFoam,uGlint,uStroke;
varying vec2 vWorld;
void main(){
  vec2 px=floor(vWorld*16.0),p=(px+.5)/16.0;float t=uSeaTime;
  float d=coastDistance(p);
  if(d < .5)discard; // land: the place backdrop covers it, so skip the work
  // Wave bands drift towards the shore; wind makes them quicker and sharper. Flat bands with crisp
  // edges (no dithering), so the sea reads as clean shapes.
  float swell=sin(p.y*1.9+sin(p.x*.31+t*.35)*1.3-t*(.55+uWind*1.3));
  float chop=sin(p.y*4.7-p.x*.62+t*(1.0+uWind*1.6))*sin(p.x*.23+p.y*.4-t*.3);
  float shade=clamp(.5+swell*.3+chop*(.08+uWind*.14),0.0,1.0);
  vec3 colour=shade<.3?uDeep:shade<.74?uMid:uLight;
  // Wave strokes: crisp one-pixel crest dashes of steady length, the classic pixel-art sea.
  float lineY=p.y*1.15+sin(p.x*.45+t*.6)*.2-t*.12*(1.0+uWind);
  float row=floor(lineY),period=11.0+mod(row,3.0)*4.0,dash=mod(px.x+row*13.0,period);
  if(uDetail>.5&&d>9.0&&fract(lineY)<.065&&dash< period*.45&&pxHash(vec2(floor((px.x+row*13.0)/period),row))>.35)colour=uStroke;
  // Shallows: two flat bands that follow the coast, their edges rippling a pixel or two.
  float ripple=sin(p.x*1.3+p.y*.7+t*.5)*1.2;
  if(d<22.0+ripple*2.0)colour=uShallow;
  if(d<9.0+ripple)colour=uShallow2;
  // Surf: a fixed foam edge and one moving one-pixel foam line that runs up and back.
  float run=.5+.5*sin(t*(.7+uWind*.5)+p.x*.21+p.y*.37);
  float surf=3.0+run*(5.0+uWind*4.0);
  if(uDetail>.5&&abs(d-surf)<.6&&mod(floor(px.x/6.0)+floor(px.y/3.0),5.0)>0.0)colour=run>.55?uFoam:uStroke;
  if(d<1.6)colour=uFoam;
  // Whitecaps on crests once the wind picks up.
  vec2 capCell=floor(px/vec2(9.0,4.0));float cap=pxHash(capCell+vec2(floor(t*.7),0.0));
  if(uDetail>.5&&d>10.0&&uWind>.45&&cap>1.0-(uWind-.45)*.22&&shade>.6&&mod(px.y,4.0)==1.0&&mod(px.x+capCell.y,9.0)<4.0)colour=uFoam;
  // Glints: a few short sparkling dashes that blink on and off (sparse, so the sea stays calm).
  vec2 cell=floor(px/vec2(14.0,6.0)),local=px-cell*vec2(14.0,6.0);float h=pxHash(cell);
  float blink=fract(h*13.7+t*(.22+h*.25));
  if(uDetail>.5&&d>12.0&&blink<.03&&shade>.55&&local.y==1.0&&local.x>=2.0&&local.x<=(blink<.015?4.0:3.0))colour=uGlint;
  // Rain: small rings open on the water and fade.
  if(uDetail>.5&&uRain>.01&&d>2.0){
    vec2 rc=floor(px/vec2(14.0,9.0));float rt=t*1.6+pxHash(rc)*9.0,cycle=floor(rt),age=fract(rt);
    vec2 centre=rc*vec2(14.0,9.0)+floor(vec2(pxHash(rc+cycle),pxHash(rc-cycle))*vec2(8.0,4.0))+vec2(3.0,2.0);
    vec2 q=(px-centre)*vec2(1.0,1.7);float r=length(q),radius=1.0+age*4.5;
    if(pxHash(rc+cycle*1.7)< uRain*.24&&abs(r-radius)<.55&&age<.6)colour=age<.3?uFoam:uShallow2;
  }
  gl_FragColor=vec4(colour,1.0);
  ${toScreen}
}`;

export function createWater(scene) {
  const colours = { uDeep: '#2c5f62', uMid: '#3d7371', uLight: '#4b8378', uShallow: '#5a9283', uShallow2: '#72a68f', uFoam: '#d8e8d2', uGlint: '#f1f7ea', uStroke: '#6aa08f' };
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
        seaUniforms.uCoastRect.value.set(origin.x - BACKDROP.width / 2, origin.y - BACKDROP.height / 2, BACKDROP.width, BACKDROP.height);
        seaUniforms.uCoastOn.value = 1;
      } catch { coastTexture.image.data.fill(255); seaUniforms.uCoastOn.value = 0; }
      coastTexture.needsUpdate = true;
    },
    update(time, weather) {
      seaUniforms.uSeaTime.value = time; seaUniforms.uWind.value = weather.wind ?? .2;
      seaUniforms.uRain.value = weather.rain ?? 0;
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}
