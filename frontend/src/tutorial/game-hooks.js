// What the tutorials (tutorials.js, T52) read from the running game, in one place so game.js only wires it:
// the island on screen and its campaign, the card open, the wave, the player, where a zone hangs on screen,
// the nearest empty tower spot, and the camera's look for Show me.
//   const hooks = createTutorialHooks({island: () => island, place: () => world.current?.id, player, camera, canvas,
//     container, waveRunning, blocked, narrating});
import {Vector3} from 'three';
import {SPOTS} from '../island/spots.js';
import {onIsland, waitForIsland} from './gate.js';

const TOWER_SPOTS = SPOTS.filter(spot => spot.slot === 'tower').map(spot => spot.id);

export function createTutorialHooks({island = () => null, place = () => null, player = null, camera = null, canvas = null,
  container = globalThis.document?.body, waveRunning = () => false, blocked = () => false, narrating = () => false} = {}) {
  const projected = new Vector3();
  const isle = () => { try { return island() ?? null; } catch { return null; } };
  function probe() {
    const lane = isle(), doc = globalThis.document;
    let wave = null;
    try { wave = lane?.campaign?.wave ?? null; } catch { wave = null; }
    return {place: place(), code: lane?.gameCode ?? null, wave, card: lane?.ui?.open ?? null,
      waveRunning: waveRunning() === true, blocked: blocked() === true, narrating: !!narrating(),
      cutscene: !!doc?.querySelector('dialog.cutscene[open]'), dialog: !!doc?.querySelector('dialog[open]'),
      player: player?.position ? {x: player.position.x, z: player.position.z} : null};
  }
  // A zone on screen in client pixels: {x, y, size, inside}. 'hud:menu' is the HUD's Menu button.
  function locate(id) {
    if (id === 'hud:menu') {
      const rect = container?.querySelector?.('.hud-menu')?.getBoundingClientRect();
      return rect && rect.width ? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: Math.max(rect.width, rect.height) + 16, inside: true} : null;
    }
    const point = isle()?.anchor?.(id);
    if (!point || !camera || !canvas) return null;
    projected.set(point.x, -point.z * .72 + point.lift * .45, 0).project(camera);
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + (projected.x + 1) / 2 * rect.width, y = rect.top + (1 - projected.y) / 2 * rect.height;
    const inside = Math.abs(projected.x) <= .92 && Math.abs(projected.y) <= .92;
    return {x, y, size: Math.max(56, Math.min(140, rect.height * .11 * (camera.zoom ?? 1))), inside};
  }
  // The empty tower spot nearest the player (the guide's "walk to a build spot").
  function spotTarget() {
    const lane = isle(), at = player?.position;
    let best = null, distance = Infinity;
    for (const id of TOWER_SPOTS) {
      if (lane?.label?.(id) !== 'Build here') continue;
      const point = lane.anchor?.(id);
      if (!point) continue;
      const d = at ? Math.hypot(point.x - at.x, point.z - at.z) : 0;
      if (d < distance) { distance = d; best = id; }
    }
    return best;
  }
  const anchor = id => { const point = isle()?.anchor?.(id); return point ? {x: point.x, z: point.z} : null; };
  // Show me: the camera follows this point instead of the player (src/player/camera.js), or the player again.
  const tour = point => { if (camera) camera.userData.tour = point && Number.isFinite(point.x) ? {x: point.x, z: point.z} : null; };
  return {probe, locate, spotTarget, anchor, tour,
    hasIsland: () => { const lane = isle(); let wave = null; try { wave = lane?.campaign?.wave ?? null; } catch { wave = null; } return onIsland({place: place(), code: lane?.gameCode ?? null, wave}); },
    islandReady: options => waitForIsland(probe, options)};
}
