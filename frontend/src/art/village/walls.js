// Original approved wall artwork. Native sheet pixels never change the paid 2×2 ground footprint.
export const sheets = {
  wallPosts: {file: 'village/walls-posts-v1.png', width: 1536, height: 1024},
  wallSurfaces: {file: 'village/walls-surfaces-v1.png', width: 1536, height: 1024},
};
// Tight authored crops retain four pixels around the visible artwork and the real foot.
// Common per-level extents keep damaged posts and shorter ruins at the intact scale.
const crops = [
  [[78,54,176,300],[51,425,223,313],[45,869,233,117]],
  [[364,93,196,261],[354,462,213,276],[351,875,216,111]],
  [[670,39,189,315],[646,407,232,331],[640,854,239,132]],
  [[973,50,182,304],[948,419,224,319],[944,860,236,126]],
  [[1258,27,200,327],[1237,397,241,341],[1233,841,242,145]],
];
const fitting = [[121,309,112,4],[110,272,106,4],[124,327,115,4],[120,315,116,4],[125,337,120,4]];
const rowFeet = [350,734,982];
const feet = [166, 461, 764, 1064, 1358];
export const wallFrame = (level = 1, look = 'intact') =>
  // Generic damaged/broken IDs are legacy L3 aliases, so L1 damage needs an explicit tier.
  `island-wall${level > 1 || look !== 'intact' ? `-l${level}` : ''}${look === 'intact' ? '' : `-${look}`}`;
export const wallSurfaceFrame = (level, face) => `village-wall-${face}-l${level}`;
export const frames = {};
for (let level = 1; level <= 5; level++) {
  const left = Math.round((level - 1) * 1536 / 5), right = Math.round(level * 1536 / 5);
  ['intact', 'damaged', 'broken'].forEach((look, index) => {
    const rect = crops[level - 1][index];
    frames[wallFrame(level, look)] = {sheet: 'wallPosts', rect,
      logical: [48, 48, 6], sourceFoot: [feet[level - 1] - rect[0], rowFeet[index] - rect[1]],
      fitBounds: fitting[level - 1]};
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
