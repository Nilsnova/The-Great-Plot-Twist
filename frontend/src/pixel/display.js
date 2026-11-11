// Bounded real framebuffer density. CSS size and world framing never depend on quality.
const MAX_PIXELS = {high: 1920 * 1080, low: 1280 * 720};
const WARMUP_MS=1500,WINDOW_MS=2000,MIN_FRAMES=16,TARGET_MS=31,SLOW_MS=38,FAST_MS=21,RECOVERY_MS=15000;
const size = value => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;

export function pixelViewport(width, height, {quality = 'high', pixelRatio = 1, densityScale = 1} = {}) {
  width = size(width); height = size(height);
  const maximum = MAX_PIXELS[quality] ?? MAX_PIXELS.high;
  const deviceRatio = Number.isFinite(pixelRatio) ? Math.max(0.25, pixelRatio) : 1;
  const density = Number.isFinite(densityScale) ? Math.max(.5,Math.min(1,densityScale)) : 1;
  const ratio = Math.min(deviceRatio, quality === 'low' ? 1 : 1.5, Math.sqrt(maximum / (width * height))) * density;
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
  let scale=1,last=null,warmup=0,total=0,count=0,fast=0;
  function clearWindow(){total=0;count=0;}
  function reset({restoreDensity=false}={}){if(restoreDensity)scale=1;last=null;warmup=0;fast=0;clearWindow();}
  return {
    get scale(){return scale;},reset,
    sample(now,active=true){
      if(!active||!Number.isFinite(now)||now<0){reset();return false;}
      const gap=last===null?0:now-last;last=now;
      if(gap<=0||gap>1000){warmup=0;fast=0;clearWindow();return false;}
      const delta=Math.min(gap,250);
      if(warmup<WARMUP_MS){warmup+=delta;return false;}
      total+=delta;count++;
      if(total<WINDOW_MS||count<MIN_FRAMES)return false;
      const average=total/count,elapsed=total;clearWindow();
      let next=scale;
      if(average>SLOW_MS){next=Math.max(.5,Math.round(scale*Math.sqrt(TARGET_MS/average)*.96*20)/20);fast=0;}
      else if(average<FAST_MS&&scale<1){fast+=elapsed;if(fast>=RECOVERY_MS){next=Math.min(1,Math.round((scale+.05)*20)/20);fast=0;}}
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
export const NATIVE_ROWS = 340, NATIVE_COLUMNS = 256;
export function nativeScale(width, height, pixelRatio = 1) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const deviceWidth = size(width) * ratio, deviceHeight = size(height) * ratio;
  return Math.max(1, Math.min(Math.round(deviceHeight / NATIVE_ROWS), Math.round(deviceWidth / NATIVE_COLUMNS)));
}
// Device pixels per native pixel for a camera zoom: whole steps, or 1/2, 1/3 … below one.
export function pixelStep(scale, zoom = 1) {
  const value = scale * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  return value >= .75 ? Math.max(1, Math.round(value)) : 1 / Math.round(1 / value);
}
export function pixelZoom(scale, zoom = 1) { return pixelStep(scale, zoom) / scale; }
export function nativeViewport(width, height, {pixelRatio = 1, zoom = 1} = {}) {
  width = size(width); height = size(height);
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const scale = nativeScale(width, height, ratio), step = pixelStep(scale, zoom);
  const even = value => Math.max(2, Math.ceil(value / 2) * 2);
  const nativeWidth = even(width * ratio / step), nativeHeight = even(height * ratio / step);
  // The world bounds at camera zoom 1; three.js divides them by the (stepped) zoom.
  const unitsWide = nativeWidth / 16 * step / scale, unitsHigh = nativeHeight / 16 * step / scale;
  return {width, height, scale, step, nativeWidth, nativeHeight,
    cssWidth: nativeWidth * step / ratio, cssHeight: nativeHeight * step / ratio,
    left: -unitsWide / 2, right: unitsWide / 2, top: unitsHigh / 2, bottom: -unitsHigh / 2};
}
