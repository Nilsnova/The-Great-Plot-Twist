// Hook timings are supplied by the server and clamped here for a safe display.
export const MIN_FLASH_SECONDS=.34;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const seconds=(value,fallback)=>Number.isFinite(value)?clamp(value,MIN_FLASH_SECONDS,10):fallback;
// Clamp server-provided chart and timing values before any UI or animation consumes them.
export function normalizeHook(hook){
  const beam = hook?.beam;
  const chart = beam?.chart;
  const pattern = beam?.pattern;
  const flash = beam?.flash;
  if (!chart || !Array.isArray(pattern) || !pattern.length || !flash) return null;

  const validPattern = pattern.slice(0, 12).filter(word => word === 'short' || word === 'long');
  if (!validPattern.length) return null;

  const safeChart = {
    x: clamp(Number.isFinite(chart.x) ? chart.x : 0, 0, 447),
    y: clamp(Number.isFinite(chart.y) ? chart.y : 0, 0, 255),
  };
  const safeFlash = {
    shortSeconds: seconds(flash.shortSeconds, 1 / 3),
    longSeconds: seconds(flash.longSeconds, 1 / 3),
    gapSeconds: clamp(Number.isFinite(flash.gapSeconds) ? flash.gapSeconds : .5, 0, 10),
    pauseSeconds: clamp(Number.isFinite(flash.pauseSeconds) ? flash.pauseSeconds : 4, 0, 10),
  };
  return { ...hook, beam: { ...beam, chart: safeChart, pattern: validPattern, flash: safeFlash } };
}
export function patternWords(hook){const safe=normalizeHook(hook);return safe?.beam.pattern.join(', ')??'';}
export function initialFlashState(){return {elapsed:0,lit:false,word:null,index:-1};}
// Advance from elapsed time rather than frame count to keep the signal stable at varied FPS.
export function advanceFlash(state,dt,hook){
  const safeHook = normalizeHook(hook);
  if (!safeHook) return initialFlashState();

  const previousElapsed = Number.isFinite(state?.elapsed) ? state.elapsed : 0;
  const elapsed = previousElapsed + Math.max(0, Number.isFinite(dt) ? dt : 0);
  const { pattern, flash } = safeHook.beam;
  const patternDuration = pattern.reduce((total, word) => {
    const flashDuration = word === 'short' ? flash.shortSeconds : flash.longSeconds;
    return total + (flashDuration + flash.gapSeconds);
  }, 0);
  const cycleDuration = patternDuration + flash.pauseSeconds;
  let cursor = cycleDuration ? elapsed % cycleDuration : 0;

  for (let index = 0; index < pattern.length; index++) {
    const word = pattern[index];
    const flashDuration = word === 'short' ? flash.shortSeconds : flash.longSeconds;
    if (cursor < flashDuration) return { elapsed, lit: true, word, index };
    cursor -= flashDuration;
    if (cursor < flash.gapSeconds) return { elapsed, lit: false, word, index };
    cursor -= flash.gapSeconds;
  }
  return {elapsed,lit:false,word:null,index:-1};
}
