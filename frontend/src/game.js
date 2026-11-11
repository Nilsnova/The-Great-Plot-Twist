// Connects place lifetime, the explorer, weather and the frame loop. No story rules.
import * as THREE from 'three';
import './ui/styles.css';
import './ui/travel.css';
import './ui/readability.css';
import './ui/kit/kit.css';
import './ui/shell.css';
import './ui/devices.css';
import './ui/open-panels.css';
import {createMapTouch} from './controls/map-touch.js';
import {canStand} from './player/collision.js';
import {session as defaultSession} from './online/session.js';
import {createSportsEntry} from './screens/sports/index.js';
import {createTouchControls} from './controls/touch.js';
import {createGamepad} from './controls/gamepad.js';
import {getPreferences,setPreferences,onPreferences,reducedMotion,watchSystemMotion} from './settings/preferences.js';
import {startLiveWeather} from './net/weather.js';
import {escapePriority} from './shell/escape.js';
import {createShortcutsHost} from './shell/shortcuts-host.js';
import {createWorldExperience} from './world/experience.js';
import {createIsletState} from './world/islet/state.js';
import {sendIntent} from './adapter/intent.js';
import {attachIsletPanel} from './screens/islet/host.js';
import {createIsletHost} from './online/islet-host.js';
import {createMarketHost} from './online/market-host.js';
import {createPredictionsEntry} from './online/predictions-entry.js';
import {findPanelServices} from './online/panel-services.js';
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
import { createLightPools } from './world/light-pools.js';
import { createPixelFx } from './world/fx.js';
import { createWeather, presets, setWeather } from './world/weather.js';
import { findZone } from './world/zones.js';
import { createCharacter } from './player/character.js';
import { createController } from './player/controller.js';
import { createCamera } from './player/camera.js';
import { createHud } from './ui/hud.js';
import {startDiagnostics,noteUiAction,noteAdapterView,disposeDiagnostics} from './diagnostics/runtime.js';

