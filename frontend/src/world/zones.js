// Pure zone test: the nearest interaction zone the player stands in. Small zones stay reachable.
export function inZone(position, zone) {
  return !!position && !!zone && Math.hypot(position.x - zone.x, position.z - zone.z) <= zone.radius && Math.abs(position.y - zone.y) < 2.5;
}
export function findZone(position, list = []) {
  let closest = null, bestDistance = Infinity;
  for (const zone of list) {
    const distance = Math.hypot(position.x - zone.x, position.z - zone.z);
    if (inZone(position, zone)) {
      // Normalising by radius avoids a large zone swallowing a small desk zone.
      const score = distance / zone.radius;
      if (score < bestDistance) { closest = zone.id; bestDistance = score; }
    }
  }
  return closest;
}
