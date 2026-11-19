import {cliffProfile} from '../art/coast-cliffs.js';
import {surfaces} from '../world/places/surfaces.js';
import {projectedCoastBounds} from '../world/projection.js';

const shore = projectedCoastBounds(cliffProfile(surfaces.home_islet));
// Include the raised rim and the tops of the taller landmarks above the playable shore.
const ISLAND_HEIGHT = shore.maxY - shore.minY + 4;
const MAX_PORTRAIT_DEPTH = 1.92;
const SHORE_MARGIN = 6;

export function portraitIslandFrame(camera, viewport) {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
      || viewport.width <= SHORE_MARGIN * 2 || viewport.height <= 0 || viewport.width / viewport.height >= .72) return null;
  const top = Math.max(0, viewport.top) / viewport.height;
  const bottom = Math.max(0, viewport.bottom) / viewport.height;
  const available = (1 - top - bottom) * (camera.top - camera.bottom);
  const factor = Math.min(MAX_PORTRAIT_DEPTH, available / (camera.zoom * ISLAND_HEIGHT));
  if (!(factor > 1.015)) return null;
  const height = 1 / factor, width = viewport.width / (viewport.width - SHORE_MARGIN * 2);
  return {width, height, offset: (1 + top - bottom) * (1 - height) / 2};
}

// A view offset changes both projection and unprojection. Upright sprites keep their authored
// proportions at their projected feet; only the spacing across the ground grows in portrait Fit.
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
          object.scale.y *= frame.height / frame.width;
        });
        return render();
      } finally {
        for (let i = 0; i < restored.length; i += 2) {
          restored[i].scale.y = restored[i + 1];
          restored[i].updateMatrix();
        }
        restored.length = 0;
      }
    },
  };
}
