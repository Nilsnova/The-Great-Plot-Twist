// Draws a QR Code onto a canvas. The site CSP forbids data: images, so no <img> or data URL is used.
import {encodeQr} from './encoder.js';

const DEFAULT_COLORS = {dark: '#0b1026', light: '#ffffff'};

/**
 * Render `text` into `canvas` and size the canvas to fit.
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {{scale?:number, margin?:number, colors?:{dark?:string, light?:string}, ecc?:'L'|'M'|'Q'|'H'}} [options]
 *   scale: CSS-independent pixels per module (integer, default 8); margin: quiet zone in modules (default 4).
 * @returns {{version:number, ecc:string, mask:number, size:number, pixels:number}}
 */
export function drawQr(canvas, text, {scale = 8, margin = 4, colors = {}, ecc = 'M'} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('drawQr needs a canvas');
  scale = Math.max(1, Math.floor(scale));
  margin = Math.max(0, Math.floor(margin));
  const {dark, light} = {...DEFAULT_COLORS, ...colors};
  const code = encodeQr(text, {ecc});
  const pixels = (code.size + margin * 2) * scale;
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.fillStyle = light;
  context.fillRect(0, 0, pixels, pixels);
  context.fillStyle = dark;
  // One rectangle per horizontal run keeps the draw call count low for large scales.
  code.modules.forEach((row, y) => {
    for (let x = 0; x < code.size; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < code.size && row[end + 1]) end++;
      context.fillRect((margin + x) * scale, (margin + y) * scale, (end - x + 1) * scale, scale);
      x = end;
    }
  });
  return {version: code.version, ecc: code.ecc, mask: code.mask, size: code.size, pixels};
}
