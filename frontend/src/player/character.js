// Original illustrated explorer. Logical terrain height never offsets its drawn feet.
import * as THREE from 'three';
import { placeArt, projectPoint } from '../world/art.js';
import { snapPixel } from '../pixel/catalog.js';

export function createCharacter(art, { reducedMotion = false } = {}) {
  const group = new THREE.Object3D();
  const holder = new THREE.Group(), sprite = placeArt(holder, art, 'explorer', 0, 0);
  let phase = 0, facing = 'explorer', flip = 1, previousFrame;
  return { group, sprite,
    face(dx, dz) {
      if (Math.abs(dz) > Math.abs(dx)) { facing = dz < 0 ? 'explorer-back' : 'explorer'; flip = 1; }
      else if (Math.abs(dx) > 0.001) { facing = art['explorer-side'] ? 'explorer-side' : 'explorer'; flip = dx < 0 ? -1 : 1; }
    },
    animate(delta, speed) {
      const reduce=typeof reducedMotion==='function'?reducedMotion():reducedMotion;
      const moving = speed > .05, amount = Math.min(Math.max(speed, 0) / 3.2, 1);
      if (moving) phase += delta * Math.min(speed, 6) * 1.65;
      else phase = 0;
      const point = projectPoint(group.position.x, group.position.z);
      const bounce = moving && !reduce ? Math.sin(phase * Math.PI / 2) ** 2 * .035 * amount : 0;
      sprite.position.set(snapPixel(point.x), snapPixel(point.y + bounce), 0);
      sprite.scale.set(flip, 1, 1);
      const clip = [`${facing}-walk-1`, facing, `${facing}-walk-2`, facing];
      const requested = moving && !reduce ? clip[Math.floor(phase) % clip.length] : facing;
      const frame = art[requested] ? requested : facing;
      if (frame !== previousFrame) { sprite.material = art[frame]; sprite.userData.pose = frame; previousFrame = frame; }
      sprite.renderOrder = 100 + group.position.z + 0.15;
    },
  };
}
