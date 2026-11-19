// Original world-only material atlas. Sampled into the existing backdrop, never a new land mask.
import {shippedTerrain} from './shipped.js';
export const TERRAIN_SOURCE_SHEET = Object.freeze({file: 'village/terrain-materials-v1.png', width: 1254, height: 1254});
// The ground is painted at most 39 texels per world unit; the shipped atlas (scripts/ship-village-art.mjs)
// resamples each authored crop to at least 39 texels per unit, with its own repeated one-texel border.
export const TERRAIN_SHEET = Object.freeze(shippedTerrain
  ? {file: shippedTerrain.file, width: shippedTerrain.width, height: shippedTerrain.height} : TERRAIN_SOURCE_SHEET);
export const TERRAIN_MATERIALS = Object.freeze({
  // One-pixel insets prevent bilinear sampling from bleeding into a neighboring material.
  grass: {rect: [1, 1, 625, 625], period: [8, 5.76], mirror: true},
  path: {rect: [628, 1, 625, 625], period: [5.5, 3.96]},
  rock: {rect: [1, 628, 625, 625], period: [6, 2.8]},
  sand: {rect: [628, 628, 625, 625], period: [8, 5.76], mirror: true},
});
const BACKDROP = {left: -32, top: -24, right: 32, bottom: 24};

/** World-anchored cells: viewport size/density never changes which material is under a foot. */
export function materialCells(name, bounds = BACKDROP) {
  const material = TERRAIN_MATERIALS[name];
  if (!material) throw new Error(`Unknown terrain material: ${name}`);
  const [width, height] = material.period, cells = [];
  for (let row = Math.floor(bounds.top / height); row * height < bounds.bottom; row++) {
    for (let column = Math.floor(bounds.left / width); column * width < bounds.right; column++) {
      cells.push({x: column * width, y: row * height, width, height,
        flipX: !!material.mirror && Math.abs(column % 2) === 1,
        flipY: !!material.mirror && Math.abs(row % 2) === 1});
    }
  }
  return cells;
}

/** The caller owns clipping. No full-size intermediate canvas or retained decoded image. */
export function paintMaterial(context, image, name, {bounds = BACKDROP, alpha = 1} = {}) {
  // A caller may still hand over the authored original (evidence scripts); its crops are the authored rects.
  const rect = shippedTerrain && image?.width === shippedTerrain.width && image?.height === shippedTerrain.height
    ? shippedTerrain.rects[name] : TERRAIN_MATERIALS[name].rect;
  context.save(); context.globalAlpha *= alpha;
  for (const cell of materialCells(name, bounds)) {
    context.save();
    context.translate(cell.x + cell.width / 2, cell.y + cell.height / 2);
    context.scale(cell.flipX ? -1 : 1, cell.flipY ? -1 : 1);
    context.drawImage(image, ...rect, -cell.width / 2, -cell.height / 2, cell.width, cell.height);
    context.restore();
  }
  context.restore();
}

/** Cosmetic grass reaches the cliff lip, except at the existing three shallow shore approaches. */
export function meadowScale(angle) {
  const distance = Math.min(...[0, 90, 180].map(bearing => {
    const offset = angle - bearing * Math.PI / 180;
    return Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset)));
  }));
  // Grass wraps the rocky shoulders more tightly, leaving the middle of each beach open.
  const t = Math.max(0, Math.min(1, (distance - Math.PI / 15) / (Math.PI * 7 / 90)));
  return .86 + .125 * t * t * (3 - 2 * t);
}

/** A filled union matching round path strokes/clearings, for clipped paver sampling. */
export function pathMaterialMask(paths, width = 2.04, padding = 0) {
  const result = new Path2D();
  for (const [lane, points] of paths.lines.entries()) {
    const radius = (paths.widths?.[lane] ?? width) / 2 + padding;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i], ay = az * .72, by = bz * .72;
      const length = Math.hypot(bx - ax, by - ay);
      if (!length) continue;
      const nx = -(by - ay) / length * radius, ny = (bx - ax) / length * radius;
      result.moveTo(ax + nx, ay + ny); result.lineTo(ax - nx, ay - ny);
      result.lineTo(bx - nx, by - ny); result.lineTo(bx + nx, by + ny); result.closePath();
    }
    for (const [x, z] of points) { result.moveTo(x + radius, z * .72); result.arc(x, z * .72, radius, 0, Math.PI * 2); }
  }
  for (const [x, z, clearing] of paths.clearings) {
    const radius = clearing + padding, y = z * .72;
    if (!paths.stoneAprons) {
      result.moveTo(x + radius, y); result.ellipse(x, y, radius, radius * .72, 0, 0, Math.PI * 2);
      continue;
    }
    // The dressed apron is an octagon inscribed in the original clearing.
    for (let corner = 0; corner < 8; corner++) {
      const angle = (corner + .5) * Math.PI / 4;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius * .72;
      if (corner) result.lineTo(px, py); else result.moveTo(px, py);
    }
    result.closePath();
  }
  return result;
}
