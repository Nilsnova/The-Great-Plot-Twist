// Room-owned input is released on overlays, pointer cancellation, blur and disposal.
export function createRoomControls({element, canvas, pad, enabled, interact, exit,onMenu=()=>{},onTap=()=>{},cancelWalk=()=>{}}) {
  const keys=new Set(),cleanups=[];let touch={x:0,y:0},pointer=null,lastA=false,lastB=false,lastMenu=false,tapTimer=null;
  const touches=new Set();let tap=null;
  function listen(target,name,fn,options){target.addEventListener(name,fn,options);cleanups.push(()=>target.removeEventListener(name,fn,options));}
  function currentPad(){try{return [...(navigator.getGamepads?.()??[])].find(p=>p?.connected&&p.mapping==='standard');}catch{return null;}}
  function manual(){tap=null;cancelWalk();}
  function reset(){manual();touches.clear();clearTimeout(tapTimer);tapTimer=null;keys.clear();touch={x:0,y:0};pointer=null;const p=currentPad();lastA=!!p?.buttons[0]?.pressed;lastB=!!p?.buttons[1]?.pressed;lastMenu=!!p?.buttons[9]?.pressed;}
  const touchPointer=event=>event.pointerType==='touch'||event.pointerType==='pen';
  listen(window,'pointerdown',event=>{
    if(!touchPointer(event)||(!element.contains(event.target instanceof Node?event.target:null)&&!touches.size))return;
    touches.add(event.pointerId);if(touches.size>1)manual();
  },true);
  listen(canvas,'pointerdown',event=>{
    if(!touchPointer(event)||event.button!==0||!enabled()||touches.size!==1)return;
    manual();tap={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  listen(window,'pointermove',event=>{
    if(tap?.id===event.pointerId&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>12)tap=null;
  },true);
  listen(window,'pointerup',event=>{
    const target=tap?.id===event.pointerId&&touches.size===1?tap:null;
    touches.delete(event.pointerId);if(tap?.id===event.pointerId)tap=null;
    if(!target||!enabled())return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1){canvas.focus({preventScroll:true});onTap({x,y});}
  },true);
  listen(window,'pointercancel',event=>{if(touches.delete(event.pointerId))manual();},true);
  listen(window,'lostpointercapture',event=>{if(touches.delete(event.pointerId))manual();},true);
  listen(document,'visibilitychange',()=>{if(document.hidden)reset();});
  function keydown(event){
    if(!enabled())return;
    if(event.code==='Tab'){
      const items=[...element.querySelectorAll('canvas[tabindex],button:not(:disabled)')].filter(item=>item.getClientRects().length);
      const index=items.indexOf(document.activeElement),next=index+(event.shiftKey?-1:1);
      if(index<0||next<0||next>=items.length){event.preventDefault();items[event.shiftKey?items.length-1:0]?.focus();}return;
    }
    if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();reset();exit();return;}
    if(['KeyE','Enter','Space'].includes(event.code)){
      if(event.target.closest?.('button'))return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat){reset();interact();}return;
    }
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();manual();keys.add(event.code);
    }
  }
  function keyup(event){keys.delete(event.code);if(enabled()&&event.code.startsWith('Arrow')){event.preventDefault();event.stopImmediatePropagation();}}
  listen(window,'keydown',keydown,true);listen(window,'keyup',keyup,true);listen(window,'blur',reset);
  const vectors={up:{x:0,y:-1},left:{x:-1,y:0},down:{x:0,y:1},right:{x:1,y:0}};
  for(const button of pad.querySelectorAll('button')){
    listen(button,'pointerdown',event=>{
      if(!enabled()||event.button!==0||pointer!==null)return;
      event.preventDefault();manual();clearTimeout(tapTimer);tapTimer=null;pointer=event.pointerId;touch=vectors[button.dataset.direction];button.setPointerCapture?.(pointer);canvas.focus({preventScroll:true});
    });
    const release=event=>{if(event.pointerId===pointer){pointer=null;touch={x:0,y:0};}};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(button,name,release);
    listen(button,'click',event=>{if(event.detail===0&&enabled()){manual();clearTimeout(tapTimer);touch=vectors[button.dataset.direction];tapTimer=setTimeout(()=>{tapTimer=null;touch={x:0,y:0};},120);}});
  }
  return {reset,read(){
    const p=currentPad(),a=!!p?.buttons[0]?.pressed,b=!!p?.buttons[1]?.pressed,menu=!!p?.buttons[9]?.pressed,allowed=enabled();
    if(allowed){if(a&&!lastA){manual();interact();}if(b&&!lastB&&enabled()){manual();exit();}if(menu&&!lastMenu&&enabled()){manual();onMenu();}}lastA=a;lastB=b;lastMenu=menu;
    if(!allowed){manual();clearTimeout(tapTimer);tapTimer=null;keys.clear();touch={x:0,y:0};return {x:0,y:0};}
    const axis=i=>Math.abs(p?.axes[i]??0)>.18?Math.max(-1,Math.min(1,p.axes[i])):0;
    const held=(...codes)=>codes.some(code=>keys.has(code));
    const vector={x:Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft'))+touch.x+axis(0),
      y:Number(held('KeyS','ArrowDown'))-Number(held('KeyW','ArrowUp'))+touch.y+axis(1)};
    if(vector.x||vector.y)manual();return vector;
  },dispose(){reset();cleanups.forEach(stop=>stop());}};
}
