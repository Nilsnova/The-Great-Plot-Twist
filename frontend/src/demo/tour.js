// Query-only presenter choreography. No fetches, account writes or persistent story progress.
import {createTourMachine} from './logic.js';
import {createDemoStory} from './story.js';
import recordedWeather from './recorded-weather.json';
import {getWeather,setWeather,presets} from '../world/weather.js';
import {settings} from '../config.js';
import {places} from '../world/places/registry.js';
export function createTour(ctx) {
  const machine=createTourMachine(),story=createDemoStory(ctx.container);
  let active=false,disposed=false,changing=false,generation=0,task=Promise.resolve(),snapshot=null,timer=null,wake=null,taskDone=true,stopPromise=null;
  function wait(ms){return new Promise(resolve=>{wake=resolve;timer=setTimeout(()=>{wake=null;resolve();},ms);});}
  function cancelWait(){clearTimeout(timer);wake?.();wake=null;}
  function closeViews(){story.close();ctx.chart.close();ctx.sailing.skip();ctx.skipCinematic();}
  function standAt(id){const zone=ctx.world.current?.zones.find(zone=>zone.id===id);if(zone){ctx.player.position.set(zone.x,zone.y,zone.z);ctx.view.setPlace(ctx.world.current.id,ctx.player.position);ctx.hud.message(zone.name);}}
  async function enter(token) {
    const id=machine.step.id;ctx.announce(machine.step);setWeather(id==='fog'?presets.fog:id==='storm'?presets.storm:recordedWeather);
    if(id==='intro'){story.open();await wait(5000);if(token!==generation)return;story.perform('to_desk');await wait(5000);if(token===generation)story.perform('read_log');return;}
    if(id==='arrival'){await ctx.world.goTo('lighthouse_isle',{fast:true});if(token===generation){ctx.hud.start();standAt('cottage');}}
    if(id==='chart'){ctx.chart.show();await wait(4000);if(token!==generation)return;ctx.chart.close();await ctx.world.goTo('saltreach_harbor');}
    if(id==='harbor'){await ctx.world.goTo('saltreach_harbor',{fast:true});if(token===generation)standAt('harbor_office');await wait(8000);if(token===generation)standAt('market_hall');await wait(8000);if(token===generation)standAt('captains_table');}
    if(id==='fog'||id==='storm'){settings.hour=21;ctx.caption(id==='fog'?'Fog settles over the harbor · weather override':'Rain and strong wind · storm override');if(id==='fog')ctx.cue('foghorn');}
    if(id==='finale'){settings.hour=23;for(const name of ['three_lights','fog_lift','schooner_reveal','unmask','relighting']){if(token!==generation)return;await ctx.world.cinematic(name);}}
  }
  function launch(){taskDone=false;const token=++generation;task=enter(token).catch(()=>{if(!disposed)ctx.caption('This highlight could not load. Press Space to continue.');}).finally(()=>{taskDone=true;});}
  function stop(restore=true) {
    if(stopPromise)return stopPromise;if(!active)return Promise.resolve();changing=true;generation++;cancelWait();closeViews();
    stopPromise=(async()=>{
      await task;if(disposed)return;machine.stop();
      try {if(restore&&snapshot){setWeather(snapshot.weather);settings.hour=snapshot.hour;await ctx.world.goTo(snapshot.place,{fast:true});if(ctx.world.current?.id===snapshot.place){ctx.player.position.copy(snapshot.position);ctx.view.setPlace(snapshot.place,ctx.player.position);}}}
      catch{ctx.caption('Rehearsal ended. Open the chart to choose a landing.');}
      finally{active=false;changing=false;ctx.announce(null);ctx.resetInput();ctx.focus();}
    })().finally(()=>{stopPromise=null;});return stopPromise;
  }
  async function advance(){if(!active||changing)return;changing=true;generation++;cancelWait();closeViews();await task;if(!active||disposed)return;if(machine.advance()){launch();changing=false;}else await stop();}
  const key=event=>{if(!active||event.code!=='Space')return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)advance();};window.addEventListener('keydown',key,true);
  return {get active(){return active;},start(){if(active||disposed||ctx.world.busy)return false;ctx.begin();snapshot={weather:getWeather(),hour:settings.hour,place:ctx.world.current?.id??'lighthouse_isle',position:ctx.player.position.clone()};active=true;ctx.resetInput();machine.start();launch();return true;},advance,stop,
    update(dt){if(!active||changing)return;machine.tick(dt);ctx.progress(machine.progress,machine.index);if(machine.due&&taskDone)advance();},
    dispose(){disposed=true;active=false;generation++;cancelWait();closeViews();story.dispose();window.removeEventListener('keydown',key,true);machine.stop();},
  };
}
