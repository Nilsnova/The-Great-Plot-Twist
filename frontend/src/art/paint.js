// The clean cartoon kit (GAME-V3.md §7): every sprite is vector paths drawn with Canvas 2D at the
// device's density. A drawing works in the frame's logical pixels (16 per world unit, the same boxes
// and anchors as the old pixel atlas); paint() scales the context, so one drawing stays crisp at any
// density. The look: smooth shapes, a bold dark outline, a two-tone shade on the side away from the
// light (top left), a few highlight strokes, warm saturated colours. No DOM beyond a canvas.
export const INK = '#2b1d1a';

const hex = value => { const n = parseInt(value.slice(1), 16); return value.length === 4
  ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Blends two #rrggbb colours (t 0 = a, 1 = b). */
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const shadeOf = colour => mix(colour, '#3a1f3c', .3);
export const lightOf = colour => mix(colour, '#fff6dc', .42);

// Path builders (logical pixels). Each returns a Path2D, so a part can be filled, shaded and stroked.
export function ellipse(cx, cy, rx, ry = rx, rotation = 0) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2); return p; }
export function rect(x, y, w, h, r = 0) {
  const p = new Path2D(), k = Math.min(r, w / 2, h / 2);
  p.moveTo(x + k, y); p.arcTo(x + w, y, x + w, y + h, k); p.arcTo(x + w, y + h, x, y + h, k);
  p.arcTo(x, y + h, x, y, k); p.arcTo(x, y, x + w, y, k); p.closePath(); return p;
}
/** A polygon with rounded corners: points [[x, y], …], r the corner radius (a number or one per point). */
export function poly(points, r = 1.2) {
  const p = new Path2D(), n = points.length, at = i => points[(i + n) % n], radius = i => (Array.isArray(r) ? r[(i + n) % n] : r);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], start = mid(at(-1), at(0));
  p.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) { const a = at(i), b = at(i + 1); p.arcTo(a[0], a[1], b[0], b[1], radius(i)); }
  p.closePath(); return p;
}
export const svg = d => new Path2D(d);

/**
 * part(c, path, fill, {shade, light, line, width, depth, gloss}): one cartoon shape. fill a colour or a
 * CanvasGradient; shade the darker tone on the bottom-right rim (false: none); depth how far the
 * shade reaches (logical px); line the outline colour (false: none) and width; gloss a Path2D (or a
 * list) drawn in the light tone inside the shape.
 */
export function part(c, path, fill, { shade, light, line = INK, width = 1, depth = 1.6, dx = -.55, gloss = null, alpha = 1 } = {}) {
  c.save(); c.globalAlpha = alpha;
  const base = typeof fill === 'string' ? fill : null;
  const dark = shade === false ? null : shade ?? (base ? shadeOf(base) : null);
  if (dark) {
    c.save(); c.clip(path);
    c.fillStyle = dark; c.fill(path);
    c.translate(dx * depth, -depth); c.fillStyle = fill; c.fill(path);
    c.restore();
  } else { c.fillStyle = fill; c.fill(path); }
  if (gloss) {
    c.save(); c.clip(path); c.fillStyle = light ?? (base ? lightOf(base) : '#ffffff88');
    for (const g of Array.isArray(gloss) ? gloss : [gloss]) c.fill(g);
    c.restore();
  }
  if (line) { c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = line; c.stroke(path); }
  c.restore();
}
/** A stroke-only line (rigging, seams, a fuse): points or a Path2D. */
export function stroke(c, path, colour = INK, width = 1, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = colour;
  c.stroke(Array.isArray(path) ? line(path) : path); c.restore();
}
export function line(points) { const p = new Path2D(); points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); return p; }
/** A soft ground shadow under a sprite (an ellipse in translucent ink). */
export function shadow(c, cx, cy, rx, ry = rx * .32, alpha = .22) {
  if (c.shadows) { c.shadows.push([cx, cy, rx, ry, alpha]); return; }
  c.save(); c.globalAlpha = alpha; c.fillStyle = '#1a2a2a'; c.fill(ellipse(cx, cy, rx, ry)); c.restore();
}
export function linear(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([at, colour]) => g.addColorStop(at, colour)); return g;
}
export function radial(c, x, y, r, stops, x0 = x, y0 = y, r0 = 0) {
  const g = c.createRadialGradient(x0, y0, r0, x, y, r); stops.forEach(([at, colour]) => g.addColorStop(at, colour)); return g;
}

// Canvases: a DOM canvas in the page (every browser uploads it as a texture), an OffscreenCanvas elsewhere.
export function canvas(width, height) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const element = document.createElement('canvas'); element.width = width; element.height = height; return element;
}

/**
 * Paints one drawing into a new canvas: size [w, h] in logical px, density texels per logical px,
 * outline the extra silhouette ring (logical px) drawn around the whole sprite in ink, so every
 * sprite gets the same bold outer edge whatever its parts. Returns the canvas.
 */
export function paint(draw, [w, h], density = 2, { outline = .9, pad = 0 } = {}) {
  const width = Math.max(1, Math.ceil(w * density)), height = Math.max(1, Math.ceil(h * density));
  const art = canvas(width, height), c = art.getContext('2d');
  c.setTransform(density, 0, 0, density, 0, 0); c.imageSmoothingEnabled = true;
  c.shadows = outline > 0 ? [] : null;
  draw(c, { w, h, pad });
  const shadows = c.shadows; c.shadows = null;
  if (outline <= 0) return art;
  // The silhouette ring: the sprite's alpha in ink, stamped in a circle behind the sprite.
  const ring = canvas(width, height), r = ring.getContext('2d');
  r.drawImage(art, 0, 0); r.globalCompositeOperation = 'source-in'; r.fillStyle = INK; r.fillRect(0, 0, width, height);
  const out = canvas(width, height), o = out.getContext('2d'), k = outline * density;
  // Ground shadows sit under the ring and the sprite, so they never get an outline.
  o.setTransform(density, 0, 0, density, 0, 0); for (const item of shadows) shadow(o, ...item); o.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; o.drawImage(ring, Math.cos(a) * k, Math.sin(a) * k); }
  o.drawImage(art, 0, 0);
  return out;
}
