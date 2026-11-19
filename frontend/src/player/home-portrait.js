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

export function portraitSpriteSize(mesh, depth) {
  return depth > 1 ? mesh.userData.portraitSize ?? 1 : 1;
}

// A view offset changes both projection and unprojection. Upright sprites keep their authored
// proportions at their projected feet. Key buildings can also read larger in the overview.
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
      const depth = camera.userData.homePortraitDepth;
      try {
        scene.traverseVisible(object => {
          if (!object.isMesh || !object.userData.ground) return;
          const {scale, position, userData} = object;
          restored.push(object, scale.x, scale.y, position.x, position.y);
          const size = portraitSpriteSize(object, depth);
          scale.x *= size;
          scale.y *= size / depth;
          const base = userData.portraitFollows;
          if (base) {
            const reach = portraitSpriteSize(base, depth);
            position.x = base.position.x + (position.x - base.position.x) * reach;
            position.y = base.position.y + (position.y - base.position.y) * reach / depth;
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
          object.updateMatrix();
        }
        restored.length = 0;
      }
    },
  };
}
