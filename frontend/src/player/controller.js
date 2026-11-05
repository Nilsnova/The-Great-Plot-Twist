// World-aligned WASD moves the logical player; the illustration projects it to the map.
import { layout } from '../config.js';
import { groundHeight, moveWithCollisions } from './collision.js';

export function createController(character, input, colliders) {
  const player = character.group;
  let groundAt = groundHeight;
  player.position.set(layout.spawn.x, groundHeight(layout.spawn.x, layout.spawn.z), layout.spawn.z);
  return { player, setPlace(place) {
    colliders = place.colliders; groundAt = place.groundHeight;
    const [x, z] = place.spawn; player.position.set(x, groundAt(x, z), z);
  }, update(delta, active) {
    let forward = active ? input.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) : 0;
    let right = active ? input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) : 0;
    const length = Math.hypot(forward, right);
    const speed = length ? (input.held.has('ShiftLeft') || input.held.has('ShiftRight') ? 6 : 3.2) : 0;
    if (length) { forward /= length; right /= length; }
    const dx = right * speed * delta, dz = -forward * speed * delta;
    const next = moveWithCollisions(player.position, dx, dz, colliders, groundAt);
    const actualSpeed = Math.hypot(next.x - player.position.x, next.z - player.position.z) / Math.max(delta, 0.001);
    player.position.set(next.x, next.y, next.z);
    if (actualSpeed > 0.05) character.face(dx, dz);
    character.animate(delta, actualSpeed);return actualSpeed;
  } };
}
