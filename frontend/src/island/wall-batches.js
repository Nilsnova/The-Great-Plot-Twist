// Textured wall quads share existing depth layers. They remain decoration, not a second collider.
import {projectPoint} from '../world/art.js';
import {wallFrame, wallSurfaceFrame} from '../art/village/walls.js';
const UNIT = 16;
// The broad footing, recessed body and beveled crown give each low wall a solid profile.
// All three widths fit within the same 2×2 placement cell and share its original ground foot.
const HEIGHTS = [.85, .95, 1.10, 1.20, 1.30];
const BASE_HALF = .47, BODY_HALF = .38, CROWN_HALF = .28;
const PLINTH_HEIGHT = .20, BEVEL_HEIGHT = .13;
const CROWN_LIGHT = 1.09;
const POST_WIDTH = .60, POST_HEIGHT = .65;
const END = .84;
// The pale stone sheet starts another bright course at the bottom of the existing face samples.
const PALE_STONE_BASE_INSET = {front: 1 / 12, side: 1 / 16};
// Dark toe, lit exposed joint and broad satin crown give the upturned corner the same
// key light as its adjacent masonry face.
const HIGH_COURSES = {
  foot: [.77, .80, 1.03, 1.06],
  stone: [.87, .85, 1.29, 1.38],
  bevel: [.73, .74, .94, 1.02],
  crown: [.96, .81, .69, .82],
};
export function wallVisualRows(spots = []) {
  return spots.filter(row => row?.built === true && row.kind === 'wall' && typeof row.id === 'string'
    && Number.isFinite(row.x) && Number.isFinite(row.z)).map(row => ({id: row.id, x: row.x, z: row.z,
    level: Number.isSafeInteger(row.level) ? Math.max(1, Math.min(5, row.level)) : 1,
    look: row.broken || row.hp === 0 || row.health === 0 || row.look === 'broken' ? 'broken' : row.look === 'damaged' ? 'damaged' : 'intact'}))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function texturedWallBatches(links, posts, art, {selectedId = null, selectionOnly = false} = {}) {
  const filterId = selectionOnly ? selectedId : null;
  const layers = new Map();
  const layerAt = order => {
    if (!layers.has(order)) layers.set(order, {positions: [], ground: [], uvs: [], colors: [], indices: []});
    return layers.get(order);
  };
  function quad(layer, points, id, shade = 1, trim = [0, 1], light = null) {
    const frame = art.rects[id]; if (!frame) return;
    const first = layer.positions.length / 3;
    for (const [index, [x, y, groundX, groundZ]] of points.entries()) {
      const brightness = shade * (light?.[index] ?? 1);
      layer.positions.push(x, y, 0);
      layer.ground.push(groundX, groundZ);
      layer.colors.push(brightness, brightness * .982, brightness * .939);
    }
    const u0 = (frame.x + .5) / art.width, u1 = (frame.x + frame.w - .5) / art.width;
    const base = 1 - (frame.y + frame.h - .5) / art.height;
    const height = (frame.h - 1) / art.height;
    const v0 = base + height * trim[0];
    const v1 = trim[1] === 1 ? 1 - (frame.y + .5) / art.height : base + height * trim[1];
    layer.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    layer.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  function span(link, layer, showEnd = false) {
    const height = HEIGHTS[link.level - 1];
    const light = link.level >= 4 ? HIGH_COURSES : null;
    const vertical = link.x0 === link.x1;
    function ring(half, lift) {
      const x0 = Math.min(link.x0, link.x1) - (vertical ? half : 0);
      const x1 = Math.max(link.x0, link.x1) + (vertical ? half : 0);
      const z0 = Math.min(link.z0, link.z1) - (vertical ? 0 : half);
      const z1 = Math.max(link.z0, link.z1) + (vertical ? 0 : half);
      return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z]) => {
        const point = projectPoint(x, z);
        return [point.x, point.y + lift, x, z];
      });
    }
    const foot = ring(BASE_HALF, 0), shoulder = ring(BODY_HALF, PLINTH_HEIGHT);
    const lip = ring(BODY_HALF, height - BEVEL_HEIGHT), crown = ring(CROWN_HALF, height);
    function side(start, end, name, shade) {
      const id = wallSurfaceFrame(link.level, name);
      const inset = link.level === 2 ? PALE_STONE_BASE_INSET[name] : 0;
      const strip = (low, high) => [low[start], low[end], high[end], high[start]];
      quad(layer, strip(foot, shoulder), id, shade * .61, [inset, .32], light?.foot);
      quad(layer, strip(shoulder, lip), id, shade, [.32, 1], light?.stone);
      quad(layer, strip(lip, crown), wallSurfaceFrame(link.level, 'top'), shade * .92, undefined, light?.bevel);
    }
    // The positive X and Z faces are camera-facing under the village projection.
    if (!vertical || showEnd) side(3, 2, 'front', .94);
    if (vertical || showEnd) side(1, 2, 'side', .74);
    quad(layer, crown, wallSurfaceFrame(link.level, 'top'), CROWN_LIGHT, undefined, light?.crown);
  }
  const byId = new Map(posts.map(post => [post.id, post]));
  for (const link of links) {
    if (filterId !== null && link.a !== filterId && link.b !== filterId) continue;
    const layer = layerAt(100 + (link.z0 + link.z1) / 2 - .02);
    const [a, b] = [byId.get(link.a)?.level ?? link.level, byId.get(link.b)?.level ?? link.level];
    if (a === b) {
      span(link, layer);
      continue;
    }
    // Each purchased cell owns its half of a mixed run, including during combat.
    // Draw its height step only when the taller half faces the camera.
    const forward = link.x0 < link.x1 || link.z0 < link.z1;
    const from = forward ? {x: link.x0, z: link.z0, level: a} : {x: link.x1, z: link.z1, level: b};
    const to = forward ? {x: link.x1, z: link.z1, level: b} : {x: link.x0, z: link.z0, level: a};
    const x = (from.x + to.x) / 2, z = (from.z + to.z) / 2;
    span({x0: from.x, z0: from.z, x1: x, z1: z, level: from.level}, layer, from.level > to.level);
    span({x0: x, z0: z, x1: to.x, z1: to.z, level: to.level}, layer);
  }
  for (const post of posts) {
    if (filterId !== null && post.id !== filterId) continue;
    const id = wallFrame(post.level, post.look), frame = art.rects[id]; if (!frame) continue;
    const layer = layerAt(100 + post.z), neighbors = links.filter(link => link.a === post.id || link.b === post.id)
      .map(link => byId.get(link.a === post.id ? link.b : link.a));
    if (post.look !== 'broken' && neighbors.length < 2) {
      const neighbor = neighbors[0];
      // Free ends are inset and show a closed end grain or face rather than a thin open edge.
      const free = neighbor ? {
        x: post.x + END * (post.x-neighbor.x)/2, z: post.z + END * (post.z-neighbor.z)/2,
      } : {x: post.x + END, z: post.z};
      span({x0: neighbor ? post.x : post.x-END, z0: post.z, x1: free.x, z1: free.z, level: post.level},
        layer, free.x > post.x || free.z > post.z);
    }
    const straight = post.look === 'intact' && neighbors.length === 2 && neighbors.every(row => row.level === post.level)
      && neighbors[0].x + neighbors[1].x === post.x * 2 && neighbors[0].z + neighbors[1].z === post.z * 2;
    // Every third two-unit cell keeps a buttress. Coordinates survive reorder and renamed IDs.
    const buttress = straight && Math.floor((neighbors[0].x === neighbors[1].x ? post.z : post.x) / 2) % 3 === 0;
    if (straight && !buttress && post.id !== selectedId) {
      const height = HEIGHTS[post.level - 1];
      quad(layer, [[post.x-CROWN_HALF,post.z-CROWN_HALF],[post.x+CROWN_HALF,post.z-CROWN_HALF],
        [post.x+CROWN_HALF,post.z+CROWN_HALF],[post.x-CROWN_HALF,post.z+CROWN_HALF]]
        .map(([x,z]) => {const point=projectPoint(x,z);return [point.x,point.y+height+.02,x,z];}),
        wallSurfaceFrame(post.level,'top'), CROWN_LIGHT, undefined, post.level >= 4 ? HIGH_COURSES.crown : null);
      continue;
    }
    // Damage and selection never enlarge a post. Scale around its source foot,
    // including the transparent anchor margin, rather than lifting it off the tile.
    const point = projectPoint(post.x, post.z), width = frame.w / UNIT * POST_WIDTH;
    const bottom = point.y - frame.anchor / UNIT * POST_HEIGHT, top = bottom + frame.h / UNIT * POST_HEIGHT;
    if (post.id === selectedId) layer.selectedPost = layer.positions.length / 3;
    quad(layer, [[point.x-width/2,bottom],[point.x+width/2,bottom],[point.x+width/2,top],[point.x-width/2,top]]
      .map(([x,y]) => [x,y,post.x,post.z]), id);
  }
  return layers;
}
