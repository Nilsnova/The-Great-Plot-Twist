// Local multiplayer QA: diagnostic rows identify a wall; real textured quads prove its drawn tier.
import {WALL_ATLAS_IDS, frames, wallFrame, wallSurfaceFrame} from '../src/art/village/walls.js';
import {projectGround} from '../src/world/projection.js';

// Independent presentation contract: tier cap heights, not imported renderer implementation values.
const CAP_HEIGHTS = [1.45, 1.70, 1.95, 2.10, 2.20];
// The existing wall atlas uses 256 logical pixels and three pixels of shelf padding.
const rects = {}; let x = 3, y = 3, shelf = 0;
for (const id of [...WALL_ATLAS_IDS].sort((a, b) => frames[b].logical[1] - frames[a].logical[1])) {
  const [w, h, anchor] = frames[id].logical;
  if (x + w + 3 > 256) {x = 3; y += shelf + 3; shelf = 0;}
  rects[id] = {x, y, w, h, anchor}; x += w + 3; shelf = Math.max(shelf, h);
}
export const WALL_AUDIT_ATLAS = {width: 256, height: y + shelf + 3, rects};
// Retain successful geometry descriptions only to reject stale teardown remnants, never to prove presence.
const lastDrawn = new WeakMap();
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5;
const visible = object => {
  for (let node = object; node; node = node.parent) if (node.visible === false) return false;
  return true;
};
const unmoved = object => [object.position.x, object.position.y, object.position.z, object.rotation.x, object.rotation.y, object.rotation.z].every(n => n === 0)
  && [object.scale.x, object.scale.y, object.scale.z].every(n => n === 1);
function unmovedChain(object) {
  for (let node = object; node; node = node.parent) {
    if (!unmoved(node)) return false;
    if (node.matrixAutoUpdate === false && !node.matrix.elements.every((n, at) => n === (at % 5 === 0 ? 1 : 0))) return false;
  }
  return true;
}

function textureMatches(map) {
  const image = map?.image, sources = map?.userData?.villageArt;
  if (!image || !Array.isArray(sources) || sources.length !== WALL_ATLAS_IDS.length) return false;
  const density = image.width / WALL_AUDIT_ATLAS.width;
  if (!(density >= 1) || Math.abs(image.height - WALL_AUDIT_ATLAS.height * density) > 1) return false;
  return WALL_ATLAS_IDS.every(id => {
    const rows = sources.filter(row => row.id === id);
    return rows.length === 1 && rows[0].source === 'png' && typeof rows[0].file === 'string'
      && rows[0].logical?.length === 3 && rows[0].logical.every((n, at) => n === frames[id].logical[at]);
  });
}

function expectedPost(post, group) {
  const neighbors = group.wallLinks.filter(link => link.a === post.id || link.b === post.id)
    .map(link => group.wallPosts.find(row => row.id === (link.a === post.id ? link.b : link.a)));
  if (neighbors.some(row => !row)) return null;
  const straight = post.look === 'intact' && neighbors.length === 2 && neighbors.every(row => row.level === post.level)
    && neighbors[0].x + neighbors[1].x === post.x * 2 && neighbors[0].z + neighbors[1].z === post.z * 2;
  // Every third two-unit cell retains its authored post; this includes negative/half-grid runs.
  const buttress = straight && Math.floor((neighbors[0].x === neighbors[1].x ? post.z : post.x) / 2) % 3 === 0;
  if (straight && !buttress && group.wallSelectedId !== post.id) {
    const height = CAP_HEIGHTS[post.level - 1];
    return {id: wallSurfaceFrame(post.level, 'top'), points: [[-.40,-.40],[.40,-.40],[.40,.40],[-.40,.40]].map(([dx,dz]) => {
      const p = projectGround(post.x + dx, post.z + dz); return [p.x, p.y + height + .02, 0];
    })};
  }
  const id = wallFrame(post.level, post.look), frame = rects[id]; if (!frame) return null;
  const p = projectGround(post.x, post.z), width = frame.w / 16 * (post.look === 'intact' && neighbors.length ? .75 : 1);
  const bottom = p.y - frame.anchor / 16, top = bottom + frame.h / 16;
  return {id, points: [[p.x-width/2,bottom,0],[p.x+width/2,bottom,0],[p.x+width/2,top,0],[p.x-width/2,top,0]]};
}

