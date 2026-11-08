// Actual bridge/native case host with injected cosmetic promises; no server, outcome or account hook.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const native=browserHarness();
const modal=page=>page.locator('.case-modal[open]');
async function mount(page,{resolveOnCancel=true}={}){
  await page.evaluate(async resolveOnCancel=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createCaseBridge}=await window.g20Import('/src/adapter/bridge.js');
    const {createUnavailableCaseAdapter}=await window.g20Import('/src/adapter/unavailable.js');
    const {bindCaseMethods}=await window.g20Import('/src/adapter/contract.js');
    const base=createUnavailableCaseAdapter(),view=base.read();base.dispose();
    Object.assign(view,{mode:'online',effects:[],notice:null});
    view.account={...view.account,state:'signed_in',hasKit:true};
    view.crew={...view.crew,status:'active',code:'RECORDA',mySeat:1};
    const listeners=new Set(),canvas=document.createElement('canvas');canvas.tabIndex=0;document.body.append(canvas);
    const proof=window.effectCleanup={view,listeners,canvas,calls:[],shots:[],terminals:[],cancels:0,writes:0,current:null};
    proof.publish=patch=>{proof.view={...proof.view,...patch,revision:proof.view.revision+1};
      for(const listener of [...listeners])listener({type:'case_updated',view:structuredClone(proof.view)});};
    proof.change=(state,code='RECORDA',seat=1)=>proof.publish({
      account:{...proof.view.account,state,hasKit:state==='signed_in'},
      crew:{...proof.view.crew,code,mySeat:seat},effects:[]});
    const finish=(shot,stage,resolve=true)=>{
      if(!shot.terminal){shot.terminal=true;proof.terminals.push({name:shot.name,stage});}
      if(proof.current===shot)proof.current=null;if(resolve)shot.resolve({stage});
    };
    proof.release=index=>finish(proof.shots[index],'completed');
    const world={cinematic(name){
      proof.calls.push(name);let resolve;const promise=new Promise(done=>{resolve=done;});
      const shot={name,resolve,terminal:false};proof.shots.push(shot);proof.current=shot;return promise;
    }};
    const adapter=bindCaseMethods({read:()=>structuredClone(proof.view),tick(){},
      subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}},async()=>{
      proof.writes++;return {accepted:false,reason:'not_ready',message:'Recorded refusal.',view:structuredClone(proof.view)};});
    proof.canPlay=true;
    proof.bridge=createCaseBridge({container:document.body,adapter,world,canPlayCaseEffect:()=>proof.canPlay,resetInput(){},focus:()=>canvas.focus(),
      cancelCaseEffects(){proof.cancels++;if(proof.current)finish(proof.current,'skipped',resolveOnCancel);}});
    proof.effect=(id,name)=>proof.publish({effects:[{id,type:'cinematic',name,params:{recorded:true}}]});
    proof.dispose=()=>{proof.bridge.dispose();for(const shot of proof.shots)if(!shot.terminal)finish(shot,'skipped');
      for(const shot of proof.shots)shot.resolve({stage:'skipped'});canvas.remove();};
    await proof.bridge.open('crew');
  },resolveOnCancel);
}
const idle=page=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
const count=(page,value)=>page.waitForFunction(value=>window.effectCleanup.calls.length===value,value);
const state=page=>page.evaluate(()=>{const p=window.effectCleanup;return{calls:p.calls,cancels:p.cancels,
  terminals:p.terminals,writes:p.writes,active:p.bridge.active,listeners:p.listeners.size};});
const cleanup=page=>page.evaluate(()=>window.effectCleanup.dispose());

