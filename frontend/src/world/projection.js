// Presentation only: saved logical XZ and deterministic gameplay never use these display coordinates.
export const GROUND_PROJECTION = Object.freeze({xScale: 1.3, zShear: .2, depthScale: .6});
// Existing64×48 backdrop pixels were authored with this depth compression; convert the plane once.
export const LEGACY_DEPTH = .72;
const {xScale, zShear, depthScale} = GROUND_PROJECTION;
export function projectGround(x, z) { return {x: xScale * x + zShear * z, y: -depthScale * z}; }
export function unprojectGround(x, y) {
  const z = -y / depthScale;
  return {x: (x - zShear * z) / xScale, z};
}
export const projectGroundVector = projectGround;
/** Local XY ground geometry uses y=-logical z, preserving its existing front-face winding. */
export function projectGroundPlane(x, y) { return projectGround(x, -y); }
/** Legacy backdrop XY, including its painted decorative depth, maps into the new display plane. */
export function projectLegacyGround(x, y) {
  return {x: xScale * x - zShear * y / LEGACY_DEPTH, y: depthScale * y / LEGACY_DEPTH};
}
export function unprojectLegacyGround(x, y) {
  const legacyY = y * LEGACY_DEPTH / depthScale;
  return {x: (x + zShear * legacyY / LEGACY_DEPTH) / xScale, y: legacyY};
}
export function displayedBounds(points) {
  if (!points.length || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return points.reduce((bounds, point) => ({minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y), maxY: Math.max(bounds.maxY, point.y)}),
  {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity});
}
/** Profile comes from the actual painted coast; its downward depth remains in legacy display units. */
export function projectedCoastBounds(profile) {
  return displayedBounds(profile.flatMap(({x, z, depth}) => {
    const top = projectGround(x, z), drop = projectLegacyGround(0, -depth);
    return [top, {x: top.x + drop.x, y: top.y + drop.y}];
  }));
}
// The same constants compile into shader-space fog/guide inverses; never keep a second literal tilt.
export const groundProjectionGlsl = /* glsl */`
vec2 projectGround(vec2 p){return vec2(${xScale.toFixed(8)}*p.x+${zShear.toFixed(8)}*p.y,-${depthScale.toFixed(8)}*p.y);}
vec2 unprojectGround(vec2 p){float z=-p.y/${depthScale.toFixed(8)};return vec2((p.x-${zShear.toFixed(8)}*z)/${xScale.toFixed(8)},z);}
`;
