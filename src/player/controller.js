// Turns camera-relative WASD into safe terrain movement and character animation.
import { layout } from '../config.js';
import { groundHeight, moveWithCollisions } from './collision.js';

export function createController(character, input, colliders) {
  const player = character.group;
  player.position.set(layout.spawn.x, groundHeight(layout.spawn.x, layout.spawn.z), layout.spawn.z);
  return { player, update(delta, yaw, active) {
    let forward = active ? input.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) : 0;
    let right = active ? input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) : 0;
    const length = Math.hypot(forward, right);
    const speed = length ? (input.held.has('ShiftLeft') || input.held.has('ShiftRight') ? 6 : 3.2) : 0;
    if (length) { forward /= length; right /= length; }
    const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed * delta;
    const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed * delta;
    const next = moveWithCollisions(player.position, dx, dz, colliders);
    const actualSpeed = Math.hypot(next.x - player.position.x, next.z - player.position.z) / Math.max(delta, 0.001);
    player.position.set(next.x, next.y, next.z);
    if (actualSpeed > 0.05) {
      const target = Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(target - player.rotation.y), Math.cos(target - player.rotation.y));
      player.rotation.y += turn * Math.min(1, delta * 12);
    }
    character.animate(delta, actualSpeed);
  } };
}
