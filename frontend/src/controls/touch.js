// Coarse-pointer controls: the stick and one contextual Use button (the HUD's Menu holds the sea chart).
// Pointer cancellation, overlays and app disposal release movement.
import {node} from '../ui/kit/dom.js';
import {touchVector} from './logic.js';
export function createTouchControls(container,input,actions) {
  const element=node('section','touch-controls');element.setAttribute('aria-label','Touch game controls');
  const stick=node('button','touch-stick'),thumb=node('span','touch-thumb');stick.type='button';stick.setAttribute('aria-label','Move: drag the stick, or focus and use arrow keys');stick.append(thumb);
  const buttons=node('div','touch-actions'),interact=node('button','','Use');interact.type='button';
  const movement=node('div','touch-stick-group'),help=node('span','touch-move-help','Drag to walk');movement.append(stick,help);
  buttons.append(interact);element.append(movement,buttons);container.append(element);
  let pointer=null;
  function release(){pointer=null;input.setVirtual('touch',{x:0,y:0});thumb.style.transform='translate(0px,0px)';}
  function move(event){if(event.pointerId!==pointer)return;const box=stick.getBoundingClientRect(),vector=touchVector(event.clientX-box.left-box.width/2,event.clientY-box.top-box.height/2);input.setVirtual('touch',vector);thumb.style.transform=`translate(${Math.round(vector.x*27)}px,${Math.round(-vector.y*27)}px)`;}
  const releasePointer=event=>{if(event.pointerId===pointer)release();};
  stick.onpointerdown=event=>{if(event.button!==0||pointer!==null)return;actions.onManualMove?.();pointer=event.pointerId;stick.setPointerCapture(pointer);move(event);};stick.onpointermove=move;
  stick.onpointerup=releasePointer;stick.onpointercancel=releasePointer;stick.onlostpointercapture=releasePointer;
  stick.onkeydown=event=>{const vectors={ArrowUp:{x:0,y:1},ArrowDown:{x:0,y:-1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};if(vectors[event.key]){event.preventDefault();actions.onManualMove?.();input.setVirtual('touch',vectors[event.key]);}};stick.onkeyup=release;stick.onblur=release;
  interact.onclick=()=>input.press('KeyE');
  const blur=()=>release();window.addEventListener('blur',blur);
  return {get active(){return pointer!==null;},update(zone,active){const show=active&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);if(!show&&!element.hidden)release();element.hidden=!show;interact.disabled=!zone;interact.hidden=!zone;interact.textContent='Use';},
    dispose(){window.removeEventListener('blur',blur);release();element.remove();}};
}
