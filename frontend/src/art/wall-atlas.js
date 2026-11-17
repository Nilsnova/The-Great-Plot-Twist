// One atlas for dimensional wall posts and surfaces. World owns its texture; combat borrows its atlas.
import {WALL_ATLAS_IDS} from './village/walls.js';
export function wallAtlasView(atlas, ownsTexture = false) {
  if (!atlas?.texture || !WALL_ATLAS_IDS.every(id => atlas.rects?.[id])) return null;
  return {texture: atlas.texture, width: atlas.width, height: atlas.height, rects: atlas.rects, ownsTexture};
}
export async function loadWallAtlas({quality = 'high', density} = {}) {
  const {cartoonAtlas, smoothTexture} = await import('./textures.js');
  const atlas = await cartoonAtlas(WALL_ATLAS_IDS, {width: 256, quality, ...(density ? {density} : {})});
  if (atlas.missing.length || !WALL_ATLAS_IDS.every(id => atlas.rects[id])) return null;
  return wallAtlasView({...atlas, texture: smoothTexture(atlas.image),
    width: atlas.image.width / atlas.density, height: atlas.image.height / atlas.density}, true);
}

/** Refresh the already-owned draft texture from the same normalized atlas post. */
export function wallPreviewCanvas(art, id = 'island-wall') {
  const frame = art.rects[id], density = art.texture.image.width / art.width;
  const canvas = document.createElement('canvas'); canvas.width = Math.round(frame.w * density); canvas.height = Math.round(frame.h * density);
  canvas.getContext('2d').drawImage(art.texture.image, Math.round(frame.x * density), Math.round(frame.y * density),
    canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
