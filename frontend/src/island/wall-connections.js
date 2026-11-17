// Between-wave wall joins. Full shared 2×2 sides connect; gaps, partial sides and corners do not.
// Drawing only: this module never writes positions, changes footprints or reads/updates battle HP.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {FOOTPRINTS} from './placement.js';
import {texturedWallBatches, wallVisualRows} from './wall-batches.js';
import {spriteMaterial} from '../art/textures.js';

export function wallTopology(spots = []) {
  const walls = spots.filter(item => item?.built === true && item.kind === 'wall' && typeof item.id === 'string'
    && Number.isFinite(item.x) && Number.isFinite(item.z) && item.standing !== false && item.hp !== 0 && item.health !== 0 && item.broken !== true)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const connected = new Set(), links = [];
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j], dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
    if (!(dx === FOOTPRINTS.wall && dz === 0 || dz === FOOTPRINTS.wall && dx === 0)) continue;
    const level = item => Number.isSafeInteger(item.level) ? Math.min(5, Math.max(1, item.level)) : 1;
    links.push({a: a.id, b: b.id, x0: a.x, z0: a.z, x1: b.x, z1: b.z, level: Math.min(level(a), level(b))});
    connected.add(a.id); connected.add(b.id);
  }
  return {links, connected};
}

// Level colours match art/island.js. The original level/banner sprites remain as the junction posts.
const COLOURS = [0xc98a4e, 0xcfc8bb, 0xa9a39a, 0xffcf3f, 0xffcf3f];
export function makeWallConnections(root) {
  const group = new THREE.Group(); group.name = 'island-wall-connections'; root.add(group);
  let material = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false});
  let key = null, disposed = false, art = null, lastSpots = [], posts = new Set(), current = {links: [], connected: new Set()};
  const readLinks = () => current.links.map(link => ({...link}));
  // Diagnostics inspect logical contacts independently of how many painter-layer meshes draw them.
  Object.defineProperty(group, 'wallLinks', {get: readLinks});
  Object.defineProperty(group, 'wallPosts', {get: () => art ? wallVisualRows(lastSpots) : []});
  const clear = () => { for (const mesh of [...group.children]) { mesh.geometry.dispose(); group.remove(mesh); } };
  function show(spots = []) {
    if (disposed) return current;
    lastSpots = spots; current = wallTopology(spots);
    const visual = art ? wallVisualRows(spots) : [];
    posts = new Set(visual.map(row => row.id));
    const next = JSON.stringify([current.links, visual]);
    if (key === next) return current;
    key = next; clear();
    if (art) {
      for (const [order, {positions, uvs, indices}] of texturedWallBatches(current.links, visual, art)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
        const mesh = new THREE.Mesh(geometry, material); mesh.name = `wall-art-layer:${order}`;
        mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {}; group.add(mesh);
      }
      return current;
    }
    const layers = new Map();
    for (const link of current.links) {
      // Transparent posts interleave at their exact z order; batch only spans that already share it.
      const order = 100 + (link.z0 + link.z1) / 2 - .02;
      if (!layers.has(order)) layers.set(order, {positions: [], colours: [], indices: []});
      const {positions, colours, indices} = layers.get(order);
      const height = link.level === 1 ? .95 : link.level === 2 ? 1.15 : 1.45;
      const vertical = link.x0 === link.x1, half = .28;
      const x0 = Math.min(link.x0, link.x1) - (vertical ? half : 0), x1 = Math.max(link.x0, link.x1) + (vertical ? half : 0);
      const z0 = Math.min(link.z0, link.z1) - (vertical ? 0 : half), z1 = Math.max(link.z0, link.z1) + (vertical ? 0 : half);
      const colour = new THREE.Color(COLOURS[link.level - 1]);
      const quad = (points, lift, shade) => {
        const start = positions.length / 3, tint = colour.clone().multiplyScalar(shade);
        for (const [x, z, raised = lift] of points) { const p = projectPoint(x, z); positions.push(p.x, p.y + raised, 0); colours.push(tint.r, tint.g, tint.b); }
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      };
      quad([[x0,z0],[x1,z0],[x1,z1],[x0,z1]], height, 1.05);
      quad([[x0,z1,0],[x1,z1,0],[x1,z1,height],[x0,z1,height]], 0, .7);
      quad([[x1,z0,0],[x1,z1,0],[x1,z1,height],[x1,z0,height]], 0, .82);
      // A dark upper rail/course keeps the joins readable at phone size without more textures.
      quad([[x0,z1],[x1,z1],[x1,z1-.07],[x0,z1-.07]], height + .01, .45);
    }
    for (const [order, {positions, colours, indices}] of layers) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geometry.setIndex(indices);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `wall-join-layer:${order}`;
      mesh.renderOrder = order; mesh.frustumCulled = false; group.add(mesh);
    }
    return current;
  }
  return {show, get links() { return readLinks(); },
    hasPost: id => !!art && posts.has(id),
    setArt(value) {
      if (disposed || !value) return false;
      if (value === art) return true;
      clear(); material.dispose(); if (art?.ownsTexture) art.texture.dispose();
      art = value; material = spriteMaterial(art.texture); material.side = THREE.DoubleSide;
      // These are camera-facing quads; a second transparent back-face pass adds no surface.
      material.forceSinglePass = true; key = null; show(lastSpots); return true;
    },
    dispose() { if (disposed) return; disposed = true; clear(); material.dispose(); if (art?.ownsTexture) art.texture.dispose(); root.remove(group); }};
}
