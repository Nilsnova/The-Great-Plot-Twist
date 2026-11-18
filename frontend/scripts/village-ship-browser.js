// Offline shipping transport for the proved world-art masters, run in Chrome by scripts/ship-village-art.mjs.
// It never changes a frame: sprite sheets are re-encoded 1:1, the terrain atlas is resampled per region.
import {pixelDifference} from './village-bake-plan.js';

async function bitmap(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Missing ${url}`);
  return createImageBitmap(await response.blob(), {premultiplyAlpha: 'none'});
}
const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
function canvasOf(width, height) { return Object.assign(document.createElement('canvas'), {width, height}); }

/**
 * regions: null copies the master unchanged; otherwise [[sourceRect, targetRect], ...] resampled with high-quality
 * smoothing, each with a one-texel border repeated from its own edge so bilinear sampling never meets a neighbour.
 */
export async function shipSheet({url, width, height, quality, regions = null}) {
  const master = await bitmap(url), reference = canvasOf(width, height), context = reference.getContext('2d');
  try {
    if (!regions) {
      if (master.width !== width || master.height !== height) throw new Error('A 1:1 shipped sheet must keep the master size.');
      context.drawImage(master, 0, 0);
    } else {
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      for (const [[sx, sy, sw, sh], [x, y, w, h]] of regions) {
        context.drawImage(master, sx, sy, sw, sh, x, y, w, h);
        context.drawImage(reference, x, y, w, 1, x, y - 1, w, 1); context.drawImage(reference, x, y + h - 1, w, 1, x, y + h, w, 1);
        context.drawImage(reference, x, y - 1, 1, h + 2, x - 1, y - 1, 1, h + 2); context.drawImage(reference, x + w - 1, y - 1, 1, h + 2, x + w, y - 1, 1, h + 2);
      }
    }
  } finally { master.close(); }
  const data = reference.toDataURL('image/webp', quality);
  if (!data.startsWith('data:image/webp;base64,')) throw new Error('This browser cannot encode WebP.');
  const decoded = await createImageBitmap(await (await fetch(data)).blob(), {premultiplyAlpha: 'none'}), check = canvasOf(width, height);
  try { check.getContext('2d').drawImage(decoded, 0, 0); } finally { decoded.close(); }
  const proof = pixelDifference(pixels(reference), pixels(check));
  reference.width = reference.height = check.width = check.height = 0;
  return {webp: data.slice(data.indexOf(',') + 1), proof};
}
