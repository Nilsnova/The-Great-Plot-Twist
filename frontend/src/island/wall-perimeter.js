// One row of Home Island wall sockets. The same coordinates are in backend/content/island_layout.json.
// A footprint covers two world units. Coasts, paths and scenery leave breaks in the line.
export const WALL_PERIMETER_ROWS = Object.freeze([
  [-18, -5, -5, -3, -3, -1, -1, 1, 1, 3, 3, 5, 5, 7, 7],
  [-12, 12, 12, 14, 14],
  [-10, -16, -16, -14, -14, 14, 14],
  [-7, -17.5, -17.5],
  [-6, 18, 18],
  [-5, -17.5, -17.5],
  [-4, 18, 18],
  [-3, -17.5, -17.5],
  [-2, 18, 18],
  [-1, -17.5, -17.5],
  [0, 18, 18],
  [1, -17.5, -17.5],
  [2, 18, 18],
  [8.5, -14.5, -14.5],
  [10.5, -14.5, -14.5],
  [12.5, -14.5, -14.5],
  [13, 13, 13],
  [15, 11, 11, 13, 13],
  [17, 7, 7, 9, 9, 11, 11],
  [18, -5, -5, -3, -3, -1, -1, 1, 1],
].map(Object.freeze));

export const WALL_PERIMETER_DEFAULTS = Object.freeze({
  wall_1: Object.freeze({x: -17.5, z: -3}),
  wall_2: Object.freeze({x: 18, z: 0}),
  wall_3: Object.freeze({x: 18, z: -2}),
  wall_4: Object.freeze({x: -1, z: 18}),
  wall_5: Object.freeze({x: -3, z: 18}),
  wall_6: Object.freeze({x: -17.5, z: -1}),
  wall_7: Object.freeze({x: 18, z: 2}),
  wall_8: Object.freeze({x: 1, z: 18}),
  wall_9: Object.freeze({x: -5, z: 18}),
  wall_10: Object.freeze({x: -17.5, z: -5}),
  wall_11: Object.freeze({x: -3, z: -18}),
  wall_12: Object.freeze({x: -1, z: -18}),
});

export const WALL_PERIMETER_CELLS = Object.freeze(WALL_PERIMETER_ROWS.flatMap(([z, ...pairs]) =>
  pairs.filter((_, index) => index % 2 === 0).map(x => Object.freeze({x, z}))));
