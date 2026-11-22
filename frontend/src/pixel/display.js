// Bounded real framebuffer density. CSS size and world framing never depend on quality.
import {QUALITY} from '../config.js';

const WARMUP_MS=1500,WINDOW_MS=2000,MIN_FRAMES=16,TARGET_MS=31,SLOW_MS=38,FAST_MS=21,RECOVERY_MS=15000;
// A screen that can show 60 frames (some gaps near 16.7 ms) but keeps missing it hitches between 60 and 30,
// which reads as lag although the average looks fine (playtest 22 Nov: the deeper Home Island terraces put an
// M1 MacBook Air just over 16.7 ms at full Retina). Such a screen gives up a little density, in small steps
// and never below HITCH_FLOOR. Require one in five intervals to show this cadence so jitter on a
// steady 30 or 50 Hz display does not count. Deeper cuts stay with the slow rule above.
const SMOOTH_GAP_MS=18.5,MIN_SMOOTH_SHARE=.2,HITCH_MS=19.5,HITCH_FAST_MS=17.4,HITCH_FLOOR=.65,HITCH_TARGET_MS=16.7,HITCH_HOLD_MS=60000;
const size = value => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;

export function pixelViewport(width, height, {quality = 'high', pixelRatio = 1, densityScale = 1} = {}) {
  width = size(width); height = size(height);
  const limits = QUALITY[quality] ?? QUALITY.high;
  const deviceRatio = Number.isFinite(pixelRatio) ? Math.max(0.25, pixelRatio) : 1;
  const density = Number.isFinite(densityScale) ? Math.max(.5,Math.min(1,densityScale)) : 1;
  const ratio = Math.min(deviceRatio, limits.pixelRatio, Math.sqrt(limits.renderPixels / (width * height))) * density;
  return {width, height, scale: 1, pixelRatio: ratio,
    drawingWidth: Math.floor(width * ratio), drawingHeight: Math.floor(height * ratio)};
}

export function worldViewport(width, height, viewHeight = 20, minWidth = 16) {
  const aspect = size(width) / size(height);
  const vertical = Math.max(viewHeight, minWidth / aspect);
  return {left: -vertical * aspect / 2, right: vertical * aspect / 2,
    top: vertical / 2, bottom: -vertical / 2};
}

// Only sustained active drawing frames count. A pause keeps density but discards stale timing.
export function createFrameBudget() {
  let scale=1,last=null,warmup=0,total=0,count=0,fast=0,smoothFrames=0,lastHitch=null;
  function clearWindow(){total=0;count=0;smoothFrames=0;}
  function reset({restoreDensity=false}={}){if(restoreDensity){scale=1;lastHitch=null;}last=null;warmup=0;fast=0;clearWindow();}
  return {
    get scale(){return scale;},reset,
    sample(now,active=true){
      if(!active||!Number.isFinite(now)||now<0){reset();return false;}
      const gap=last===null?0:now-last;last=now;
      if(gap<=0||gap>1000){warmup=0;fast=0;clearWindow();return false;}
      const delta=Math.min(gap,250);
      if(warmup<WARMUP_MS){warmup+=delta;return false;}
      total+=delta;count++;if(delta<SMOOTH_GAP_MS)smoothFrames++;
      if(total<WINDOW_MS||count<MIN_FRAMES)return false;
      const average=total/count,elapsed=total,smooth=smoothFrames>=count*MIN_SMOOTH_SHARE;clearWindow();
      let next=scale;
      if(average>SLOW_MS){next=Math.max(.5,Math.round(scale*Math.sqrt(TARGET_MS/average)*.96*20)/20);fast=0;}
      else if(smooth&&average>HITCH_MS){
        lastHitch=now;fast=0;
        if(scale>HITCH_FLOOR){
          // GPU cost follows the pixel count: aim for one refresh, at least .05 and at most .1 per step.
          const aim=Math.max(scale-.1,Math.min(scale-.05,scale*Math.sqrt(HITCH_TARGET_MS/average)));
          next=Math.max(HITCH_FLOOR,Math.round(aim*20)/20);
        }
      }
      else if(average<(smooth?HITCH_FAST_MS:FAST_MS)&&scale<1){
        fast+=elapsed;
        // Within a minute of a hitch, climbing back waits longer, so the density does not swing every 15 s.
        const up=Math.min(1,Math.round((scale+.05)*20)/20),wait=lastHitch!==null&&now-lastHitch<HITCH_HOLD_MS?HITCH_HOLD_MS:RECOVERY_MS;
        if(fast>=wait){next=up;fast=0;}}
      else fast=0;
      if(next===scale)return false;
      scale=next;warmup=0;return true;
    },
  };
}

// The crisp pixel framebuffer (td-clean, 11 Nov): the world draws at exactly 16 native pixels per
// unit into a small buffer that the browser magnifies by a whole number of DEVICE pixels with
// image-rendering: pixelated, so every art pixel is the same square on screen. `scale` (k) is the
// zoom-1 magnification: about 340 native rows tall (640 x 360 on a 1280 x 720 or 1920 x 1080
// screen, 576 x 360 on a 1440 x 900 retina) and about 256 native columns wide on a phone.
// Camera zoom is a whole-number step of device pixels too (pixelZoom), so a zoomed-out battle view
// gets a larger buffer instead of shrunken, broken sprites. Buffers are even so a camera on the
// native grid lines up with the drawn pixels.
// Device pixels per native pixel for a camera zoom: whole steps, or 1/2, 1/3 … below one.
export function pixelStep(scale, zoom = 1) {
  const value = scale * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  return value >= .75 ? Math.max(1, Math.round(value)) : 1 / Math.round(1 / value);
}
export function pixelZoom(scale, zoom = 1) { return pixelStep(scale, zoom) / scale; }
