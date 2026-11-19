// Pure collision helpers. The controller checks land, pier and building walls here.
import { LAND_LIMIT, PLAYER_RADIUS } from '../config.js';
import { terrainHeight } from '../world/terrain.js';

export function groundHeight(x, z) {
  if (x >= -2.95 && x <= -1.05 && z >= 16.4 && z <= 25.5) return Math.max(1.03, terrainHeight(x, z));
  return terrainHeight(x, z);
}
export function overlapsCollider(x, z, collider, radius = PLAYER_RADIUS) {
  if (collider.disabled) return false;
  if ('radius' in collider) return Math.hypot(x - collider.x, z - collider.z) < radius + collider.radius;
  const closestX = Math.max(collider.x - collider.width / 2, Math.min(x, collider.x + collider.width / 2));
  const closestZ = Math.max(collider.z - collider.depth / 2, Math.min(z, collider.z + collider.depth / 2));
  return Math.hypot(x - closestX, z - closestZ) < radius;
}
function onLand(x, z, groundAt) {
  // Test the edge of the character as well as its centre to keep feet on land.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    if (groundAt(x + Math.cos(angle) * PLAYER_RADIUS, z + Math.sin(angle) * PLAYER_RADIUS) < LAND_LIMIT) return false;
  }
  return true;
}
export function canStand(x, z, colliders = [], groundAt = groundHeight) {
  return onLand(x, z, groundAt) && !colliders.some(collider => overlapsCollider(x, z, collider));
}

function buildingClearance(x, z, building) {
  const dx = Math.abs(x - building.x) - building.width / 2, dz = Math.abs(z - building.z) - building.depth / 2;
  return dx <= 0 && dz <= 0 ? Math.max(dx, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

function canStep(x, z, fromX, fromZ, colliders, groundAt) {
  return onLand(x, z, groundAt) && colliders.every(collider => !overlapsCollider(x, z, collider)
    // A confirmed build or Move can appear around the captain. Let them step out without crossing a new building.
    || (collider.islandBuilding && overlapsCollider(fromX, fromZ, collider)
      && buildingClearance(x, z, collider) >= buildingClearance(fromX, fromZ, collider)));
}
export function moveWithCollisions(position, dx, dz, colliders = [], groundAt = groundHeight) {
  let { x, z } = position;
  // Small steps prevent running through thin cottage walls after a slow frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (canStep(x + dx / steps, z, x, z, colliders, groundAt)) x += dx / steps;
    if (canStep(x, z + dz / steps, x, z, colliders, groundAt)) z += dz / steps;
  }
  return { x, y: groundAt(x, z), z };
}
