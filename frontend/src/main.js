// Connects place lifetime, the explorer, weather and the frame loop. No story rules.
import * as THREE from 'three';
import './ui/styles.css';
import './ui/travel.css';
import { createChart } from './ui/chart.js';
import { createSailing } from './ui/sailing.js';
import { settings } from './config.js';
import { loadArt } from './world/art.js';
import { pixelArtIds } from './pixel/catalog.js';
import { createRenderer } from './core/renderer.js';
import { createInput } from './core/input.js';
import { startLoop } from './core/loop.js';
import { emit, on } from './core/events.js';
import { createWorld } from './world/places/manager.js';
import { createLighthousePlace } from './world/places/lighthouse.js';
import { createLifetime } from './world/places/resources.js';
import { createWater } from './world/water.js';
import { createSky } from './world/sky.js';
import { createWeather, presets, setWeather } from './world/weather.js';
import { findZone } from './world/zones.js';
import { createCharacter } from './player/character.js';
import { createController } from './player/controller.js';
import { createCamera } from './player/camera.js';
import { createHud } from './ui/hud.js';

async function startGame() {
  const container = document.querySelector('#game'), scene = new THREE.Scene();
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const character = createCharacter(art, { reducedMotion: reducedMotion() }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  let active = false, hud, chart, fpsFrames = 0, fpsStart = performance.now(), fps = 0;
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.skip, createPlace: id => {
    if (id !== 'lighthouse_isle') throw new Error('This place is still being drawn.');
    return createLighthousePlace();
  }, attach(place) { scene.add(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, quality, chart() { if (active) chart.show(); },
  });
  const stopListening = on('interact', event => hud.notify(event.id));
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  await world.goTo('lighthouse_isle');
  quality(settings.quality); graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();
    if (input.consume('Escape')) { if (active) view.start(true); hud.togglePanel(false); }
    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    settings.hour = (settings.hour + delta * (settings.fastTime ? 0.8 : 0.003)) % 24;
    controller.update(delta, active && !world.busy && !chart.open);
    const state = weather.update(delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    water.update(time, state); sailing.update(delta);
    world.update(delta, { player: controller.player.position, time, night, weather: state });
    view.update(delta, controller.player.position);
    const zone = active && !world.busy && !chart.open ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    if (input.consume('KeyE') && zone) world.interact(zone);
    fpsFrames++;
    if (performance.now() - fpsStart >= 500) {
      fps = Math.round(fpsFrames * 1000 / (performance.now() - fpsStart)); fpsFrames = 0; fpsStart = performance.now();
    }
    const info = graphics.renderer.info.render;
    hud.update(zone, { fps, calls: info.calls, triangles: info.triangles, night }); input.endFrame();
  }, () => { graphics.renderer.render(scene, view.camera); });
  // Local dev inspection only; Vite removes this branch in the production build.
  if (import.meta.env.DEV) window.__island = { scene, renderer: graphics.renderer,
    camera: view.camera, view, player: controller.player, settings, quality, setWeather, emit, on, world, chart, sailing };
  function dispose() {
    stop(); stopListening(); stopArrivals(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    graphics.renderer.dispose(); container.replaceChildren(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    container.innerHTML = '<p class="error">Graphics paused. Reload the page to restore the island.</p>';
  }, { once: true });
}
startGame().catch(error => {
  console.error(error);
  document.querySelector('#game').innerHTML = '<p class="error">The island could not start. Enable WebGL 2 in a current desktop browser, then reload.</p>';
});
