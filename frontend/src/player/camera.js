// Orthographic follow for the smooth cartoon art (GAME-V3.md §7): the follow and the zoom are
// continuous; an exponential ease keeps the camera steady, and the smooth (linear, mipmapped)
// textures need no pixel grid, so the art never shimmers at any position or zoom.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {surfaces} from '../world/places/surfaces.js';

// Fit today's whole island, including its wavy shore, tall buildings and HUD space.
// This is a village overview, not an alternate battle zoom or a future land-growth rule.
export function villageFrame(camera, placeId, viewport = null) {
  const land = placeId === 'home_islet' ? surfaces[placeId] : null;
  const width = camera.right - camera.left, height = camera.top - camera.bottom;
  if (!land || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const fraction = value => Number.isFinite(viewport?.height) && viewport.height > 0 && Number.isFinite(value)
    ? Math.max(0, Math.min(.6, value / viewport.height)) : 0;
  const top = fraction(viewport?.top), bottom = fraction(viewport?.bottom), free = Math.max(.1, 1 - top - bottom);
  const zoom = Math.min(1, width / (2 * (land.rx * 1.1 + 2)), height * free / (2 * (land.rz * .72 * 1.1 + 4.5)));
  return {x: 0, y: 3 - (bottom - top) * height / (2 * zoom), zoom};
}

export function createCamera(input) {
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, .1, 200);
  const start = projectPoint(-1, 10);
  camera.position.set(start.x, start.y + 3.1, 100); camera.lookAt(camera.position.x, camera.position.y, 0);
  camera.userData.viewHeight = 22; // world units tall at zoom 1 (at least 16 wide on a phone)
  let exploring = false, targetZoom = 1, placeId = 'lighthouse_isle', reduce = false, zoom = 1, village = false, villageViewport = null;
  const follow = new THREE.Vector2(camera.position.x, camera.position.y);
  let villageScale = 1, villageX = 0, villageY = 0;
  const fitVillage = () => { villageScale = 1; villageX = villageY = 0; };
  const villageBase = () => villageFrame(camera, placeId, villageViewport);
  function place(x, y) { follow.set(x, y); camera.position.set(x, y, 100); }
  function applyZoom(value) {
    zoom = value;
    if (Math.abs(value - camera.zoom) > 1e-6) { camera.zoom = value; camera.updateProjectionMatrix(); }
  }
  return {camera, get yaw() { return 0; },
    setPlace(id, player) {
      placeId = id; village = false; fitVillage(); targetZoom = 1; const point = projectPoint(player.x, player.z);
      place(point.x, point.y + 3.1); zoom = 1;
      camera.zoom = 1; camera.updateProjectionMatrix();
    },
    pause() { exploring = false; },
    overview() { exploring = false; targetZoom = 1; applyZoom(1); },
    start(reducedMotion = false) { exploring = true; reduce = reducedMotion === true; },
    setVillageView(active, viewport = null) {
      if (active === true && !village) fitVillage();
      village = active === true; villageViewport = viewport;
    },
    villageControl(action) {
      const frame = exploring && village && villageBase();
      if (!frame) return;
      if (action === 'fit') { fitVillage(); return; }
      const factor = action === 'in' ? 1.4 : action === 'out' ? 1 / 1.4 : 1;
      villageScale = Math.max(1, Math.min(2 / frame.zoom, villageScale * factor));
      if (villageScale === 1) villageX = villageY = 0;
    },
    panVillage(dx, dy, width, height) {
      const frame = exploring && village && villageBase(), land = surfaces[placeId];
      if (!frame || villageScale <= 1 || ![dx, dy, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      const at = Math.min(2, frame.zoom * villageScale);
      villageX = THREE.MathUtils.clamp(villageX - dx * (camera.right - camera.left) / (width * at), -land.rx, land.rx);
      villageY = THREE.MathUtils.clamp(villageY + dy * (camera.top - camera.bottom) / (height * at), -land.rz * .72, land.rz * .72);
    },
    update(delta, player) {
      if (!exploring || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, .1);
      const tour = camera.userData.tour, touring = Number.isFinite(tour?.x) && Number.isFinite(tour?.z);
      // Holding Tab looks at the whole island for a moment, also during a wave; letting go eases back.
      const peek = input?.held?.has?.('Tab') === true;
      const frame = !touring && (peek || (village && !Number.isFinite(camera.userData.battleZoom)))
        ? villageFrame(camera, placeId, village ? villageViewport : null) : null;
      if (frame) {
        // Tab borrows the whole-island frame without consuming the saved working view.
        if (village && !peek) {
          const baseZoom = frame.zoom;
          frame.zoom = Math.min(2, frame.zoom * villageScale);
          // Keep the working center in the measured free area as captions and bars reflow.
          frame.x = villageX;
          frame.y = 3 + villageY + (frame.y - 3) * baseZoom / frame.zoom;
        }
        const blend = reduce ? 1 : 1 - Math.exp(-dt * 5);
        if (reduce) place(frame.x, frame.y);
        else place(follow.x + (frame.x - follow.x) * blend, follow.y + (frame.y - follow.y) * blend);
        applyZoom(reduce ? frame.zoom : zoom + (frame.zoom - zoom) * blend);
        return; // Village controls never alter the player's exploration zoom.
      }
      const wheel = input.pointer.wheel;
      if (Number.isFinite(wheel) && wheel) targetZoom = Math.max(1, Math.min(2, targetZoom - wheel / 1000));
      // ...and lean towards the fight: camera.userData.battleFocus is a small logical offset {x, z}.
      const lean = camera.userData.battleFocus, leanX = Number.isFinite(lean?.x) ? lean.x : 0, leanZ = Number.isFinite(lean?.z) ? lean.z : 0;
      // ...or, for a moment, look at a thing on the island instead (the unlock cards' Show me, T52): camera.userData.tour {x, z}.
      const point = touring ? projectPoint(tour.x, tour.z) : projectPoint(player.x + leanX, player.z + leanZ);
      const blend = reduce ? 1 : 1 - Math.exp(-dt * (touring ? 3 : 12));
      const headroom = placeId === 'lighthouse_isle' && Math.hypot(player.x - 9, player.z + 8) < 8 ? 4.2 : 3.1;
      place(follow.x + (point.x - follow.x) * blend, follow.y + (point.y + headroom - follow.y) * blend);
      // A pirate wave (lane P) may ask for a wider view while it runs: camera.userData.battleZoom (0.4-1).
      const battle = camera.userData.battleZoom, goal = Number.isFinite(battle) ? Math.max(.4, Math.min(1, battle)) : targetZoom;
      applyZoom(reduce ? goal : zoom + (goal - zoom) * (1 - Math.exp(-dt * (Number.isFinite(battle) || zoom < .98 ? 3 : 16))));
    },
  };
}