export async function startGame({container,shell,audio,captions,adapter,isAppBlocked,openAccount,session=defaultSession}) {
  startDiagnostics();noteAdapterView(adapter?.read());
  const shortcuts=createShortcutsHost(container);
  const scene = new THREE.Scene();
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene), lightPools = createLightPools(scene);
  const pixelFx = createPixelFx(scene); scene.userData.lightPools = lightPools; scene.userData.pixelFx = pixelFx;
  // The clock follows the player's local time (automated checks keep the old fixed morning).
  const followLocalTime = !navigator.webdriver; if (followLocalTime) { const now = new Date(); settings.hour = now.getHours() + now.getMinutes() / 60; }
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  const isletState=createIsletState({on});
  let mapTouch=null;
  let classDemo=null,classDemoLoad=null,pirates=null;
  let active = false, disposed=false, hud, chart, perf, marketUi=null, marketLoad=null, experience,beginRequest=0, fpsFrames = 0, fpsStart = performance.now(), fps = 0,weatherAnswer=null;
  const externalOverlay=()=>!!(classDemo?.active||shortcuts.active||shell?.blocked||isAppBlocked?.()||marketUi?.active||sportsUi.active||desk?.active||chart?.open||sailing.active||stopPlots?.active);
  const worldBlocked=()=>!!(classDemo?.active||shortcuts.active||shell?.blocked||isAppBlocked?.()||marketUi?.active||sportsUi.active||desk?.active);
  function resetControls(){mapTouch?.cancel();input.reset();}
  const outsideBlocked=()=>externalOverlay()||world.busy;
  const sportsUi=createSportsEntry({container,getToken:session.getToken,onSessionChange:session.onChange,resetInput:resetControls,focusGame:()=>graphics.renderer.domElement.focus()});
  // The desk and app-owned ring capture current private capabilities before loading their screens.
  const desk=createPredictionsEntry({session,container,resetInput:resetControls,
    focus:()=>graphics.renderer.domElement.focus(),notify:message=>hud.message(message),
    onSignIn:()=>{desk.close();openAccount?.();}});
  const openDesk=()=>void desk.open();
  const practice=new URLSearchParams(location.search);
  function panelLabel(zone){
    if(zone!=='prediction_kiosk')return;
    const local=import.meta.env.DEV&&practice.get('desk')==='local';
    if(local||findPanelServices(session)?.getFlags()?.predictions===true)return;
    return 'The prediction desk is closed for now.';
  }
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:worldBlocked, disposeVisuals(){mapTouch?.dispose();perf?.dispose();experience?.dispose();marketUi?.dispose();sportsUi.dispose();desk?.dispose();shortcuts.dispose();isletState.dispose();stopIslet?.();stopActualIslet?.();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, isletState, reducedMotion, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !outsideBlocked() }), attach(place) { scene.add(place.group); water.setCoast(place.group); lightPools.setPlace(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    mapTouch?.cancel();
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},menu:()=>shell.show('pause'),quality(name){setUserQuality(name);}, chart() { if (active) chart.show(); },
  });
  experience=createWorldExperience({scene,container,art,world,player:controller.player,camera:view.camera,canvas:graphics.renderer.domElement,reducedMotion,preferences:getPreferences,
    send:(name,...args)=>sendIntent(adapter,name,...args),
    isBlocked:outsideBlocked,presencePlace:place=>classDemo?.presencePlace(place)??place});
  const stopIslet=isletState.subscribe(built=>chart.setIsletBuilt(built)),stopActualIslet=isletState.subscribeActual(built=>adapter?.dev?.setIsletBuilt?.(built));
  const applyView=view=>{noteAdapterView(view);classDemo?.apply(view);hud.setCaptain(view);experience.apply(view);};
  const stopView=adapter?adapter.subscribe(event=>applyView(event.view)):()=>{};
  if(adapter)applyView(adapter.read());
  // Public prices and private trading share the factory's explicit-session capabilities.
  marketUi=createMarketHost({session,container,resetInput:resetControls,
    focusGame:()=>graphics.renderer.domElement.focus(),notify:message=>hud.message(message),
    onSignIn:()=>{marketUi.close();openAccount?.();}});
  const panelClosed=event=>{
    const element=event.target;if(element?.open||!element?.matches)return;
    if(element.matches('.market-modal')&&container.querySelector('.market-modal')===element
      &&marketUi.pending)marketUi.close();
    if(element.matches('.desk-modal')&&container.querySelector('.desk-modal')===element
      &&desk.pending)desk.close();
  };
  container.addEventListener('close',panelClosed,true);
  async function openMarket(){
    const task=marketUi.open();marketLoad=task;
    try{return await task;}finally{if(marketLoad===task)marketLoad=null;}
  }
  const stopListening = on('interact', event => {
    hud.notify(event.id);
    if (event.id === 'sports_pavilion') { sportsUi.open().catch(()=>hud.message('The sports pavilion could not open. Try again.')); return; }
    if (event.id === 'prediction_kiosk') { openDesk(); return; }
    if (event.id === 'market_hall') { openMarket(); return; }
  });
  const stopPlots = createIsletHost({session,attach:attachIsletPanel,container,on,emit,
    resetInput:resetControls,focus:()=>graphics.renderer.domElement.focus(),
    resetWorld:()=>isletState.resetAccount(),
    isDemo:()=>new URLSearchParams(location.search).get('demo')==='1'});
  void stopPlots.refresh();
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  try { await world.goTo('saltreach_harbor'); }
  catch (error) {
    disposed=true;container.removeEventListener('close',panelClosed,true);stopView();stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    createLifetime(scene, art)(); graphics.renderer.dispose();graphics.renderer.domElement.remove(); throw error;
  }
  // ?perf=1 shows the frame-rate panel (the old highlights tour left with the mystery, 10 Nov).
  if(new URLSearchParams(location.search).get('perf')==='1'){const {createPerformancePanel}=await import('./shell/perf/index.js');
    if(!disposed)perf=createPerformancePanel(container,{readStats(){const info=graphics.renderer.info;return {fps,calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,quality:settings.quality};},setQuality:setUserQuality});}
  // G29: the class demo (quest strip, class harbor, duel shortcut, Keeper's Lock, lamps) loads after the
  // front door, or with ?demo=1 (rehearsal) or ?present=1 (a projector rehearsal). Its own chunk.
  function classDemoQuery(){const query=new URLSearchParams(location.search);return query.get('demo')==='1'||query.get('present')==='1';}
  function loadClassDemo(){
    classDemoLoad??=import('./class-demo/index.js').then(module=>{
      if(disposed)return null;const query=new URLSearchParams(location.search);
      classDemo=module.createClassDemo({container,scene,world,player:controller.player,input,audio,reducedMotion,on,canvas:graphics.renderer.domElement,
        rehearsal:query.get('demo')==='1',present:query.get('present')==='1',send:(name,...args)=>sendIntent(adapter,name,...args),
        canStand:(x,z)=>canStand(x,z,world.current?.colliders??[],world.current?.groundHeight),simulate:presence=>experience.simulate(presence),
        focus:()=>graphics.renderer.domElement.focus({preventScroll:true}),resetInput:resetControls,cancelWalk:()=>mapTouch?.cancel(),
        isBlocked:()=>!active||outsideBlocked(),project:(x,z)=>{const rect=graphics.renderer.domElement.getBoundingClientRect();projected.set(x,-z*.72,0).project(view.camera);return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};}});
      const current=adapter?.read?.();if(current)classDemo.apply(current);
      return classDemo;
    }).catch(error=>{console.error(error);classDemoLoad=null;return null;});
    return classDemoLoad;
  }
  const projected=new THREE.Vector3(),canvas=graphics.renderer.domElement;
  canvas.setAttribute('aria-label','Island exploration. Tap a clear path or drag the movement stick to walk. Arrow keys and WASD also move.');
  mapTouch=createMapTouch({canvas,input,container,position:()=>controller.player.position,place:()=>world.current?.id,enabled:()=>active&&!disposed&&!outsideBlocked(),
    canStand:(x,z)=>canStand(x,z,world.current?.colliders??[],world.current?.groundHeight),
    project(x,y,target){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      if(target){projected.set(target.x,-target.y*.72,0).project(view.camera);return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};}
      projected.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2,0).unproject(view.camera);return {x:projected.x,z:-projected.y/.72};
    }});
  const deviceActions={onManualMove:()=>mapTouch.cancel(),chart:()=>chart.show(),menu:()=>shell.show('pause'),isPlaying:()=>active&&!outsideBlocked()};
  const touch=createTouchControls(container,input,deviceActions),gamepad=createGamepad(input,deviceActions);
  const stopLiveWeather=startLiveWeather({setWeather,onUpdate(answer){
    weatherAnswer=answer;emit({type:'weather_updated',source:answer.source,fetchedAt:answer.fetchedAt});
  }});
  function applyPreferences(value){quality(value.quality);if(active&&!shell.blocked)view.start(reducedMotion());}
  const stopPreferences=onPreferences(applyPreferences),stopMotion=watchSystemMotion();applyPreferences(getPreferences());graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    gamepad.update();adapter?.tick?.(delta);perf?.update();
    if (!outsideBlocked()) {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();

    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked && !followLocalTime ? 0 : delta) * (settings.fastTime ? 0.8 : followLocalTime ? 1 / 3600 : 0.003)) % 24;
    mapTouch.update(delta);
    const speed=controller.update(delta, active && !outsideBlocked());
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state, reducedMotion()?0:time); lightPools.update(reducedMotion()?0:time, night); pixelFx.update(delta);
    audio.update(delta,{weather:state,weatherAnswer,isletBuilt:isletState.getBuilt(),speed,night,active:active&&!isAppBlocked?.()&&!world.busy&&!(marketUi?.active||sportsUi.active)&&!desk?.active&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta);
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state,weatherAnswer });
    view.update(delta, controller.player.position);experience.update(delta,{speed});
    const zone = active&&!outsideBlocked() ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(zone,active&&!outsideBlocked());
    classDemo?.update(delta,{blocked:!active||outsideBlocked(),zoneActive:!!zone});
    if(input.consume('KeyE')&&zone)world.interact(zone);
    fpsFrames++;
    if (performance.now() - fpsStart >= 500) {
      fps = Math.round(fpsFrames * 1000 / (performance.now() - fpsStart)); fpsFrames = 0; fpsStart = performance.now();
    }
    const info = graphics.renderer.info.render;
    hud.update(zone, { fps, calls: info.calls, triangles: info.triangles, night,interactionLabel:panelLabel(zone) }); input.endFrame();
  }, () => {
    const draw=shell.mode!=='title';
    if(draw)graphics.renderer.render(scene,view.camera);
    graphics.sampleFrame(performance.now(),{active:draw&&active&&!outsideBlocked()});
  });
  // Local dev inspection only; Vite removes this branch in the production build.
  if (import.meta.env.DEV) window.__island = { scene, renderer: graphics.renderer,
    camera: view.camera, view, player: controller.player, settings, quality:setUserQuality, setWeather, emit, on, world, chart, sailing, shell, audio, adapter, get marketUi(){return marketUi;},sportsUi, get marketLoad(){return marketLoad;},mapTouch, experience,isletState,get classDemo(){return classDemo;} };
  function dispose() {
    if(disposed)return;disposed=true;container.removeEventListener('close',panelClosed,true);classDemo?.dispose();classDemo=null;void pirates?.then(harness=>harness?.dispose());
    mapTouch?.dispose();touch.dispose();gamepad.dispose();marketUi?.dispose();sportsUi.dispose();desk?.dispose();stopLiveWeather();stopPreferences();stopMotion();stop();stopView();stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    disposeDiagnostics();graphics.renderer.dispose();graphics.renderer.domElement.remove(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    captions.show('Graphics paused. Reload the page to restore the island.');
  }, { once: true });
  return {dispose,resetInput:resetControls,hasOverlay:()=>!!classDemo?.active||shortcuts.active||chart.open||sailing.active||(marketUi?.active||sportsUi.active)||desk?.active||stopPlots.active,
    setMode(mode){mapTouch?.cancel();if(mode!=='playing'){marketUi?.close();desk.close();sportsUi.close();beginRequest++;}audio.setScreen(mode);input.reset();if(mode==='playing')view.start(reducedMotion());else view.pause();},
    handleEscape(){
      if(shortcuts.active){shortcuts.close();return true;}
      if(classDemo?.handleEscape())return true;
      if(desk.pending&&!container.querySelector('.desk-modal[open]')){desk.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(marketUi?.pending&&!container.querySelector('.market-modal[open]')){marketUi.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(stopPlots.active){stopPlots.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(hud.closeQuickPanels?.())return true;
      if(sportsUi.active&&!document.querySelector('.sports-modal[open]')){sportsUi.close();return true;}
      const panel=[...document.querySelectorAll('dialog[open]')].filter(node=>!node.classList.contains('cinematic-modal')&&!node.classList.contains('shell-screen')).at(-1);
      const debug=container.querySelector('.debug:not([hidden])');
      const action=escapePriority({panel:!!panel||!!debug,playing:!shell.blocked});
      if(action==='close_panel'){
        if(panel)panel.dispatchEvent(new Event('cancel',{cancelable:true}));
        else hud.togglePanel(false);return true;
      }
      return false;
    },
    // Play lands the player outside in Saltreach Harbor (the front door's HARBOR_START), or where a
    // world continuation points. Every start loads the class demo layer (quest strip, lamps, duels).
    async begin(_resume=false,continuation){
      noteUiAction('play');
      mapTouch?.cancel();const token=++beginRequest;
      sportsUi.close();chart.close();
      await world.whenIdle();
      if(disposed||token!==beginRequest||shell.blocked)return;
      const destination=continuation?.kind==='world'?(continuation.place??'saltreach_harbor'):'saltreach_harbor';
      if(world.current?.id!==destination)await travel(destination,{fast:true});
      if(disposed||token!==beginRequest||shell.blocked||isAppBlocked?.()||world.current?.id!==destination)return;
      hud.start();
      // Lane P: ?pirates=demo plays waves with the fake API (src/pirates/dev-harness.js), its own lazy chunk.
      if(new URLSearchParams(location.search).get('pirates')==='demo')pirates??=import('./pirates/dev-harness.js').then(m=>disposed?null:m.startPirateDemo({scene,camera:view.camera,canvas:graphics.renderer.domElement,container,player:controller.player,world,input,audio,reducedMotion,quality:()=>settings.quality,isBlocked:()=>!active||outsideBlocked(),on,emit,travel})).catch(error=>{console.error(error);return null;});
      if(continuation?.demo!==false||classDemoQuery())void loadClassDemo();
    }};
}
