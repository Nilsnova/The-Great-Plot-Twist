// Browser-only, supplementary source/foot/pixel proof. Actual-game screenshots remain a separate gate.
import {getRasterFrame, rasterFrameSizes} from '../src/art/village-raster.js';
import {artSizes, loadArt} from '../src/world/art.js';
import {cartoonAtlas} from '../src/art/textures.js';
const check = (ok, message) => { if (!ok) throw new Error(message); };
export async function verifyVillageRasterFrames(ids = Object.keys(rasterFrameSizes())) {
  check(ids.length > 0 && ids.every(id => getRasterFrame(id)), 'Select registered original PNG frame IDs.');
  const results = [];
  for (const request of [{quality: 'low', density: 1.5}, {quality: 'high', density: 2}, {quality: 'high', density: 4}]) {
    const atlas = await cartoonAtlas(ids, request), density = atlas.density;
    check(atlas.missing.length === 0, 'Every approved PNG frame is in the atlas.');
    const world = await loadArt(ids, {density});
    try {
      for (const id of ids) {
        const frame = getRasterFrame(id), [w, h, anchor] = frame.logical, source = world[id].map.userData.villageArt;
        check(source?.source === 'png' && source.file === frame.sheet.file, `${id}: world uses the approved PNG.`);
        check(atlas.image.villageArt.some(item => item.id === id && item.source === 'png' && item.file === source.file), `${id}: atlas uses the same PNG.`);
        const image = world[id].map.image, rect = atlas.rects[id];
        check(rect.w === w && rect.h === h && rect.anchor === anchor, `${id}: atlas logical metrics.`);
        check(artSizes[id][0] === w / 16 && artSizes[id][1] === h / 16 && artSizes[id][2] === anchor / h, `${id}: world logical metrics.`);
        const direct = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
        const packed = atlas.image.getContext('2d').getImageData(Math.round(rect.x * density), Math.round(rect.y * density), image.width, image.height).data;
        let maxDelta = 0, visible = 0;
        for (let i = 0; i < direct.length; i++) {
          if (i % 4 === 3 && direct[i] > 128) visible++;
          if (i % 4 !== 3 && direct[i - i % 4 + 3] === 0 && packed[i - i % 4 + 3] === 0) continue;
          maxDelta = Math.max(maxDelta, Math.abs(direct[i] - packed[i]));
        }
        check(visible > 0 && maxDelta <= 2, `${id}: visible world/atlas PNG pixels match (delta ${maxDelta}).`);
        results.push({id, file: frame.sheet.file, nativeSheet: [frame.sheet.width, frame.sheet.height], rect: [...frame.rect],
          logical: [...frame.logical], sourceFoot: [...frame.sourceFoot], fitBounds: [...frame.fitBounds], quality: request.quality, requestedDensity: request.density,
          effectiveDensity: density, rasterSize: [image.width, image.height], logicalFoot: [w / 2, h - anchor], visiblePixels: visible, maxDelta});
      }
    } finally { for (const material of Object.values(world)) { material.map?.dispose(); material.dispose(); } }
  }
  return {scope: 'supplementary real browser Canvas/world-material/combat-atlas PNG parity; not a gameplay screenshot or sustained performance claim', results};
}
