// The animated title, loaded after the first title paint so the cold title stays within its budget.
// A cartoon scene drawn in code (GAME-V3.md §7, src/art/scenery.js PANELS.title): the lighthouse island
// at dusk with its beam sweeping round, the sea rolling, a pirate ship bobbing on the horizon, and a
// gentle parallax that follows the pointer. No image files. Reduced motion draws one still frame with
// a resting beam. The plain sky colours of .title-backdrop (src/ui/shell.css) are the instant first
// frame; this canvas fades in over them and shows only while the title does.
import './animated-title.css';
import {createScene, PANELS} from '../art/scenery.js';
import {createStage} from '../art/stage.js';

export async function startAnimatedTitle({container, backdrop, reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches}) {
  const scene = await createScene({...PANELS.title, still: false});
  const canvas = document.createElement('canvas'); canvas.className = 'title-scene'; canvas.setAttribute('aria-hidden', 'true');
  const stage = createStage(canvas, scene);
  backdrop.after(canvas);
  let frame = 0, stopped = false, pointer = 0, eased = 0, fitted = false;
  const onPointer = event => { pointer = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1)); };
  addEventListener('pointermove', onPointer, {passive: true});
  const fit = () => { stage.resize(innerWidth, innerHeight, devicePixelRatio || 1); fitted = true; };

  function render(time) {
    const still = reducedMotion(), t = still ? 0 : time / 1000;
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
    render(time);
    if (!reducedMotion()) frame = requestAnimationFrame(loop);
  }
  const onResize = () => { if (backdrop.hidden) return; fit(); render(performance.now()); };
  addEventListener('resize', onResize);
  // Keep watching the backdrop: the scene shows only while the title does.
  const watcher = new MutationObserver(() => { canvas.hidden = backdrop.hidden; if (!backdrop.hidden && !frame && !stopped) frame = requestAnimationFrame(loop); });
  watcher.observe(backdrop, {attributes: true, attributeFilter: ['hidden']});
  fit(); render(performance.now());
  requestAnimationFrame(() => canvas.classList.add('title-scene-ready'));
  frame = requestAnimationFrame(loop);
  return {canvas, dispose() {
    stopped = true; cancelAnimationFrame(frame); watcher.disconnect(); removeEventListener('resize', onResize); removeEventListener('pointermove', onPointer);
    stage.dispose(); canvas.remove();
  }};
}
