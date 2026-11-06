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
import {getPreferences,setPreferences,onPreferences,reducedMotion,watchSystemMotion} from './settings/preferences.js';
import {startLiveWeather,weatherAttribution} from './net/weather.js';
import {createCaseBridge} from './adapter/bridge.js';
import {createIntro} from './story/intro.js';
import {createLazyCinematics} from './world/cinematics/lazy.js';
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

export async function startGame({container,shell,audio,captions,caseAdapter}) {
  const scene = new THREE.Scene();
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  let active = false, disposed=false, hud, chart, cinematics, demo, intro, caseUi, marketUi = null, marketLoad = null, fpsFrames = 0, fpsStart = performance.now(), fps = 0,caseWorld=null,festival=null,festivalPending=null;
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:()=>!!(shell?.blocked || cinematics?.active || intro?.active || caseUi?.active || marketUi?.active), disposeVisuals(){cinematics?.dispose();intro?.dispose();demo?.dispose();caseUi?.dispose();festival?.dispose();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !demo?.active && !world.busy && !chart.open }), attach(place) { scene.add(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  cinematics = createLazyCinematics({container,world,emit,on,reducedMotion,caption:captions.show,resetInput:input.reset}); world.cinematic = cinematics.play;
  intro = createIntro({container,world,on,emit,resetInput:input.reset,onEnding:receipt=>caseUi?.completeIntro(receipt)}); world.intro = intro;
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},caseScreen:name=>caseUi?.open(name),quality(name){setUserQuality(name);}, chart() { if (active) chart.show(); },
  });
  const applyCaseView=view=>{hud.setCaptain(view);caseWorld=view.world;world.setRelightingComplete(view.world.lightsOn===true);if(view.world.festivalRemaining>0&&!festival&&!festivalPending){festivalPending=import('./world/festival.js').then(module=>{if(!disposed){festival=module.createFestival(scene);captions.show('Lantern festival · lights across the coast');}}).catch(()=>{}).finally(()=>{festivalPending=null;});}};
  caseUi=createCaseBridge({container,adapter:caseAdapter,world,resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),beforeOpen:()=>intro.close(),hasOtherOverlay:()=>intro.active||cinematics.active,onView:applyCaseView,onArrival:node=>intro.setArrival(node)});
  // The Island Exchange panel is made on the first visit to the market hall; its code loads only then.
  // The load is kept as one promise, so two quick presses of E (or A, or a tap) still make one panel.
  function loadMarket() {
    marketLoad ??= import('./screens/market/index.js').then(module => {
      marketUi = module.createMarketEntry({ container, resetInput: input.reset, focusGame: () => graphics.renderer.domElement.focus(),
        openShareholderRegister: () => caseUi.open('search', { spot: 'market_hall' }) });
      return marketUi;
    }).catch(error => { marketLoad = null; throw error; });
    return marketLoad;
  }
  async function openMarket() {
    try { const market = await loadMarket(); if (!disposed) await market.open(); }
    catch (error) { console.error(error); hud.message('The Island Exchange could not open. Try again.'); }
  }
  const stopListening = on('interact', event => {
    hud.notify(event.id);
    if (intro.active) return;
    if (event.id === 'market_hall') { openMarket(); return; }
    caseUi.interact(event);
  });
  const stopPlots = on('plot_clicked', event => hud.notify(event.plot));
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  try { await world.goTo('lighthouse_isle'); }
  catch (error) {
    disposed=true;stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    createLifetime(scene, art)(); graphics.renderer.dispose(); throw error;
  }
  const createCinematicDemo=new URLSearchParams(location.search).get('demo')==='1'?(await import('./ui/cinematic-demo.js')).createCinematicDemo:()=>({active:false,start(){},update(){},dispose(){}});
  demo=createCinematicDemo(container,world,{chart,sailing,player:controller.player,view,hud,
    skipCinematic:()=>cinematics.skip(),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    captureCase:()=>({view:caseUi.adapter?.read()??null,world:caseWorld,relit:world.relit}),presentCase:applyCaseView,restoreCase(snapshot){if(snapshot?.view)applyCaseView(snapshot.view);else{caseWorld=snapshot?.world??null;world.setRelightingComplete(!!snapshot?.relit);hud.setCaptain({captain:{name:'Captain pending',coins:null,save:{state:'local',label:'Local intro only'}}});}},
    begin(){caseUi.close();intro.close();shell.play();hud.start();},caption:captions.show,cue:audio.cue});
  const deviceActions={chart:()=>chart.show(),menu:()=>shell.show('pause'),isPlaying:()=>!demo.active&&!shell.blocked&&!world.busy&&!caseUi.active&&!marketUi?.active&&!chart.open};
  const touch=createTouchControls(container,input,deviceActions),gamepad=createGamepad(input,deviceActions);
  const stopLiveWeather=startLiveWeather({setWeather:changes=>{if(!demo.active)setWeather(changes);},onUpdate(answer){
    if(demo.active)return;
    hud.setWeatherCredit(weatherAttribution(answer));emit({type:'weather_updated',source:answer.source,fetchedAt:answer.fetchedAt});
  }});
  function applyPreferences(value){quality(value.quality);}
  const stopPreferences=onPreferences(applyPreferences),stopMotion=watchSystemMotion();applyPreferences(getPreferences());graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    gamepad.update();demo.update(delta);caseUi.tick(delta);
    if (!shell.blocked && !demo.active && !cinematics.active && !intro.active && !caseUi.active && !marketUi?.active) {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();
    if (input.consume('Escape')) hud.togglePanel(false);
    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked ? 0 : delta) * (settings.fastTime ? 0.8 : 0.003)) % 24;
    const speed=controller.update(delta, active && !demo?.active && !world.busy && !chart.open);
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    audio.update(delta,{weather:state,speed,night,active:active&&!world.busy&&!caseUi.active&&!marketUi?.active&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta); cinematics.update(delta);
    festival?.update(reducedMotion()?0:time,{active:(caseWorld?.festivalRemaining??0)>0,night,reducedMotion:reducedMotion(),quality:settings.quality,player:controller.player.position,lanternColour:caseWorld?.lanternColour});
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state,relit:world.relit,festival:(caseWorld?.festivalRemaining??0)>0 });
    view.update(delta, controller.player.position);
    const zone = active && !demo?.active && !world.busy && !chart.open ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(zone,active&&!demo.active&&!world.busy&&!caseUi.active&&!marketUi?.active&&!chart.open);
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
    camera: view.camera, view, player: controller.player, settings, quality:setUserQuality, setWeather, emit, on, world, chart, sailing, shell, audio, demo, caseUi };
  function dispose() {
    if(disposed)return;disposed=true;
    touch.dispose();gamepad.dispose();marketUi?.dispose();stopLiveWeather();stopPreferences();stopMotion();stop(); stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    graphics.renderer.dispose(); container.replaceChildren(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    captions.show('Graphics paused. Reload the page to restore the island.');
  }, { once: true });  return {dispose,hasOverlay:()=>intro.active||cinematics.active||chart.open||sailing.active||demo.active||caseUi.active||marketUi?.active,
    setMode(mode){audio.setScreen(mode);input.reset();if(mode==='playing')view.start();else view.pause();},
    async begin(resume=false){if(world.current?.id!=='lighthouse_isle')await world.goTo('lighthouse_isle',{fast:true});hud.start();intro.begin(resume);},
    startDemo(){return demo.start();}};
}
