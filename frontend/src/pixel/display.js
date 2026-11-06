// Bounded real framebuffer density. CSS size and world framing never depend on quality.
const MAX_PIXELS = {high: 1920 * 1080, low: 1280 * 720};
const size = value => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;

export function pixelViewport(width, height, {quality = 'high', pixelRatio = 1} = {}) {
  width = size(width); height = size(height);
  const maximum = MAX_PIXELS[quality] ?? MAX_PIXELS.high;
  const deviceRatio = Number.isFinite(pixelRatio) ? Math.max(0.25, pixelRatio) : 1;
  const ratio = Math.min(deviceRatio, quality === 'low' ? 1 : 1.5, Math.sqrt(maximum / (width * height)));
  return {width, height, scale: 1, pixelRatio: ratio,
    drawingWidth: Math.floor(width * ratio), drawingHeight: Math.floor(height * ratio)};
}

export function worldViewport(width, height, viewHeight = 20, minWidth = 16) {
  const aspect = size(width) / size(height);
  const vertical = Math.max(viewHeight, minWidth / aspect);
  return {left: -vertical * aspect / 2, right: vertical * aspect / 2,
    top: vertical / 2, bottom: -vertical / 2};
}
