// Connects place lifetime, the explorer, weather and the frame loop. No story rules.
import * as THREE from 'three';
import './ui/styles.css';
import './ui/travel.css';
import './ui/readability.css';
import './ui/kit/kit.css';
import './ui/kit/components.css';
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
import {createTutorialHost} from './tutorial/host.js';
import {createWorldExperience} from './world/experience.js';
import {characterScale as characterScaleFor} from './pirates/character-scale.js';
import {createIsletState} from './world/islet/state.js';
import {sendIntent} from './adapter/intent.js';
import {attachIsletPanel} from './screens/islet/host.js';
import {createIsletHost} from './online/islet-host.js';
import {createMarketHost} from './online/market-host.js';
import {createHarbor,loadMarketCard,loadMatchCard} from './harbor/host.js';
import {findPanelServices} from './online/panel-services.js';
import {islandsMode as quickIslandsMode,resolveIslandsMode,startPlace} from './island/mode.js';
import {PLACE_ARRIVED} from './ui/quest-events.js';
import {readVisit} from './island/codes.js';
import {setOneIslandFlags,travelAllowed} from './island/one-island.js';
import {setMenuTravel} from './shell/menu-extras.js';
import {joinedHarbor} from './front-door/logic.js';
import { createChart } from './ui/chart.js';
import { createSailing } from './ui/sailing.js';
import { settings } from './config.js';
import { loadArt, setArtQuality } from './world/art.js';
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
import { POSE_IDS } from './pirates/poses.js';
import { createController } from './player/controller.js';
import { createCamera } from './player/camera.js';
import { createHud } from './ui/hud.js';
import {startDiagnostics,noteUiAction,noteAdapterView,disposeDiagnostics} from './diagnostics/runtime.js';
import {createNarrator} from './narrator/index.js';

