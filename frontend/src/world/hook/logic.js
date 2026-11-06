// Hook timings are supplied by the server and clamped here for a safe display.
export const MIN_FLASH_SECONDS=.34;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const seconds=(value,fallback)=>Number.isFinite(value)?clamp(value,MIN_FLASH_SECONDS,10):fallback;
export function normalizeHook(hook){
  const beam=hook?.beam,chart=beam?.chart,pattern=beam?.pattern,flash=beam?.flash;
  if(!chart||!Array.isArray(pattern)||!pattern.length||!flash)return null;
  const values=pattern.slice(0,12).filter(word=>word==='short'||word==='long');if(!values.length)return null;
  return {...hook,beam:{...beam,chart:{x:clamp(Number.isFinite(chart.x)?chart.x:0,0,447),y:clamp(Number.isFinite(chart.y)?chart.y:0,0,255)},pattern:values,
    flash:{shortSeconds:seconds(flash.shortSeconds,1/3),longSeconds:seconds(flash.longSeconds,1/3),gapSeconds:clamp(Number.isFinite(flash.gapSeconds)?flash.gapSeconds:.5,0,10),pauseSeconds:clamp(Number.isFinite(flash.pauseSeconds)?flash.pauseSeconds:4,0,10)}}};
}
export function patternWords(hook){const safe=normalizeHook(hook);return safe?.beam.pattern.join(', ')??'';}
export function initialFlashState(){return {elapsed:0,lit:false,word:null,index:-1};}
export function advanceFlash(state,dt,hook){
  const safe=normalizeHook(hook);if(!safe)return initialFlashState();
  const elapsed=(Number.isFinite(state?.elapsed)?state.elapsed:0)+Math.max(0,Number.isFinite(dt)?dt:0),{pattern,flash}=safe.beam;
  let cycle=0;for(const word of pattern)cycle+=(word==='short'?flash.shortSeconds:flash.longSeconds)+flash.gapSeconds;
  cycle+=flash.pauseSeconds;let cursor=cycle?elapsed%cycle:0;
  for(let index=0;index<pattern.length;index++){
    const word=pattern[index],duration=word==='short'?flash.shortSeconds:flash.longSeconds;
    if(cursor<duration)return {elapsed,lit:true,word,index};
    cursor-=duration;if(cursor<flash.gapSeconds)return {elapsed,lit:false,word,index};cursor-=flash.gapSeconds;
  }
  return {elapsed,lit:false,word:null,index:-1};
}
