// VIS71: three rows per existing east/south/west approach, not three upgrade levels.
// Count reserved wall sites, including unbuilt ones. The current Move CAS fences those positions.
// The nearest approach to the heart wins; south owns both 45-degree boundary ties.
// East/west depth is x, south depth is z. Equal depth shares a row; a .5 stagger does not.
export const MAX_WALL_ROWS = 3;
const APPROACHES = Object.freeze(['east', 'south', 'west']);

export function wallRowCounts(walls, heart) {
  const rows = {east: new Set(), south: new Set(), west: new Set()};
  for (const {x, z} of walls) {
    const dx = x - heart.x, dz = z - heart.z;
    const approach = dz > 0 && dz >= Math.abs(dx) ? 'south' : dx < 0 ? 'west' : 'east';
    rows[approach].add(approach === 'south' ? z : x);
  }
  return Object.fromEntries(APPROACHES.map(name => [name, rows[name].size]));
}

// Historical excess is not rewritten. Allow correction/rearrangement without adding an excessive row.
export function addedWallRow(before, after, heart) {
  const was = wallRowCounts(before, heart), next = wallRowCounts(after, heart);
  return APPROACHES.find(name => next[name] > MAX_WALL_ROWS && next[name] > was[name]) ?? null;
}
