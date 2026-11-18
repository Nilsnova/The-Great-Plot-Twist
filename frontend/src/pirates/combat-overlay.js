// Two cached range rings and a danger pointer in the game's flat world projection. Used by render.js.
import * as THREE from 'three';

const Y = .72;
export function createCombatOverlay(parent) {
  const root = new THREE.Group(); root.name = 'captain-combat-feedback'; parent.add(root);
  const ringGeometry = new THREE.RingGeometry(.986, 1, 128);
  const markerGeometry = new THREE.RingGeometry(.8, 1, 32);
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, -.6, .65, 0, -.6, -.65, 0], 3));
  const make = (geometry, color, order) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = order; mesh.frustumCulled = false;
    mesh.visible = false; root.add(mesh); return mesh;
  };
  const shadow = make(ringGeometry, 0x10232b, 92), ring = make(ringGeometry, 0x8ee8ea, 93);
  const target = make(markerGeometry, 0xffd77b, 935), pointer = make(arrowGeometry, 0xff765e, 936);
  return {
    update({ range = null, danger = null, player = null } = {}) {
      for (const mesh of root.children) mesh.visible = false;
      if (range) {
        for (const mesh of [shadow, ring]) {
          mesh.visible = true; mesh.position.set(range.x, -range.z * Y, 0);
          const padding = mesh === shadow ? .12 : 0;
          mesh.scale.set(range.radius + padding, (range.radius + padding) * Y, 1);
          mesh.material.opacity = range.alpha * (mesh === shadow ? .85 : .9);
        }
        ring.material.color.setHex(range.melee ? 0xffe4ad : range.mode === 'area' ? 0xffc66d : 0x8ee8ea);
        if (range.point) {
          target.visible = true; target.position.set(range.point.x, -range.point.z * Y + .4, 0);
          target.scale.set(.7, .7 * Y, 1); target.material.opacity = range.alpha;
        }
      }
      if (danger && player) {
        const dx = danger.x - player.x, dy = -(danger.z - player.z) * Y;
        const length = Math.hypot(dx, dy);
        pointer.visible = length > .1;
        pointer.position.set(player.x + dx / (length || 1) * 2.8, -player.z * Y + dy / (length || 1) * 2.8 + .5, 0);
        pointer.rotation.z = Math.atan2(dy, dx);
        pointer.material.color.setHex(danger.critical ? 0xff6653 : 0xffbc66);
      }
    },
    dispose() {
      root.removeFromParent(); ringGeometry.dispose(); markerGeometry.dispose(); arrowGeometry.dispose();
      for (const mesh of root.children) mesh.material.dispose(); root.clear();
    },
  };
}
