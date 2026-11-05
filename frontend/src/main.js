// Connects place lifetime, the explorer, weather and the frame loop. No story rules.
import * as THREE from 'three';
import './ui/styles.css';
import './ui/travel.css';
import './ui/readability.css';
import './ui/kit/kit.css';
import './ui/cinematics.css';
import './ui/intro.css';
import './ui/shell.css';
import './ui/devices.css';
import {createTouchControls} from './controls/touch.js';
import {createGamepad} from './controls/gamepad.js';
import {createAudio} from './audio/controller.js';
import {createCaptions} from './audio/captions.js';
import {createShell} from './shell/controller.js';
import {createSettingsView} from './settings/view.js';
import {getPreferences,setPreferences,onPreferences,reducedMotion,watchSystemMotion} from './settings/preferences.js';
import {introJournal} from './story/intro-journal.js';
import {startLiveWeather,weatherAttribution} from './net/weather.js';
import {createIntro} from './story/intro.js';
import { createCinematics } from './world/cinematics/controller.js';
import { createCinematicDemo } from './ui/cinematic-demo.js';
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
import { createPlace } from './world/places/factory.js';
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
  const captions=createCaptions(container),audio=createAudio({container,on,caption:captions.show});
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  let active = false, hud, chart, cinematics, demo, intro, shell, fpsFrames = 0, fpsStart = performance.now(), fps = 0;
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:()=>!!(shell?.blocked || cinematics?.active || intro?.active), disposeVisuals(){cinematics?.dispose();intro?.dispose();demo?.dispose();shell?.dispose();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !demo?.active && !world.busy && !chart.open }), attach(place) { scene.add(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  cinematics = createCinematics({container,world,emit,on,reducedMotion,resetInput:input.reset}); world.cinematic = cinematics.play;
  intro = createIntro({container,world,on,emit,resetInput:input.reset}); world.intro = intro;
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},quality(name){setUserQuality(name);}, chart() { if (active) chart.show(); },
  });
  const stopListening = on('interact', event => hud.notify(event.id));
  const stopPlots = on('plot_clicked', event => hud.notify(event.plot));
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  try { await world.goTo('lighthouse_isle'); }
  catch (error) {
    audio.dispose();captions.dispose();stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    createLifetime(scene, art)(); graphics.renderer.dispose(); throw error;
  }
  shell=createShell({container,readSave:()=>introJournal().read(),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    demo:new URLSearchParams(location.search).get('demo')==='1',onDemo:()=>demo.start(),settingsView:createSettingsView,hasOverlay:()=>intro.active||cinematics.active||chart.open||sailing.active,onState(mode){audio.setScreen(mode);input.reset();if(mode==='playing')view.start();else view.pause();},
    onPlay(resume){hud.start();intro.begin(resume);}});
  demo=createCinematicDemo(container,world,{chart,sailing,player:controller.player,view,hud,
    skipCinematic:()=>cinematics.skip(),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    begin(){shell.play();hud.start();},caption:captions.show,cue:audio.cue});
  const deviceActions={chart:()=>chart.show(),menu:()=>shell.show('pause'),isPlaying:()=>!demo.active&&!shell.blocked&&!world.busy&&!chart.open};
  const touch=createTouchControls(container,input,deviceActions),gamepad=createGamepad(input,deviceActions);
  const stopLiveWeather=startLiveWeather({setWeather:changes=>{if(!demo.active)setWeather(changes);},onUpdate(answer){
    if(demo.active)return;
    hud.setWeatherCredit(weatherAttribution(answer));emit({type:'weather_updated',source:answer.source,fetchedAt:answer.fetchedAt});
  }});
  function applyPreferences(value){quality(value.quality);}
  const stopPreferences=onPreferences(applyPreferences),stopMotion=watchSystemMotion();applyPreferences(getPreferences());graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    gamepad.update();demo.update(delta);
    if (!shell.blocked && !demo.active && !cinematics.active && !intro.active) {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();
    if (input.consume('Escape')) hud.togglePanel(false);
    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked ? 0 : delta) * (settings.fastTime ? 0.8 : 0.003)) % 24;
    const speed=controller.update(delta, active && !demo?.active && !world.busy && !chart.open);
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    audio.update(delta,{weather:state,speed,night,active:active&&!world.busy&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta); cinematics.update(delta);
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state });
    view.update(delta, controller.player.position);
    const zone = active && !demo?.active && !world.busy && !chart.open ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(zone,active&&!demo.active&&!world.busy&&!chart.open);
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
    camera: view.camera, view, player: controller.player, settings, quality, setWeather, emit, on, world, chart, sailing, shell, audio, demo };
  function dispose() {
    touch.dispose();gamepad.dispose();audio.dispose();captions.dispose();stopLiveWeather();stopPreferences();stopMotion();stop(); stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
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
