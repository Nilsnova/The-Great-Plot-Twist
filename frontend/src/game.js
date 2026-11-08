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
import {createHookWorld} from './world/hook/index.js';
import {sendCaseIntent} from './adapter/intent.js';
import {createCaseBridge} from './adapter/bridge.js';
import {attachIsletPanel} from './screens/islet/host.js';
import {createIsletHost} from './online/islet-host.js';
import {createMarketHost} from './online/market-host.js';
import {createPredictionsEntry} from './online/predictions-entry.js';
import {findPanelEntry,findPanelServices} from './online/panel-services.js';
import {createIntro} from './story/intro.js';
import {entranceFor,canEnterRoom} from './world/interiors/rooms.js';
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
import {createBuildBadge} from './build/badge.js';
import {startDiagnostics,noteUiAction,noteAdapterView,disposeDiagnostics} from './diagnostics/runtime.js';

export async function startGame({container,shell,audio,captions,caseAdapter,isAppBlocked,festivalEntry,session=defaultSession}) {
  startDiagnostics();noteAdapterView(caseAdapter?.read());
  const shortcuts=createShortcutsHost(container);
  const scene = new THREE.Scene();
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement),buildBadge=createBuildBadge(container);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  const isletState=createIsletState({on}),hookWorld=createHookWorld({scene,reducedMotion});
  let interiors=null,interiorLoad=null,roomRequest=0;
  let active = false, disposed=false, hud, chart, cinematics, demo, intro, caseUi, marketUi=null, marketLoad=null, experience,entryDestination=null,introPassage=false,beginRequest=0, fpsFrames = 0, fpsStart = performance.now(), fps = 0,caseWorld=null,festival=null,festivalPending=null,bulletin=null,weatherAnswer=null;
  const externalOverlay=()=>!!(shortcuts.active||shell?.blocked||isAppBlocked?.()||demo?.active||cinematics?.active||intro?.active||caseUi?.active||marketUi?.active||sportsUi.active||desk?.active||arenaOpen()||chart?.open||sailing.active||stopPlots?.active);
  const worldBlocked=()=>!!(shortcuts.active||shell?.blocked||isAppBlocked?.()||cinematics?.active||intro?.active||caseUi?.active||marketUi?.active||sportsUi.active||desk?.active||arenaOpen());
  const outsideBlocked=()=>externalOverlay()||world.busy||!!interiors?.active||!!interiorLoad;
  const sportsUi=createSportsEntry({container,getToken:session.getToken,onSessionChange:session.onChange,resetInput:input.reset,focusGame:()=>graphics.renderer.domElement.focus()});
  // The desk and app-owned ring capture current private capabilities before loading their screens.
  const desk=createPredictionsEntry({session,container,resetInput:input.reset,
    focus:()=>graphics.renderer.domElement.focus(),notify:message=>hud.message(message),
    onSignIn:()=>{desk.close();festivalEntry?.openAccount?.();}});
  const openDesk=()=>void desk.open();
  const arenaEntry=findPanelEntry(session,'arena');
  const arenaOpen=()=>arenaEntry?.active===true;
  const practice=new URLSearchParams(location.search);
  function panelLabel(zone){
    if(!['prediction_kiosk','arena_gate'].includes(zone))return;
    const feature=zone==='prediction_kiosk'?'predictions':'arena';
    const local=import.meta.env.DEV&&practice.get(feature==='predictions'?'desk':'arena')==='local';
    if(local||findPanelServices(session)?.getFlags()?.[feature]===true)return;
    return feature==='predictions'?'The prediction desk is closed for now.':'The ring is closed for now.';
  }
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:worldBlocked, disposeVisuals(){roomRequest++;interiors?.dispose();cinematics?.dispose();intro?.dispose();demo?.dispose();caseUi?.dispose();experience?.dispose();festival?.dispose();marketUi?.dispose();sportsUi.dispose();desk?.dispose();arenaEntry?.invalidate();shortcuts.dispose();isletState.dispose();hookWorld.dispose();stopIslet?.();stopActualIslet?.();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, isletState, reducedMotion, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !outsideBlocked() }), attach(place) { scene.add(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    roomRequest++;interiors?.close('travel',{immediate:true});
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  async function enterRoom(roomId){
    if(!canEnterRoom(roomId,intro?.state)||disposed||world.current?.id!=='lighthouse_isle')return false;
    const request=++roomRequest;input.reset();
    try{
      if(!interiors){
        interiorLoad??=import('./world/interiors/scene.js').then(module=>{
          if(disposed)return null;
          interiors=module.createInteriors({container,resetInput:input.reset,reducedMotion,onMenu:()=>shell.show('pause'),focus:()=>graphics.renderer.domElement.focus(),
            onInteract:event=>{if(intro.open(event.id,{resume:event.resume}))emit({type:'interact',id:event.id,place:event.place});},
            onExit({outside,placeId}){if(disposed||world.current?.id!==placeId)return;const p=controller.player.position;p.set(outside.x,world.current.groundHeight(outside.x,outside.z),outside.z);input.reset();}});
          return interiors;
        });
        await interiorLoad;
      }
      if(disposed||request!==roomRequest||world.current?.id!=='lighthouse_isle'||shell.blocked)return false;
      if(interiors?.roomId===roomId)return true;
      interiors?.close('story',{immediate:true});
      return interiors?.enter(roomId,{unlocked:canEnterRoom(roomId,intro.state)})??false;
    }catch(error){console.error(error);hud?.message('The room could not open. Try again.');return false;}
    finally{interiorLoad=null;}
  }
  function followStoryScene(scene){
    const room=({cottage:'cottage',desk:'cottage',shore:'boathouse',stairwell:'lighthouse',lamp_room:'lighthouse'})[scene];
    if(room)void enterRoom(room);else{roomRequest++;interiors?.close('story',{immediate:true});if(scene==='tower_door'){const p=controller.player.position;p.set(9,world.current.groundHeight(9,-3.7),-3.7);}}
  }
  cinematics = createLazyCinematics({container,world,emit,on,reducedMotion,caption:captions.show,resetInput:input.reset}); world.cinematic = cinematics.play;
  intro = createIntro({container,world,on,emit,resetInput:input.reset,readStory:caseAdapter?.read().mode==='local'?()=>import('./demo/intro-story.json').then(module=>module.default):null,onSceneChange:followStoryScene,onEnding:receipt=>caseUi?.completeIntro(receipt)}); world.intro = intro;
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},menu:()=>shell.show('pause'),caseScreen:name=>caseUi?.open(name),festival:()=>festivalEntry?.open(),quality(name){setUserQuality(name);}, chart() { if (active) chart.show(); },
  });
  hud.setFestivalAvailable(festivalEntry?.available===true);
  experience=createWorldExperience({scene,container,art,world,player:controller.player,camera:view.camera,canvas:graphics.renderer.domElement,reducedMotion,preferences:getPreferences,
    send:(name,...args)=>sendCaseIntent(caseUi.adapter,name,...args),openCrew:()=>caseUi.open('crew'),isDemo:()=>!!demo?.active,isIntro:()=>intro.active||introPassage,
    isBlocked:outsideBlocked});
  const stopIslet=isletState.subscribe(built=>chart.setIsletBuilt(built)),stopActualIslet=isletState.subscribeActual(built=>caseAdapter?.dev?.setIsletBuilt?.(built));
  const applyCaseView=view=>{bulletin=view.bulletin;hookWorld.setHook(bulletin?.status==='ready'?bulletin.chapterTwoHook:null);chart.setHook(bulletin?.status==='ready'?bulletin.chapterTwoHook:null);hud.setBulletin(view);hud.setCaptain(view);experience.apply(view);chart.setPartners(view.partners);chart.setKeepsakes(view.rewards.keepsakes);caseWorld=view.world;world.setRelightingComplete(view.world.lightsOn===true);if(view.world.festivalRemaining>0&&!festival&&!festivalPending){festivalPending=import('./world/festival.js').then(module=>{if(!disposed){festival=module.createFestival(scene);captions.show('Lantern festival · lights across the coast');}}).catch(()=>{}).finally(()=>{festivalPending=null;});}};
  caseUi=createCaseBridge({container,adapter:caseAdapter,world,canPlayCaseEffect:()=>!cinematics.active&&!world.busy,cancelCaseEffects:()=>cinematics.skip(),retryBulletin:()=>findPanelServices(session)?.retryBulletin?.()??Promise.resolve({ok:false}),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),beforeOpen:()=>intro.close(),hasOtherOverlay:()=>intro.active||cinematics.active,openIslet:()=>{caseUi.close();void stopPlots.open('islet_signal_station');},onView:view=>{noteAdapterView(view);if(!demo?.active)applyCaseView(view);},onArrival:(node,snapshot)=>{intro.setArrival(node);entryDestination=snapshot.arrival.destination??null;}});
  // Public prices and private trading share the factory's explicit-session capabilities.
  marketUi=createMarketHost({session,container,resetInput:input.reset,
    focusGame:()=>graphics.renderer.domElement.focus(),notify:message=>hud.message(message),
    openShareholderRegister:()=>caseUi.open('search',{spot:'market_hall'}),
    onSignIn:()=>{marketUi.close();festivalEntry?.openAccount?.();}});
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
    if (intro.active) return;
    if (event.id === 'sports_pavilion') { sportsUi.open().catch(()=>hud.message('The sports pavilion could not open. Try again.')); return; }
    if (event.id === 'prediction_kiosk') { openDesk(); return; }
    if (event.id === 'market_hall') { openMarket(); return; }
    caseUi.interact(event);
  });
  // Both this hotspot and the festival handoff use the same app-owned ring entry.
  const stopArena=on('interact',event=>{
    if(event.id!=='arena_gate'||intro.active)return;
    if(arenaEntry)void arenaEntry.open();else hud.message('The ring is closed for now.');
  });
  const stopPlots = createIsletHost({session,attach:attachIsletPanel,container,on,emit,
    resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    resetWorld:()=>isletState.resetAccount(),
    isDemo:()=>demo?.active===true||new URLSearchParams(location.search).get('demo')==='1'});
  void stopPlots.refresh();
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  try { await world.goTo('lighthouse_isle'); }
  catch (error) {
    disposed=true;container.removeEventListener('close',panelClosed,true);stopListening();stopArena(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    buildBadge.dispose();createLifetime(scene, art)(); graphics.renderer.dispose();graphics.renderer.domElement.remove(); throw error;
  }
  const createCinematicDemo=['demo','perf'].some(key=>new URLSearchParams(location.search).get(key)==='1')?(await import('./ui/cinematic-demo.js')).createCinematicDemo:()=>({active:false,start(){},update(){},dispose(){}});
  demo=createCinematicDemo(container,world,{chart,sailing,player:controller.player,view,hud,isletState,quality:setUserQuality,readStats(){const info=graphics.renderer.info;return {fps,calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,quality:settings.quality};},
    skipCinematic:()=>cinematics.skip(),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    captureCase:()=>({view:caseUi.adapter?.read()??null,world:caseWorld,relit:world.relit}),presentCase:applyCaseView,restoreCase(snapshot){if(caseUi.adapter)applyCaseView(caseUi.adapter.read());else if(snapshot?.view)applyCaseView(snapshot.view);else{caseWorld=snapshot?.world??null;world.setRelightingComplete(!!snapshot?.relit);hud.setCaptain({captain:{name:'Captain pending',coins:null,save:{state:'local',label:'Local intro only'}}});}},
    begin(){roomRequest++;interiors?.close('demo',{immediate:true});caseUi.close();intro.close();shell.play();hud.start();},caption:captions.show,cue:audio.cue});
  const deviceActions={chart:()=>chart.show(),menu:()=>shell.show('pause'),isPlaying:()=>active&&!outsideBlocked()};
  const touch=createTouchControls(container,input,deviceActions),gamepad=createGamepad(input,deviceActions);
  const stopLiveWeather=startLiveWeather({setWeather:changes=>{if(!demo.active)setWeather(changes);},onUpdate(answer){
    if(demo.active)return;
    weatherAnswer=answer;emit({type:'weather_updated',source:answer.source,fetchedAt:answer.fetchedAt});
  }});
  function applyPreferences(value){quality(value.quality);if(active&&!shell.blocked)view.start(reducedMotion());}
  const stopPreferences=onPreferences(applyPreferences),stopMotion=watchSystemMotion();applyPreferences(getPreferences());graphics.resize(view.camera);
  const resize = () => graphics.resize(view.camera); window.addEventListener('resize', resize);
  const stop = startLoop((delta, time) => {
    gamepad.update();demo.update(delta);caseUi.tick(delta);interiors?.update(delta,{blocked:externalOverlay()});
    if(entryDestination&&!world.busy&&!chart.open){const target=entryDestination;entryDestination=null;if(target!==world.current?.id)void travel(target,{fast:true});}
    if (!outsideBlocked()) {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();

    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked ? 0 : delta) * (settings.fastTime ? 0.8 : 0.003)) % 24;
    const speed=controller.update(delta, active && !outsideBlocked());
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    audio.update(delta,{weather:state,weatherAnswer,bulletin,isletBuilt:isletState.getBuilt(),speed,night,active:active&&!isAppBlocked?.()&&!world.busy&&!caseUi.active&&!(marketUi?.active||sportsUi.active)&&!desk?.active&&!arenaOpen()&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta); cinematics.update(delta,{paused:demo.active&&demo.paused});chart.update(delta);hookWorld.update(delta,{night,place:world.current?.id,active:active&&!world.busy&&!intro.active&&!shell.blocked});
    festival?.update(reducedMotion()?0:time,{active:(caseWorld?.festivalRemaining??0)>0,night,reducedMotion:reducedMotion(),quality:settings.quality,player:controller.player.position,lanternColour:caseWorld?.lanternColour});
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state,bulletin,weatherAnswer,relit:world.relit,festival:(caseWorld?.festivalRemaining??0)>0 });
    view.update(delta, controller.player.position);experience.update(delta,{speed});
    const doorway=active&&!outsideBlocked()?entranceFor(world.current?.id,controller.player.position):null;
    const zone = active&&!outsideBlocked() ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(doorway?({cottage:'cottage',boathouse:'shore',lighthouse:'tower_door'})[doorway.roomId]:zone,active&&!outsideBlocked());
    const entering=doorway&&canEnterRoom(doorway.roomId,intro.state);
    if(entering)void enterRoom(doorway.roomId);
    if(input.consume('KeyE')&&!entering&&zone)world.interact(zone);
    fpsFrames++;
    if (performance.now() - fpsStart >= 500) {
      fps = Math.round(fpsFrames * 1000 / (performance.now() - fpsStart)); fpsFrames = 0; fpsStart = performance.now();
    }
    const info = graphics.renderer.info.render;
    hud.update(doorway?({cottage:'cottage',boathouse:'shore',lighthouse:'tower_door'})[doorway.roomId]:zone, { fps, calls: info.calls, triangles: info.triangles, night,interactionLabel:doorway?`Enter ${doorway.roomId==='lighthouse'?'the lighthouse':doorway.roomId==='boathouse'?'the boathouse':'the cottage'}`:panelLabel(zone) }); input.endFrame();
  }, () => {
    const draw=!interiors?.active&&shell.mode!=='title';
    if(draw)graphics.renderer.render(scene,view.camera);
    graphics.sampleFrame(performance.now(),{active:draw&&active&&!outsideBlocked()});
  });
  // Local dev inspection only; Vite removes this branch in the production build.
  if (import.meta.env.DEV) window.__island = { scene, renderer: graphics.renderer,
    camera: view.camera, view, player: controller.player, settings, quality:setUserQuality, setWeather, emit, on, world, chart, sailing, shell, audio, demo, caseUi, get marketUi(){return marketUi;},sportsUi, get marketLoad(){return marketLoad;},get interiors(){return interiors;}, experience,isletState,hookWorld };
  function dispose() {
    if(disposed)return;disposed=true;container.removeEventListener('close',panelClosed,true);
    roomRequest++;interiors?.dispose();touch.dispose();gamepad.dispose();marketUi?.dispose();sportsUi.dispose();desk?.dispose();stopLiveWeather();stopPreferences();stopMotion();stop(); stopListening();stopArena(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    disposeDiagnostics();buildBadge.dispose();graphics.renderer.dispose();graphics.renderer.domElement.remove(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    captions.show('Graphics paused. Reload the page to restore the island.');
  }, { once: true });  return {dispose,resetInput:input.reset,setFestivalAvailable:value=>hud.setFestivalAvailable(value),hasOverlay:()=>!!interiors?.active||!!interiorLoad||shortcuts.active||intro.active||cinematics.active||chart.open||sailing.active||demo.active||caseUi.active||(marketUi?.active||sportsUi.active)||desk?.active||arenaOpen()||stopPlots.active,
    setMode(mode){if(mode==='title'){roomRequest++;interiors?.close('title',{immediate:true});}if(mode!=='playing'){marketUi?.close();desk.close();arenaEntry?.close();sportsUi.close();beginRequest++;introPassage=false;}audio.setScreen(mode);input.reset();if(mode==='playing')view.start(reducedMotion());else view.pause();},
    handleEscape(){
      if(shortcuts.active){shortcuts.close();return true;}
      if(arenaEntry?.pending&&!container.querySelector('.duel-modal[open]')){arenaEntry.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(desk.pending&&!container.querySelector('.desk-modal[open]')){desk.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(marketUi?.pending&&!container.querySelector('.market-modal[open]')){marketUi.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(stopPlots.active){stopPlots.close();input.reset();graphics.renderer.domElement.focus({preventScroll:true});return true;}
      if(hud.closeQuickPanels?.())return true;
      if(intro.active&&intro.closeJournal?.())return true;
      if(sportsUi.active&&!document.querySelector('.sports-modal[open]')){sportsUi.close();return true;}
      const panel=[...document.querySelectorAll('dialog[open]')].filter(node=>!node.classList.contains('cinematic-modal')&&!node.classList.contains('shell-screen')).at(-1);
      const debug=container.querySelector('.debug:not([hidden])');
      const action=escapePriority({panel:caseUi.active||!!panel||!!debug||(demo.active&&!cinematics.active),cinematic:cinematics.active,playing:!shell.blocked});
      if(action==='close_panel'){
        if(caseUi.active)caseUi.close();else if(panel)panel.dispatchEvent(new Event('cancel',{cancelable:true}));
        else if(debug)hud.togglePanel(false);else void demo.stop();return true;
      }
      if(action==='skip_cinematic'){cinematics.skip();return true;}
      if(interiorLoad&&!interiors?.active){roomRequest++;input.reset();return true;}
      if(interiors?.active){interiors.close();return true;}
      return false;
    },
    async begin(resume=false,continuation){
      noteUiAction(resume?'continue':'new_game');
      const token=++beginRequest;entryDestination=null;introPassage=true;
      roomRequest++;interiors?.close('begin',{immediate:true});sportsUi.close();caseUi.close();intro.close();chart.close();cinematics.skip();
      try{
        await demo.stop?.();await world.whenIdle();
        if(disposed||token!==beginRequest||shell.blocked)return;
        const destination=continuation?.kind==='world'?(continuation.place??'lighthouse_isle'):'lighthouse_isle';
        if(world.current?.id!==destination)await travel(destination,{fast:true});
        if(disposed||token!==beginRequest||shell.blocked||isAppBlocked?.()||world.current?.id!==destination)return;
        hud.start();if(continuation?.kind!=='world'){intro.begin(resume);if(intro.state)followStoryScene(intro.state.scene);}
      }finally{if(token===beginRequest)introPassage=false;}
    },
    startDemo(){return demo.start();}};
}
