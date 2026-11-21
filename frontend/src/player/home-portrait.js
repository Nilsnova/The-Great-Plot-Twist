import {cliffProfile} from '../art/coast-cliffs.js';
import {surfaces} from '../world/places/surfaces.js';
import {projectedCoastBounds} from '../world/projection.js';

const shore = projectedCoastBounds(cliffProfile(surfaces.home_islet));
// Allow room for the raised shoreline, landmarks and pier beyond the playable surface.
const ISLAND_HEIGHT = shore.maxY - shore.minY + 5;
const MAX_PORTRAIT_DEPTH = 2.55;
const SHORE_MARGIN = 5;

export function usesPortraitVillage(viewport) {
  // Include short phone viewports that still use the compact village controls.
  return Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height)
    && viewport.width > SHORE_MARGIN * 2 && viewport.height > 0 && viewport.width / viewport.height < .8;
}

export function portraitIslandFrame(camera, viewport) {
  if (!usesPortraitVillage(viewport) || !Number.isFinite(viewport.top) || !Number.isFinite(viewport.bottom)) return null;
  const top = Math.max(0, viewport.top) / viewport.height;
  const bottom = Math.max(0, viewport.bottom) / viewport.height;
  const available = (1 - top - bottom) * (camera.top - camera.bottom);
  const depth = Math.min(MAX_PORTRAIT_DEPTH, available / (camera.zoom * ISLAND_HEIGHT));
  if (!(depth > 1.015)) return null;
  const height = 1 / depth;
  const width = viewport.width / (viewport.width - SHORE_MARGIN * 2);
  return {width, height, offset: (1 + top - bottom) * (1 - height) / 2};
}

// Three updates both matrices for a view offset, so taps still map to the same logical ground.
// Keep upright artwork proportional around its feet while rows of terrain gain depth.
export function createHomePortrait(camera) {
  let frame = null;
  const restored = [];
  return {
    update(viewport) {
      const next = portraitIslandFrame(camera, viewport);
      if (next?.width === frame?.width && next?.height === frame?.height && next?.offset === frame?.offset) return;
      if (next) camera.setViewOffset(1, 1, (1 - next.width) / 2, next.offset, next.width, next.height);
      else camera.clearViewOffset();
      frame = next;
      camera.userData.homePortraitDepth = frame ? frame.width / frame.height : 1;
    },
    draw(scene, render) {
      if (!frame) return render();
      try {
        scene.traverseVisible(object => {
          if (!object.isMesh || !object.userData.ground) return;
          restored.push(object, object.scale.y);
          object.scale.y /= camera.userData.homePortraitDepth;
        });
        return render();
      } finally {
        for (let i = 0; i < restored.length; i += 2) {
          const object = restored[i];
          object.scale.y = restored[i + 1];
          object.updateMatrixWorld(true);
        }
        restored.length = 0;
      }
    },
  };
}
