import * as THREE from 'three';
import {smoothTexture, spriteMaterial} from '../../art/textures.js';
import {artSizes} from '../art.js';
import {projectGround} from '../projection.js';

// Low planting beds on the grass beside the existing walks. Keep their entrances and
// the center of the village open. Each row gives the shrub foot, the side of its
// understory, the shrub scale and the understory art.
const BEDS = [
  [-8.27, -11.41, -1, .74, 'flowers'], [-2.93, -10.83, 1, .61, 'grass-tuft'],
  [5.65, -12.48, -1, .76, 'grass-tuft'], [10.68, -10.98, 1, .69, 'flowers'],
  [-10.75, -6.92, -1, .74, 'grass-tuft'], [-5.50, -6.88, 1, .61, 'flowers'],
  [4.47, -6.81, -1, .63, 'flowers'], [9.69, -6.98, 1, .78, 'grass-tuft'],
  [-4.80, 1.45, -1, .66, 'grass-tuft'], [3.52, 1.60, 1, .84, 'flowers'],
  [-10.95, 5.54, -1, .72, 'flowers'], [-5.37, 5.46, 1, .62, 'grass-tuft'],
  [10.66, 6.31, -1, .68, 'grass-tuft'], [10.54, 11.59, 1, .74, 'flowers'],
];
const ART = ['shrub', 'flowers', 'grass-tuft'];
const TREE_ART = ['oak', 'pine', 'birch'];
const HOME_FOLIAGE = [...ART, ...TREE_ART];

function leafTexture(canvas, sampling = {}) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const {width, height} = canvas;
  const {data: source} = context.getImageData(0, 0, width, height);
  const data = new Uint8Array(source.length), stride = width * 4;
  // Associate colour with the original alpha before upload. This avoids a bright fringe
  // when the browser converts a transparent canvas to a premultiplied WebGL texture.
  // Typed textures use bottom-up rows, matching the existing garden UVs.
  for (let y = 0; y < height; y++) {
    const row = y * stride, flipped = (height - y - 1) * stride;
    for (let x = 0; x < stride; x += 4) {
      const from = row + x, to = flipped + x, opacity = source[from + 3] / 255;
      data[to] = Math.round(source[from] * opacity);
      data[to + 1] = Math.round(source[from + 1] * opacity);
      data[to + 2] = Math.round(source[from + 2] * opacity);
      data[to + 3] = source[from + 3];
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = sampling.colorSpace ?? THREE.SRGBColorSpace;
  texture.magFilter = sampling.magFilter ?? THREE.LinearFilter;
  texture.minFilter = sampling.minFilter ?? THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = sampling.generateMipmaps ?? true;
  texture.anisotropy = sampling.anisotropy ?? 4;
  if (sampling.userData) texture.userData = sampling.userData;
  texture.needsUpdate = true;
  return texture;
}

// Only Home leaf sprites use the explicit upload. Replace the original local texture
// before it can be rendered, after its canvas has served the garden atlas.
export function prepareHomeFoliage(art, preserveMask) {
  for (const id of HOME_FOLIAGE) {
    const material = art[id], original = material?.map;
    if (!original?.isCanvasTexture || !original.premultiplyAlpha || !original.image?.getContext) continue;
    const texture = leafTexture(original.image, original);
    if (!texture) continue;
    if (TREE_ART.includes(id)) preserveMask?.(texture, original);
    material.map = texture;
    original.dispose();
  }
}

// Reuse the decoded scenery sprites so all beds share one draw call.
function packGardenArt(sources) {
  const atlas = document.createElement('canvas'), padding = 8;
  atlas.width = padding + sources.reduce((width, source) => width + source.width + padding, 0);
  atlas.height = Math.max(...sources.map(source => source.height)) + 2 * padding;
  const context = atlas.getContext('2d');
  if (!context) return null;
  const rectangles = {};
  let x = padding;
  for (const [index, source] of sources.entries()) {
    context.drawImage(source, x, padding);
    rectangles[ART[index]] = [
      x / atlas.width, 1 - (padding + source.height) / atlas.height,
      (x + source.width) / atlas.width, 1 - padding / atlas.height,
    ];
    x += source.width + padding;
  }
  return {atlas, rectangles};
}

export function createHomeGardens(root, art) {
  if (typeof document === 'undefined') return;
  const sources = ART.map(id => art[id]?.map?.image);
  if (sources.some(source => !source?.width || !source?.height)) return;
  const packed = packGardenArt(sources);
  if (!packed) return;

  const plants = BEDS.flatMap(([x, z, side, scale, understory]) => [
    {id: 'shrub', x, z, scale},
    {id: 'shrub', x: x + .57 * side, z: z + .3, scale: scale * .68},
    {id: understory, x: x + .87 * side, z: z + .75, scale: scale * .78},
  ]).sort((a, b) => a.z - b.z);
  const vertices = [], indices = [], uv = [], feet = [];
  for (const {id, x, z, scale} of plants) {
    const [width, height, anchor] = artSizes[id], foot = projectGround(x, z);
    const half = width * scale * .5, bottom = foot.y - height * scale * anchor;
    const top = bottom + height * scale, first = vertices.length / 3;
    const [left, low, right, high] = packed.rectangles[id];
    feet.push(foot.y);
    vertices.push(foot.x - half, bottom, 0, foot.x + half, bottom, 0,
      foot.x + half, top, 0, foot.x - half, top, 0);
    uv.push(left, low, right, low, right, high, left, high);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, spriteMaterial(leafTexture(packed.atlas) ?? smoothTexture(packed.atlas)));
  mesh.name = 'home-village-gardens';
  mesh.renderOrder = 22; // Above ground finishes, behind buildings, wall previews and actors.
  mesh.raycast = () => {};
  let previousDepth = 1;
  mesh.onBeforeRender = (_, _scene, camera) => {
    const depth = camera.userData.homePortraitDepth ?? 1;
    if (depth === previousDepth) return;
    for (let i = 0; i < position.count; i++) {
      const foot = feet[Math.floor(i / 4)];
      position.setY(i, foot + (vertices[i * 3 + 1] - foot) / depth);
    }
    position.needsUpdate = true;
    previousDepth = depth;
  };
  root.add(mesh);
}
