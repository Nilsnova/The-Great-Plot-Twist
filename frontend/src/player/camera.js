// Orthographic follow for the smooth cartoon art (GAME-V3.md §7): the follow and the zoom are
// continuous; an exponential ease keeps the camera steady, and the smooth (linear, mipmapped)
// textures need no pixel grid, so the art never shimmers at any position or zoom.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {surfaces} from '../world/places/surfaces.js';
import {cliffProfile} from '../art/coast-cliffs.js';
import {projectedCoastBounds} from '../world/projection.js';
const COAST_BOUNDS = projectedCoastBounds(cliffProfile(surfaces.home_islet));

// Real overlay insets describe usable room independently of the chosen working zoom.
function villageSpace(camera, viewport = null) {
  const width = camera.right - camera.left, height = camera.top - camera.bottom;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const fraction = value => Number.isFinite(viewport?.height) && viewport.height > 0 && Number.isFinite(value)
    ? Math.max(0, value / viewport.height) : 0;
  const top = fraction(viewport?.top), bottom = fraction(viewport?.bottom), free = 1 - top - bottom;
  if (free <= 0) return null; // There is no honest island fit when overlays occupy the whole view.
  return {width, height, top, bottom, free};
}

// Fit the actual painted shore and cliff base; upright ornamental crowns may extend above this frame.
export function villageFrame(camera, placeId, viewport = null) {
  const space = villageSpace(camera, viewport);
  if (placeId !== 'home_islet' || !space) return null;
  const {width, height, top, bottom, free} = space, bounds = COAST_BOUNDS, margin = .4;
  const zoom = Math.min(1, width / (bounds.maxX - bounds.minX + margin * 2), height * free / (bounds.maxY - bounds.minY + margin * 2));
  const centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
  return {x: centerX, y: centerY - (bottom - top) * height / (2 * zoom), zoom, centerX, centerY, bounds};
}

