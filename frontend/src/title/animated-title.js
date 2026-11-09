// The animated title, loaded after the first title paint so the cold title stays within its budget.
// It brings the G29 title planes (cutscenes/title-*.webp, painted at native size) to life on one
// small canvas at native resolution, enlarged by whole numbers with nearest sampling:
// parallax drift, a rolling pixel sea, twinkling stars and moon glints, and the lighthouse beam
// sweeping round in four dithered steps of lamplight. The painted title stays underneath as the
// instant first frame and the fallback. Reduced motion draws one still frame with a resting beam.
import './animated-title.css';
import {titleLayers, titleLampOrigin, CUTSCENE_PIXEL_SCALE} from '../cutscenes/art.js';

const W = 352, H = 180, SEA_TOP = 118, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BEAM_RGB = [255, 222, 150];

function load(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => resolve(image); image.onerror = reject;
    image.src = `${import.meta.env.BASE_URL}${file}`;
  });
}
// One native-size copy per plane (the files are 4x nearest enlargements of native pixels).
function nativeCopy(image) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, W, H);
  return canvas;
}
function brightPixels(canvas, test) {
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data, found = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (data[i + 3] > 200 && test(data[i], data[i + 1], data[i + 2], x, y)) found.push([x, y, data[i], data[i + 1], data[i + 2]]);
  }
  return found;
}

