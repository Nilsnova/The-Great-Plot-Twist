// Query-only presenter choreography. No fetches, account writes or persistent story progress.
import {createFakeCaseAdapter} from '../adapter/fake/index.js';
import {createCaseScreens} from '../screens/controller.js';
import {createTourMachine} from './logic.js';
import {createDemoStory} from './story.js';
import recordedWeather from './recorded-weather.json';
import {getWeather,setWeather,presets} from '../world/weather.js';
import {settings} from '../config.js';

const BUILD=['plot_1','plot_2','islet_signal_station'];
export function createTour(ctx) {
  const machine=createTourMachine(),story=createDemoStory(ctx.container);
  let active=false,disposed=false,changing=false,generation=0,task=Promise.resolve(),snapshot=null,taskDone=true,stopPromise=null;
  let delay=0,delayed=null;
  const adapter=createFakeCaseAdapter(),screens=createCaseScreens({container:ctx.container,adapter,onView(view){if(active)ctx.presentCase?.(view);},focus:ctx.focus});
  function wait(seconds,token){if(disposed||token!==generation)return Promise.resolve();return new Promise(resolve=>{delay=seconds;delayed=resolve;});}
  function cancelWait(){delay=0;const resolve=delayed;delayed=null;resolve?.();}
  function closeViews(){screens.close();story.close();ctx.chart.close();ctx.sailing.skip();ctx.skipCinematic();}
  function standAt(id){const zone=ctx.world.current?.zones.find(zone=>zone.id===id);if(zone){ctx.player.position.set(zone.x,zone.y,zone.z);ctx.view.setPlace(ctx.world.current.id,ctx.player.position);ctx.hud.message(zone.name);}}
  function fakeBuild(ids){adapter.dev?.setIsletBuilt?.(ids);ctx.isletState?.previewBuilt?.(ids);}
  function announce(){ctx.announce?.(active?{...machine.step,index:machine.index,paused:machine.paused}:null);}
  async function enter(token) {
    const id=machine.step.id;announce();
    setWeather(id==='weather'?presets.fog:recordedWeather);
    if(id==='intro'){story.open();await wait(5,token);if(token!==generation)return;story.perform('to_desk');await wait(5,token);if(token===generation)story.perform('read_log');return;}
    if(id==='arrival'){await ctx.world.goTo('lighthouse_isle',{fast:true});if(token===generation){ctx.hud.start();standAt('cottage');}return;}
    if(id==='islet'){
      fakeBuild(['plot_1','plot_2']);await ctx.world.goTo('home_islet',{fast:true});if(token!==generation)return;
      standAt('plot_2');ctx.caption('The crew prepares the home islet · local rehearsal only.');await wait(2,token);if(token!==generation)return;
      fakeBuild(BUILD);standAt('islet_signal_station');ctx.caption('The signal station rises · temporary rehearsal preview.');return;
    }
    if(id==='chart'){
      ctx.chart.show();await wait(5,token);if(token!==generation)return;ctx.chart.close();await ctx.world.goTo('saltreach_harbor',{fast:true});return;
    }
    if(id==='harbor'){
      adapter.dev?.setBulletin?.('almanac');
      const peers=adapter.read().presence.others.slice(0,8).map((peer,index)=>({...peer,phase:index*.71,active:true,seat:peer.isCrew?index+1:null,at:Date.now(),place:'saltreach_harbor',x:-6+(index%4)*4,y:12+Math.floor(index/4)*5,moving:true}));
      const now=Date.now();adapter.dev?.setPresence?.({place:'saltreach_harbor',x:0,y:19,startedAt:now,now,sampledAt:now,peers,hiddenCount:0});
      await ctx.world.goTo('saltreach_harbor',{fast:true});if(token!==generation)return;
      standAt('captains_table');ctx.caption('Local captains gather at the harbor.');
      await screens.open('bulletin');await wait(8,token);if(token!==generation)return;screens.close();standAt('captains_table');return;
    }
    if(id==='board'){adapter.dev.rehearse('board');await screens.open('board');return;}
    if(id==='weather'){
      adapter.dev?.setBulletin?.('almanac');settings.hour=21;
      ctx.caption('The harbor almanac names a fog night. Storm weather is shown as a local rehearsal.');ctx.cue('foghorn');
      await wait(9,token);if(token!==generation)return;setWeather(presets.storm);ctx.caption('Rain and strong wind · local weather rehearsal.');return;
    }
    if(id==='finale'){
      settings.hour=23;adapter.dev.rehearse('finale');await screens.open('finale');await wait(6,token);if(token!==generation)return;
      screens.close();adapter.dev.rehearse('lock');for(const effect of adapter.read().effects){if(token!==generation)return;await ctx.world.cinematic(effect.name,effect.params);}return;
    }
    if(id==='relighting'){
      adapter.dev.rehearse('relighting');settings.hour=23;await ctx.world.cinematic('relighting');if(token!==generation)return;
      await ctx.world.goTo('gulls_rest',{fast:true});return;
    }
  }
  function launch(){taskDone=false;const token=++generation;task=enter(token).catch(()=>{if(!disposed)ctx.caption('This highlight could not load. Press Space to continue.');}).finally(()=>{taskDone=true;});}
  function resetRehearsal(){adapter.dev?.reset?.();ctx.isletState?.clearPreview?.();}
  function stop(restore=true) {
    if(stopPromise)return stopPromise;if(!active)return Promise.resolve();changing=true;generation++;cancelWait();closeViews();
    stopPromise=(async()=>{
      await task;if(disposed)return;machine.stop();
      try {if(restore&&snapshot){ctx.restoreCase?.(snapshot.case);setWeather(snapshot.weather);settings.hour=snapshot.hour;await ctx.world.goTo(snapshot.place,{fast:true});if(ctx.world.current?.id===snapshot.place){ctx.player.position.copy(snapshot.position);ctx.view.setPlace(snapshot.place,ctx.player.position);}}}
      catch{ctx.caption('Rehearsal ended. Open the chart to choose a landing.');}
      finally{ctx.isletState?.clearPreview?.();resetRehearsal();active=false;changing=false;announce();ctx.resetInput();ctx.focus();}
    })().finally(()=>{stopPromise=null;});return stopPromise;
  }
  async function select(index){if(!active||changing)return false;changing=true;generation++;cancelWait();closeViews();await task;if(!active||disposed)return false;
    const selected=machine.jump(index);if(selected){launch();changing=false;announce();return true;}changing=false;return false;}
  async function advance(){if(!active||changing)return;if(machine.index+1>=9){await stop();return;}return select(machine.index+1);}
  async function back(){return select(Math.max(0,machine.index-1));}
  async function restart(){if(!active||changing)return;changing=true;generation++;cancelWait();closeViews();await task;if(!active||disposed)return;
    try{if(snapshot){ctx.restoreCase?.(snapshot.case);setWeather(snapshot.weather);settings.hour=snapshot.hour;await ctx.world.goTo(snapshot.place,{fast:true});if(ctx.world.current?.id===snapshot.place){ctx.player.position.copy(snapshot.position);ctx.view.setPlace(snapshot.place,ctx.player.position);}}}
    catch{} resetRehearsal();ctx.isletState?.clearPreview?.();machine.restart();launch();changing=false;announce();}
  function togglePause(){if(!active)return false;const paused=machine.togglePause();announce();return paused;}
  const key=event=>{if(!active||event.code!=='Space')return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)advance();};window.addEventListener('keydown',key,true);
  return {get active(){return active;},get changing(){return changing;},get step(){return machine.step?.id??null;},get index(){return machine.index;},get paused(){return machine.paused;},start(){if(active||disposed||ctx.world.busy)return false;resetRehearsal();ctx.begin();snapshot={case:ctx.captureCase?.(),weather:getWeather(),hour:settings.hour,place:ctx.world.current?.id??'lighthouse_isle',position:ctx.player.position.clone()};active=true;ctx.resetInput();machine.start();launch();return true;},advance,back,jump:select,restart,pause:togglePause,stop,
    update(dt){if(!active||changing)return;adapter.tick(dt);machine.tick(dt);if(delay>0&&!machine.paused){delay=Math.max(0,delay-Math.max(0,dt));if(delay===0){const resolve=delayed;delayed=null;resolve?.();}}ctx.progress?.(machine.progress,machine.index);if(machine.due&&taskDone)advance();},
    dispose(){disposed=true;active=false;generation++;cancelWait();closeViews();ctx.isletState?.clearPreview?.();screens.dispose();adapter.dispose();story.dispose();window.removeEventListener('keydown',key,true);machine.stop();},
  };
}
