// Cartoon drawings as Three.js textures: rasterised once per frame name at the device's density,
// smooth (linear, mipmapped), premultiplied alpha, cached. The density follows the screen: about as
// many texels per logical pixel as the frame shows device pixels at the camera's closest zoom,
// capped (high 4, low 2) and fitted to a memory budget, so a phone never holds a giant atlas.
import * as THREE from 'three';
import {paint} from './paint.js';
import {islandFrame, framesFor} from './registry.js';
import {NO_OUTLINE} from './island.js';

const CAP = {high: 4, low: 2};
// Logical px per screen height at zoom 1 (the camera frames about 20 units = 320 logical px).
const VIEW_LOGICAL_ROWS = 320, VIEW_LOGICAL_COLUMNS = 256;
export const ATLAS_BUDGET = {high: 40 * 2 ** 20, low: 12 * 2 ** 20};

/** Texels per logical px for this screen: pure, from the window size, the device ratio and quality. */
export function artDensity({width = 1280, height = 800, pixelRatio = 1, quality = 'high'} = {}) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const shown = Math.max(height * ratio / VIEW_LOGICAL_ROWS, Math.min(height, width) * ratio / VIEW_LOGICAL_COLUMNS * .6);
  const cap = CAP[quality] ?? CAP.high;
  return Math.max(1.5, Math.min(cap, Math.ceil(shown * 2) / 2));
}
/** The density that fits an area of logical px² (with mipmaps, RGBA) inside budget bytes. */
export function fitDensity(area, wanted, budget) {
  const most = Math.sqrt(budget / (Math.max(1, area) * 4 * 4 / 3));
  return Math.max(1, Math.min(wanted, Math.floor(most * 4) / 4));
}
export function screenDensity(quality = 'high') {
  if (typeof window === 'undefined') return 2;
  return artDensity({width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1, quality});
}

/** A smooth texture from a painted canvas: linear, mipmapped, premultiplied, sRGB. */
export function smoothTexture(image) {
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace; texture.premultiplyAlpha = true;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4;
  return texture;
}
// Materials for premultiplied textures: the blend is ONE / ONE_MINUS_SRC_ALPHA (three's premultiplied
// mode), and opacity scales the colour too, so a faded tree stays a faded tree.
export function premultiply(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>', 'gl_FragColor.rgb *= opacity;');
}
// A class, so a clone (a fading captain, a swaying tree) keeps the premultiplied program.
class CartoonMaterial extends THREE.MeshBasicMaterial {
  onBeforeCompile(shader) { premultiply(shader); }
  customProgramCacheKey() { return 'cartoon-sprite'; }
}
export function spriteMaterial(texture) {
  const material = new CartoonMaterial({map: texture, transparent: true, premultipliedAlpha: true,
    depthTest: false, depthWrite: false, toneMapped: false});
  material.userData.cartoon = true;
  return material;
}
const options = (name, frame) => ({outline: NO_OUTLINE.has(name) ? 0 : frame?.[4]?.outline ?? .9});
/** Paints one frame (an island frame synchronously, or a frame already resolved) to a canvas. */
export function frameCanvas(name, density = screenDensity(), frame = islandFrame(name)) {
  if (!frame) return null;
  return paint(frame[3], [frame[0], frame[1]], density, options(name, frame));
}

/**
 * Lazy materials: an object with a material for every cartoon name, painted on first use (so ten
 * captain colours cost nothing until a captain wears one). Object.hasOwn and `in` see every name;
 * Object.values sees only what was painted (what a place's lifetime has to dispose).
 */
export function lazyMaterials(names, density = screenDensity()) {
  const known = new Set(names.filter(name => islandFrame(name))), target = {};
  const make = name => {
    if (!Object.hasOwn(target, name) && known.has(name)) target[name] = spriteMaterial(smoothTexture(frameCanvas(name, density)));
    return target[name];
  };
  return new Proxy(target, {
    get: (object, key) => (typeof key === 'string' && known.has(key) ? make(key) : object[key]),
    has: (object, key) => known.has(key) || key in object,
    getOwnPropertyDescriptor: (object, key) => { if (typeof key === 'string' && known.has(key)) make(key); return Reflect.getOwnPropertyDescriptor(object, key); },
  });
}

/**
 * Packs frames into one atlas canvas (shelves, tallest first) at a density that fits the budget.
 * rects are in logical px (x, y, w, h, anchor), the canvas in texels: texel = logical × density.
 */
export async function cartoonAtlas(ids, {width = 640, pad = 3, quality = 'high', density = screenDensity(quality), extra = []} = {}) {
  const frames = await framesFor(ids);
  const items = [...ids.filter(id => frames[id]).map(id => [id, frames[id][0], frames[id][1], frames[id][2]]), ...extra.map(([id, w, h]) => [id, w, h, 0])];
  items.sort((a, b) => b[2] - a[2]);
  const rects = {};
  let x = pad, y = pad, shelf = 0;
  for (const [id, w, h, anchor] of items) {
    if (x + w + pad > width) { x = pad; y += shelf + pad; shelf = 0; }
    rects[id] = {x, y, w, h, anchor}; x += w + pad; shelf = Math.max(shelf, h);
  }
  const height = y + shelf + pad, scale = fitDensity(width * height, density, ATLAS_BUDGET[quality] ?? ATLAS_BUDGET.high);
  const image = document.createElement('canvas'); image.width = Math.ceil(width * scale); image.height = Math.ceil(height * scale);
  const context = image.getContext('2d');
  for (const id of ids) {
    const frame = frames[id], r = rects[id]; if (!frame) continue;
    context.drawImage(paint(frame[3], [frame[0], frame[1]], scale, options(id, frame)), Math.round(r.x * scale), Math.round(r.y * scale));
  }
  return {image, width, height, density: scale, rects, missing: ids.filter(id => !frames[id])};
}
