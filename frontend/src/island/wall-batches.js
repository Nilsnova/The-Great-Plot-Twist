// Textured wall quads share existing depth layers. They remain decoration, not a second collider.
import {projectPoint} from '../world/art.js';
import {wallFrame, wallSurfaceFrame} from '../art/village/walls.js';
const UNIT = 16;
// Low walls frame the village without hiding its defenses. Artwork alone is scaled;
// the paid 2×2 cells, real contacts and authoritative ground feet stay unchanged.
// The tallest cap is 1.30+.6*.28+.02=1.488, below the scaled L5 solid post top.
const HEIGHTS = [.85, .95, 1.10, 1.20, 1.30], HALF = .28;
const POST_WIDTH = .60, POST_HEIGHT = .65;
const END = .84;
// The pale stone sheet starts another bright course at the bottom of the existing face samples.
const PALE_STONE_BASE_INSET = {front: 1 / 12, side: 1 / 16};
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
    if (!layers.has(order)) layers.set(order, {positions: [], uvs: [], indices: []});
    return layers.get(order);
  };
  function quad(layer, points, id, baseInset = 0) {
    const frame = art.rects[id]; if (!frame) return;
    const first = layer.positions.length / 3;
    for (const [x, y] of points) layer.positions.push(x, y, 0);
    const u0 = (frame.x + .5) / art.width, u1 = (frame.x + frame.w - .5) / art.width;
    const v1 = 1 - (frame.y + .5) / art.height;
    const v0 = 1 - (frame.y + frame.h - .5) / art.height + (frame.h - 1) * baseInset / art.height;
    layer.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    layer.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  function span(link, layer) {
    const height = HEIGHTS[link.level - 1];
    const vertical = link.x0 === link.x1, half = HALF;
    const x0 = Math.min(link.x0, link.x1) - (vertical ? half : 0), x1 = Math.max(link.x0, link.x1) + (vertical ? half : 0);
    const z0 = Math.min(link.z0, link.z1) - (vertical ? 0 : half), z1 = Math.max(link.z0, link.z1) + (vertical ? 0 : half);
    const face = (points, lift, name) => quad(layer, points.map(([x, z, raised = lift]) => {
      const point = projectPoint(x, z); return [point.x, point.y + raised];
    }), wallSurfaceFrame(link.level, name), link.level === 2 ? PALE_STONE_BASE_INSET[name] : 0);
    face([[x0,z0],[x1,z0],[x1,z1],[x0,z1]], height, 'top');
    face([[x0,z1,0],[x1,z1,0],[x1,z1,height],[x0,z1,height]], 0, 'front');
    face([[x1,z0,0],[x1,z1,0],[x1,z1,height],[x1,z0,height]], 0, 'side');
    // Reuse the fourth face for upright cap trim, along the longer visible side.
    face(vertical
      ? [[x1,z0,height-.14],[x1,z1,height-.14],[x1,z1,height+.01],[x1,z0,height+.01]]
      : [[x0,z1,height-.14],[x1,z1,height-.14],[x1,z1,height+.01],[x0,z1,height+.01]], 0, 'top');
  }
  for (const link of links) if (filterId === null || link.a === filterId || link.b === filterId)
    span(link, layerAt(100 + (link.z0 + link.z1) / 2 - .02));
  const byId = new Map(posts.map(post => [post.id, post]));
  for (const post of posts) {
    if (filterId !== null && post.id !== filterId) continue;
    const id = wallFrame(post.level, post.look), frame = art.rects[id]; if (!frame) continue;
    const layer = layerAt(100 + post.z), neighbors = links.filter(link => link.a === post.id || link.b === post.id)
      .map(link => byId.get(link.a === post.id ? link.b : link.a));
    if (post.look !== 'broken' && neighbors.length < 2) {
      const neighbor = neighbors[0];
      // The free ends leave a little air inside their tiles. Full contacts keep their exact join.
      span(neighbor ? {x0: post.x, z0: post.z, x1: post.x + END * (post.x-neighbor.x)/2,
        z1: post.z + END * (post.z-neighbor.z)/2, level: post.level}
        : {x0: post.x-END, z0: post.z, x1: post.x+END, z1: post.z, level: post.level}, layer);
    }
    const straight = post.look === 'intact' && neighbors.length === 2 && neighbors.every(row => row.level === post.level)
      && neighbors[0].x + neighbors[1].x === post.x * 2 && neighbors[0].z + neighbors[1].z === post.z * 2;
    // Every third two-unit cell keeps a buttress. Coordinates survive reorder and renamed IDs.
    const buttress = straight && Math.floor((neighbors[0].x === neighbors[1].x ? post.z : post.x) / 2) % 3 === 0;
    if (straight && !buttress && post.id !== selectedId) {
      const height = HEIGHTS[post.level - 1];
      quad(layer, [[post.x-HALF,post.z-HALF],[post.x+HALF,post.z-HALF],[post.x+HALF,post.z+HALF],[post.x-HALF,post.z+HALF]]
        .map(([x,z]) => {const point=projectPoint(x,z);return [point.x,point.y+height+.02];}), wallSurfaceFrame(post.level,'top'));
      continue;
    }
    // Damage and selection never enlarge a post. Scale around its source foot,
    // including the transparent anchor margin, rather than lifting it off the tile.
    const point = projectPoint(post.x, post.z), width = frame.w / UNIT * POST_WIDTH;
    const bottom = point.y - frame.anchor / UNIT * POST_HEIGHT, top = bottom + frame.h / UNIT * POST_HEIGHT;
    quad(layer, [[point.x-width/2,bottom],[point.x+width/2,bottom],[point.x+width/2,top],[point.x-width/2,top]], id);
  }
  return layers;
}
