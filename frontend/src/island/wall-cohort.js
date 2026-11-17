// WALL-03: stable bounded identities, without default coordinates or empty world sites.
export const LEGACY_WALL_CAPACITY = 12;
export const PERIMETER_WALL_CAPACITY = 128;
const NUMBER = /^wall_([1-9][0-9]{0,2})$/;
export function isInventoryWallId(id) {
  const match = typeof id === 'string' ? NUMBER.exec(id) : null;
  const number = match ? Number(match[1]) : 0;
  return id === `wall_${number}` && number > LEGACY_WALL_CAPACITY && number <= PERIMETER_WALL_CAPACITY;
}
const WALLS = new Map(Array.from({length: PERIMETER_WALL_CAPACITY - LEGACY_WALL_CAPACITY}, (_, i) => {
  const id = `wall_${LEGACY_WALL_CAPACITY + i + 1}`;
  return [id, Object.freeze({id, slot: 'wall', kind: 'wall', edge: 'inventory'})];
}));
export const inventoryWall = id => WALLS.get(id) ?? null;
export const isPositionedInventoryWall = row => isInventoryWallId(row?.id) && row.built === true && row.kind === 'wall'
  && Number.isFinite(row.x) && Number.isFinite(row.z);

/** Only paid, positioned answer rows become world spots. Duplicate identities fail closed. */
export function offeredInventoryWalls(rows = []) {
  const sent = new Map(), duplicate = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isInventoryWallId(row?.id)) continue;
    if (sent.has(row.id)) duplicate.add(row.id);
    sent.set(row.id, row);
  }
  return [...WALLS.values()].filter(wall => !duplicate.has(wall.id) && isPositionedInventoryWall(sent.get(wall.id)))
    .map(wall => ({...wall, x: sent.get(wall.id).x, z: sent.get(wall.id).z}));
}
