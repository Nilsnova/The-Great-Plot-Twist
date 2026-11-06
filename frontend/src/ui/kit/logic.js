// Display-only math and keyboard helpers, shared by the kit and unit tests.
export function createTypewriter(text, { rate = 36, reducedMotion = false } = {}) {
  const letters = Array.from(String(text ?? '')); let elapsed = 0, count = reducedMotion ? letters.length : 0;
  return {
    get text() { return letters.slice(0, count).join(''); }, get done() { return count === letters.length; },
    tick(dt) { elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0); count = Math.max(count, Math.min(letters.length, Math.floor(elapsed * rate))); },
    skip() { count = letters.length; },
    setRate(next){rate=next;elapsed=count/Math.max(1,rate);},
  };
}
export function choiceKey(key, index, count) {
  if (count < 1) return null;
  if (/^[1-9]$/.test(key)) return Number(key) <= count ? { index:Number(key)-1, activate:true } : null;
  if (key === 'Enter' || key === ' ') return { index, activate:true };
  if (key === 'Home') return { index:0, activate:false };
  if (key === 'End') return { index:count-1, activate:false };
  if (key === 'ArrowDown' || key === 'ArrowRight') return { index:(index+1)%count, activate:false };
  if (key === 'ArrowUp' || key === 'ArrowLeft') return { index:(index+count-1)%count, activate:false };
  return null;
}
export const formatCoins = value => Number.isSafeInteger(value) ? new Intl.NumberFormat('en-GB').format(value) : '?';
export function chartPoints(values, width = 240, height = 72, padding = 4) {
  if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) return [];
  let low = Infinity, high = -Infinity;
  for (const value of values) { low = Math.min(low,value); high = Math.max(high,value); }
  return values.map((value, index) => [
    Math.round(values.length === 1 ? width/2 : padding + index/(values.length-1)*(width-padding*2)),
    Math.round(low === high ? height/2 : height-padding-(value-low)/(high-low)*(height-padding*2)),
  ]);
}
export const progressRatio = (value, max) => Number.isFinite(value) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(1,value/max)) : 0;
