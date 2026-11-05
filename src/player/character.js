// Original illustrated explorer. Logical terrain height never offsets its drawn feet.
import * as THREE from 'three';
import { placeArt, projectPoint } from '../world/art.js';

export function createCharacter(art) {
  const group = new THREE.Object3D();
  const holder = new THREE.Group(), sprite = placeArt(holder, art, 'explorer', 0, 0);
  let phase = 0, facing = 'explorer', flip = 1;
  return { group, sprite,
    face(dx, dz) {
      if (Math.abs(dz) > Math.abs(dx)) facing = dz < 0 ? 'explorer-back' : 'explorer';
      else if (Math.abs(dx) > 0.001) { facing = 'explorer'; flip = dx < 0 ? -1 : 1; }
    },
    animate(delta, speed) {
      phase += delta * (speed > 4 ? 13 : 9);
      const point = projectPoint(group.position.x, group.position.z);
      sprite.position.set(point.x, point.y + (speed > 0.05 ? Math.abs(Math.sin(phase)) * 0.055 : 0), 0);
      sprite.scale.set(flip, 1 + (speed > 0.05 ? Math.sin(phase * 2) * 0.013 : 0), 1);
      const frame = speed > 0.05 ? `${facing}-walk-${Math.floor(phase) % 2 + 1}` : facing;
      sprite.material = art[frame]; sprite.renderOrder = 100 + group.position.z + 0.15;
    },
  };
}
