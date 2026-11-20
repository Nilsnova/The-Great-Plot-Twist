import * as THREE from 'three';
import {smoothTexture, spriteMaterial} from '../../art/textures.js';
import {artSizes} from '../art.js';
import {projectGround} from '../projection.js';

// Low planting beds on the grass beside the existing walks. Keep their entrances and
// the center of the village open. Each row gives the shrub foot, the side of its
// understory, the shrub scale and the understory art. The bell bed's flower sits
// behind the raised terrace on the original meadow.
const BEDS = [
  [-8.27, -11.41, -1, .74, 'flowers'], [-2.93, -10.83, 1, .61, 'grass-tuft'],
  [5.65, -12.48, -1, .76, 'grass-tuft'], [10.68, -10.98, 1, .69, 'flowers'],
  [-10.75, -6.92, -1, .74, 'grass-tuft'], [-5.50, -6.88, 1, .61, 'flowers'],
  [4.47, -6.81, -1, .63, 'flowers'], [9.69, -6.98, 1, .78, 'grass-tuft'],
  [-4.80, 1.45, -1, .66, 'grass-tuft'], [3.52, 1.60, 1, .84, 'flowers'],
  [-10.95, 5.54, -1, .72, 'flowers'], [-5.37, 5.46, 1, .62, 'grass-tuft'],
  [10.66, 6.31, -1, .68, 'grass-tuft'], [10.54, 11.59, 1, .74, 'flowers'],
  [-12.28, 1.63, -1, .73, 'grass-tuft'], [11.56, .87, 1, .71, 'flowers'],
  [-6.02, 11.39, -1, .67, 'grass-tuft'], [6.91, 15.37, 1, .76, 'flowers', true],
];
const ART = ['shrub', 'flowers', 'grass-tuft'];
const GARDEN_ART = [...ART, 'rock', 'home-broadleaf'];
const TREE_ART = ['oak', 'pine', 'birch'];
const HOME_FOLIAGE = [...ART, ...TREE_ART];
const STONE_BEDS = new Set([0, 3, 4, 8, 10, 13]);
const BROADLEAF_BEDS = new Set([1, 3, 5, 7, 9, 12, 14, 15, 16, 17]);
// Low extensions on the lawn side of the existing beds. Each offsets from its bed's
// original foot, away from the path or doorway. Keep the middle of each yard clear.
const BED_EDGES = [
  [0, -.63, -.64, .58, 'flowers'], [1, .70, -.42, .55, 'grass-tuft'],
  [2, -.63, -.43, .63, 'flowers'], [3, .66, -.53, .57, 'grass-tuft'],
  [4, -.66, -.48, .60, 'flowers'], [5, 1.22, -2.15, .53, 'grass-tuft'],
  [6, -.68, -.53, .58, 'grass-tuft'], [9, .68, -.47, .54, 'flowers'],
  [10, -.71, -.57, .59, 'flowers'], [11, .64, -.53, .58, 'grass-tuft'],
  [12, .58, -.49, .52, 'grass-tuft'], [13, .63, -.55, .59, 'flowers'],
  [16, -.67, .38, .60, 'flowers'],
];
// These are light multipliers in the same corner order as the sprite quads.
const GARDEN_LIGHT = [
  .83, .88, .84, .76, .81, .79,
  1.09, 1.065, .976, 1.20, 1.15, .99,
];

const SHADED_LEAVES = [
  .67, .79, .71, .63, .74, .71,
  .91, .97, .83, 1.04, 1.07, .86,
];
const SUNLIT_LEAVES = [
  .83, .88, .75, .78, .86, .70,
  1.16, 1.14, .88, 1.23, 1.20, .91,
];

const CANOPY = {
  oak: {crownEnd: .73, roots: .78},
  pine: {crownEnd: .82, roots: .80},
  birch: {crownEnd: .64, roots: .75},
};

function paintCanopy(source, width, height, {crownEnd, roots}) {
  const smooth = THREE.MathUtils.smoothstep;
  const values = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) {
    const p = i * 4;
    values[i] = (source[p] * 54 + source[p + 1] * 183 + source[p + 2] * 19) / 256;
  }
  const step = Math.max(1, Math.round(width * .012));
  const diagonal = step * (width + 1);
  for (let y = 0, i = 0; y < height; y++) {
    const down = (y + .5) / height;
    const crown = 1 - smooth(down, crownEnd - .09, crownEnd + .10);
    const foot = smooth(down, roots, .94);
    for (let x = 0; x < width; x++, i += 4) {
      if (!source[i + 3]) continue;
      const across = (x + .5) / width, r = source[i], g = source[i + 1], b = source[i + 2];
      // Golden leaf tips remain part of the canopy. Bark and berries keep their own material.
      const leaf = crown * smooth(g - r, -14, 29) * smooth(g - b, 11, 52);
      const bark = smooth(r - g, 15, 55) * smooth(g - b, 8, 38);
      const px = i >> 2, value = values[px];
      const key = 1 - smooth(.68 * across + .57 * down, .20, .68);
      const under = smooth(.53 * across + .68 * down, .29, .72);
      const upperLeaf = leaf * key * smooth(value, 73, 168);
      const leeLeaf = leaf * under;
      const amberTint = upperLeaf * smooth(r, 147, 218);
      const face = x >= step && x + step < width && y >= step && y + step < height
        && source[(px - diagonal) * 4 + 3] > 195 && source[(px + diagonal) * 4 + 3] > 195;
      // Broad reflected light follows the existing leaf and bark grain into the smaller mip levels.
      const grain = face ? (values[px + diagonal] - values[px - diagonal]) / 255 : 0;
      const shadow = 1 + .14 * upperLeaf - .48 * leeLeaf + grain * (.50 * leaf + .34 * bark);
      // Tint the existing root grain with grass bounce and quiet the dry orange at ground level.
      const ground = foot * bark;
      const moss = ground * smooth(g - b, 17, 53) * (1 - smooth(value, 90, 162));
      source[i] = r * shadow + 10 * upperLeaf - 15 * amberTint - 29 * ground;
      source[i + 1] = g * shadow + 12 * upperLeaf + 13 * moss - 8 * ground;
      source[i + 2] = b * shadow + 17 * leeLeaf + 11 * ground + 5 * moss;
    }
  }
}

