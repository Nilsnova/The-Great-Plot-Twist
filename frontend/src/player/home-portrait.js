import {Matrix4} from 'three';
import {cliffProfile} from '../art/coast-cliffs.js';
import {surfaces} from '../world/places/surfaces.js';
import {projectedCoastBounds} from '../world/projection.js';

const shore = projectedCoastBounds(cliffProfile(surfaces.home_islet));
// Include the raised rim and the tops of the taller landmarks above the playable shore.
const ISLAND_HEIGHT = shore.maxY - shore.minY + 4;
const MAX_PORTRAIT_DEPTH = 2.28;
const SHORE_MARGIN = 6;
const LANDSCAPE_BUILDING_EMPHASIS = .72;

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

export function portraitSpriteSize(mesh, depth, emphasis = depth > 1 ? 1 : 0) {
  return 1 + ((mesh.userData.portraitSize ?? 1) - 1) * emphasis;
}

function overviewFrame(camera, viewport) {
  if (!viewport || ![viewport.width, viewport.height, viewport.top, viewport.bottom].every(Number.isFinite)
      || viewport.width <= SHORE_MARGIN * 2 || viewport.height <= 0) return null;
  const free = 1 - (viewport.top + viewport.bottom) / viewport.height;
  if (free < .24) return null;
  const portrait = portraitIslandFrame(camera, viewport);
  const pivot = (viewport.bottom - viewport.top) / viewport.height;
  const strength = (portrait ? .24 : .23) * Math.min(1, free / .6);
  return {portrait, pivot, strength, limit: free * .84, widthGain: portrait ? .92 : .96};
}

// Compose the fixed ground map toward a vanishing point. The near shore grows relative to the
// far terraces, and the inverse projects input through the same lens back onto the original map.
function projectOverview(matrix, {pivot, strength, limit, widthGain}) {
  return matrix.set(
    widthGain, 0, 0, 0,
    0, 1 + pivot * strength, 0, strength * (limit * limit - pivot * pivot),
    0, 0, 1, 0,
    0, strength, 0, 1 - strength * pivot,
  );
}

export function createHomePortrait(camera) {
  let frame = null;
  let previous = null;
  const warp = new Matrix4();
  const updateProjection = camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix = () => {
    updateProjection();
    if (!frame) return;
    camera.projectionMatrix.premultiply(warp);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  const restored = [];
  return {
    update(viewport) {
      const next = overviewFrame(camera, viewport), lens = next?.portrait;
      const key = next ? [next.pivot, next.strength, next.limit, next.widthGain, lens?.width, lens?.height, lens?.offset].join() : null;
      if (key === previous) return;
      previous = key;
      frame = next;
      if (frame) projectOverview(warp, frame);
      if (lens) camera.setViewOffset(1, 1, (1 - lens.width) / 2, lens.offset, lens.width, lens.height);
      else camera.clearViewOffset();
      camera.userData.homePortraitDepth = lens ? lens.width / lens.height : 1;
      camera.userData.homeOverviewEmphasis = lens ? 1 : frame ? LANDSCAPE_BUILDING_EMPHASIS : 0;
    },
    draw(scene, render) {
      if (!frame) return render();
      const {homePortraitDepth: depth, homeOverviewEmphasis: emphasis} = camera.userData;
      try {
        scene.traverseVisible(object => {
          if (!object.isMesh || !object.userData.ground) return;
          const {scale, position, userData} = object;
          const size = portraitSpriteSize(object, depth, emphasis), base = userData.portraitFollows;
          if (size === 1 && depth === 1 && !base) return;
          restored.push(object, scale.x, scale.y, position.x, position.y);
          scale.x *= size;
          scale.y *= size / depth;
          if (base) {
            const reach = portraitSpriteSize(base, depth, emphasis);
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
