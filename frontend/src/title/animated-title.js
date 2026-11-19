// The animated title, loaded after the first title paint so the cold title stays within its budget.
// A cartoon scene drawn in code (GAME-V3.md §7, src/art/scenery.js PANELS.title): the lighthouse island
// at dusk with its beam sweeping round, the sea rolling, a pirate ship bobbing on the horizon, and a
// gentle parallax that follows the pointer. No image files. Reduced motion draws one still frame with
// a resting beam. The plain sky colours of .title-backdrop (src/ui/shell.css) are the instant first
// frame; this canvas fades in over them and shows only while the title does.
import './animated-title.css';
import {createScene, PANELS} from '../art/scenery.js';
import {createStage} from '../art/stage.js';
import {onPreferences, reducedMotion} from '../settings/preferences.js';

export async function startAnimatedTitle({backdrop}) {
  const scene = await createScene({...PANELS.title, still: false});
  const canvas = document.createElement('canvas'); canvas.className = 'title-scene'; canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = backdrop.hidden;
  const stage = createStage(canvas, scene);
  backdrop.after(canvas);
  let frame = 0, stopped = false, pointer = 0, eased = 0, fitted = false;
  const onPointer = event => { pointer = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1)); };
  addEventListener('pointermove', onPointer, {passive: true});
  const fit = () => { stage.resize(innerWidth, innerHeight, devicePixelRatio || 1); fitted = true; };

  function render(time, still = reducedMotion()) {
    const t = still ? 0 : time / 1000;
    canvas.classList.toggle('title-scene-still', still);
    eased += (pointer - eased) * .05;
    stage.render(t, still ? 0 : Math.max(-1, Math.min(1, Math.sin(t * .11) * .6 + eased * .5)));
  }
  function loop(time) {
    if (stopped) return;
    frame = 0;
    canvas.hidden = backdrop.hidden;
    // Off the title the painted layers are let go (the game needs the memory); the watcher restarts the loop.
    if (backdrop.hidden) { if (fitted) { stage.dispose(); fitted = false; } return; }
    if (!fitted) fit();
    const still = reducedMotion();
    render(time, still);
    if (!still) frame = requestAnimationFrame(loop);
  }
  function schedule() { if (!frame && !stopped) frame = requestAnimationFrame(loop); }
  const onResize = () => { if (backdrop.hidden) return; fit(); render(performance.now()); };
  addEventListener('resize', onResize);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion = () => { if (!backdrop.hidden) schedule(); };
  motion.addEventListener('change', updateMotion);
  const stopPreferences = onPreferences(updateMotion);
  const watcher = new MutationObserver(() => { canvas.hidden = backdrop.hidden; schedule(); });
  watcher.observe(backdrop, {attributes: true, attributeFilter: ['hidden']});
  if (!backdrop.hidden) { fit(); render(performance.now()); }
  requestAnimationFrame(() => canvas.classList.add('title-scene-ready'));
  schedule();
  return {canvas, dispose() {
    stopped = true; cancelAnimationFrame(frame); watcher.disconnect(); removeEventListener('resize', onResize); removeEventListener('pointermove', onPointer);
    stopPreferences(); motion.removeEventListener('change', updateMotion);
    stage.dispose(); canvas.remove();
  }};
}
