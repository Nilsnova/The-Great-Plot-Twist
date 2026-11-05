// Five skippable visual beats. Owns its dialog, bitmaps, frame state and event subscription.
import { createModal,createButton,createProgress } from '../../ui/kit/index.js';
import { node } from '../../ui/kit/dom.js';
import { places,lightIds } from '../places/registry.js';
import { pixelById } from '../../pixel/catalog.js';
import { characterIds } from '../../pixel/story-catalog.js';
import { getWeather } from '../weather.js';
import { cinematicNames,createTimeline,projectLights,durations } from './logic.js';
import { loadShotImages,shotAssetIds } from './images.js';
import { drawShot } from './render.js';
const titles={three_lights:'Three lights, one bearing.',fog_lift:'Beyond the fog.',schooner_reveal:'A hull in the mist.',unmask:'The mask falls.',relighting:'The coast relit.'};
export function createCinematics(ctx) {
  const body=node('div','cinematic-body'),canvas=node('canvas'),controls=node('div','cinematic-controls');canvas.width=448;canvas.height=256;
  canvas.setAttribute('aria-label','Pixel-art coastal cinematic');
  const status=node('p','cinematic-status');status.setAttribute('role','status');
  const progress=createProgress({label:'Coastal passage'}),skipButton=createButton({label:'Skip · Escape',onClick:()=>finish('skipped')});
  controls.append(progress.element,skipButton.element);body.append(canvas,status,controls);
  const modal=createModal({title:'The Saltreach Isles',body,onCancel:()=>finish('skipped')});modal.element.classList.add('cinematic-modal');
  const draw=canvas.getContext('2d');let current=null,disposed=false;
  function finish(stage) {
    const shot=current;if(!shot)return;current=null;ctx.resetInput?.();clearTimeout(shot.deadline);
    shot.loader.dispose();modal.close(stage);ctx.emit({type:'cinematic',name:shot.name,stage});shot.resolve({name:shot.name,stage});
  }
  function play(name,params={}) {
    if(disposed||current||ctx.world.busy||!cinematicNames.includes(name))return Promise.resolve(false);
    const ids=name==='relighting'?lightIds:(params.lights??['keepers_lamp','harbor_light','islet_signal_station']);
    let lights;try {if(name==='three_lights'&&ids.length!==3)return Promise.resolve(false);lights=projectLights(places,ids);}catch{return Promise.resolve(false);}
    const revealAsset=characterIds.includes(params.revealAsset)&&Object.hasOwn(pixelById,params.revealAsset)?params.revealAsset:null;
    const target=params.target&&Number.isFinite(params.target.x)&&Number.isFinite(params.target.y)?params.target:{x:places.the_teeth.chart[0],y:places.the_teeth.chart[1]};
    if(target.x<0||target.x>448||target.y<0||target.y>256)return Promise.resolve(false);
    const assets=shotAssetIds(name,revealAsset);
    const shot={name,lights,target,revealAsset,ready:false,time:0,timeline:createTimeline(name,{reducedMotion:ctx.reducedMotion()}),loader:loadShotImages(assets)};
    const result=new Promise(resolve=>{shot.resolve=resolve;});current=shot;ctx.resetInput?.();
    draw.fillStyle='#284b3b';draw.fillRect(0,0,448,256);status.textContent='At the edge of the coast…';progress.update({value:0,max:1,label:'Coastal passage'});
    const scale=Math.max(1,Math.floor(Math.min((innerWidth-90)/448,(innerHeight-220)/256)));modal.element.style.setProperty('--cinematic-scale',scale);
    modal.setTitle(titles[name]);modal.open(ctx.container,skipButton.element);
    // Loading is bounded to 2.5s; this final wall-clock bound also settles hidden tabs.
    shot.deadline=setTimeout(()=>finish('completed'),(durations[name]+3)*1000);
    ctx.emit({type:'cinematic',name,stage:'started'});
    shot.loader.ready.then(()=>{if(current!==shot)return;shot.ready=true;if(shot.timeline.done){render(shot);finish('skipped');}}).catch(()=>{if(current===shot)finish('cancelled');});
    return result;
  }
  function render(shot) {drawShot(draw,{...shot,images:shot.loader.images,p:shot.timeline.progress,wind:getWeather().wind});}
  const stop=ctx.on('finale',event=>{if(cinematicNames.includes(event.stage))play(event.stage);});
  return {get active(){return !!current;},play,skip(){finish('skipped');},
    update(dt){const shot=current;if(!shot?.ready)return;shot.time+=dt;shot.timeline.tick(dt);render(shot);progress.update({value:shot.timeline.progress,max:1});status.textContent='';if(shot.timeline.done)finish('completed');},
    dispose(){if(disposed)return;disposed=true;stop();finish('cancelled');skipButton.dispose();progress.dispose();modal.dispose();},
  };
}
