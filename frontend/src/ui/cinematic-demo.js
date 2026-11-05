// Explicit query-only presenter tour plus individual visual rehearsal. Never reveals an identity.
import {cinematicNames} from '../world/cinematics/logic.js';
import {createPanel,createButton,createProgress} from './kit/index.js';
import {node} from './kit/dom.js';
import {createTour} from '../demo/tour.js';
export function createCinematicDemo(container,world,ctx={}) {
  if(new URLSearchParams(location.search).get('demo')!=='1')return {active:false,start(){},update(){},dispose(){}};
  const body=node('div','cinematic-demo-body'),select=node('select'),label=node('label','','Visual beat'),copy=node('p','tour-copy','A 2½-minute local tour. Space skips each beat. No progress or backend writes.');
  label.append(select);select.setAttribute('aria-label','Cinematic to rehearse');
  cinematicNames.forEach(name=>{const option=node('option','',name.replaceAll('_',' '));option.value=name;select.append(option);});
  const play=createButton({label:'Play visual',onClick:()=>world.cinematic(select.value)}),start=createButton({label:'Start highlights tour',onClick:()=>tour.start()}),next=createButton({label:'Next beat · Space',onClick:()=>tour.advance()}),stop=createButton({label:'End rehearsal',onClick:()=>tour.stop(),variant:'quiet'});
  const progress=createProgress({label:'Highlight'}),details=node('details'),summary=node('summary','','Individual shots');details.append(summary,label,play.element);
  body.append(copy,start.element,progress.element,next.element,stop.element,details);
  const panel=createPanel({title:'Presenter · local rehearsal',body});panel.element.classList.add('cinematic-demo','presenter-panel');container.append(panel.element);copy.setAttribute('role','status');
  let currentProgress=0;
  const tour=createTour({...ctx,container,world,progress(value){currentProgress=value;},announce(step){panel.update({title:step?.title??'Presenter · local rehearsal'});copy.textContent=step?.copy??'Tour finished. Player progress was not changed.';start.element.hidden=!!step;next.element.hidden=!step;stop.element.hidden=!step;progress.element.hidden=!step;details.hidden=!!step;}});
  progress.element.hidden=true;next.element.hidden=true;stop.element.hidden=true;
  return {get active(){return tour.active;},start:tour.start,stop:tour.stop,
    update(dt){tour.update(dt);progress.update({value:currentProgress,max:1});const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),parent=tour.active&&dialog?dialog:container;if(panel.element.parentElement!==parent)parent.append(panel.element);panel.element.classList.toggle('in-dialog',parent!==container);panel.element.hidden=!!document.querySelector('.shell-screen[open]');},
    dispose(){tour.dispose();for(const button of [play,start,next,stop])button.dispose();progress.dispose();panel.dispose();},
  };
}