function leafTexture(canvas, sampling = {}, canopy) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const {width, height} = canvas;
  const {data: source} = context.getImageData(0, 0, width, height);
  if (canopy) paintCanopy(source, width, height, canopy);
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
    const texture = leafTexture(original.image, original, CANOPY[id]);
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
    rectangles[GARDEN_ART[index]] = [
      x / atlas.width, 1 - (padding + source.height) / atlas.height,
      (x + source.width) / atlas.width, 1 - padding / atlas.height,
    ];
    x += source.width + padding;
  }
  return {atlas, rectangles};
}

function gardenPlants() {
  return BEDS.flatMap(([x, z, side, scale, understory, behindTerrace], index) => {
    const stone = STONE_BEDS.has(index);
    const broadleaf = BROADLEAF_BEDS.has(index);
    const plants = [
      {id: broadleaf ? 'home-broadleaf' : 'shrub', x, z, scale},
      {id: 'shrub', x: x - .53 * side, z: z - .17, scale: scale * .67},
      {id: stone ? 'rock' : 'shrub', x: x + .54 * side, z: z + .26, scale: scale * (stone ? .41 : .56)},
      {id: understory, x: x + .58 * side, z: z + .52, scale: scale * .81, behindTerrace},
    ];
    if (broadleaf && !behindTerrace) {
      // Keep the original anchor and frame the shaded leaves with short stems at its foot.
      const undergrowth = index % 3 === 0 ? 'flowers' : 'grass-tuft';
      plants.push({id: undergrowth, x: x - .28 * side, z: z + .37, scale: scale * .58});
    }
    return plants;
  });
}

function addGardenLayer(root, plants, rectangles, material, name, renderOrder) {
  const vertices = [], indices = [], uv = [], feet = [], colors = [];
  for (const {id, x, z, scale, light = GARDEN_LIGHT} of plants) {
    const [width, height, anchor] = artSizes[id], foot = projectGround(x, z);
    const half = width * scale * .5, bottom = foot.y - height * scale * anchor;
    const top = bottom + height * scale, first = vertices.length / 3;
    const [left, low, right, high] = rectangles[id];
    feet.push(foot.y);
    vertices.push(foot.x - half, bottom, 0, foot.x + half, bottom, 0,
      foot.x + half, top, 0, foot.x - half, top, 0);
    uv.push(left, low, right, low, right, high, left, high);
    colors.push(...light);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;
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

export function createHomeGardens(root, art) {
  if (typeof document === 'undefined') return [];
  const sources = GARDEN_ART.map(id => art[id]?.map?.image);
  if (sources.some(source => !source?.width || !source?.height)) return [];
  const packed = packGardenArt(sources);
  if (!packed) return [];

  const material = spriteMaterial(leafTexture(packed.atlas) ?? smoothTexture(packed.atlas));
  material.vertexColors = true;
  const edges = BED_EDGES.map(([bed, across, back, scale, understory]) => {
    const [baseX, baseZ] = BEDS[bed];
    return {x: baseX + across, z: baseZ + back, side: Math.sign(across), scale, understory};
  });
  const underplanting = edges.flatMap(({x, z, side, scale, understory}) => [
    {id: 'home-broadleaf', x, z, scale, light: SHADED_LEAVES},
    {id: 'shrub', x: x - .28 * side, z: z + .24, scale: scale * .74, light: SUNLIT_LEAVES},
    {id: understory, x: x + .40 * side, z: z + .26, scale: scale * .72},
  ]);
  const plants = [...gardenPlants(), ...underplanting].sort((a, b) => a.z - b.z);
  // The raised bank occludes the flower at its original meadow position.
  addGardenLayer(root, plants.filter(plant => plant.behindTerrace), packed.rectangles, material, 'home-under-terrace-garden', 4.65);
  addGardenLayer(root, plants.filter(plant => !plant.behindTerrace), packed.rectangles, material, 'home-village-gardens', 22);
  return [
    ...BEDS.map(([x, z, , scale]) => ({x, z, width: scale * 1.07, depth: scale * .51,
      reach: scale * .48, opacity: .56})),
    ...edges.map(({x, z, scale}) => ({x, z, width: scale * 1.04, depth: scale * .49,
      reach: scale * .36, opacity: .43})),
  ];
}
