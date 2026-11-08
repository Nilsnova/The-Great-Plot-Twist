// A touch tap walks along a safe route; dragging the stick still takes immediate control.
import {planTapPath,createTapWalker} from './tap-path.js';
export function createMapTouch({canvas,input,container,project,position,place,enabled,canStand}){
  const walker=createTapWalker(),marker=document.createElement('span');marker.className='tap-destination';marker.hidden=true;marker.setAttribute('aria-hidden','true');container.append(marker);
  let pointer=null,origin=null,placeId=null,frame=null,disposed=false,multi=false;
  const pointers=new Set();
  function cancel(){if(frame!==null)cancelAnimationFrame(frame);frame=null;walker.cancel();input.setVirtual('tap',{x:0,y:0});marker.hidden=true;}
  const reset=()=>{pointer=null;origin=null;multi=false;pointers.clear();cancel();};
  function down(event){
    if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
    pointers.add(event.pointerId);
    if(pointers.size>1){multi=true;cancel();return;}
    if(!enabled())return;pointer=event.pointerId;origin={x:event.clientX,y:event.clientY,place:place()};multi=false;cancel();
  }
  function move(event){if(event.pointerId===pointer&&origin&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>12)origin=null;}
  function up(event){
    pointers.delete(event.pointerId);
    if(event.pointerId!==pointer)return;const tapped=origin&&!multi,owner=origin?.place;pointer=null;origin=null;
    if(!tapped||!enabled())return;
    const target=project(event.clientX,event.clientY);if(!target)return;
    if(frame!==null)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=null;if(disposed||!enabled()||owner!==place()||pointers.size)return;const p=position();
      const path=planTapPath({x:p.x,y:p.z},{x:target.x,y:target.z},{canStand:(x,z)=>canStand(x,z)});
      if(path){placeId=place();walker.follow(path);}else cancel();});
  }
  function cancelled(event){pointers.delete(event.pointerId);if(event.pointerId===pointer){pointer=null;origin=null;}cancel();}
  const lost=event=>{if(pointers.has(event.pointerId))cancelled(event);};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancelled);
  canvas.addEventListener('lostpointercapture',lost);
  window.addEventListener('blur',reset);const visibility=()=>{if(document.hidden)reset();};document.addEventListener('visibilitychange',visibility);
  return {get active(){return walker.active;},cancel:reset,update(delta){
    const manual=input.axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft'],{excludeSource:'tap'})||input.axis(['KeyW','ArrowUp'],['KeyS','ArrowDown'],{excludeSource:'tap'});
    if(!enabled()||manual||(origin&&origin.place!==place())){reset();return;}
    const allowed=placeId===place();
    const p=position(),v=walker.direction({x:p.x,y:p.z},delta,{active:allowed});input.setVirtual('tap',{x:v.x,y:-v.y});
    marker.hidden=!walker.active;if(walker.active){const q=project(null,null,walker.target);if(q){marker.style.left=`${q.x}px`;marker.style.top=`${q.y}px`;}else marker.hidden=true;}
  },dispose(){if(disposed)return;disposed=true;reset();for(const [type,listener]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancelled],['lostpointercapture',lost]])canvas.removeEventListener(type,listener);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);marker.remove();}};
}
