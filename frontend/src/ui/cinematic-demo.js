// Explicit query-only presenter tour plus individual visual rehearsal. Never reveals an identity.
import {cinematicNames} from '../world/cinematics/logic.js';
import {createPanel,createButton,createProgress} from './kit/index.js';
import {node} from './kit/dom.js';
import {createTour} from '../demo/tour.js';
import {tourSteps} from '../demo/logic.js';
import {speakerNotes} from '../demo/speaker-notes.js';
import {createPresenter} from '../shell/presenter/index.js';
import {createPerformancePanel} from '../shell/perf/index.js';
export function createCinematicDemo(container,world,ctx={}) {
  const params=new URLSearchParams(location.search);
  const demoEnabled=params.get('demo')==='1',perfEnabled=params.get('perf')==='1';
  if(!demoEnabled&&!perfEnabled)return {active:false,start(){},update(){},dispose(){}};
  const performancePanel=perfEnabled?createPerformancePanel(container,{readStats:ctx.readStats,setQuality:ctx.quality}):null;
  const placePerformancePanel=()=>{if(!performancePanel)return;const dialog=[...document.querySelectorAll('dialog[open]:not(.presenter-blank)')].at(-1),parent=dialog??container;if(performancePanel.element.parentElement!==parent)parent.append(performancePanel.element);};
  if(!demoEnabled)return {active:false,start(){},update(){performancePanel?.update();placePerformancePanel();},dispose(){performancePanel?.dispose();}};
  const recording=params.get('record')==='1';
  if(recording)container.classList.add('recording-frame');
  const body=node('div','cinematic-demo-body'),select=node('select'),label=node('label','','Visual beat'),copy=node('p','tour-copy','A short local highlights tour. Space skips each beat. No progress or backend writes.');
  label.append(select);select.setAttribute('aria-label','Cinematic to rehearse');
  cinematicNames.forEach(name=>{const option=node('option','',name.replaceAll('_',' '));option.value=name;select.append(option);});
  const play=createButton({label:'Play visual',onClick:()=>world.cinematic(select.value)}),start=createButton({label:'Start highlights tour',onClick:()=>tour.start()}),next=createButton({label:'Next beat · Space',onClick:()=>tour.advance()}),stop=createButton({label:'End rehearsal',onClick:()=>tour.stop(),variant:'quiet'});
  const progress=createProgress({label:'Highlight'}),details=node('details'),summary=node('summary','','Individual shots');details.append(summary,label,play.element);
  body.append(copy,start.element,progress.element,next.element,stop.element,details);
  const panel=createPanel({title:'Presenter · local rehearsal',body});panel.element.classList.add('cinematic-demo','presenter-panel');container.append(panel.element);copy.setAttribute('role','status');
  let currentProgress=0;
  const presenter=createPresenter({steps:tourSteps,notes:speakerNotes,onAction(action,value){if(action==='next')tour.advance();else if(action==='back')tour.back();else if(action==='pause')tour.pause();else if(action==='restart')tour.restart();else if(action==='jump')tour.jump(value);}});
  body.append(presenter.element);
  const tour=createTour({...ctx,container,world,progress(value){currentProgress=value;},announce(step){panel.update({title:step?.title??'Presenter · local rehearsal'});copy.textContent=step?.copy??'Tour finished. Player progress was not changed.';start.element.hidden=!!step;next.element.hidden=true;stop.element.hidden=!step;progress.element.hidden=!step;details.hidden=!!step;presenter.update({active:!!step,index:step?.index??-1,step,paused:step?.paused,changing:tour?.changing});}});
  progress.element.hidden=true;next.element.hidden=true;stop.element.hidden=true;
  let lastChanging=null,lastProgressPercent=-1,lastShellHidden=null;
  return {get active(){return tour.active;},get paused(){return tour.paused;},get changing(){return tour.changing;},get step(){return tour.step;},start:tour.start,stop:tour.stop,
    update(dt){tour.update(dt);performancePanel?.update();placePerformancePanel();if(lastChanging!==tour.changing){next.element.disabled=tour.changing;stop.element.disabled=tour.changing;lastChanging=tour.changing;}const percent=Math.round(currentProgress*100);if(percent!==lastProgressPercent){progress.update({value:currentProgress,max:1});lastProgressPercent=percent;}presenter.update({active:tour.active,index:tour.index,step:tour.active?tourSteps[tour.index]:null,paused:tour.paused,changing:tour.changing});const dialog=[...document.querySelectorAll('dialog[open]:not(.presenter-blank)')].at(-1),parent=tour.active&&dialog?dialog:container;if(panel.element.parentElement!==parent){parent.append(panel.element);panel.element.classList.toggle('in-dialog',parent!==container);}const shellHidden=!!document.querySelector('.shell-screen[open]');if(shellHidden!==lastShellHidden){panel.element.hidden=shellHidden;lastShellHidden=shellHidden;}},
    dispose(){tour.dispose();presenter.dispose();performancePanel?.dispose();container.classList.remove('recording-frame');for(const button of [play,start,next,stop])button.dispose();progress.dispose();panel.dispose();},
  };
}
