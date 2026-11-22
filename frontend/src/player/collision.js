// Pure collision helpers. The controller checks land, pier and building walls here.
import { LAND_LIMIT, PLAYER_RADIUS } from '../config.js';
import { terrainHeight } from '../world/terrain.js';

export function groundHeight(x, z) {
  if (x >= -2.95 && x <= -1.05 && z >= 16.4 && z <= 25.5) return Math.max(1.03, terrainHeight(x, z));
  return terrainHeight(x, z);
}
export function overlapsCollider(x, z, collider, radius = PLAYER_RADIUS) {
  if ('radius' in collider) return Math.hypot(x - collider.x, z - collider.z) < radius + collider.radius;
  const closestX = Math.max(collider.x - collider.width / 2, Math.min(x, collider.x + collider.width / 2));
  const closestZ = Math.max(collider.z - collider.depth / 2, Math.min(z, collider.z + collider.depth / 2));
  return Math.hypot(x - closestX, z - closestZ) < radius;
}
function onDryGround(x, z, groundAt) {
  // Test the edge of the character as well as its centre to keep feet on land.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    if (groundAt(x + Math.cos(angle) * PLAYER_RADIUS, z + Math.sin(angle) * PLAYER_RADIUS) < LAND_LIMIT) return false;
  }
  return true;
}
export function canStand(x, z, colliders = [], groundAt = groundHeight) {
  return onDryGround(x, z, groundAt) && !colliders.some(collider => overlapsCollider(x, z, collider));
}
function distanceToBuilding(x, z, building) {
  const side = Math.abs(x - building.x) - building.width / 2;
  const end = Math.abs(z - building.z) - building.depth / 2;
  return side <= 0 && end <= 0 ? Math.max(side, end) : Math.hypot(Math.max(0, side), Math.max(0, end));
}
function canStep(x, z, nextX, nextZ, colliders, groundAt) {
  if (!onDryGround(nextX, nextZ, groundAt)) return false;
  return !colliders.some(collider => {
    if (!overlapsCollider(nextX, nextZ, collider)) return false;
    if (!collider.walkOut) return true;
    // A teammate can build or move a body over the captain. Allow the captain
    // to walk out without permitting entry from a clear tile.
    const before = distanceToBuilding(x, z, collider);
    return before >= PLAYER_RADIUS || distanceToBuilding(nextX, nextZ, collider) < before;
  });
}
export function moveWithCollisions(position, dx, dz, colliders, groundAt = groundHeight) {
  let { x, z } = position;
  // Small steps prevent running through thin cottage walls after a slow frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (canStep(x, z, x + dx / steps, z, colliders, groundAt)) x += dx / steps;
    if (canStep(x, z, x, z + dz / steps, colliders, groundAt)) z += dz / steps;
  }
  return { x, y: groundAt(x, z), z };
}