export async function startGame({container,shell,audio,captions,adapter,isAppBlocked,openAccount,session=defaultSession}) {
  startDiagnostics();noteAdapterView(adapter?.read());
  const shortcuts=createShortcutsHost(container);
  // Menu › How to play (src/tutorial/): the paged card, loaded on first use; the one-island pages while the
  // sea chart is closed (travelOpen below, read when the card opens).
  const tutorial=createTutorialHost(container,{onClose:()=>graphics.renderer.domElement.focus({preventScroll:true}),one:()=>!travelOpen()});
  const scene = new THREE.Scene();
  // Your captain: the explorer frames and the ten captain colours (GAME-V3.md §7; painted on first use).
  const art = await loadArt([...pixelArtIds.filter(id => id.startsWith('explorer')),
    ...Array.from({length: 10}, (_, i) => ['', '-back', '-side'].flatMap(view => ['', '-walk-1', '-walk-2'].map(step => `captain-${i + 1}${view}${step}`))).flat(), ...POSE_IDS]);
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene), lightPools = createLightPools(scene);
  const pixelFx = createPixelFx(scene); scene.userData.lightPools = lightPools; scene.userData.pixelFx = pixelFx;
  // The clock follows the player's local time (automated checks keep the old fixed morning).
  const followLocalTime = !navigator.webdriver; if (followLocalTime) { const now = new Date(); settings.hour = now.getHours() + now.getMinutes() / 60; }
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  const isletState=createIsletState({on});
  // The narrator (src/narrator/): voiced lines and captions for the story and every new thing; keyed by island code.
  const narrator=createNarrator({container,on,audio,getGame:()=>{const visit=island?.visiting,own=island?.island;return visit?{code:visit.code,waveBest:0}:own?{code:own.code,waveBest:own.waveBest??0}:null;}});
  let mapTouch=null;
  let classDemo=null,classDemoLoad=null,island=null,islandLoad=null,islandsMode=null,pirates=null,waves=null,wavesLoad=null;
  let harbor=null, active = false, disposed=false, hud, chart, perf, marketUi=null, marketLoad=null, experience,beginRequest=0, fpsFrames = 0, fpsStart = performance.now(), fps = 0,weatherAnswer=null;
  const externalOverlay=()=>!!(harbor?.active||island?.active||classDemo?.active||shortcuts.active||tutorial.active||shell?.blocked||isAppBlocked?.()||marketUi?.active||sportsUi.active||chart?.open||sailing.active||stopPlots?.active);
  const worldBlocked=()=>!!(harbor?.active||island?.active||classDemo?.active||shortcuts.active||tutorial.active||shell?.blocked||isAppBlocked?.()||marketUi?.active||sportsUi.active);
  function resetControls(){mapTouch?.cancel();input.reset();}
  const outsideBlocked=()=>externalOverlay()||world.busy;
  const sportsUi=createSportsEntry({container,getToken:session.getToken,onSessionChange:session.onChange,resetInput:resetControls,focusGame:()=>graphics.renderer.domElement.focus(),onSignIn:()=>{sportsUi.close();openAccount?.();}},{load:loadMatchCard});
  // No prediction market in the game (D035, 11 Nov): the fortune teller and its desk are gone.
  function panelLabel(zone){return island?.label(zone);}
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:worldBlocked, disposeVisuals(){harbor?.dispose();mapTouch?.dispose();perf?.dispose();experience?.dispose();marketUi?.dispose();sportsUi.dispose();shortcuts.dispose();tutorial.dispose();isletState.dispose();stopIslet?.();stopActualIslet?.();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, isletState, island, reducedMotion, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !outsideBlocked() }), attach(place) { scene.add(place.group); water.setCoast(place.group); lightPools.setPlace(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    mapTouch?.cancel();
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  // One island (docs/GAME-V3.md §2): with the island game on, the sea chart and its travel stay hidden
  // (Menu, M, the gamepad and the goals) unless /api/config sends flags.one_island = false or ?oneisland=0.
  setOneIslandFlags(()=>{const services=findPanelServices(session);return services?.isReady()?services.getFlags():null;});
  const travelOpen=()=>travelAllowed({islandsMode:islandsMode??(islandsOn()?'live':'off'),classHarbor:joinedHarbor()});
  const showChart=()=>{if(travelOpen())chart.show();};
  setMenuTravel(travelOpen);
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus(),{visible:id=>island?.chartVisible(id)??true,label:id=>island?.chartLabel(id)??(id==='lighthouse_isle'&&waves?.point?'Pirate Point':undefined)});
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; setArtQuality(name); graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},menu:()=>shell.show('pause'),quality(name){setUserQuality(name);}, chart() { if (active) showChart(); },travel:()=>travelOpen(),placeName:id=>island?.placeName?.(id)??null,controls:()=>void shortcuts.open(),tutorial:()=>void tutorial.open(),
  });
  experience=createWorldExperience({scene,container,art,world,player:controller.player,camera:view.camera,canvas:graphics.renderer.domElement,reducedMotion,preferences:getPreferences,
    send:(name,...args)=>sendIntent(adapter,name,...args),
    colourOf:id=>island?.colourOf?.(id)??null,characterScale:()=>characterScale,
    isBlocked:outsideBlocked,presencePlace:place=>island?.presencePlace(place)??(place==='lighthouse_isle'&&(island||waves?.point)?'pirate_point':null)??classDemo?.presencePlace(place)??place});
  // Captains and boarders draw larger during a wave (1.4x, up to 1.8x on a phone: pirates/character-scale.js),
  // so they read at the zoomed-out battle camera; back to 1 when the wave's drawing stops.
  let characterScale=1,inBattle=false;const stopScale=[on('wave_controller_started',()=>{inBattle=true;}),on('wave_controller_stopped',()=>{inBattle=false;})];
  // The class goals (class demo) show in the quest strip except on your island, where the first-3-minutes
  // goals of src/ui/first-quests.js show (BUILD-PLAN 3.6). A class-code player keeps the class goals elsewhere.
  let classQuests=null;
  const onOwnIsland=()=>!!island&&world.current?.id==='home_islet';
  function showQuests(view=classQuests){classQuests=view??null;hud.setQuests(onOwnIsland()?null:classQuests);}
  const stopIslet=isletState.subscribe(built=>chart.setIsletBuilt(built)),stopActualIslet=isletState.subscribeActual(built=>adapter?.dev?.setIsletBuilt?.(built));
  const applyView=view=>{noteAdapterView(view);classDemo?.apply(view);hud.setCaptain(view);experience.apply(view);island?.setPresence(view?.presence);};
  const stopView=adapter?adapter.subscribe(event=>applyView(event.view)):()=>{};
  if(adapter)applyView(adapter.read());
  // Public prices and private trading share the factory's explicit-session capabilities.
  marketUi=createMarketHost({session,container,resetInput:resetControls,
    focusGame:()=>graphics.renderer.domElement.focus(),notify:message=>hud.message(message),
    onSignIn:()=>{marketUi.close();openAccount?.();},load:loadMarketCard});
  // Lane H: the Harbor overview (menu "Harbor") and the weather board; the stalls open the cards above.
  harbor=createHarbor({container,resetInput:resetControls,focusGame:()=>graphics.renderer.domElement.focus(),getWeather:()=>weatherAnswer,
    openStall:id=>void(id==='market'?openMarket():id==='match'?sportsUi.open().catch(()=>{}):null),notify:message=>hud.message(message)});
  const panelClosed=event=>{
    const element=event.target;if(element?.open||!element?.matches)return;
    if(element.matches('.market-modal')&&container.querySelector('.market-modal')===element
      &&marketUi.pending)marketUi.close();
  };
  container.addEventListener('close',panelClosed,true);
  async function openMarket(){
    const task=marketUi.open();marketLoad=task;
    try{return await task;}finally{if(marketLoad===task)marketLoad=null;}
  }
  const stopListening = on('interact', event => {
    if(island?.owns(event.id))return;
    hud.notify(event.id);
    if (event.id === 'sports_pavilion') { sportsUi.open().catch(()=>hud.message('The sports pavilion could not open. Try again.')); return; }
    if (event.id === 'market_hall') { openMarket(); return; }
  });
  // With the islands on, the old islet panel never opens and never reads GET /api/islet.
  function islandsOn(){
    if(islandsMode)return islandsMode!=='off';
    const services=findPanelServices(session);
    return quickIslandsMode({search:location.search,dev:import.meta.env.DEV,flags:services?.isReady()?services.getFlags():null})!=='off';
  }
  const stopPlots = createIsletHost({session,attach:attachIsletPanel,container,on,emit,
    resetInput:resetControls,focus:()=>graphics.renderer.domElement.focus(),
    resetWorld:()=>isletState.resetAccount(),isOff:islandsOn,
    isDemo:()=>new URLSearchParams(location.search).get('demo')==='1'});
  void stopPlots.refresh();
  const stopArrivals = on('arrived', event => {hud.arrive(event.place);showQuests();emit({type:PLACE_ARRIVED,id:event.place});});
  // A friend's game names its host once the island answers: the banner says "Nils's game", not "Your island".
  const stopVisitNamed = on('island_visit_named', event => {if(event.place===world.current?.id)hud.renamePlace();});
  try { await world.goTo('saltreach_harbor'); }
  catch (error) {
    disposed=true;container.removeEventListener('close',panelClosed,true);stopView();stopListening();for(const stopOne of stopScale)stopOne?.(); stopArrivals(); stopVisitNamed(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
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
        ringPiratePoint:async()=>(await ensureWaves())?.ringPiratePoint()??false,pointBattle:()=>!!waves?.point?.controller.wave,
        rehearsal:query.get('demo')==='1',present:query.get('present')==='1',send:(name,...args)=>sendIntent(adapter,name,...args),
        canStand:(x,z)=>canStand(x,z,world.current?.colliders??[],world.current?.groundHeight),simulate:presence=>experience.simulate(presence),quests:view=>showQuests(view),
        focus:()=>graphics.renderer.domElement.focus({preventScroll:true}),resetInput:resetControls,cancelWalk:()=>mapTouch?.cancel(),
        isBlocked:()=>!active||outsideBlocked(),project:(x,z)=>{const rect=graphics.renderer.domElement.getBoundingClientRect();projected.set(x,-z*.72,0).project(view.camera);return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};}});
      const current=adapter?.read?.();if(current)classDemo.apply(current);
      return classDemo;
    }).catch(error=>{console.error(error);classDemoLoad=null;return null;});
    return classDemoLoad;
  }
  // The island game (src/island/, flag "islands" or ?islands=fake in dev): decided once, at the first
  // Play, then loaded in its own chunk. Off keeps the old home islet and the harbor start.
  async function ensureIsland(){
    islandsMode??=await resolveIslandsMode({search:location.search,dev:import.meta.env.DEV,online:adapter?.read?.().mode==='online',
      readFlags:()=>{const services=findPanelServices(session);return services?.isReady()?services.getFlags():null;}});
    hud.refreshQuests?.();
    if(islandsMode==='off'||disposed)return islandsMode;
    islandLoad??=Promise.all([import('./island/index.js'),islandsMode==='fake'&&import.meta.env.DEV?import('./pirates/fake-api.js'):null]).then(([module,fake])=>{
      if(disposed)return null;
      island=module.createIsland({container,emit,on,mode:islandsMode,transport:fake?fake.createFakeIslandTransport():null,
        getTransport:()=>findPanelServices(session)?.request,resetInput:resetControls,reducedMotion,preferences:getPreferences,
        focus:()=>graphics.renderer.domElement.focus({preventScroll:true}),onCoins:(value,options)=>{hud.setCoinSource('island');hud.setCoins(value,options);},onCaptain:level=>hud.setCaptainLevel(level),
        // The Harbor building (GAME-V3.md §4) opens the same stalls as the old Harbor overview.
        openHarborStall:id=>void(id==='market'?openMarket():id==='match'?sportsUi.open().catch(()=>{}):null),
        // The visit chip: the old "Visiting … · Sail home" only where travel applies (src/island/one-island.js).
        travel:()=>travelOpen()});
      if(adapter)island.setPresence(adapter.read()?.presence);
      void ensureWaves();
      return island;
    }).catch(error=>{console.error(error);islandLoad=null;return null;});
    await islandLoad;return island?islandsMode:'off';
  }
  // The pirate waves (src/pirates/game-wiring.js): with the island game, or for the ?demo=1 rehearsal (Pirate
  // Point on the in-memory fake, no server). Own chunk, after Play; ?pirates=demo keeps lane P's harness.
  function ensureWaves(){
    const query=new URLSearchParams(location.search),rehearsal=query.get('demo')==='1';
    if(disposed||query.get('pirates')==='demo'||(!island&&!rehearsal))return null;
    wavesLoad??=Promise.all([import('./pirates/game-wiring.js'),import('./net/wave-rooms.js'),!island||islandsMode==='fake'?import('./pirates/room.js'):null,
      island?null:import('./pirates/fake-api.js')]).then(([module,rooms,local,fake])=>{
      if(disposed)return null;
      waves=module.wireWaves({scene,camera:view.camera,canvas:graphics.renderer.domElement,container,player:controller.player,world,input,audio,reducedMotion,
        quality:()=>settings.quality,isBlocked:()=>!active||outsideBlocked(),on,emit,island,fakeApi:fake?fake.createFakeIslandApi():null,
        rehearsal:!island,host:!island,openRoom:local?topic=>local.createLocalRoom(topic):topic=>rooms.openRoom(topic),notify:text=>hud.message(text)});
      return waves;
    }).catch(error=>{console.error(error);wavesLoad=null;return null;});
    return wavesLoad;
  }
  const projected=new THREE.Vector3(),canvas=graphics.renderer.domElement;
  canvas.setAttribute('aria-label','Island exploration. Tap a clear path or drag the movement stick to walk. Arrow keys and WASD also move.');
  mapTouch=createMapTouch({canvas,input,container,position:()=>controller.player.position,place:()=>world.current?.id,enabled:()=>active&&!disposed&&!outsideBlocked(),
    canStand:(x,z)=>canStand(x,z,world.current?.colliders??[],world.current?.groundHeight),
    project(x,y,target){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      if(target){projected.set(target.x,-target.y*.72,0).project(view.camera);return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};}
      projected.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2,0).unproject(view.camera);return {x:projected.x,z:-projected.y/.72};
    }});
  const deviceActions={onManualMove:()=>mapTouch.cancel(),chart:()=>showChart(),menu:()=>shell.show('pause'),isPlaying:()=>active&&!outsideBlocked()};
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
    if (input.consume('KeyM') && active && !sailing.active) showChart();

    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked && !followLocalTime ? 0 : delta) * (settings.fastTime ? 0.8 : followLocalTime ? 1 / 3600 : 0.003)) % 24;
    mapTouch.update(delta);
    // Captain health (GAME-V3.md §3): a fallen captain cannot walk, and lies as the wave draws them.
    const captainDown=!!(waves?.island.captainDown||waves?.point?.controller.captainDown);controller.player.visible=!captainDown;
    // A shot or a cutlass blow poses your own body (and a teammate's figure), never a second captain (pirates/poses.js).
    const poses=waves?.poses?.()??null;character.pose(poses?.own??null);
    const speed=captainDown?controller.update(delta,false):controller.update(delta, active && !outsideBlocked());
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state, reducedMotion()?0:time); lightPools.update(reducedMotion()?0:time, night); pixelFx.update(delta);
    audio.update(delta,{weather:state,weatherAnswer,isletBuilt:isletState.getBuilt(),speed,night,active:active&&!isAppBlocked?.()&&!world.busy&&!(marketUi?.active||sportsUi.active)&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta);
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state,weatherAnswer });
    characterScale=inBattle?characterScaleFor(view.camera.zoom):1;scene.userData.characterScale=characterScale;
    character.setColour(island?.game?island.captainColour():null);character.setScale(characterScale);
    view.update(delta, controller.player.position);
    // A captain down in the wave lies in the wave's drawing: their standing presence figure hides (pirates/figures.js).
    experience.update(delta,{speed,hide:waves?.figures?.(experience.figures())??null,poses:poses?.figures??null});
    const zone = active&&!outsideBlocked()&&!captainDown ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(zone,active&&!outsideBlocked());
    classDemo?.update(delta,{blocked:!active||outsideBlocked(),zoneActive:!!zone});
    // During a wave E belongs to the wave's own prompt (fire, repair, rebuild: TOWER-DEFENSE.md §12) when it has one,
    // so a wall's build card does not open instead of the rebuild.
    const waveAction=waves?.island.wave?.action??waves?.point?.controller.wave?.action??null;
    if(input.consume('KeyE')&&zone&&!waveAction)world.interact(zone);
    fpsFrames++;
    if (performance.now() - fpsStart >= 500) {
      fps = Math.round(fpsFrames * 1000 / (performance.now() - fpsStart)); fpsFrames = 0; fpsStart = performance.now();
    }
    const info = graphics.renderer.info.render;
    hud.update(waveAction?null:zone, { fps, calls: info.calls, triangles: info.triangles, night,interactionLabel:waveAction?undefined:panelLabel(zone),speed,blocked:!active||outsideBlocked()||!!waves?.island.wave||!!waves?.point?.controller.wave }); input.endFrame();
  }, () => {
    const draw=shell.mode!=='title';
    if(draw)graphics.renderer.render(scene,view.camera);
    graphics.sampleFrame(performance.now(),{active:draw&&active&&!outsideBlocked()});
  });
  // Local dev inspection only; Vite removes this branch in the production build.
  if (import.meta.env.DEV) window.__island = { get island(){return island;}, scene, renderer: graphics.renderer,
    camera: view.camera, view, player: controller.player, settings, quality:setUserQuality, setWeather, emit, on, world, chart, sailing, shell, audio, adapter, get marketUi(){return marketUi;},sportsUi, get marketLoad(){return marketLoad;},mapTouch, experience,isletState,get classDemo(){return classDemo;},get waves(){return waves;} };
  function dispose() {
    if(disposed)return;disposed=true;narrator.dispose();container.removeEventListener('close',panelClosed,true);classDemo?.dispose();classDemo=null;waves?.dispose();waves=null;island?.dispose();island=null;void pirates?.then(harness=>harness?.dispose());
    harbor?.dispose();mapTouch?.dispose();touch.dispose();gamepad.dispose();marketUi?.dispose();sportsUi.dispose();stopLiveWeather();stopPreferences();stopMotion();stop();stopView();stopListening();for(const stopOne of stopScale)stopOne?.(); stopArrivals(); stopVisitNamed(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    setMenuTravel(null);disposeDiagnostics();graphics.renderer.dispose();graphics.renderer.domElement.remove(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    captions.show('Graphics paused. Reload the page to restore the island.');
  }, { once: true });
  return {dispose,resetInput:resetControls,hasOverlay:()=>!!harbor?.active||!!island?.active||!!classDemo?.active||shortcuts.active||tutorial.active||chart.open||sailing.active||(marketUi?.active||sportsUi.active)||stopPlots.active,
    setMode(mode){mapTouch?.cancel();if(mode!=='playing'){harbor?.close();marketUi?.close();sportsUi.close();beginRequest++;}audio.setScreen(mode);input.reset();if(mode==='playing')view.start(reducedMotion());else view.pause();},
    handleEscape(){
      if(shortcuts.active){shortcuts.close();return true;}
      if(tutorial.active){tutorial.close();return true;}
      if(island?.handleEscape())return true;
      if(classDemo?.handleEscape())return true;
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
    // The games (docs/GAME-V3.md §2) for the front door's games card: the island lane, once the island game
    // is on (null with the islands off, or for a player who came with the class code).
    async gameLane(){if(disposed||joinedHarbor())return null;const mode=await ensureIsland();return !disposed&&mode!=='off'?island:null;},
    // The lobby over the island after Create, Join or Continue.
    openLobby(){if(!disposed&&island&&world.current?.id==='home_islet')island.openLobby();},
    // The island arrival cutscene (once per device), after the front door's goal card.
    // The "Your island" banner shows again as the player takes over.
    async playArrival(){if(disposed||!onOwnIsland())return;await island.playArrival();if(!disposed&&world.current)hud.arrive(world.current.id);},
    // Play lands the player outside in Saltreach Harbor (the front door's HARBOR_START), or where a
    // world continuation points. Every start loads the class demo layer (quest strip, lamps, duels).
    async begin(_resume=false,continuation){
      noteUiAction('play');
      mapTouch?.cancel();const token=++beginRequest;
      sportsUi.close();chart.close();
      await world.whenIdle();
      if(disposed||token!==beginRequest||shell.blocked)return;
      const planned=continuation?.kind==='world'?(continuation.place??'saltreach_harbor'):'saltreach_harbor';
      // With the islands on, Play lands on your own island (or the one you visit); a class code keeps the harbor.
      const mode=await ensureIsland();
      if(disposed||token!==beginRequest||shell.blocked)return;
      const visitCode=island?readVisit():null;if(visitCode&&island.visiting?.code!==visitCode)island.visit(visitCode);
      const destination=startPlace({mode,destination:planned,classHarbor:joinedHarbor(),visiting:!!island?.visiting});
      if(world.current?.id!==destination)await travel(destination,{fast:true});
      else if(destination==='home_islet')void island?.load();
      if(disposed||token!==beginRequest||shell.blocked||isAppBlocked?.()||world.current?.id!==destination)return;
      // The front door shows its goal card first on a first Play and then asks for the arrival itself.
      if(destination==='home_islet'&&continuation?.arrival!=='later')await island?.playArrival();
      if(disposed||token!==beginRequest||shell.blocked)return;
      hud.start();
      // With a game's lobby (GAME-V3.md §2) the narrator waits for its Start (game_started); else it begins here.
      if(destination==='home_islet'&&continuation?.lobby!==true)void narrator.begin();
      // Lane P: ?pirates=demo plays waves with the fake API (src/pirates/dev-harness.js), its own lazy chunk.
      if(new URLSearchParams(location.search).get('pirates')==='demo')pirates??=import('./pirates/dev-harness.js').then(m=>disposed?null:m.startPirateDemo({scene,camera:view.camera,canvas:graphics.renderer.domElement,container,player:controller.player,world,input,audio,reducedMotion,quality:()=>settings.quality,isBlocked:()=>!active||outsideBlocked(),on,emit,travel})).catch(error=>{console.error(error);return null;});
      if(continuation?.demo!==false||classDemoQuery())void loadClassDemo();
      void ensureWaves();
    }};
}
