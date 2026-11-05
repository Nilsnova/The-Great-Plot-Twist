// The offline backgrounds and the movement controller share exactly this coastline.
export const surfaces = {
  saltreach_harbor: { rx: 29, rz: 22, seed: 1, docks: [[-1.7, 1.7, 15, 26.5]] },
  home_islet: { rx: 20, rz: 22, seed: 3 },
  smugglers_cove: { rx: 23, rz: 21, seed: 5 },
  wreck_point: { rx: 24, rz: 21, seed: 7 },
  the_teeth: { rx: 22, rz: 22, seed: 9 },
  gulls_rest: { rx: 19, rz: 20, seed: 11 },
};
export function surfaceClass(id, x, z) {
  const s = surfaces[id]; if (!s) return 0;
  if (s.docks?.some(([a, b, c, d]) => x >= a && x <= b && z >= c && z <= d)) return 3;
  const angle = Math.atan2(z / s.rz, x / s.rx);
  const edge = 1 + .055 * Math.sin(angle * 5 + s.seed) + .035 * Math.cos(angle * 7);
  const r = Math.hypot(x / s.rx, z / s.rz) / edge;
  return r < .85 ? 2 : r < 1 ? 1 : 0;
}
export const placeGround = id => (x, z) => surfaceClass(id, x, z) ? 1.03 : -1;
