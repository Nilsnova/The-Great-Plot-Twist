// Compiled from unchanged original artwork; VIS30 records source hashes and maximum-density pixel proof.
// Metadata imports no image. The same bindings drive world, combat and portraits.
// baked.js names the proved 4x PNG masters; shipped.js (scripts/ship-village-art.mjs) names the same-size
// WebP each master is downloaded as. Frame rects, feet and logical boxes are unchanged.
import * as baked from './village/baked.js';
import {compiledHomeFoliage} from './village/home-foliage.js';
import {shippedSheets} from './village/shipped.js';
export function shippedFamily(family, shipped = shippedSheets) {
  const sheets = Object.fromEntries(Object.entries(family.sheets).map(([key, sheet]) => {
    const target = shipped[sheet.file];
    if (target && (target.width !== sheet.width || target.height !== sheet.height)) throw new Error(`Shipped sheet size differs: ${sheet.file}`);
    return [key, target ? {file: target.file, width: target.width, height: target.height} : sheet];
  }));
  return Object.freeze({sheets, frames: family.frames});
}
export const villageFamilies = [shippedFamily({
  sheets: {...baked.sheets, ...compiledHomeFoliage.sheets},
  frames: {...baked.frames, ...compiledHomeFoliage.frames},
})];
