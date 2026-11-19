import {cliffProfile} from '../art/coast-cliffs.js';
import {surfaces} from '../world/places/surfaces.js';
import {projectedCoastBounds} from '../world/projection.js';

const shore = projectedCoastBounds(cliffProfile(surfaces.home_islet));
// Allow room for the raised shoreline, landmarks and pier beyond the playable surface.
const ISLAND_HEIGHT = shore.maxY - shore.minY + 5;
const MAX_PORTRAIT_DEPTH = 2.68;
const SHORE_MARGIN = 5;

export function usesPortraitVillage(viewport) {
  return Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height)
    && viewport.width > SHORE_MARGIN * 2 && viewport.height > 0 && viewport.width / viewport.height < .72;
}

export function portraitStructureScale(depth) {
  return depth > 1 ? 1.26 : 1;
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
        const depth = camera.userData.homePortraitDepth;
        scene.traverseVisible(object => {
          if (!object.isMesh || !object.userData.ground) return;
          const {portraitStructure, portraitLabelAnchor} = object.userData;
          const scale = portraitStructure || portraitLabelAnchor ? portraitStructureScale(depth) : 1;
          restored.push(object, object.scale.x, object.scale.y, object.position.x, object.position.y);
          object.scale.x *= scale;
          object.scale.y *= scale / depth;
          if (portraitLabelAnchor) {
            const {x,y} = portraitLabelAnchor;
            object.position.x = x + (object.position.x - x) * scale;
            object.position.y = y + (object.position.y - y) * scale / depth;
          }
        });
        return render();
      } finally {
        for (let i = 0; i < restored.length; i += 5) {
          const object = restored[i];
          object.scale.x = restored[i + 1];
          object.scale.y = restored[i + 2];
          object.position.x = restored[i + 3];
          object.position.y = restored[i + 4];
          object.updateMatrixWorld(true);
        }
        restored.length = 0;
      }
    },
  };
}
