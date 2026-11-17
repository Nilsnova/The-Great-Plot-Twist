// Bounded wall-run ghosts borrow the world's real level-1 art; exact footprint lines grant no build authority.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {spriteMaterial} from '../art/textures.js';
export function createWallBuilderPreview({root, wall}) {
  const group = new THREE.Group(); group.name = 'island-wall-draft'; group.visible = false; root.add(group);
  const ghostMaterial = spriteMaterial(wall.texture); ghostMaterial.opacity = .55;
  let geometry = new THREE.PlaneGeometry(wall.size[0] / 16, wall.size[1] / 16);
  geometry.translate(0, (wall.size[1] / 2 - (wall.anchor ?? 0)) / 16, 0);
  const gridMaterial = new THREE.LineBasicMaterial({transparent: true, opacity: .8, depthTest: false, depthWrite: false, toneMapped: false});
  const grid = new THREE.LineSegments(new THREE.BufferGeometry(), gridMaterial); grid.name = 'wall-draft-grid'; grid.renderOrder = 98; group.add(grid);
  const ghosts = []; let disposed = false, key = '';
  return {
    setFrame({size: [width, height], anchor = 0}) {
      if (disposed) return;
      const previous = geometry; geometry = new THREE.PlaneGeometry(width / 16, height / 16);
      geometry.translate(0, (height / 2 - anchor) / 16, 0);
      ghosts.forEach(mesh => { mesh.geometry = geometry; }); previous.dispose();
    },
    show(model) {
      if (disposed) return;
      const cells = (model?.cells ?? []).slice(0, 32); group.visible = cells.length > 0;
      if (!group.visible) return;
      const color = model.valid ? 0x64c978 : model.refused ? 0xe46c54 : 0xe4bb57;
      ghostMaterial.color.setHex(color); gridMaterial.color.setHex(color);
      cells.forEach((cell, i) => {
        if (!ghosts[i]) { const mesh = new THREE.Mesh(geometry, ghostMaterial); mesh.name = `wall-draft:${i}`; mesh.frustumCulled = false; group.add(mesh); ghosts.push(mesh); }
        const point = projectPoint(cell.x, cell.z), mesh = ghosts[i]; mesh.visible = true; mesh.position.set(point.x, point.y, 0);
        mesh.renderOrder = 100 + cell.z; mesh.userData.ground = {...cell};
      });
      for (let i = cells.length; i < ghosts.length; i++) ghosts[i].visible = false;
      const next = JSON.stringify(cells); if (key === next) return; key = next;
      const points = [];
      for (const cell of cells) for (let step = -1; step <= 1; step += .5) {
        for (const [x, z] of [[cell.x - 1, cell.z + step], [cell.x + 1, cell.z + step], [cell.x + step, cell.z - 1], [cell.x + step, cell.z + 1]]) {
          const point = projectPoint(x, z); points.push(point.x, point.y, 0);
        }
      }
      grid.geometry.dispose(); grid.geometry = new THREE.BufferGeometry(); grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    },
    dispose() {
      if (disposed) return; disposed = true; group.removeFromParent(); group.clear();
      geometry.dispose(); ghostMaterial.dispose(); grid.geometry.dispose(); gridMaterial.dispose();
    },
  };
}
