// Shared GLSL for the code-drawn world effects (water, sky, rain, fog, beams, light pools, sparks).
// With the clean cartoon art (GAME-V3.md §7) the effects are smooth: pxSteps and pxBands keep their
// names and arguments but return the continuous value (no flat bands), and callers sample their
// drawn position directly instead of snapping it to the old 16 px/unit grid. bayer4 stays for
// callers that still want an ordered pattern; the world effects do not.
export const PIXELS_PER_UNIT = 16;

export const pixelGlsl = /* glsl */`
float pxHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float pxHash1(float n){return fract(sin(n*12.9898)*43758.5453);}
float bayer4(vec2 px){
  vec2 m=mod(px,4.0);
  float b=mod(m.x,2.0)*2.0+mod(m.y,2.0);
  float c=floor(m.x*.5)*2.0+floor(m.y*.5);
  float v=0.0;
  if(b==0.0)v=0.0;else if(b==1.0)v=3.0;else if(b==2.0)v=2.0;else v=1.0;
  float w=0.0;
  if(c==0.0)w=0.0;else if(c==1.0)w=3.0;else if(c==2.0)w=2.0;else w=1.0;
  return (v*4.0+w+.5)/16.0;
}
float pxNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(pxHash(i),pxHash(i+vec2(1,0)),f.x),mix(pxHash(i+vec2(0,1)),pxHash(i+vec2(1,1)),f.x),f.y);}
// Smooth ramps: v clamped to 0..1 (steps, px and spread are accepted for the old callers and ignored).
float pxSteps(float v,float steps,vec2 px){return clamp(v,0.0,1.0);}
float pxBands(float v,float steps,vec2 px,float spread){return clamp(v,0.0,1.0);}
`;

// Last line of every fragment shader: linear colour to the screen's sRGB.
export const toScreen = '#include <colorspace_fragment>';

// Vertex shader for flat planes: hands the fragment its drawn (world) position.
export const worldVertex = /* glsl */`
varying vec2 vWorld;varying vec2 vScreen;
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xy;
  gl_Position=projectionMatrix*viewMatrix*world;vScreen=gl_Position.xy/gl_Position.w;}
`;
