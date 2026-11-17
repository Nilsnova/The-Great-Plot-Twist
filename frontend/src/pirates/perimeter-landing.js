// New perimeter-wave entries must approach from outside; repaired occupants keep their old egress rule.
import {BODY, WALL_FOOTPRINT, wallInWay} from './boarder-paths.js';

/** Clamp the old spawn before its first standing wall, preserving empty/gap/rubble routes exactly. */
export function exteriorWallLanding(start, landing, walls = []) {
  const standing = walls.filter(wall => wall.hp > 0);
  if (!standing.length) return start;
  let dx = start.x - landing.x, dz = start.z - landing.z;
  let length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-9) {
    dx = landing.x || 1; dz = landing.z;
    length = Math.sqrt(dx * dx + dz * dz);
  }
  const ux = dx / length, uz = dz / length;
  // This circle encloses every footprint plus BODY, regardless of coast shape or legal shoreline overhang.
  const padding = (WALL_FOOTPRINT / 2 + BODY) * Math.SQRT2 + 1;
  let reach = length + padding;
  for (const wall of standing) {
    const wx = wall.x - landing.x, wz = wall.z - landing.z;
    reach = Math.max(reach, Math.sqrt(wx * wx + wz * wz) + padding);
  }
  const outside = {x: landing.x + ux * reach, z: landing.z + uz * reach};
  // wallInWay's inside-occupant exemption cannot apply: outside is beyond every standing square.
  const hit = wallInWay(outside, start, standing);
  if (!hit) return start;
  const share = Math.max(0, hit.t - 1e-6);
  return {x: outside.x + (start.x - outside.x) * share, z: outside.z + (start.z - outside.z) * share};
}
