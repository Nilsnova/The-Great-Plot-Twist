// Native pointer lifecycles feed the real input combiner without loading the game or a renderer.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';

const native=browserHarness();
async function withMap(action,argument){
  return native.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createInput}=await window.g20Import('/src/core/input.js');
      const {createMapTouch}=await window.g20Import('/src/controls/map-touch.js');
      const container=document.createElement('main'),canvas=document.createElement('canvas');
      container.append(canvas);document.body.append(container);canvas.setPointerCapture=()=>{};
      const frames=new Map();let frameId=0,place='island',enabled=true,hidden=false,standChecks=0;
      window.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};
      window.cancelAnimationFrame=id=>frames.delete(id);
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
      const input=createInput(canvas),position={x:0,z:0};
      const map=createMapTouch({canvas,input,container,position:()=>position,place:()=>place,enabled:()=>enabled,
        canStand:(x,z)=>{standChecks++;return Math.abs(x)<10&&Math.abs(z)<10;},
        project:(x,y,target)=>target?{x:target.x*10,y:target.y*10}:{x:x/10,z:y/10}});
      const pointer=(type,id=1,x=40,y=0,pointerType='touch')=>canvas.dispatchEvent(new PointerEvent(type,
        {pointerId:id,clientX:x,clientY:y,pointerType,button:0,bubbles:true}));
      const flush=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(0);};
      const tap=(id=1,pointerType='touch')=>{pointer('pointerdown',id,40,0,pointerType);pointer('pointerup',id,40,0,pointerType);};
      const axis=()=>({x:input.axis(['KeyD'],['KeyA']),y:input.axis(['KeyW'],['KeyS'])});
      window.mapProof={map,input,container,canvas,pointer,tap,flush,axis,
        get queued(){return frames.size;},get checks(){return standChecks;},
        setPlace:value=>{place=value;},setEnabled:value=>{enabled=value;},
        hide(){hidden=true;document.dispatchEvent(new Event('visibilitychange'));}};
    });
    return page.evaluate(action,argument);
  });
}

it.each(['touch','pen'])('%s taps plan after release and keep moving across frames without cancelling their own input',async pointerType=>{
  const result=await withMap(pointerType=>{
    const p=window.mapProof;p.tap(1,pointerType);
    const deferred={queued:p.queued,checks:p.checks,active:p.map.active};p.flush();
    const movement=[];for(let frame=0;frame<3;frame++){p.map.update(1/60);movement.push(p.axis());}
    const marker=p.container.querySelector('.tap-destination');
    const result={deferred,movement,active:p.map.active,markerVisible:!marker.hidden,
      markerHiddenFromAssistiveTech:marker.getAttribute('aria-hidden'),left:marker.style.left,top:marker.style.top};
    p.map.dispose();p.input.dispose();return result;
  },pointerType);
  expect(result).toEqual({deferred:{queued:1,checks:0,active:false},movement:Array(3).fill({x:1,y:0}),
    active:true,markerVisible:true,markerHiddenFromAssistiveTech:'true',left:'40px',top:'0px'});
});

it('ignores mouse clicks, canvas drags and a multitouch sequence until every finger is released',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.tap(1,'mouse');p.flush();const mouse=p.map.active;
    p.pointer('pointerdown',2);p.pointer('pointermove',2,54,0);p.pointer('pointerup',2,54,0);p.flush();const drag=p.map.active;
    p.pointer('pointerdown',3);p.pointer('pointerdown',4);p.pointer('pointerup',3);
    p.pointer('pointerdown',5);p.pointer('pointerup',5);p.pointer('pointerup',4);p.flush();const multi=p.map.active;
    p.tap(6);p.flush();p.map.update(1/60);
    const result={mouse,drag,multi,recovered:p.map.active,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  });
  expect(result).toEqual({mouse:false,drag:false,multi:false,recovered:true,axis:{x:1,y:0}});
});

it('a new drag cancels an earlier released tap before its queued planning frame',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.tap();const queued=p.queued;
    p.pointer('pointerdown',2);p.pointer('pointermove',2,54,0);p.pointer('pointerup',2,54,0);p.flush();p.map.update(1/60);
    const result={queued,remaining:p.queued,active:p.map.active,checks:p.checks,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  });
  expect(result).toEqual({queued:1,remaining:0,active:false,checks:0,axis:{x:0,y:0}});
});

