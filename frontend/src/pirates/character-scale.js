// How big characters on foot draw during a wave (GAME-V3.md §7 polish): the battle camera zooms out to
// show the ships (pirates/controller.js battleZoom: about .52 on a 1280 x 800 screen, .4 on a phone), so
// captains and boarders grow with it: 1.4x at the desktop's battle zoom, up to 1.8x at the phone's. Pure.
export const CHARACTER_SCALE = 1.4;
export const MAX_CHARACTER_SCALE = 1.8;
export function characterScale(zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0) return CHARACTER_SCALE;
  return Math.round(Math.min(MAX_CHARACTER_SCALE, Math.max(CHARACTER_SCALE, CHARACTER_SCALE * Math.sqrt(.55 / zoom))) * 100) / 100;
}
