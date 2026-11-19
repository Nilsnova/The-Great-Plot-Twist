import {Box3, Vector3} from 'three';
import {projectGround} from '../projection.js';

const MASK_SIZE = 64, GRID_SIZE = 16, SOLID_ALPHA = 48, MIN_OVERLAP = 4;

function spriteBounds(mesh, depth) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);
  const box = new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  if (depth > 1 && mesh.userData.ground) {
    const foot = new Vector3().setFromMatrixPosition(mesh.matrixWorld);
    box.min.y = foot.y + (box.min.y - foot.y) / depth;
    box.max.y = foot.y + (box.max.y - foot.y) / depth;
  }
  return box;
}

// A wall post is one upright quad within a shared batch. Its first and opposite vertices
// bound the exact drawn post and the corresponding source crop, including damaged or rubble art.
function wallPost({mesh, firstVertex}, depth) {
  const {position, uv, wallGround} = mesh.geometry.attributes, opposite = firstVertex + 2;
  mesh.updateWorldMatrix(true, false);
  const vertex = index => {
    const corner = new Vector3().fromBufferAttribute(position, index);
    if (depth > 1 && wallGround) {
      const foot = projectGround(wallGround.getX(index), wallGround.getY(index));
      corner.y = foot.y + (corner.y - foot.y) / depth;
    }
    return corner;
  };
  const box = new Box3(vertex(firstVertex), vertex(opposite)).applyMatrix4(mesh.matrixWorld);
  return {box, crop: [uv.getX(firstVertex), uv.getY(firstVertex), uv.getX(opposite), uv.getY(opposite)]};
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
  let context, selected = null, treeScale, portraitDepth = 1;

  function maskFor(texture, crop) {
    const image = texture?.image;
    if (!image?.width || !image.height || typeof document === 'undefined') return null;
    let imageMasks = masks.get(image);
    if (!imageMasks) { imageMasks = new Map(); masks.set(image, imageMasks); }
    const key = crop ? crop.join(',') : '';
    if (imageMasks.has(key)) return imageMasks.get(key);
    let mask = null;
    try {
      if (!context) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = MASK_SIZE;
        context = canvas.getContext('2d', {willReadFrequently: true});
      }
      if (context) {
        context.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
        if (crop) {
          const [u0, v0, u1, v1] = crop, top = texture.flipY ? 1 - v1 : v0;
          context.drawImage(image, u0 * image.width, top * image.height,
            (u1 - u0) * image.width, (v1 - v0) * image.height, 0, 0, MASK_SIZE, MASK_SIZE);
        } else context.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
        mask = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
      }
    } catch {
      context = null;
    }
    imageMasks.set(key, mask);
    return mask;
  }

  return {
    has(tree) { return occluding.has(tree); },
    show(target, depth = 1) {
      // House growth multiplies every home tree's base scale by the same value.
      const scale = target ? trees[0]?.scale.x : undefined;
      if (target === selected && scale === treeScale && depth === portraitDepth) return false;
      selected = target;
      treeScale = scale;
      portraitDepth = depth;
      occluding.clear();
      const building = target?.mesh ?? target;
      if (!building?.visible) return true;
      const {box: bodyBox, crop} = target.mesh ? wallPost(target, depth) : {box: spriteBounds(building, depth)};
      for (const tree of trees) {
        if (!tree.visible || !drawsInFront(tree, building)) continue;
        const treeBox = spriteBounds(tree, depth);
        if (!treeBox.intersectsBox(bodyBox)) continue;
        const bodyMask = maskFor(building.material.map, crop), treeMask = maskFor(tree.material.map);
        if (bodyMask && treeMask && overlapsBody(tree, treeBox, treeMask, building, bodyBox, bodyMask)) occluding.add(tree);
      }
      return true;
    },
  };
}