export function createCamera(input) {
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, .1, 200);
  const start = projectPoint(-1, 10);
  camera.position.set(start.x, start.y + 3.1, 100); camera.lookAt(camera.position.x, camera.position.y, 0);
  camera.userData.viewHeight = 22; // world units tall at zoom 1 (at least 16 wide on a phone)
  let exploring = false, targetZoom = 1, placeId = 'lighthouse_isle', reduce = false, zoom = 1, village = false, villageViewport = null;
  const follow = new THREE.Vector2(camera.position.x, camera.position.y);
  let villageFit = true, villageZoom = 1, villageX = 0, villageY = 0;
  const fitVillage = () => { villageFit = true; villageZoom = 1; villageX = villageY = 0; };
  // The cabin/left-house/heart district is useful on a narrow screen; outskirts remain pannable.
  const workVillage = () => {
    const frame = villageBase(); if (!frame) return;
    const phone = (camera.right - camera.left) / (camera.top - camera.bottom) < .8;
    const center = phone ? projectPoint(-4, -4) : {x: frame.centerX, y: frame.centerY};
    villageFit = false; villageZoom = phone ? Math.max(frame.zoom, .9) : frame.zoom * 1.05;
    villageX = center.x; villageY = center.y;
  };
  const villageBase = () => villageFrame(camera, placeId, villageViewport);
  const workingZoom = frame => Math.max(frame.zoom, Math.min(2, villageZoom));
  function place(x, y) { follow.set(x, y); camera.position.set(x, y, 100); }
  function applyZoom(value) {
    zoom = value;
    if (Math.abs(value - camera.zoom) > 1e-6) { camera.zoom = value; camera.updateProjectionMatrix(); }
  }
  return {camera, get yaw() { return 0; }, get villageFit() { return village && villageFit; },
    setPlace(id, player) {
      placeId = id; village = false; fitVillage(); targetZoom = 1; const point = projectPoint(player.x, player.z);
      place(point.x, point.y + 3.1); zoom = 1;
      camera.zoom = 1; camera.updateProjectionMatrix();
    },
    pause() { exploring = false; },
    overview() { exploring = false; targetZoom = 1; applyZoom(1); },
    start(reducedMotion = false) { exploring = true; reduce = reducedMotion === true; },
    setVillageView(active, viewport = null) {
      const entering = active === true && !village;
      village = active === true; villageViewport = viewport;
      if (entering) workVillage();
    },
    villageControl(action) {
      const frame = exploring && village && villageBase();
      if (!frame) return;
      if (action === 'fit') { fitVillage(); return; }
      if (action === 'work') { workVillage(); return; }
      if (!['in', 'out'].includes(action)) return;
      const factor = action === 'in' ? 1.4 : 1 / 1.4;
      if (villageFit) { villageX = frame.centerX; villageY = frame.centerY; }
      villageZoom = Math.max(frame.zoom, Math.min(2, (villageFit ? frame.zoom : workingZoom(frame)) * factor));
      villageFit = villageZoom === frame.zoom;
      if (villageFit) villageX = villageY = 0;
    },
    panVillage(dx, dy, width, height) {
      const frame = exploring && village && villageBase();
      if (!frame || villageFit || ![dx, dy, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      const at = workingZoom(frame);
      villageX = THREE.MathUtils.clamp(villageX - dx * (camera.right - camera.left) / (width * at), frame.bounds.minX, frame.bounds.maxX);
      villageY = THREE.MathUtils.clamp(villageY + dy * (camera.top - camera.bottom) / (height * at), frame.bounds.minY, frame.bounds.maxY);
    },
    focusVillage(anchor) {
      const frame = exploring && village && villageBase(), space = frame && villageSpace(camera, villageViewport);
      const lift = anchor?.lift === undefined ? 0 : anchor.lift, tour = camera.userData.tour;
      if (!space || ![anchor?.x, anchor?.z, lift].every(Number.isFinite) || lift < 0 || lift > 12
        || Number.isFinite(camera.userData.battleZoom) || (Number.isFinite(tour?.x) && Number.isFinite(tour?.z))) return false;
      const wasFit = villageFit;
      if (wasFit && anchor.keepFit) return false;
      if (wasFit) workVillage();
      const point = projectPoint(anchor.x, anchor.z), at = workingZoom(frame), y = point.y + lift;
      // Retain the player's working view while the selected anchor fits a one-unit inner margin.
      if (Math.abs(point.x - villageX) <= Math.max(0, space.width / (2 * at) - 1)
        && Math.abs(y - villageY) <= Math.max(0, space.height * space.free / (2 * at) - 1)) return wasFit;
      villageX = THREE.MathUtils.clamp(point.x, frame.bounds.minX, frame.bounds.maxX);
      villageY = THREE.MathUtils.clamp(y, frame.bounds.minY, frame.bounds.maxY);
      return true;
    },
    update(delta, player) {
      if (!exploring || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, .1);
      const tour = camera.userData.tour, touring = Number.isFinite(tour?.x) && Number.isFinite(tour?.z);
      // Holding Tab looks at the whole island for a moment, also during a wave; letting go eases back.
      const peek = input?.held?.has?.('Tab') === true;
      const frame = !touring && (peek || (village && !Number.isFinite(camera.userData.battleZoom)))
        ? villageFrame(camera, placeId, village ? villageViewport : null) : null;
      // Fully obstructed management holds its last finite view until scrolling/layout restores room.
      // It must not fall through to captain zoom or consume exploration wheel input.
      if (!frame && village && placeId === 'home_islet' && !peek && !touring && !Number.isFinite(camera.userData.battleZoom)) return;
      if (frame) {
        // Tab borrows the whole-island frame without consuming the saved working view.
        if (village && !peek && !villageFit) {
          const baseZoom = frame.zoom;
          frame.zoom = workingZoom(frame);
          // Keep the working center in the measured free area as captions and bars reflow.
          frame.x = villageX;
          frame.y = villageY + (frame.y - frame.centerY) * baseZoom / frame.zoom;
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
