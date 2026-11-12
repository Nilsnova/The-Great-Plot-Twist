// A full-screen cartoon scene on one canvas (the title and the cutscene panels, GAME-V3.md §7): layers
// back to front, each with a parallax depth. Still layers are painted once per size into their own
// canvas (wider than the view by the pan margin) and only slide; moving layers (the beam, the ships, the
// waves, rain) draw every frame. Drawn at the device's pixel ratio, capped so a layer stays near
// 2.6 million pixels, so a phone never holds a huge stack of canvases.
const MAX_LAYER_PIXELS = 2.6e6;

function surface(width, height) {
  const element = document.createElement('canvas'); element.width = Math.max(1, width); element.height = Math.max(1, height); return element;
}

/** The ratio a stage draws at for a view of width x height CSS px (pure). */
export function stageRatio(width, height, deviceRatio = 1) {
  const most = Math.sqrt(MAX_LAYER_PIXELS / Math.max(1, width * height));
  return Math.max(.75, Math.min(2, deviceRatio || 1, most));
}

/**
 * createStage(canvas, scene): scene.layout(w, h) returns the geometry (with margin, the pan reach in CSS
 * px), scene.layers [{depth, still, draw(context, geometry, time)}]. resize(w, h, ratio) repaints the
 * still layers; render(time, pan) draws one frame, pan -1..1 slides each layer by depth x margin.
 */
export function createStage(canvas, scene) {
  const context = canvas.getContext('2d');
  let geometry = null, ratio = 1, caches = [];
  function resize(width, height, deviceRatio = globalThis.devicePixelRatio || 1) {
    width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
    ratio = stageRatio(width, height, deviceRatio);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    for (const cache of caches) if (cache) cache.width = cache.height = 0;
    geometry = scene.layout(width, height, ratio);
    const margin = geometry.margin ?? 0;
    caches = scene.layers.map(layer => {
      if (!layer.still) return null;
      const cache = surface(Math.round((width + margin * 2) * ratio), canvas.height), c = cache.getContext('2d');
      c.setTransform(ratio, 0, 0, ratio, margin * ratio, 0);
      layer.draw(c, geometry, 0);
      return cache;
    });
  }
  function render(time = 0, pan = 0) {
    if (!geometry) return;
    const margin = geometry.margin ?? 0;
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
    scene.layers.forEach((layer, index) => {
      const dx = pan * (layer.depth ?? 0) * margin;
      if (caches[index]) { context.setTransform(1, 0, 0, 1, 0, 0); context.drawImage(caches[index], Math.round((dx - margin) * ratio), 0); return; }
      context.setTransform(ratio, 0, 0, ratio, dx * ratio, 0);
      context.save(); layer.draw(context, geometry, time); context.restore();
    });
  }
  return {canvas, resize, render, get geometry() { return geometry; },
    dispose() { for (const cache of caches) if (cache) cache.width = cache.height = 0; caches = []; canvas.width = canvas.height = 0; }};
}
