// Original illustrated explorer. Logical terrain height never offsets its drawn feet.
import * as THREE from 'three';
import { placeArt, projectPoint } from '../world/art.js';
import { WALK_SPEED } from './controller.js';

export function createCharacter(art, { reducedMotion = false } = {}) {
  const group = new THREE.Object3D();
  const holder = new THREE.Group(), sprite = placeArt(holder, art, 'explorer', 0, 0);
  let phase = 0, facing = 'explorer', flip = 1, previousFrame, body = 'explorer', scale = 1;
  // Your captain's colour (GAME-V3.md §7): the lobby's index 0-9 picks captain-1 … captain-10 (null: the explorer).
  const named = view => (view ? `${body}-${view}` : body);
  const viewOf = name => (name.endsWith('-back') ? 'back' : name.endsWith('-side') ? 'side' : '');
  return { group, sprite,
    setColour(index) {
      const next = Number.isInteger(index) && index >= 0 && index < 10 && art[`captain-${index + 1}`] ? `captain-${index + 1}` : 'explorer';
      if (next === body) return;
      const view = viewOf(facing); body = next; facing = named(view); previousFrame = null;
    },
    // How big your captain draws (1.4 during a wave, so it reads at the battle camera).
    setScale(value) { scale = Number.isFinite(value) && value > 0 ? value : 1; },
    face(dx, dz) {
      if (Math.abs(dz) > Math.abs(dx)) { facing = dz < 0 ? named('back') : body; flip = 1; }
      else if (Math.abs(dx) > 0.001) { facing = art[named('side')] ? named('side') : body; flip = dx < 0 ? -1 : 1; }
    },
    animate(delta, speed) {
      const reduce=typeof reducedMotion==='function'?reducedMotion():reducedMotion;
      const moving = speed > .05, amount = Math.min(Math.max(speed, 0) / WALK_SPEED, 1);
      if (moving) phase += delta * Math.min(speed, WALK_SPEED) * 1.1;
      else phase = 0;
      const point = projectPoint(group.position.x, group.position.z);
      const bounce = moving && !reduce ? Math.sin(phase * Math.PI / 2) ** 2 * .035 * amount : 0;
      // Continuous, like the camera (player/camera.js): smooth art needs no pixel grid.
      sprite.position.set(point.x, point.y + bounce, 0);
      sprite.scale.set(flip * scale, scale, 1);
      const clip = [`${facing}-walk-1`, facing, `${facing}-walk-2`, facing];
      const requested = moving && !reduce ? clip[Math.floor(phase) % clip.length] : facing;
      const frame = art[requested] ? requested : facing;
      if (frame !== previousFrame) { sprite.material = art[frame]; sprite.userData.pose = frame; previousFrame = frame; }
      sprite.renderOrder = 100 + group.position.z + 0.15;
    },
  };
}
