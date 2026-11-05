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
import {escapePriority} from './shell/escape.js';
import {createShortcutsHost} from './shell/shortcuts-host.js';
import {createWorldExperience} from './world/experience.js';
import {sendCaseIntent} from './adapter/intent.js';
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

export async function startGame({container,shell,audio,captions,caseAdapter,isAppBlocked}) {
  const shortcuts=createShortcutsHost(container);
  const scene = new THREE.Scene();
  const art = await loadArt(pixelArtIds.filter(id => id.startsWith('explorer')));
  const graphics = createRenderer(container), input = createInput(graphics.renderer.domElement);
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  const controller = createController(character, input, []), view = createCamera(input);
  let active = false, disposed=false, hud, chart, cinematics, demo, intro, caseUi, experience,entryDestination=null,introPassage=false,beginRequest=0, fpsFrames = 0, fpsStart = performance.now(), fps = 0,caseWorld=null,festival=null,festivalPending=null;
  const sailing = createSailing(container, reducedMotion, () => settings.quality === 'low');
  const world = createWorld({ emit, isBlocked:()=>!!(shortcuts.active || shell?.blocked || isAppBlocked?.() || cinematics?.active || intro?.active || caseUi?.active), disposeVisuals(){cinematics?.dispose();intro?.dispose();demo?.dispose();caseUi?.dispose();experience?.dispose();festival?.dispose();shortcuts.dispose();}, transition: (id, options) => sailing.start(id, options),
    cancelTransition: sailing.end, finishTransition() { sailing.end(); graphics.renderer.domElement.focus(); }, createPlace: id => createPlace({ id, canvas: graphics.renderer.domElement, camera: view.camera,
      isActive: () => active && !demo?.active && !world.busy && !chart.open }), attach(place) { scene.add(place.group); controller.setPlace(place); view.setPlace(place.id, controller.player.position); } });
  async function travel(id, options) {
    try { await world.goTo(id, options); }
    catch (error) { console.error(error); hud.message('Passage interrupted. Please try again.'); }
  }
  cinematics = createLazyCinematics({container,world,emit,on,reducedMotion,caption:captions.show,resetInput:input.reset}); world.cinematic = cinematics.play;
  intro = createIntro({container,world,on,emit,resetInput:input.reset,readStory:caseAdapter?.read().mode==='local'?()=>import('./demo/intro-story.json').then(module=>module.default):null,onEnding:receipt=>caseUi?.completeIntro(receipt)}); world.intro = intro;
  chart = createChart(container, world, travel, () => graphics.renderer.domElement.focus());
  function setUserQuality(name){setPreferences({quality:name});}
  function quality(name) { settings.quality = name; graphics.setQuality(name); water.setQuality(name); }
  hud = createHud(container, {
    start() { active = true; view.start(reducedMotion()); },
    focus() { graphics.renderer.domElement.focus({ preventScroll: true }); }, settings(){shell?.openSettings();},caseScreen:name=>caseUi?.open(name),quality(name){setUserQuality(name);}, chart() { if (active) chart.show(); },
  });
  experience=createWorldExperience({scene,container,art,world,player:controller.player,camera:view.camera,canvas:graphics.renderer.domElement,reducedMotion,preferences:getPreferences,
    send:(name,...args)=>sendCaseIntent(caseUi.adapter,name,...args),openCrew:()=>caseUi.open('crew'),isDemo:()=>!!demo?.active,isIntro:()=>intro.active||introPassage,
    isBlocked:()=>shell.blocked||!!isAppBlocked?.()||intro.active||caseUi.active||cinematics.active||chart.open||sailing.active});
  const applyCaseView=view=>{hud.setCaptain(view);experience.apply(view);chart.setPartners(view.partners);chart.setKeepsakes(view.rewards.keepsakes);caseWorld=view.world;world.setRelightingComplete(view.world.lightsOn===true);if(view.world.festivalRemaining>0&&!festival&&!festivalPending){festivalPending=import('./world/festival.js').then(module=>{if(!disposed){festival=module.createFestival(scene);captions.show('Lantern festival · lights across the coast');}}).catch(()=>{}).finally(()=>{festivalPending=null;});}};
  caseUi=createCaseBridge({container,adapter:caseAdapter,world,resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),beforeOpen:()=>intro.close(),hasOtherOverlay:()=>intro.active||cinematics.active,onView:view=>{if(!demo?.active)applyCaseView(view);},onArrival:(node,snapshot)=>{intro.setArrival(node);entryDestination=snapshot.arrival.destination??null;}});
  const stopListening = on('interact', event => {hud.notify(event.id);if(!intro.active)caseUi.interact(event);});
  const stopPlots = on('plot_clicked', event => hud.notify(event.plot));
  const stopArrivals = on('arrived', event => hud.arrive(event.place));
  try { await world.goTo('lighthouse_isle'); }
  catch (error) {
    disposed=true;stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    createLifetime(scene, art)(); graphics.renderer.dispose();graphics.renderer.domElement.remove(); throw error;
  }
  const createCinematicDemo=new URLSearchParams(location.search).get('demo')==='1'?(await import('./ui/cinematic-demo.js')).createCinematicDemo:()=>({active:false,start(){},update(){},dispose(){}});
  demo=createCinematicDemo(container,world,{chart,sailing,player:controller.player,view,hud,
    skipCinematic:()=>cinematics.skip(),resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus(),
    captureCase:()=>({view:caseUi.adapter?.read()??null,world:caseWorld,relit:world.relit}),presentCase:applyCaseView,restoreCase(snapshot){if(caseUi.adapter)applyCaseView(caseUi.adapter.read());else if(snapshot?.view)applyCaseView(snapshot.view);else{caseWorld=snapshot?.world??null;world.setRelightingComplete(!!snapshot?.relit);hud.setCaptain({captain:{name:'Captain pending',coins:null,save:{state:'local',label:'Local intro only'}}});}},
    begin(){caseUi.close();intro.close();shell.play();hud.start();},caption:captions.show,cue:audio.cue});
  const deviceActions={chart:()=>chart.show(),menu:()=>shell.show('pause'),isPlaying:()=>!demo.active&&!shell.blocked&&!world.busy&&!caseUi.active&&!chart.open};
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
    if(entryDestination&&!world.busy&&!chart.open){const target=entryDestination;entryDestination=null;if(target!==world.current?.id)void travel(target,{fast:true});}
    if (!shell.blocked && !isAppBlocked?.() && !demo.active && !cinematics.active && !intro.active && !caseUi.active) {
    if (input.consume('KeyT')) settings.fastTime = !settings.fastTime;
    if (input.consume('KeyM') && active && !sailing.active) chart.show();

    for (let i = 0; i < 4; i++) if (input.consume(`Digit${i + 1}`)) setWeather(Object.values(presets)[i]);
    }
    settings.hour = (settings.hour + (shell.blocked ? 0 : delta) * (settings.fastTime ? 0.8 : 0.003)) % 24;
    const speed=controller.update(delta, active && !demo?.active && !world.busy && !chart.open);
    const state = weather.update(reducedMotion()?0:delta, controller.player.position, settings.quality);
    const night = sky.update(settings.hour, state);
    audio.update(delta,{weather:state,speed,night,active:active&&!world.busy&&!caseUi.active&&!chart.open,place:world.current?.id});
    water.update(reducedMotion()?0:time, state); sailing.update(delta); cinematics.update(delta);
    festival?.update(reducedMotion()?0:time,{active:(caseWorld?.festivalRemaining??0)>0,night,reducedMotion:reducedMotion(),quality:settings.quality,player:controller.player.position,lanternColour:caseWorld?.lanternColour});
    world.update(delta, { player: controller.player.position, time:reducedMotion()?0:time, night, weather: state,relit:world.relit,festival:(caseWorld?.festivalRemaining??0)>0 });
    view.update(delta, controller.player.position);experience.update(delta,{speed});
    const zone = active && !demo?.active && !world.busy && !chart.open ? findZone(controller.player.position, world.current?.zones ?? []) : null;
    touch.update(zone,active&&!demo.active&&!world.busy&&!caseUi.active&&!chart.open);
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
    camera: view.camera, view, player: controller.player, settings, quality:setUserQuality, setWeather, emit, on, world, chart, sailing, shell, audio, demo, caseUi, experience };
  function dispose() {
    if(disposed)return;disposed=true;
    touch.dispose();gamepad.dispose();stopLiveWeather();stopPreferences();stopMotion();stop(); stopListening(); stopArrivals(); stopPlots(); world.dispose(); chart.dispose(); sailing.dispose(); hud.dispose(); input.dispose();
    window.removeEventListener('resize', resize); createLifetime(scene, art)();
    graphics.renderer.dispose();graphics.renderer.domElement.remove(); delete window.__island;
  }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  graphics.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose();
    captions.show('Graphics paused. Reload the page to restore the island.');
  }, { once: true });  return {dispose,hasOverlay:()=>shortcuts.active||intro.active||cinematics.active||chart.open||sailing.active||demo.active||caseUi.active,
    setMode(mode){if(mode!=='playing'){beginRequest++;introPassage=false;}audio.setScreen(mode);input.reset();if(mode==='playing')view.start();else view.pause();},
    handleEscape(){
      if(shortcuts.active){shortcuts.close();return true;}
      const panel=[...document.querySelectorAll('dialog[open]')].filter(node=>!node.classList.contains('cinematic-modal')&&!node.classList.contains('shell-screen')).at(-1);
      const debug=container.querySelector('.debug:not([hidden])');
      const action=escapePriority({panel:caseUi.active||!!panel||!!debug||(demo.active&&!cinematics.active),cinematic:cinematics.active,playing:!shell.blocked});
      if(action==='close_panel'){
        if(caseUi.active)caseUi.close();else if(panel)panel.dispatchEvent(new Event('cancel',{cancelable:true}));
        else if(debug)hud.togglePanel(false);else void demo.stop();return true;
      }
      if(action==='skip_cinematic'){cinematics.skip();return true;}
      return false;
    },
    async begin(resume=false,continuation){
      const token=++beginRequest;entryDestination=null;introPassage=true;
      caseUi.close();intro.close();chart.close();cinematics.skip();
      try{
        await demo.stop?.();await world.whenIdle();
        if(disposed||token!==beginRequest||shell.blocked)return;
        const destination=continuation?.kind==='world'?(continuation.place??'lighthouse_isle'):'lighthouse_isle';
        if(world.current?.id!==destination)await travel(destination,{fast:true});
        if(disposed||token!==beginRequest||shell.blocked||isAppBlocked?.()||world.current?.id!==destination)return;
        hud.start();if(continuation?.kind!=='world')intro.begin(resume);
      }finally{if(token===beginRequest)introPassage=false;}
    },
    startDemo(){return demo.start();}};
}