export async function startAnimatedTitle({container, backdrop, reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches}) {
  const images = await Promise.all(titleLayers.map(layer => load(layer.file)));
  const planes = Object.fromEntries(titleLayers.map((layer, i) => [layer.id, {...layer, canvas: nativeCopy(images[i])}]));
  const stars = brightPixels(planes.sky.canvas, (r, g, b, x, y) => y < 110 && r + g + b > 430).filter((_, i) => i % 2 === 0);
  const glints = brightPixels(planes.sea.canvas, (r, g, b, x, y) => y > SEA_TOP + 2 && r + g + b > 210);
  const canvas = document.createElement('canvas'); canvas.className = 'title-scene'; canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
  const beam = document.createElement('canvas'); beam.width = W; beam.height = H;
  const beamContext = beam.getContext('2d'), beamPixels = beamContext.createImageData(W, H);
  backdrop.after(canvas);
  let frame = 0, stopped = false, pointer = 0, view = {width: W, height: H, scale: 1};
  const onPointer = event => { pointer = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1)); };
  addEventListener('pointermove', onPointer, {passive: true});

  // Whole-number enlargement that covers the window; the lighthouse side stays in view.
  function fit() {
    const scale = Math.max(1, Math.ceil(Math.max(innerWidth / (W - 24), innerHeight / H)));
    const width = Math.min(W - 24, Math.ceil(innerWidth / scale)), height = Math.min(H, Math.ceil(innerHeight / scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; context.imageSmoothingEnabled = false; }
    Object.assign(canvas.style, {width: `${width * scale}px`, height: `${height * scale}px`,
      left: `${Math.floor((innerWidth - width * scale) / 2)}px`, top: `${Math.floor((innerHeight - height * scale) / 2)}px`});
    view = {width, height, scale};
  }
  // The beam in native pixels: a cone from the lantern whose length follows the sweep.
  function drawBeam(angle, origin) {
    const data = beamPixels.data; data.fill(0);
    const side = Math.cos(angle), facing = Math.sin(angle), length = Math.abs(side) * 250, dir = Math.sign(side) || 1;
    if (length > 6) for (let y = Math.max(0, origin.y - 40); y < Math.min(H, origin.y + 40); y++) {
      for (let step = 2; step < length; step++) {
        const x = origin.x + dir * step;
        if (x < 0 || x >= W) break;
        const half = 1.5 + step * .11, dy = Math.abs(y - origin.y - step * .035);
        if (dy > half) continue;
        const core = (1 - step / length) ** 1.15 * (1 - dy / half) ** .65;
        const level = Math.floor(Math.min(1, core * 1.25) * 4 + (BAYER[(y % 4) * 4 + (x % 4)] + .5) / 16);
        if (level <= 0) continue;
        const i = (y * W + x) * 4; data[i] = BEAM_RGB[0]; data[i + 1] = BEAM_RGB[1]; data[i + 2] = BEAM_RGB[2]; data[i + 3] = [0, 46, 84, 124, 170][level];
      }
    }
    // The lantern flares when the light turns towards us.
    const flare = Math.max(0, facing) * 7 + 3;
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) {
      const r = Math.hypot(x, y * 1.15) / flare; if (r >= 1) continue;
      const px = origin.x + x, py = origin.y + y, level = Math.floor((1 - r) ** 1.4 * 4 + (BAYER[((py + 64) % 4) * 4 + ((px + 64) % 4)] + .5) / 16);
      if (level <= 0 || px < 0 || px >= W || py < 0) continue;
      const i = (py * W + px) * 4; data[i] = 255; data[i + 1] = 236; data[i + 2] = 180; data[i + 3] = Math.max(data[i + 3], [0, 60, 110, 170, 230][Math.min(4, level)]);
    }
    beamContext.putImageData(beamPixels, 0, 0);
    return {dir, length};
  }
  function render(time) {
    const still = reducedMotion(), t = still ? 0 : time / 1000;
    const crop = Math.floor((W - view.width) / 2) + 10; // favour the lighthouse side a little
    const drift = still ? 0 : Math.sin(t * .11) * 5 + pointer * 4;
    const offset = plane => -crop + Math.round(drift * plane.depth);
    context.clearRect(0, 0, view.width, view.height);
    const dy = view.height - H;
    context.drawImage(planes.sky.canvas, offset(planes.sky), dy);
    // Twinkle: a few stars dim for a moment.
    if (!still) for (let i = 0; i < stars.length; i++) {
      const [x, y] = stars[i], phase = Math.sin(t * (1.3 + (i % 7) * .37) + i * 2.1);
      if (phase > .82) { context.fillStyle = '#2a2d5c'; context.fillRect(x + offset(planes.sky), y + dy, 1, 1); }
    }
    context.drawImage(planes['far-cliffs'].canvas, offset(planes['far-cliffs']), dy);
    // The sea rolls: thin strips slide a pixel left or right like swell.
    const sea = planes.sea, seaX = offset(sea);
    context.drawImage(sea.canvas, 0, 0, W, SEA_TOP, seaX, dy, W, SEA_TOP);
    for (let y = SEA_TOP; y < H; y += 2) {
      const shift = still ? 0 : Math.round(Math.sin(t * .9 + y * .45) * (y > 150 ? 2 : 1));
      context.drawImage(sea.canvas, 0, y, W, 2, seaX + shift, y + dy, W, 2);
    }
    const lampX = Math.round(titleLampOrigin.x / CUTSCENE_PIXEL_SCALE) + offset(planes.lighthouse), lampY = Math.round(titleLampOrigin.y / CUTSCENE_PIXEL_SCALE);
    const angle = still ? Math.PI * .92 : t * .55;
    const lit = drawBeam(angle, {x: Math.round(titleLampOrigin.x / CUTSCENE_PIXEL_SCALE), y: lampY});
    // Moonlight and beam glints on the water.
    if (!still) for (let i = 0; i < glints.length; i += 3) {
      const [x, y] = glints[i], sx = x + seaX, under = lit.dir < 0 && sx < lampX && sx > lampX - lit.length;
      const seed = (Math.sin(i * 12.9898) * 43758.5453) % 1, blink = Math.sin(t * (1.2 + Math.abs(seed) * 1.6) + seed * 40);
      if (blink > (under ? .78 : .9)) { context.fillStyle = under ? '#f2dc9c' : '#c9d4ff'; context.fillRect(sx, y + dy, 1, 1); }
    }
    context.drawImage(planes.lighthouse.canvas, offset(planes.lighthouse), dy);
    context.drawImage(beam, offset(planes.lighthouse), dy);
    context.drawImage(planes.foreground.canvas, offset(planes.foreground), dy);
  }
  function loop(time) {
    if (stopped) return;
    frame = 0;
    canvas.hidden = backdrop.hidden;
    if (backdrop.hidden) return; // the watcher restarts the loop when the title returns
    render(time);
    if (!reducedMotion()) frame = requestAnimationFrame(loop);
  }
  const onResize = () => { fit(); if (reducedMotion()) render(0); };
  addEventListener('resize', onResize);
  // Keep watching the painted backdrop: the scene shows only while the title does.
  const watcher = new MutationObserver(() => { canvas.hidden = backdrop.hidden; if (!backdrop.hidden && !frame && !stopped) frame = requestAnimationFrame(loop); });
  watcher.observe(backdrop, {attributes: true, attributeFilter: ['hidden']});
  fit(); render(performance.now());
  requestAnimationFrame(() => canvas.classList.add('title-scene-ready'));
  frame = requestAnimationFrame(loop);
  return {canvas, dispose() { stopped = true; cancelAnimationFrame(frame); watcher.disconnect(); removeEventListener('resize', onResize); removeEventListener('pointermove', onPointer); canvas.remove(); }};
}
