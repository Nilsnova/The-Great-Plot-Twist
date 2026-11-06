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
  function reset(){last=null;warmup=0;fast=0;clearWindow();}
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