function hasDrawnPost(mesh, expected, requireArtwork = true) {
  if (!expected || !visible(mesh) || mesh.material?.visible === false || !(mesh.material?.opacity > 0)) return false;
  if (requireArtwork && (!unmovedChain(mesh) || !textureMatches(mesh.material?.map))) return false;
  const position = mesh.geometry?.getAttribute('position'), uv = mesh.geometry?.getAttribute('uv'), index = mesh.geometry?.index;
  if (!position || !index || requireArtwork && !uv) return false;
  const frame = rects[expected.id], u0 = (frame.x+.5)/256, u1 = (frame.x+frame.w-.5)/256;
  const v0 = 1-(frame.y+frame.h-.5)/WALL_AUDIT_ATLAS.height, v1 = 1-(frame.y+.5)/WALL_AUDIT_ATLAS.height;
  const expectedUV = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  const range = mesh.geometry.drawRange, end = Math.min(index.count, range.start + range.count);
  for (let at = 0; at + 5 < index.count; at += 6) {
    if (at < range.start || at + 6 > end) continue;
    const first = index.getX(at), quad = [first, first+1, first+2, first, first+2, first+3];
    if (!quad.every((value, n) => index.getX(at+n) === value)) continue;
    if (expected.points.every((point, n) => point.every((value, axis) => close(position.array[(first+n)*3+axis], value))
      && (!requireArtwork || expectedUV[n].every((value, axis) => close(uv.array[(first+n)*2+axis], value))))) return true;
  }
  return false;
}

export function observeMultiplayerMap(scene, spot) {
  const sprites = [], allGroups = []; let pips = 0;
  scene.traverse(object => {
    if (/^island-(wall|cannon|mortar|watchtower|house):/.test(object.name) && object.name.endsWith(`:${spot}`) && visible(object)) sprites.push(object);
    if (object.name.startsWith(`island-pip:${spot}:`) && visible(object)) pips++;
    if (object.name === 'island-wall-connections') allGroups.push(object);
  });
  const invalid = {level: 0, pips, mode: 'invalid-wall-batch'};
  const groups = allGroups.filter(group => group.wallPosts?.some(row => row.id === spot));
  if (!groups.length) {
    if (sprites.length) return {level: sprites.length === 1 ? sprites[0].userData.level ?? 0 : 0, pips, mode: sprites.length === 1 ? 'sprite' : 'invalid-sprites'};
    const previous = lastDrawn.get(scene)?.get(spot);
    // Rejection is deliberately independent of art validity: a remapped/plain stale quad is still a remnant.
    if (previous && allGroups.some(group => group.children.some(mesh => hasDrawnPost(mesh, previous, false)))) return invalid;
    return {level: 0, pips, mode: previous || !spot.startsWith('wall_') ? 'none' : 'unobserved-wall'};
  }
  if (groups.length !== 1 || sprites.length || pips) return invalid;
  const group = groups[0], posts = group.wallPosts.filter(row => row.id === spot);
  if (!unmoved(group) || !Array.isArray(group.wallLinks)) return invalid;
  if (posts.length !== 1 || !Number.isSafeInteger(posts[0].level) || posts[0].level < 1 || posts[0].level > 5) return invalid;
  const post = posts[0], expected = expectedPost(post, group);
  const matches = group.children.filter(mesh => mesh.name.startsWith('wall-art-layer:') && mesh.renderOrder === 100 + post.z && hasDrawnPost(mesh, expected));
  if (matches.length !== 1) return invalid;
  if (!lastDrawn.has(scene)) lastDrawn.set(scene, new Map());
  lastDrawn.get(scene).set(spot, expected);
  return {level: post.level, pips, mode: 'wall-batch'};
}
