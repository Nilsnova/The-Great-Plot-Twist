import {Box3} from 'three';

const MASK_SIZE = 64, GRID_SIZE = 16, SOLID_ALPHA = 48, MIN_OVERLAP = 4;

function spriteBounds(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);
  return new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
}

function alphaAt(mask, texture, box, x, y) {
  if (x <= box.min.x || x >= box.max.x || y <= box.min.y || y >= box.max.y) return 0;
  const u = (x - box.min.x) / (box.max.x - box.min.x);
  const v = (y - box.min.y) / (box.max.y - box.min.y);
  const col = Math.floor(u * MASK_SIZE), row = Math.floor((texture.flipY ? 1 - v : v) * MASK_SIZE);
  return mask[(row * MASK_SIZE + col) * 4 + 3];
}

// These flat sprites share a painter group and depth. The renderer breaks ties by mesh id.
function drawsInFront(tree, building) {
  return tree.renderOrder > building.renderOrder ||
    (tree.renderOrder === building.renderOrder && tree.id > building.id);
}

// Check that a meaningful part of the building body lies behind filled canopy pixels.
// Sampling the resting sprite keeps the result stable through the tree's small wind shear.
function overlapsBody(tree, treeBox, treeMask, building, bodyBox, bodyMask) {
  const stepX = (bodyBox.max.x - bodyBox.min.x) / GRID_SIZE;
  const stepY = (bodyBox.max.y - bodyBox.min.y) / GRID_SIZE;
  let overlap = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    const y = bodyBox.min.y + (row + .5) * stepY;
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = bodyBox.min.x + (col + .5) * stepX;
      if (alphaAt(treeMask, tree.material.map, treeBox, x, y) < SOLID_ALPHA ||
        alphaAt(bodyMask, building.material.map, bodyBox, x, y) < SOLID_ALPHA) continue;
      if (++overlap >= MIN_OVERLAP) return true;
    }
  }
  return false;
}

export function makeSelectedCanopy(trees) {
  const masks = new WeakMap(), occluding = new Set();
  let context, selected = null, treeScale;

  function maskFor(mesh) {
    const image = mesh.material.map?.image;
    if (!image?.width || !image.height || typeof document === 'undefined') return null;
    if (masks.has(image)) return masks.get(image);
    let mask = null;
    try {
      if (!context) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = MASK_SIZE;
        context = canvas.getContext('2d', {willReadFrequently: true});
      }
      if (context) {
        context.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
        context.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
        mask = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
      }
    } catch {
      context = null;
    }
    masks.set(image, mask);
    return mask;
  }

  return {
    has(tree) { return occluding.has(tree); },
    show(building) {
      // House growth multiplies every home tree's base scale by the same value.
      const scale = building ? trees[0]?.scale.x : undefined;
      if (building === selected && scale === treeScale) return false;
      selected = building;
      treeScale = scale;
      occluding.clear();
      if (!building?.visible) return true;
      const bodyBox = spriteBounds(building);
      for (const tree of trees) {
        if (!tree.visible || !drawsInFront(tree, building)) continue;
        const treeBox = spriteBounds(tree);
        if (!treeBox.intersectsBox(bodyBox)) continue;
        const bodyMask = maskFor(building), treeMask = maskFor(tree);
        if (bodyMask && treeMask && overlapsBody(tree, treeBox, treeMask, building, bodyBox, bodyMask)) occluding.add(tree);
      }
      return true;
    },
  };
}