it.each(['pointercancel','lostpointercapture'])('%s abandons the captured gesture and permits the next tap',async type=>{
  const result=await withMap(type=>{
    const p=window.mapProof;p.pointer('pointerdown');p.pointer(type);p.pointer('pointerup');p.flush();const cancelled=p.map.active;
    p.tap(2);p.flush();p.map.update(1/60);
    const result={cancelled,recovered:p.map.active,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  },type);
  expect(result).toEqual({cancelled:false,recovered:true,axis:{x:1,y:0}});
});

it('normal capture loss after pointer-up preserves the released tap',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.tap();p.pointer('lostpointercapture');p.flush();p.map.update(1/60);
    const result={active:p.map.active,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  });
  expect(result).toEqual({active:true,axis:{x:1,y:0}});
});

it('capture loss of a secondary finger cannot leave the map stuck in multitouch mode',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.pointer('pointerdown',1);p.pointer('pointerdown',2);p.pointer('pointerup',1);
    p.pointer('lostpointercapture',2);p.tap(3);p.flush();p.map.update(1/60);
    const result={active:p.map.active,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  });
  expect(result).toEqual({active:true,axis:{x:1,y:0}});
});

it('does not apply a tap from a previous place or keep walking after another place arrives',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.tap();p.setPlace('harbor');p.flush();p.map.update(1/60);const stale=p.map.active;
    p.tap(2);p.flush();p.map.update(1/60);const started=p.map.active;
    p.setPlace('islet');p.map.update(1/60);
    const result={stale,started,active:p.map.active,axis:p.axis()};p.map.dispose();p.input.dispose();return result;
  });
  expect(result).toEqual({stale:false,started:true,active:false,axis:{x:0,y:0}});
});

it.each(['keyboard','touch','gamepad'])('%s movement takes over without restoring the old tap when released',async source=>{
  const result=await withMap(source=>{
    const p=window.mapProof;p.tap();p.flush();p.map.update(1/60);
    if(source==='keyboard')p.input.held.add('KeyW');else p.input.setVirtual(source,{x:0,y:.6});
    p.map.update(1/60);const stopped=!p.map.active,manual=p.axis();
    if(source==='keyboard')p.input.held.clear();else p.input.setVirtual(source,{x:0,y:0});
    p.map.update(1/60);
    const result={stopped,manual,released:p.axis(),active:p.map.active};p.map.dispose();p.input.dispose();return result;
  },source);
  expect(result).toEqual({stopped:true,manual:{x:0,y:source==='keyboard'?1:.6},released:{x:0,y:0},active:false});
});

it.each(['overlay','blur','hidden','explicit_cancel'])('%s cancels pending and active walks',async boundary=>{
  const result=await withMap(boundary=>{
    const p=window.mapProof;
    const interrupt=()=>{if(boundary==='overlay'){p.setEnabled(false);p.map.update(1/60);}
      else if(boundary==='blur')window.dispatchEvent(new Event('blur'));
      else if(boundary==='hidden')p.hide();else p.map.cancel();};
    p.tap();interrupt();p.flush();p.map.update(1/60);const pendingCancelled=!p.map.active;
    p.setEnabled(true);p.tap(2);p.flush();p.map.update(1/60);const started=p.map.active;
    interrupt();p.setEnabled(true);p.map.update(1/60);
    const result={pendingCancelled,started,active:p.map.active,axis:p.axis(),markerHidden:p.container.querySelector('.tap-destination').hidden};
    p.map.dispose();p.input.dispose();return result;
  },boundary);
  expect(result).toEqual({pendingCancelled:true,started:true,active:false,axis:{x:0,y:0},markerHidden:true});
});

it('disposes pending work, movement, marker and listeners without accepting later pointer events',async()=>{
  const result=await withMap(()=>{
    const p=window.mapProof;p.tap();p.map.dispose();p.map.dispose();p.flush();p.tap(2);p.flush();
    const result={queued:p.queued,active:p.map.active,checks:p.checks,axis:p.axis(),markers:p.container.querySelectorAll('.tap-destination').length};
    p.input.dispose();return result;
  });
  expect(result).toEqual({queued:0,active:false,checks:0,axis:{x:0,y:0},markers:0});
});
