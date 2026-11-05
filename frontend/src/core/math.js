// Pure arithmetic shared by lighting, weather and tests. No Three.js objects.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, amount) => a + (b - a) * amount;
export function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}
export function sunPosition(hour) {
  const angle = (((hour % 24) + 24) % 24 - 6) / 24 * Math.PI * 2;
  return { x: Math.cos(angle) * 0.8, y: Math.sin(angle), z: -0.45 };
}
export function seededRandom(seed = 8) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
