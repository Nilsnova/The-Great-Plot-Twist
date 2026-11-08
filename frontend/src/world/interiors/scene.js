// A full-screen local room, with owned input/lifetime and unchanged island/story contracts.
import {rooms} from './rooms.js';
import {atExit,canStandInRoom,moveInRoom,nearestHotspot} from './logic.js';
import {planTapPath,createTapWalker} from '../../controls/tap-path.js';
import {paintRoom,paintCaptain,paintAtmosphere} from './paint.js';
import {createRoomControls} from './controls.js';
import {createCaptainArt} from './captain-art.js';
import './interiors.css';
export {entranceFor,canEnterRoom} from './rooms.js';

function node(tag,className,text){const element=document.createElement(tag);element.className=className;if(text)element.textContent=text;return element;}
function button(label,className,onClick){const element=node('button',className,label);element.type='button';element.onclick=onClick;return element;}

export function createInteriors({container,resetInput,focus,onInteract,onExit,onMenu,reducedMotion=()=>false}={}) {
  const element=node('section','interiors-scene'),canvas=node('canvas','interiors-canvas');
  const heading=node('h1','interiors-title'),objective=node('p','interiors-objective'),header=node('header','interiors-heading');
  const exit=button('Leave room','interiors-exit',()=>close()),hud=node('footer','interiors-hud');
  const hint=node('span','interiors-action-label'),act=button('Inspect','interiors-act',()=>activate());
  const markers=node('div','interiors-markers'),pad=node('nav','interiors-pad'),background=document.createElement('canvas');
  const destination=node('span','interiors-destination'),walker=createTapWalker({threshold:.008});
  destination.hidden=true;destination.setAttribute('aria-hidden','true');
  let room=null,roomId=null,position=null,disposed=false,blocked=false,closing=false,ready=false;
  let width=0,height=0,dpr=1,time=0,phase=0,face={x:0,y:1},timer=null,opener=null,near=null;
  const reduce=()=>typeof reducedMotion==='function'?!!reducedMotion():!!reducedMotion;
  element.hidden=true;element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');element.setAttribute('aria-label','Room exploration');
  canvas.tabIndex=0;canvas.setAttribute('role','img');pad.setAttribute('aria-label','Move around the room');
  for(const [direction,label,className] of [['up','↑','interiors-up'],['left','←','interiors-left'],['down','↓','interiors-down'],['right','→','interiors-right']]){
    const control=button(label,'interiors-direction',()=>{});control.classList.add(className);control.dataset.direction=direction;control.setAttribute('aria-label',`Walk ${direction}`);pad.append(control);
  }
  hint.setAttribute('role','status');header.append(heading,objective);hud.append(hint,act);
  element.append(canvas,destination,header,exit,markers,pad,hud);(container??document.body).append(element);
  function enabled(){return !!room&&!disposed&&!closing&&ready&&!blocked&&!document.querySelector('dialog[open]');}
  function cancelWalk(){walker.cancel();destination.hidden=true;}
  const controls=createRoomControls({element,canvas,pad,enabled,interact:()=>activate(),exit:()=>close(),onMenu,cancelWalk,
    onTap(target){if(enabled())walker.follow(planTapPath(position,target,{step:.025,margin:1,maxNodes:2000,
      canStand:(x,y)=>canStandInRoom(x,y,room.objects)}));}});
  const captainArt=createCaptainArt({onReady:()=>{if(!disposed)draw();}});
  function draw(){
    if(!room||!width||!height)return;
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
    c.drawImage(background,0,0,background.width,background.height,0,0,width,height);
    paintAtmosphere(c,width,height,room,time,reduce());paintCaptain(c,width,height,position,phase,face,reduce(),captainArt);
    const target=walker.target;destination.hidden=!target||!enabled();
    if(target){destination.style.left=`${target.x*100}%`;destination.style.top=`${target.y*100}%`;}
  }
  function resize(){
    if(!room||disposed)return;
    const rect=element.getBoundingClientRect();width=Math.max(1,Math.round(rect.width));height=Math.max(1,Math.round(rect.height));
    dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));canvas.width=background.width=Math.round(width*dpr);canvas.height=background.height=Math.round(height*dpr);
    const c=background.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);paintRoom(c,width,height,room);draw();
  }
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(element);
  window.addEventListener('resize',resize);
  function refresh(){
    if(!room)return;near=nearestHotspot(room,position);act.disabled=!near||!enabled();
    const action=near?`Inspect ${near.label.toLowerCase()}`:'Explore the room',label=near?'E · Inspect':room.objective;
    if(act.textContent!==action)act.textContent=action;if(hint.textContent!==label)hint.textContent=label;
  }
  function activate(spot=near){
    if(!spot||!enabled())return false;controls.reset();resetInput?.();
    onInteract?.({type:'interact',id:spot.id,place:room.placeId,roomId,resume:spot.resume===true});return true;
  }
  function finishClose(reason,notify=true){
    clearTimeout(timer);timer=null;const previous=room,previousId=roomId;room=null;roomId=null;closing=false;ready=false;near=null;
    element.hidden=true;element.removeAttribute('data-state');controls.reset();resetInput?.();
    if(!notify)return;
    try{onExit?.({roomId:previousId,placeId:previous.placeId,outside:{...previous.outside},reason});}
    finally{if(focus)focus();else if(opener?.isConnected)opener.focus({preventScroll:true});}
  }
  function close(reason='exit',{immediate=false}={}){
    if(!room||disposed||closing)return false;clearTimeout(timer);timer=null;closing=true;ready=false;controls.reset();resetInput?.();element.dataset.state='leaving';
    if(immediate||reduce())finishClose(reason);else timer=setTimeout(()=>finishClose(reason),180);return true;
  }
  function enter(id,{unlocked=false}={}){
    const next=Object.hasOwn(rooms,id)?rooms[id]:null;
    if(disposed||room||!next||(next.requiresOpenedDoor&&unlocked!==true))return false;
    room=next;roomId=id;position={...room.spawn};time=0;phase=0;face={x:0,y:-1};closing=false;blocked=false;opener=document.activeElement;
    resetInput?.();controls.reset();heading.textContent=room.title;objective.textContent=room.objective;
    canvas.setAttribute('aria-label',`${room.title}. Tap the floor, or use arrow keys or WASD to walk. E inspects the highlighted object. Escape leaves the room.`);
    markers.replaceChildren(...room.hotspots.map(spot=>{
      const marker=button(spot.label,'interiors-hotspot',()=>activate(spot));marker.style.left=`${spot.x*100}%`;marker.style.top=`${(spot.y-.11)*100}%`;return marker;
    }));
    element.hidden=false;ready=reduce();element.dataset.state=ready?'ready':'entering';resize();captainArt.load();refresh();canvas.focus({preventScroll:true});
    if(!ready)timer=setTimeout(()=>{timer=null;if(!room||closing||disposed)return;ready=true;element.dataset.state='ready';refresh();},220);
    return true;
  }
  return {element,get active(){return !!room&&!disposed;},get roomId(){return roomId;},
    enter,close,update(delta,state={}){
      if(!room||disposed)return;blocked=state.blocked===true;
      const manual=controls.read();if(!room||disposed)return;
      const vector=manual.x||manual.y?manual:walker.direction(position,delta,{active:enabled(),maxStep:.014,
        verticalFactor:Math.max(.5,Math.min(2,width/height))});
      const previous=position;position=moveInRoom(position,vector,enabled()?delta:0,room.objects,width/height);
      const moved=Math.hypot(position.x-previous.x,position.y-previous.y);
      if(moved>0){phase+=Math.min(Math.max(delta,0),.05)*12;face=vector;}else phase=0;
      if(Number.isFinite(delta)&&delta>0)time+=Math.min(delta,.05);
      refresh();draw();if(enabled()&&atExit(position))close('door');
    },dispose(){
      if(disposed)return;disposed=true;clearTimeout(timer);timer=null;controls.dispose();captainArt.dispose();
      observer?.disconnect();window.removeEventListener('resize',resize);
      room=null;roomId=null;resetInput?.();element.remove();canvas.width=canvas.height=background.width=background.height=1;
    }};
}
