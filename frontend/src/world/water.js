// The sea: one code-drawn shader under every place (clean cartoon water, see the fragment below). The coast comes from the
// place's own backdrop: its alpha is turned once into a small distance field (water.setCoast).
// The distance field and clock are shared with the beams (seaUniforms), so a sweeping light can
// catch the wave crests it crosses. Low quality draws no glints, rings or moving foam.
import * as THREE from 'three';
import { QUALITY } from '../config.js';
import {coastUvMatrix} from './ground-transform.js';
import { pixelGlsl, worldVertex, toScreen } from './pixel-glsl.js';
import { groundProjectionGlsl } from './projection.js';

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
// Bound the sea to cells (1 x 1 backdrop unit, merged into runs per row) that hold at least one water
// texel the bilinear lookup can reach, plus a frame out to the old 400 x 300 plane. The short margin
// covers the translucent shore at Home. Deep inland never needs a sea fragment beneath opaque ground.
const SEA_W = 400, SEA_H = 300, CELL = FIELD_PX; // one cell = 4 texels = 1 backdrop unit
export function seaOutline(field, matrixWorld, width = FIELD_W, height = FIELD_H) {
  const columns = width / CELL, rows = height / CELL, local = [], cellW = BACKDROP.width / columns, cellH = BACKDROP.height / rows;
  const water = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) if (field[y * width + x]) return true;
    return false;
  };
  const quad = (x0, y0, x1, y1) => local.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
  const left = -BACKDROP.width / 2, bottom = -BACKDROP.height / 2;
  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let column = 0; column <= columns; column++) {
      const keep = column < columns && water(column * CELL - 2, row * CELL - 2, column * CELL + CELL + 1, row * CELL + CELL + 1);
      if (keep && start < 0) start = column;
      if (!keep && start >= 0) {
        quad(left + start * cellW, bottom + row * cellH, left + column * cellW, bottom + (row + 1) * cellH); start = -1;
      }
    }
  }
  // The frame: the old plane's corners in backdrop coordinates bound it (the ground may be sheared).
  const inverse = matrixWorld.clone().invert(), corner = new THREE.Vector3();
  let minX = left, minY = bottom, maxX = -left, maxY = -bottom;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corner.set(x * SEA_W / 2, y * SEA_H / 2, 0).applyMatrix4(inverse);
    minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x); minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
  }
  quad(minX, minY, left, maxY); quad(-left, minY, maxX, maxY); quad(left, minY, -left, bottom); quad(left, -bottom, -left, maxY);
  const positions = new Float32Array(local.length / 2 * 3), point = new THREE.Vector3();
  for (let i = 0; i < local.length / 2; i++) {
    point.set(local[i * 2], local[i * 2 + 1], 0).applyMatrix4(matrixWorld);
    positions[i * 3] = point.x; positions[i * 3 + 1] = point.y;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
const openSea = () => new THREE.PlaneGeometry(SEA_W, SEA_H);
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
// blue, intersecting ripples and restrained caustics, broken surf along the actual coast,
// soft sun flecks, rain rings and whitecaps. Every edge is
// antialiased with fwidth, so the sea stays clean at any resolution and zoom.
const fragment = /* glsl */`
${pixelGlsl}${seaGlsl}${groundProjectionGlsl}
uniform vec3 uDeep,uMid,uLight,uShallow,uShallow2,uFoam,uGlint,uStroke;
uniform float uHomeCoast;
varying vec2 vWorld;
float band(float v,float edge){float w=fwidth(v)*.75+1e-4;return smoothstep(edge-w,edge+w,v);}
float waterDistance(vec2 p){
  if(uHomeCoast<.5||uCoastOn<.5)return coastDistance(p);
  vec2 uv=(uCoastUv*vec3(p,1.0)).xy;
  vec2 edge=clamp(uv,0.0,1.0);
  // Continue the shallow gradient beyond the backdrop edge in the whole-island view.
  float beyond=length((uv-edge)*vec2(${BACKDROP.width * 16}.0,${BACKDROP.height * 16}.0));
  return min(255.0,texture2D(uCoast,edge).r*255.0+beyond);
}
vec3 rockWash(vec3 colour,vec2 p,float shoreDistance,float coastRock,float light,float time){
  // Follow the painted shoreline, including concave pockets between the stone toes.
  // A short reach smooths the distance field between adjacent coast texels.
  vec2 coastSlope=vec2(waterDistance(p+vec2(.23,0))-waterDistance(p-vec2(.23,0)),
    waterDistance(p+vec2(0,.23))-waterDistance(p-vec2(0,.23)));
  vec2 normal=normalize(coastSlope+.2*normalize(p+vec2(.01)));
  vec2 tangent=vec2(-normal.y,normal.x);
  vec2 foot=p-normal*shoreDistance;
  float edge=pxNoise(foot*vec2(1.20,1.76)+vec2(8.2,4.6));
  float surge=.5+.5*sin(time*(1.05+uWind*.54)+dot(foot,vec2(.72,.94))+edge*3.4);
  float spread=smoothstep(.21,.74,edge);
  float chop=pxNoise((p+tangent*time*.14)*vec2(3.7,5.9));
  float arc=shoreDistance-.24-surge*.33-(edge-.5)*.36;
  float nearWater=smoothstep(.09,.21,shoreDistance);
  float stain=(1.0-smoothstep(.04,.43,shoreDistance))*(.45+.35*edge);
  colour=mix(colour,uDeep,stain*coastRock);

  // Thick turquoise water catches the lit rock before the wave folds over it.
  // The crest pinches into a thin seam between broader patches of broken foam.
  float shoulder=(1.0-band(abs(arc-.16),.28+.16*spread))*(.44+.56*spread);
  float front=(1.0-band(abs(arc+(chop-.5)*.25),.063+.15*spread))
    *smoothstep(.20,.53,chop*.46+edge*.54);
  float retreat=1.0-band(abs(arc-.29-(chop-.5)*.58),.046+.092*spread);
  retreat*=smoothstep(.33,.69,chop*.65+edge*.35);
  float streak=pxNoise((p+normal*(chop-.5)*.12)*vec2(6.4,9.0)-tangent*time*.42);
  // Small broken loops extend into the clear water between projecting rocks.
  // The same noise opens gaps in the wave so they never become a second coast outline.
  float split=abs(streak-.5)*.77;
  float seam=(1.0-band(abs(arc-.54-split+(chop-.5)*.56),.024+.038*spread))
    *smoothstep(.28,.68,chop)*smoothstep(.17,.52,edge);
  float spray=(1.0-band(abs(arc-.58-(edge-.5)*.62),.16+.11*spread))
    *smoothstep(.52,.79,streak)*smoothstep(.31,.69,chop);
  float wash=nearWater*coastRock*(.86+.14*light);
  colour=mix(colour,mix(uShallow,uFoam,.34),shoulder*.55*wash);
  float whiteWater=clamp(front+retreat*.84+seam*.82+spray*.57,0.0,1.0);
  return mix(colour,uFoam,whiteWater*wash);
}
void main(){
  vec2 p=vWorld;float t=uSeaTime;
  float d=waterDistance(p)/16.0; // world units to the nearest land (16 = open sea)
  // Home's translucent beach wash needs sea underneath it even at zero field distance.
  // The unchanged outlined mesh still skips the inland cells covered by opaque ground.
  if(d<.02&&uHomeCoast<.5)discard;
  // Broad depth pockets and crossing swells give the sea mass beneath the smaller ripples.
  // The same real coast distance still defines the shallows; none of these colours add land.
  float swell=sin(p.y*.38+p.x*.12+sin(p.x*.13+t*.18)*1.4-t*(.35+uWind*.6))*.5+.5;
  float far=pxNoise(p*.055+vec2(t*.01,0.0))*.7+pxNoise(p*.12+vec2(7.0,3.0))*.3;
  float depth=smoothstep(1.0,11.0,d);
  float deepWater=depth*mix(.58,.52,uHomeCoast)+smoothstep(.25,.85,far)*mix(.40,.33,uHomeCoast);
  vec3 offshoreColour=mix(uMid,uDeep,clamp(deepWater,0.0,1.0));
  offshoreColour=mix(offshoreColour,uLight,smoothstep(.3,.9,swell)*(.09+(1.0-depth)*.11));
  vec3 colour=offshoreColour;
  float shallow=1.0-smoothstep(.0,mix(4.2,3.05,uHomeCoast),d+sin(p.x*.8+p.y*.5+t*.6)*.25);
  // Sunlit foam traces the facing beach. Softer backlight keeps the northern limestone readable.
  float shoreLight=mix(1.0,mix(.73,.93,1.0-smoothstep(-13.0,-6.0,p.y)),uHomeCoast);
  colour=mix(colour,uShallow,shallow*.85*shoreLight);
  colour=mix(colour,uShallow2,(1.0-smoothstep(.0,mix(1.3,1.1,uHomeCoast),d))*mix(.9,.79,uHomeCoast)*shoreLight);
  float rockShore=0.0;
  if(uHomeCoast>.5&&d<6.0){
    // Fine-scale pigment changes across the existing contour. The four open beaches show
    // warm sand through clear water, while ledges cast a darker pool directly below the rock.
    vec2 shore=unprojectGround(p)/vec2(20.0,22.0);
    vec2 reach=abs(shore);
    float shoulder=min(reach.x,reach.y)/max(.001,max(reach.x,reach.y));
    float north=shore.y<0.0&&reach.y>reach.x?1.0:0.0;
    rockShore=smoothstep(.20+north*.11,.47+north*.10,shoulder);
    float beach=1.0-rockShore;
    float bedding=pxNoise(p*vec2(.56,1.62)+vec2(.35,2.2));
    // Steep rock drops into open water quickly. Keep most of the exposed sand tint
    // at the actual beaches, with little broken turquoise pockets along the rock shelves.
    float drop=1.0-smoothstep(.13,1.45+.64*bedding,d+(.5-bedding)*.44);
    float pools=smoothstep(.39,.73,bedding);
    vec3 overRock=mix(offshoreColour,uShallow,drop*(.14+.52*pools)*shoreLight);
    colour=mix(colour,overRock,rockShore*.92);
    float submergedSand=(1.0-smoothstep(.16,2.4,d+bedding*.49))*beach;
    vec3 sandWater=mix(uShallow2,vec3(.60,.55,.32),.31);
    colour=mix(colour,sandWater,submergedSand*(.37+bedding*.25));
    float lee=smoothstep(-.54,.57,dot(normalize(shore),vec2(.71,.71)));
    float stoneShelf=1.0-smoothstep(.24,mix(1.06,2.20,lee)+bedding*.52,d);
    float shadow=rockShore*stoneShelf*(.48+bedding*.20+lee*.23);
    colour=mix(colour,uDeep,shadow);
    float contact=1.0-smoothstep(.07,.48+bedding*.37,d);
    colour=mix(colour,uDeep,contact*(.14+.38*rockShore));
    shoreLight=mix(shoreLight,mix(.55,.84,1.0-lee),rockShore*.52);
  }
  // Skip the surface lighting and fine contours in low quality.
  if(uDetail>.5){
    vec2 drift=vec2(t*(.06+uWind*.06),-t*.045);
    float curl=pxNoise(p*.42+drift), coarse=pxNoise(p*.19-drift);
    float broad=curl*.6+coarse*.4;
    vec2 flow=p*vec2(.55,1.4)+vec2(coarse,curl)*2.4;
    float ripple=pxNoise(flow+drift);
    float broken=smoothstep(.32,.75,curl);
    float offshore=smoothstep(.5,2.0,d);
    float crest=(1.0-band(abs(ripple-.55),.025))*broken*offshore;
    float sheen=smoothstep(.35,.85,ripple);
    colour=mix(colour,uDeep,(1.0-broad)*.09);
    colour=mix(colour,uLight,sheen*.05);
    // Reserve the brightest surface strokes for the shallows. Broad swells still show offshore depth.
    colour=mix(colour,uStroke,crest*mix(.16,.10,depth)*mix(1.0,.15,uHomeCoast));
    vec2 q=p*2.2+vec2(broad,pxNoise(p*.65-drift))*.8;
    float cells=pxNoise(q+drift)+pxNoise(q*1.95-drift)*.2;
    float caustic=(1.0-band(abs(cells-.6),.02))*smoothstep(.6,1.2,d)*(1.0-smoothstep(1.5,3.0,d));
    colour=mix(colour,uShallow2,caustic*mix(.12,.07,uHomeCoast));
    if(uHomeCoast>.5){
      // Cross swells give the surface lit slopes and dark troughs. Breaking the
      // reflected light into patches keeps the offshore marks from forming stripes.
      vec2 current=vec2(.903*p.x-.43*p.y,.903*p.y+.43*p.x);
      float run=sin(current.x*.23+coarse*1.9-t*.26);
      float longWave=current.y*1.40+run*1.28+curl*.88-t*(.79+uWind*.41);
      float shortWave=current.y*2.49-current.x*1.45+curl*1.28-t*.98;
      float height=sin(longWave)*.57+sin(shortWave)*.43;
      float slope=cos(longWave)*.54+cos(shortWave)*.46;
      float field=smoothstep(.20,.73,coarse+curl*.14);
      float face=smoothstep(.03,.80,height)*smoothstep(-.05,.86,slope);
      float trough=smoothstep(.25,.88,-height);
      // Lit wave faces have a short saturated slope and a broader dark back.
      // The crossing short swell breaks the shapes across the prevailing wind.
      float back=smoothstep(.10,.88,-slope)*smoothstep(.05,.65,height);
      colour=mix(colour,uDeep,max(trough*.23,back*.32)*(.76+field*.22)*offshore);
      colour=mix(colour,uLight,face*(.18+field*.31)*offshore);
      // Current-aligned grooves split the reflection into short, crisp breaks at the crest.
      float facets=pxNoise(current*vec2(1.14,2.80)+drift+vec2(curl,-coarse));
      float ridge=(1.0-band(abs(height-.69+(facets-.5)*.22),.036))*smoothstep(.05,.73,slope);
      float spray=smoothstep(.44,.78,facets*.61+ripple*.39+curl*.11)*smoothstep(.20,.68,field);
      float nearLight=mix(.94,.39,smoothstep(1.0,8.0,d));
      colour=mix(colour,mix(uStroke,uFoam,.52),ridge*spray*nearLight*offshore);
      float returnLight=(1.0-band(abs(height-.46+(facets-.5)*.21),.036))*smoothstep(.19,.76,slope);
      colour=mix(colour,uStroke,returnLight*spray*.24*offshore);
      float chop=shortWave*1.22+longWave*.73+(facets-.5)*.81;
      float reflected=(1.0-band(abs(sin(chop)-.72),.046))*smoothstep(.18,.68,height);
      float detailFade=1.0-smoothstep(.36,.9,fwidth(chop));
      float reflectedLight=(.15+.27*field)*detailFade*spray;
      colour=mix(colour,uGlint,reflected*reflectedLight*offshore);

      // Submerged stone and narrow refracted marks sit beneath the white breaking water.
      float shelf=smoothstep(.28,1.0,d)*(1.0-smoothstep(2.3,5.5,d));
      float submerged=smoothstep(.57,.91,cells)*rockShore*shelf;
      colour=mix(colour,mix(uMid,uDeep,.46),submerged*.26);
      float lace=(1.0-band(abs(cells-.66),.025))*smoothstep(.44,.8,coarse);
      colour=mix(colour,uShallow2,lace*shelf*smoothstep(.39,.79,broad)*mix(.14,.23,rockShore));
    }
  }
  // A slow wash leaves darker water on the wet sand before the next narrow breaker.
  // The headlands get isolated foam where a wave hits the stone. There is no full rim stroke.
  float foamTime=uDetail>.5?t:0.0;
  float run=.5+.5*sin(foamTime*(.8+uWind*.5)+p.x*.21+p.y*.37);
  if(uHomeCoast>.5){
    if(d<3.2){
      float beach=1.0-rockShore;
      float pockets=pxNoise(p*vec2(.80,2.65)+vec2(.36,-1.67));
      float refraction=.18*sin(p.x*2.1+p.y*1.3+foamTime*1.2)+(pockets-.5)*.44;
      float flood=mix(.09,.62,run)+refraction;
      float stirred=smoothstep(.10,.36,d-flood)*(1.0-smoothstep(.43,1.28,d-flood));
      colour=mix(colour,vec3(.40,.65,.55),stirred*beach*.15);
      float ripples=pxNoise(p*vec2(1.18,3.08)+vec2(foamTime*.10,-foamTime*.047));
      float segments=smoothstep(.36,.74,pockets*.57+ripples*.43);
      float curl=.37+run*.69+refraction;
      float crest=1.0-band(abs(d-curl),.038+segments*.025);
      colour=mix(colour,uFoam,crest*segments*(.21+.77*beach)*shoreLight);
      if(uDetail>.5){
        // The return flow curls outside the first wave. The two edges break in different places.
        float curlBack=curl+.28+(.5-pockets)*.43;
        float returnFoam=(1.0-band(abs(d-curlBack),.036))*smoothstep(.44,.79,ripples);
        colour=mix(colour,uFoam,returnFoam*beach*.30*shoreLight);
        if(rockShore>.01&&d<1.8)colour=rockWash(colour,p,d,rockShore,shoreLight,foamTime);
      }
    }
  }else{
    // The other coasts keep their previous water and foam.
    float edge=.18+sin(p.x*2.1+p.y*1.3+foamTime*1.2)*.045;
    float surf=.55+run*(.6+uWind*.5);
    if(uDetail>.5){
      float grain=pxNoise(p*1.4+vec2(foamTime*.08,-foamTime*.03));
      float broken=smoothstep(.25,.7,grain);
      float width=mix(.06,.088,uHomeCoast);
      colour=mix(colour,uFoam,(1.0-band(abs(d-surf),width))*.8*broken*smoothstep(.0,.25,run)
        *shoreLight*mix(1.0,.31,rockShore));
    }
    colour=mix(colour,uFoam,(1.0-band(d,edge))*shoreLight);
  }
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
  const colours = { uDeep: '#07566e', uMid: '#087f96', uLight: '#3dbdc9', uShallow: '#38c9b5', uShallow2: '#8be2c5', uFoam: '#f4fffa', uGlint: '#e6fff5', uStroke: '#63cfd6' };
  const homeColours = {...colours, uDeep: '#064662', uMid: '#087f9e', uLight: '#3fbdd0',
    uShallow: '#1bd2c3', uShallow2: '#70e2d2', uFoam: '#f5fffd', uStroke: '#75dbe7'};
  const uniforms = { ...seaUniforms, uHomeCoast: {value: 0} };
  for (const [key, value] of Object.entries(colours)) uniforms[key] = { value: new THREE.Color(value) };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: worldVertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }); // the outline follows the ground's own (maybe mirrored) frame
  const mesh = new THREE.Mesh(openSea(), material);
  mesh.name = 'sea'; mesh.renderOrder = -10; mesh.frustumCulled = false; scene.add(mesh);
  let detail = 1;
  const outline = geometry => { mesh.geometry.dispose(); mesh.geometry = geometry; };
  return {
    mesh,
    setQuality(name) { detail = QUALITY[name]?.waveMarks >= 160 ? 1 : 0; seaUniforms.uDetail.value = detail; },
    // Read the coast of the place just attached; without a readable backdrop the sea stays open.
    setCoast(group) {
      const home = group?.name === 'place:home_islet';
      const palette = home ? homeColours : colours;
      uniforms.uHomeCoast.value = home ? 1 : 0;
      for (const [key, value] of Object.entries(palette)) uniforms[key].value.set(value);
      const backdrop = findBackdrop(group);
      try {
        if (!backdrop) throw new Error('no backdrop');
        const texture = backdrop.material.map;
        const field = readField(texture.userData?.coastSource ?? texture.image);
        coastTexture.image.data.set(field);
        backdrop.updateWorldMatrix(true, false);
        outline(seaOutline(field, backdrop.matrixWorld));
        const origin = new THREE.Vector3().setFromMatrixPosition(backdrop.matrixWorld);
        seaUniforms.uCoastUv.value.copy(coastUvMatrix(backdrop.matrixWorld, BACKDROP.width, BACKDROP.height));
        seaUniforms.uCoastRect.value.set(origin.x - BACKDROP.width / 2, origin.y - BACKDROP.height / 2, BACKDROP.width, BACKDROP.height);
        seaUniforms.uCoastOn.value = 1;
      } catch { coastTexture.image.data.fill(255); seaUniforms.uCoastOn.value = 0; outline(openSea()); }
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
