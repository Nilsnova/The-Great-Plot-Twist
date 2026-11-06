// Room-owned input is released on overlays, pointer cancellation, blur and disposal.
export function createRoomControls({element, canvas, pad, enabled, interact, exit,onMenu=()=>{}}) {
  const keys=new Set(),cleanups=[];let touch={x:0,y:0},pointer=null,lastA=false,lastB=false,lastMenu=false,tapTimer=null;
  function listen(target,name,fn,options){target.addEventListener(name,fn,options);cleanups.push(()=>target.removeEventListener(name,fn,options));}
  function currentPad(){return [...(navigator.getGamepads?.()??[])].find(p=>p?.connected&&p.mapping==='standard');}
  function reset(){clearTimeout(tapTimer);tapTimer=null;keys.clear();touch={x:0,y:0};pointer=null;const p=currentPad();lastA=!!p?.buttons[0]?.pressed;lastB=!!p?.buttons[1]?.pressed;lastMenu=!!p?.buttons[9]?.pressed;}
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
      event.preventDefault();event.stopImmediatePropagation();keys.add(event.code);
    }
  }
  function keyup(event){keys.delete(event.code);if(enabled()&&event.code.startsWith('Arrow')){event.preventDefault();event.stopImmediatePropagation();}}
  listen(window,'keydown',keydown,true);listen(window,'keyup',keyup,true);listen(window,'blur',reset);
  const vectors={up:{x:0,y:-1},left:{x:-1,y:0},down:{x:0,y:1},right:{x:1,y:0}};
  for(const button of pad.querySelectorAll('button')){
    listen(button,'pointerdown',event=>{
      if(!enabled()||event.button!==0||pointer!==null)return;
      event.preventDefault();clearTimeout(tapTimer);tapTimer=null;pointer=event.pointerId;touch=vectors[button.dataset.direction];button.setPointerCapture?.(pointer);canvas.focus({preventScroll:true});
    });
    const release=event=>{if(event.pointerId===pointer){pointer=null;touch={x:0,y:0};}};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(button,name,release);
    listen(button,'click',event=>{if(event.detail===0&&enabled()){clearTimeout(tapTimer);touch=vectors[button.dataset.direction];tapTimer=setTimeout(()=>{tapTimer=null;touch={x:0,y:0};},120);}});
  }
  return {reset,read(){
    const p=currentPad(),a=!!p?.buttons[0]?.pressed,b=!!p?.buttons[1]?.pressed,menu=!!p?.buttons[9]?.pressed,allowed=enabled();
    if(allowed){if(a&&!lastA)interact();if(b&&!lastB&&enabled())exit();if(menu&&!lastMenu&&enabled())onMenu();}lastA=a;lastB=b;lastMenu=menu;
    if(!allowed){clearTimeout(tapTimer);tapTimer=null;keys.clear();touch={x:0,y:0};return {x:0,y:0};}
    const axis=i=>Math.abs(p?.axes[i]??0)>.18?Math.max(-1,Math.min(1,p.axes[i])):0;
    const held=(...codes)=>codes.some(code=>keys.has(code));
    return {x:Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft'))+touch.x+axis(0),
      y:Number(held('KeyS','ArrowDown'))-Number(held('KeyW','ArrowUp'))+touch.y+axis(1)};
  },dispose(){reset();cleanups.forEach(stop=>stop());}};
}