it.each(['signed_out','expired'])('drops held and queued old effects on private account loss %s',async account=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>window.effectCleanup.effect(1,'three_lights'));await count(page,1);
      expect(await modal(page).count()).toBe(0);
      await page.evaluate(account=>{const p=window.effectCleanup;p.effect(2,'fog_lift');p.change(account,null,null);},account);
      await idle(page);
      expect(await state(page)).toMatchObject({calls:['three_lights'],cancels:1,
        terminals:[{name:'three_lights',stage:'skipped'}],writes:0,active:false});
      expect(await modal(page).count()).toBe(0);
      await page.evaluate(()=>{const p=window.effectCleanup;p.change('signed_in','RECORDB',2);});await idle(page);
      expect((await state(page)).calls).toEqual(['three_lights']);expect(await modal(page).count()).toBe(0);
    }finally{await cleanup(page);}
  });
});
it('does not let an old finally erase a newer owned shot after a crew change',async()=>{
  await native.withPage(async page=>{
    await mount(page,{resolveOnCancel:false});
    try{
      await page.evaluate(()=>window.effectCleanup.effect(1,'unmask'));await count(page,1);
      await page.evaluate(()=>{const p=window.effectCleanup;p.change('signed_in','RECORDB',1);p.effect(2,'relighting');});
      await count(page,2);expect((await state(page)).cancels).toBe(1);
      await page.evaluate(()=>window.effectCleanup.release(0));await idle(page);
      await page.evaluate(()=>window.effectCleanup.change('signed_in','RECORDC',3));await idle(page);
      expect(await state(page)).toMatchObject({calls:['unmask','relighting'],cancels:2,
        terminals:[{name:'unmask',stage:'skipped'},{name:'relighting',stage:'skipped'}],writes:0,active:false});
      await page.evaluate(()=>window.effectCleanup.release(1));await idle(page);expect(await modal(page).count()).toBe(0);
    }finally{await cleanup(page);}
  });
});
it('keeps same-case finished status transitions, shot ordering and the existing screen resume',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>{const p=window.effectCleanup;p.publish({effects:[
        {id:1,type:'cinematic',name:'unmask',params:{}},{id:2,type:'cinematic',name:'relighting',params:{}}]});});
      await count(page,1);
      await page.evaluate(()=>{const p=window.effectCleanup;p.publish({crew:{...p.view.crew,status:'finished'},effects:[]});});
      expect((await state(page)).cancels).toBe(0);
      await page.evaluate(()=>window.effectCleanup.release(0));await count(page,2);
      await page.evaluate(()=>window.effectCleanup.release(1));await modal(page).waitFor({state:'visible'});
      expect(await state(page)).toMatchObject({calls:['unmask','relighting'],cancels:0,
        terminals:[{name:'unmask',stage:'completed'},{name:'relighting',stage:'completed'}],writes:0,active:true});
    }finally{await cleanup(page);}
  });
});
it('captures effect navigation ownership before an older queued batch can adopt a newer open',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>window.effectCleanup.effect(1,'three_lights'));await count(page,1);
      await page.evaluate(async()=>{const p=window.effectCleanup;p.effect(2,'fog_lift');await p.bridge.open('crew');p.release(0);});
      await idle(page);expect((await state(page)).calls).toEqual(['three_lights']);
      expect(await modal(page).isVisible()).toBe(true);expect((await state(page)).cancels).toBe(0);
    }finally{await cleanup(page);}
  });
});
it('cancels its owned shot exactly once on disposal and ignores later publications and completion',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>window.effectCleanup.effect(1,'unmask'));await count(page,1);
      await page.evaluate(()=>{const p=window.effectCleanup;p.bridge.dispose();p.bridge.dispose();p.effect(2,'relighting');p.release(0);});
      await idle(page);expect(await state(page)).toMatchObject({calls:['unmask'],cancels:1,
        terminals:[{name:'unmask',stage:'skipped'}],writes:0,active:false,listeners:0});
      expect(await modal(page).count()).toBe(0);
    }finally{await cleanup(page);}
  });
});
it('does not cancel any cinematic when private ownership changes without a bridge-owned shot',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{await page.evaluate(()=>window.effectCleanup.change('signed_out',null,null));await idle(page);
      expect(await state(page)).toMatchObject({calls:[],cancels:0,terminals:[],writes:0});
    }finally{await cleanup(page);}
  });
});

it.each(['mode','seat'])('invalidates an owned shot when only its private %s discriminator changes',async field=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>window.effectCleanup.effect(1,'unmask'));await count(page,1);
      await page.evaluate(field=>{const p=window.effectCleanup;
        p.publish(field==='mode'?{mode:'unavailable',effects:[]}:{crew:{...p.view.crew,mySeat:2},effects:[]});
      },field);await idle(page);
      expect(await state(page)).toMatchObject({calls:['unmask'],cancels:1,
        terminals:[{name:'unmask',stage:'skipped'}],writes:0,active:false});
      expect(await modal(page).count()).toBe(0);
    }finally{await cleanup(page);}
  });
});

it('leaves an unrelated active cinematic alone, then owns and cancels a later ready case shot',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await page.evaluate(()=>{const p=window.effectCleanup;p.canPlay=false;p.effect(1,'unmask');});await idle(page);
      expect(await state(page)).toMatchObject({calls:[],cancels:0,terminals:[],writes:0});
      await page.evaluate(()=>window.effectCleanup.change('signed_out',null,null));await idle(page);
      expect(await state(page)).toMatchObject({calls:[],cancels:0,terminals:[],writes:0,active:true});
      await page.evaluate(()=>{const p=window.effectCleanup;p.change('signed_in','RECORDB',2);p.canPlay=true;p.effect(2,'relighting');});
      await count(page,1);expect((await state(page)).calls).toEqual(['relighting']);
      await page.evaluate(()=>window.effectCleanup.change('signed_out',null,null));await idle(page);
      expect(await state(page)).toMatchObject({calls:['relighting'],cancels:1,
        terminals:[{name:'relighting',stage:'skipped'}],writes:0,active:false});
    }finally{await cleanup(page);}
  });
});
