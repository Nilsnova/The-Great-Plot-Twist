// Offline texture compilation/proof, never imported by the game or title.
import {collectRasterFrames, createRasterCache, normalizeRasterFrame} from '../src/art/village-raster.js';
import {BAKE_DENSITY, GUTTER, pixelDifference, PROOF_DENSITIES} from './village-bake-plan.js';
export async function compileFamily(plan, frames) {
  const cache = createRasterCache(), canvases = plan.pages.map(page => Object.assign(document.createElement('canvas'), {width: page.width, height: page.height}));
  const bySheet = new Map(); let peakSourceBytes = 0, largestTemporaryCanvasBytes = 0;
  for (const [index, page] of plan.pages.entries()) for (const item of page.items) {
    const frame = frames[item.id], key = frame.sheet.file;
    if (!bySheet.has(key)) bySheet.set(key, []); bySheet.get(key).push({...item, index, frame});
  }
  try {
    for (const items of bySheet.values()) {
      const lease = await cache.acquire(items[0].frame.sheet); peakSourceBytes = Math.max(peakSourceBytes, cache.stats().bytes);
      try {
        for (const {id, rect, index, frame} of items) {
          const normalized = normalizeRasterFrame(lease.image, frame, BAKE_DENSITY);
          largestTemporaryCanvasBytes = Math.max(largestTemporaryCanvasBytes, normalized.width * normalized.height * 4);
          canvases[index].getContext('2d').drawImage(normalized, rect[0], rect[1]); normalized.width = normalized.height = 0;
        }
      } finally { lease.release(); }
    }
    for (const [index, page] of plan.pages.entries()) for (const {rect: [x, y, w, h]} of page.items) {
      const border = canvases[index].getContext('2d').getImageData(x - GUTTER, y - GUTTER, w + GUTTER * 2, h + GUTTER * 2);
      for (let by = 0; by < border.height; by++) for (let bx = 0; bx < border.width; bx++) {
        if ((bx < GUTTER || bx >= w + GUTTER || by < GUTTER || by >= h + GUTTER) && border.data[(by * border.width + bx) * 4 + 3]) throw new Error('Baked gutter is not transparent.');
      }
    }
    return {outputs: canvases.map((canvas, i) => ({file: plan.pages[i].file, png: canvas.toDataURL('image/png').split(',')[1]})),
      peakSourceBytes, retainedDecodedAfterRelease: cache.stats().bytes, canvasBytes: canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0), largestTemporaryCanvasBytes};
  } finally { for (const canvas of canvases) canvas.width = canvas.height = 0; }
}
export async function verifyFamily(plan, raw) {
  const baked = collectRasterFrames([plan]), cache = createRasterCache(), results = []; let peakSourceBytes = 0;
  const render = async (frame, density) => {
    const lease = await cache.acquire(frame.sheet); peakSourceBytes = Math.max(peakSourceBytes, cache.stats().bytes);
    try { return normalizeRasterFrame(lease.image, frame, density); } finally { lease.release(); }
  };
  for (const id of Object.keys(raw)) for (const density of PROOF_DENSITIES) {
    const a = await render(raw[id], density), b = await render(baked[id], density);
    try {
      const read = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const difference = pixelDifference(read(a), read(b));
      if (density === 4 && (!difference.visiblePixels || difference.maxAlphaDelta !== 0 || difference.maxVisibleDelta > 2)) throw new Error(`Baked4× pixels differ for ${id}: ${JSON.stringify(difference)}`);
      results.push({id, density, ...difference});
    } finally { a.width = a.height = b.width = b.height = 0; }
  }
  return {results, peakSourceBytes, retainedDecodedAfterRelease: cache.stats().bytes};
}
