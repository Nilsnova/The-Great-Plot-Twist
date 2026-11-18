// Presentation only: frozen posts supply geometry; accepted simulation state supplies standing HP.
import * as THREE from 'three';
import {makeWallConnections} from '../island/wall-connections.js';

export function standingCombatWalls(posts = [], walls = [], inBreak = false) {
  const live = new Map(walls.map(wall => [wall.id, wall]));
  return posts.filter(post => {
    if (post.kind !== 'wall' || !Number.isFinite(post.x) || !Number.isFinite(post.z)) return false;
    // setDefenses is the renderer's existing explicit post-wave handoff, never an active-wave read.
    if (inBreak && Number.isFinite(post.rest)) return post.rest > 0;
    const wall = live.get(post.id);
    return Number.isFinite(wall?.hp) && wall.hp > 0 && Number.isFinite(wall.maxHp) && wall.maxHp > 0;
  }).map(({id, x, z, level}) => ({id, x, z, level, kind: 'wall', built: true}))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function makeCombatWallConnections(root) {
  const group = new THREE.Group(); group.name = 'pirates:wall-connections'; root.add(group);
  const drawing = makeWallConnections(group);
  let key = null, disposed = false, connected = new Set();
  return {
    show(posts, walls, {visible = true, inBreak = false} = {}) {
      if (disposed) return;
      group.visible = visible;
      const standing = standingCombatWalls(posts, walls, inBreak), next = JSON.stringify(standing);
      if (key === next) return;
      key = next; connected = drawing.show(standing).connected;
      // Joins are decoration, never a second target, interaction zone or pathing collider.
      group.traverse(object => { if (object.isMesh) object.raycast = () => {}; });
    },
    get links() { return drawing.links; },
    isJoined(id) { return connected.has(id); },
    dispose() {
      if (disposed) return; disposed = true;
      drawing.dispose(); root.remove(group);
    },
  };
}
