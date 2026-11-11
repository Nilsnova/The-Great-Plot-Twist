// World-aligned WASD moves the logical player; the illustration projects it to the map.
// One brisk speed, no sprint key (owner, 11 Nov: "no sprinting, just always fast moving").
import { layout } from '../config.js';
import { groundHeight, moveWithCollisions } from './collision.js';

export const WALK_SPEED = 6.5;

export function createController(character, input, colliders) {
  const player = character.group;
  let groundAt = groundHeight;
  player.position.set(layout.spawn.x, groundHeight(layout.spawn.x, layout.spawn.z), layout.spawn.z);
  return { player, setPlace(place) {
    colliders = place.colliders; groundAt = place.groundHeight;
    const [x, z] = place.spawn; player.position.set(x, groundAt(x, z), z);
  }, update(delta, active) {
    // A resumed/stalled frame must not teleport the explorer or poison its coordinates.
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .1)) : 0;
    let forward = active ? input.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) : 0;
    let right = active ? input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) : 0;
    if (!Number.isFinite(forward)) forward = 0;
    if (!Number.isFinite(right)) right = 0;
    const length = Math.hypot(forward, right);
    const speed = length ? WALK_SPEED * Math.min(1, length) : 0;
    if (length) { forward /= length; right /= length; }
    const dx = right * speed * dt, dz = -forward * speed * dt;
    const next = moveWithCollisions(player.position, dx, dz, colliders, groundAt);
    const actualSpeed = Math.hypot(next.x - player.position.x, next.z - player.position.z) / Math.max(dt, 0.001);
    player.position.set(next.x, next.y, next.z);
    if (actualSpeed > 0.05) character.face(dx, dz);
    character.animate(dt, actualSpeed);return actualSpeed;
  } };
}
