// VIS62: ground-only reserves for future wall intents. Never used for route finding or saved-position settlement.
// Circles match the existing tree blockers; prop boxes cover their bases rather than their upright artwork.
export const WALL_OBSTACLES = Object.freeze([
  {id: 'tree_1', name: 'a tree', x: -15, z: 6, radius: .48},
  {id: 'tree_2', name: 'a tree', x: -16, z: 0, radius: .48},
  {id: 'tree_3', name: 'a tree', x: -13, z: -12, radius: .48},
  {id: 'tree_4', name: 'a tree', x: -9, z: -17, radius: .48},
  {id: 'tree_5', name: 'a tree', x: 9, z: -17, radius: .48},
  {id: 'tree_6', name: 'a tree', x: 15, z: -8, radius: .48},
  {id: 'tree_7', name: 'a tree', x: 16, z: 2, radius: .48},
  {id: 'tree_8', name: 'a tree', x: 14, z: 11, radius: .48},
  {id: 'tree_9', name: 'a tree', x: -12, z: 13, radius: .48},
  {id: 'bench', name: 'the bench', x: 4, z: 13, w: 2.5, d: .75},
  {id: 'barrel', name: 'the barrel', x: -12, z: 7, w: 1.25, d: .75},
  {id: 'lantern', name: 'the lantern', x: -3, z: 12, w: .5, d: .5},
  {id: 'record', name: 'the record board', x: -3.5, z: 2.5, w: 1.5, d: .75},
  {id: 'statue', name: 'the statue', x: 4, z: 5.5, w: 2.5, d: 1},
].map(Object.freeze));
