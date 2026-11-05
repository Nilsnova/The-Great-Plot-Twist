// Connects world, player, UI and the frame loop. Story logic plugs into events.js.
import * as THREE from 'three';
import './ui/styles.css';
import { settings } from './config.js';
import { createRenderer } from './core/renderer.js';
import { createInput } from './core/input.js';
import { startLoop } from './core/loop.js';
import { emit, on } from './core/events.js';
import { createIsland } from './world/island.js';
import { createWater } from './world/water.js';
import { createBoat } from './world/boat.js';
import { createSky } from './world/sky.js';
import { createWeather, presets, setWeather } from './world/weather.js';
import { findZone } from './world/zones.js';
import { createCharacter } from './player/character.js';
import { createController } from './player/controller.js';
import { createCamera } from './player/camera.js';
import { createHud } from './ui/hud.js';

function startGame() {
  const container = document.querySelector('#game'), scene = new THREE.Scene();
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const island = createIsland(scene), water = createWater(scene), boat = createBoat(scene);
  const sky = createSky(scene), weather = createWeather(scene), character = createCharacter();
  scene.add(character.group);
  const controller = createController(character, input, island.colliders), view = createCamera(input, island.cameraObstacles);
  let active = false, hud, fpsFrames = 0, fpsStart = performance.now(), fps = 0;
  function quality(name) { settings.quality = name; graphics.setQuality(name, scene); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(matchMedia('(prefers-reduced-motion: reduce)').matches); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, quality,
  });
  const stopListening = on('interact', event => hud.notify(event.id));
  quality(settings.quality); graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('Escape')) { view.start(true); hud.togglePanel(false); }
    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    settings.hour = (settings.hour + delta * (settings.fastTime ? 0.8 : 0.003)) % 24;
    controller.update(delta, view.yaw, active);
    const state = weather.update(delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    water.update(time, state); boat.update(time, state);
    island.update(controller.player.position, time, night); view.update(delta, controller.player.position);
    const zone = active ? findZone(controller.player.position) : null;
    if (input.consume('KeyE') && zone) emit({ type: 'interact', id: zone });
    fpsFrames++;
    if (performance.now() - fpsStart >= 500) {
      fps = Math.round(fpsFrames * 1000 / (performance.now() - fpsStart)); fpsFrames = 0; fpsStart = performance.now();
    }
    const info = graphics.renderer.info.render;
    hud.update(zone, { fps, calls: info.calls, triangles: info.triangles }); input.endFrame();
  }, () => { sky.follow(view.camera.position); graphics.renderer.render(scene, view.camera); });
  // A local dev-only inspection seam; never included in the production build.
  if (import.meta.env.DEV) window.__island = { scene, renderer: graphics.renderer,
    camera: view.camera, view, player: controller.player, settings, quality, setWeather, emit, on };
  function dispose() {
    stop(); stopListening(); input.dispose(); window.removeEventListener('resize', resize);
    const materials = new Set();
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    materials.forEach(material => material.dispose());
    graphics.renderer.dispose(); container.replaceChildren(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); stop();
    container.innerHTML = '<p class="error">Graphics paused. Reload the page to restore the island.</p>';
  });
}
try { startGame(); } catch (error) {
  console.error(error);
  document.querySelector('#game').innerHTML = '<p class="error">The island could not start. Enable WebGL 2 in a current desktop browser, then reload.</p>';
}
