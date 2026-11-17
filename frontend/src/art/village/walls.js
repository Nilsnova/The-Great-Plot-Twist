// Original approved wall artwork. Native sheet pixels never change the paid 2×2 ground footprint.
export const sheets = {
  wallPosts: {file: 'village/walls-posts-v1.png', width: 1536, height: 1024},
  wallSurfaces: {file: 'village/walls-surfaces-v1.png', width: 1536, height: 1024},
};
const rows = [[0, 370, 350], [370, 420, 364], [790, 234, 192]];
const feet = [166, 461, 764, 1064, 1358];
export const wallFrame = (level = 1, look = 'intact') =>
  `island-wall${level > 1 ? `-l${level}` : ''}${look === 'intact' ? '' : `-${look}`}`;
export const wallSurfaceFrame = (level, face) => `village-wall-${face}-l${level}`;
export const frames = {};
for (let level = 1; level <= 5; level++) {
  const left = Math.round((level - 1) * 1536 / 5), right = Math.round(level * 1536 / 5);
  ['intact', 'damaged', 'broken'].forEach((look, index) => {
    const [top, height, foot] = rows[index];
    frames[wallFrame(level, look)] = {sheet: 'wallPosts', rect: [left, top, right - left, height],
      logical: [48, 32, 6], sourceFoot: [feet[level - 1] - left, foot]};
  });
  // Square, fully opaque samples stay inside each authored cell; no neighboring tier can bleed in.
  for (const [face, top, size] of [['front', 95, 192], ['top', 405, 128], ['side', 735, 192]]) {
    frames[wallSurfaceFrame(level, face)] = {sheet: 'wallSurfaces',
      rect: [Math.round((left + right - size) / 2), top, size, size], logical: [32, 32, 0]};
  }
}
// Old consumers keep their generic damaged/ruin IDs; new renderers retain the actual tier.
frames['island-wall-damaged'] = {...frames[wallFrame(3, 'damaged')]};
frames['island-wall-broken'] = {...frames[wallFrame(3, 'broken')]};
export const WALL_POST_IDS = Array.from({length: 5}, (_, index) =>
  ['intact', 'damaged', 'broken'].map(look => wallFrame(index + 1, look))).flat();
export const WALL_SURFACE_IDS = Array.from({length: 5}, (_, index) =>
  ['front', 'top', 'side'].map(face => wallSurfaceFrame(index + 1, face))).flat();
export const WALL_ATLAS_IDS = [...WALL_POST_IDS, ...WALL_SURFACE_IDS];
