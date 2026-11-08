// Recorded public DOM checks: unrelated live snapshots cannot remove an active arrival action.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
const record=()=>({revision:1,mode:'online',now:0,notice:null,
  account:{state:'signed_in',canSignIn:true,signInMessage:'Recorded sign-in is unavailable.'},
  arrival:{status:'ready',endingLabel:'Recorded ending',title:'Recorded arrival',coins:120,
    kit:{id:'recorded-kit',name:'Recorded kit',item:'Recorded item',startLabel:'Recorded place'},
    items:['Recorded item'],logCard:{id:'recorded-log',title:'Recorded log',message:'Recorded lead.'},message:'Recorded arrival confirmed.'},
  presence:{status:'live',others:[],hiddenCount:0},crew:{status:'none',code:null,seats:[]},bulletin:{status:'ready'}});
async function styles(page){await page.evaluate(async()=>{
  await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
  await window.g20Import('/src/screens/screens.css');
});}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function mount(page,{kit=true}={}){
  await styles(page);const view=record();if(!kit){view.arrival.kit=null;view.arrival.status='pending';}
  await page.evaluate(async view=>{
    const {createArrivalScreen}=await window.g20Import('/src/screens/arrival.js');
    const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
    const callbacks={navigate:[],retry:0,signIn:0};
    const screen=createArrivalScreen({navigate:name=>callbacks.navigate.push(name),onRetry:()=>callbacks.retry++,onSignIn:()=>callbacks.signIn++});
    const modal=createModal({title:'Recorded arrival',body:screen.element});
    // Match the controller: append to the modal, update while closed, then connect/open it.
    screen.update(view);modal.open();
    const hostOwned=document.createElement('div');hostOwned.className='intro-ending-summary';hostOwned.textContent='Recorded host-owned summary.';screen.element.prepend(hostOwned);
    window.arrivalProof={screen,modal,view,callbacks,hostOwned};
  },view);await settle(page);
}

it('keeps the actual action and call nodes focused across presence-only snapshots and real content changes',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await page.getByRole('button',{name:'Find your crew',exact:true}).focus();
    const unchanged=await page.evaluate(async()=>{
      const state=window.arrivalProof,action=document.activeElement,call=state.screen.element.querySelector('.server-call');
      const children=[...state.screen.element.children],records=[];
      const observer=new MutationObserver(changes=>records.push(...changes));observer.observe(state.screen.element,{subtree:true,childList:true,attributes:true,characterData:true});
      for(let i=0;i<8;i++){
        const next=structuredClone(state.view);next.revision+=i+1;next.presence.others=[{id:'recorded-peer',x:i}];
        next.crew.count=i;next.account.state=i%2?'signed_in':'signed_out';state.screen.update(next);
      }
      await Promise.resolve();observer.disconnect();
      state.action=action;state.call=call;
      return {mutations:records.length,focus:document.activeElement===action,actionConnected:action.isConnected,
        sameChildren:children.every((child,index)=>state.screen.element.children[index]===child),
        host:state.screen.element.firstElementChild===state.hostOwned};
    });
    expect(unchanged).toEqual({mutations:0,focus:true,actionConnected:true,sameChildren:true,host:true});
    const changed=await page.evaluate(()=>{
      const state=window.arrivalProof;state.view.arrival.title='Updated recorded arrival';state.view.arrival.coins=987;
      state.view.arrival.items.push('Another recorded item');state.view.arrival.logCard.message='Updated recorded lead.';
      state.screen.update(state.view);
      return {focused:document.activeElement===state.action,action:state.action===state.screen.element.querySelector('[data-focus="arrival-crew"]'),
        call:state.call===state.screen.element.querySelector('.server-call'),host:state.screen.element.firstElementChild===state.hostOwned,
        title:state.screen.element.querySelector('h3').textContent,facts:[...state.screen.element.querySelectorAll('dd')].map(node=>node.textContent),
        items:[...state.screen.element.querySelectorAll('ul>li')].map(node=>node.textContent),log:state.screen.element.querySelector('.case-log-card p').textContent};
    });
    expect(changed).toEqual({focused:true,action:true,call:true,host:true,title:'Updated recorded arrival',
      facts:['Recorded item','Recorded place','987'],items:['Recorded item','Another recorded item'],log:'Updated recorded lead.'});
    await page.getByRole('button',{name:'Find your crew',exact:true}).click();
    expect(await page.evaluate(()=>window.arrivalProof.callbacks)).toEqual({navigate:['crew'],retry:0,signIn:0});
  });
});

it('preserves sign-in focus and responds to actual flag changes without taking focus above Account',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{kit:false});expect(await page.locator('.case-kit-name').count()).toBe(0);
    await page.evaluate(()=>window.arrivalProof.screen.setResult({accepted:false,reason:'sign_in_required',message:'Recorded sign-in step.'}));await settle(page);
    const first=await page.evaluate(()=>{
      const state=window.arrivalProof;state.signIn=state.screen.element.querySelector('[data-focus="sign-in-server-call"]');
      state.report=state.screen.element.querySelector('[data-focus="report-server-call"]');
      state.view.revision++;state.view.presence.hiddenCount=7;state.screen.update(structuredClone(state.view));
      state.view.arrival.title='Changed recorded arrival';state.screen.update(state.view);
      return {focused:document.activeElement===state.signIn,same:state.signIn===state.screen.element.querySelector('[data-focus="sign-in-server-call"]')};
    });expect(first).toEqual({focused:true,same:true});
    const off=await page.evaluate(()=>{
      const state=window.arrivalProof;state.view.account.canSignIn=false;state.screen.update(state.view);state.signIn.click();
      return {hidden:state.signIn.hidden,reportFocused:document.activeElement===state.report,signIns:state.callbacks.signIn,
        caption:state.screen.element.querySelector('.case-caption').textContent};
    });expect(off).toEqual({hidden:true,reportFocused:true,signIns:0,caption:'Recorded sign-in is unavailable.'});
    await page.evaluate(()=>{const state=window.arrivalProof;state.view.account.canSignIn=true;state.screen.update(state.view);});
    expect(await page.locator('[data-focus="sign-in-server-call"]').isVisible()).toBe(true);
    expect(await page.evaluate(()=>document.activeElement===window.arrivalProof.report)).toBe(true);
    await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();
    const account=await page.evaluate(async()=>{
      const state=window.arrivalProof,dialog=document.createElement('dialog'),button=document.createElement('button');dialog.className='account-modal';button.textContent='Recorded account action';dialog.append(button);document.body.append(dialog);dialog.showModal();button.focus();
      state.view.arrival.message='Another recorded message';state.screen.update(state.view);
      state.screen.setResult({accepted:false,reason:'session_expired'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const focused=document.activeElement===button;dialog.close();dialog.remove();return {focused,signIns:state.callbacks.signIn};
    });expect(account).toEqual({focused:true,signIns:1});
  });
});

it('resumes a stopped countdown after a real modal reopen without resetting its original deadline',async()=>{
  await evaluate.withPage(async page=>{
    await page.clock.install();await mount(page,{kit:false});
    await page.evaluate(()=>window.arrivalProof.screen.setResult({accepted:false,reason:'rate_limited',retryAfterSeconds:3}));
    await page.clock.runFor(1200);
    expect(await page.locator('.server-call').textContent()).toContain('2 s.');
    expect(await page.locator('.server-call-announcement').textContent()).toContain('3 s.');
    await page.evaluate(()=>window.arrivalProof.modal.close());await page.clock.runFor(1200);
    await page.evaluate(()=>{const state=window.arrivalProof;state.screen.update(structuredClone(state.view));state.modal.open();});
    await page.evaluate(()=>Promise.resolve());
    expect(await page.locator('[data-focus="retry-server-call"]').isDisabled()).toBe(true);
    expect(await page.locator('.server-call').textContent()).toContain('1 s.');
    await page.evaluate(()=>window.arrivalProof.modal.close());await page.clock.runFor(1200);
    await page.evaluate(()=>{const state=window.arrivalProof;state.screen.update(structuredClone(state.view));state.modal.open();});
    await page.evaluate(()=>Promise.resolve());
    expect(await page.locator('[data-focus="retry-server-call"]').isEnabled()).toBe(true);
    expect(await page.locator('.server-call').textContent()).toContain('You can try again now.');
    expect(await page.evaluate(()=>window.arrivalProof.callbacks.retry)).toBe(0);
    await page.getByRole('button',{name:'Retry arrival confirmation',exact:true}).click();
    expect(await page.evaluate(()=>window.arrivalProof.callbacks.retry)).toBe(1);
    await page.evaluate(()=>{const state=window.arrivalProof;state.screen.dispose();state.modal.dispose();state.screen.update(state.view);state.screen.setResult({accepted:false,reason:'offline'});});
    await page.clock.runFor(6000);expect(await page.locator('.case-arrival').count()).toBe(0);
  });
});

it('ticks the adapter while closed, pauses selected ticks, and keeps closed updates and latest reopen state',async()=>{
  await evaluate.withPage(async page=>{
    await page.route('**/src/screens/bulletin/index.js*',route=>route.fulfill({contentType:'text/javascript',body:`
      export function createBulletinScreen(){
        const element=document.createElement('section');let active=false;
        return {element,update(view){window.tickProof.updates.push({revision:view.revision,now:view.now,signIn:view.account.canSignIn});element.textContent='Recorded screen '+view.now;},
          setActive(value){active=value===true;},tick(view){if(!active)throw new Error('Inactive screen tick');window.tickProof.selected.push(view.now);},close(){active=false;},dispose(){active=false;element.remove();}};
      }`}));
    await styles(page);
    const result=await page.evaluate(async initial=>{
      const {createCaseScreens}=await window.g20Import('/src/screens/controller.js'),{on}=await window.g20Import('/src/core/events.js');
      let view=initial;const listeners=new Set(),proof=window.tickProof={updates:[],selected:[],adapter:[],events:[],views:[]};
      const stop=on('bulletin_opened',event=>proof.events.push({...event}));
      const adapter={read:()=>structuredClone(view),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        tick(dt){proof.adapter.push(dt);view={...view,now:view.now+dt};for(const fn of listeners)fn({view:structuredClone(view)});}};
      const screens=createCaseScreens({container:document.body,adapter,onView:value=>proof.views.push(value.now)});
      for(let i=0;i<3;i++)screens.tick(1);
      const neverOpened={adapter:proof.adapter.length,selected:proof.selected.length,events:proof.events.length};
      await screens.open('bulletin');screens.tick(1);
      const active={adapter:proof.adapter.length,selected:proof.selected.length,updates:proof.updates.length};
      screens.close();const ticksBefore=proof.selected.length;
      for(let i=0;i<4;i++)screens.tick(1);
      // A closed selected screen must still receive revision publications for private-data cleanup.
      view={...view,revision:view.revision+1,account:{...view.account,state:'signed_out'}};
      for(const fn of listeners)fn({view:structuredClone(view)});
      // A same-revision account gate must also reach the separately hosted arrival presentation.
      view={...view,account:{...view.account,canSignIn:false},arrival:{...view.arrival,status:'pending',kit:null}};
      for(const fn of listeners)fn({view:structuredClone(view)});
      const closed={adapter:proof.adapter.length,selected:proof.selected.length-ticksBefore,updates:proof.updates.length,
        latest:proof.updates.at(-1),arrival:screens.arrival.querySelector('.case-caption').textContent};
      await screens.open('bulletin');const reopened={last:proof.updates.at(-1),updates:proof.updates.length};
      screens.close();await screens.open('bulletin');const sameRevision=proof.updates.at(-1);
      const events=[...proof.events],views=proof.views.length;screens.dispose();stop();
      return {neverOpened,active,closed,reopened,sameRevision,events,views};
    },record());
    expect(result.neverOpened).toEqual({adapter:3,selected:0,events:0});
    expect(result.active).toEqual({adapter:4,selected:2,updates:1});
    expect(result.closed).toEqual({adapter:8,selected:0,updates:2,latest:{revision:2,now:8,signIn:true},arrival:'Recorded sign-in is unavailable.'});
    expect(result.reopened).toEqual({last:{revision:2,now:8,signIn:false},updates:3});
    expect(result.sameRevision).toEqual({revision:2,now:8,signIn:false});
    expect(result.events).toEqual(Array.from({length:3},()=>({type:'bulletin_opened'})));
    expect(result.views).toBeGreaterThanOrEqual(11);
  });
});


it.each([
  ['sign-out',{state:'signed_out',hasKit:false}],
  ['session expiry',{state:'expired',hasKit:false}],
  ['membership loss',{state:'signed_in',hasKit:true}],
])('clears actual private crew DOM on a %s publication while its modal is closed',async(_label,account)=>{
  await evaluate.withPage(async page=>{
    await styles(page);const initial=record();
    initial.account.hasKit=true;initial.permissions={createCrew:false,joinCrew:false,muster:true};
    initial.crew={status:'ready',code:'RECORDEDCREW',joinPreview:null,seats:[{
      seat:2,kind:'npc',name:'Recorded private crewmate',kit:{name:'Recorded private kit'},
    }]};
    const result=await page.evaluate(async({initial,account})=>{
      const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
      let view=initial;const listeners=new Set();
      const adapter={read:()=>structuredClone(view),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
      const screens=createCaseScreens({container:document.body,adapter});await screens.open('crew');
      const modal=document.querySelector('.case-modal');
      const before={open:modal.open,code:modal.querySelector('.crew-code')?.textContent,
        seat:modal.querySelector('.crew-seat[data-kind="npc"] h3')?.textContent};
      screens.close();
      view={...view,revision:view.revision+1,account:{...view.account,...account},
        crew:{status:'none',code:null,joinPreview:null,seats:[]},permissions:{createCrew:false,joinCrew:false,muster:false}};
      for(const fn of listeners)fn({view:structuredClone(view)});
      const cleared={open:modal.open,connected:!!modal.querySelector('.case-crew'),
        codes:modal.querySelectorAll('.crew-code').length,npcs:modal.querySelectorAll('.crew-seat[data-kind="npc"]').length,
        privateText:['RECORDEDCREW','Recorded private crewmate','Recorded private kit'].some(text=>modal.textContent.includes(text))};
      await screens.open('crew');
      const reopened={open:modal.open,npcs:modal.querySelectorAll('.crew-seat[data-kind="npc"]').length,
        privateText:modal.textContent.includes('RECORDEDCREW')||modal.textContent.includes('Recorded private crewmate')};
      screens.dispose();return {before,cleared,reopened};
    },{initial,account});
    expect(result.before).toEqual({open:true,code:'RECORDEDCREW',seat:'Recorded private crewmate'});
    expect(result.cleared).toEqual({open:false,connected:true,codes:0,npcs:0,privateText:false});
    expect(result.reopened).toEqual({open:true,npcs:0,privateText:false});
  });
});


it.each([
  ['sign-out',{state:'signed_out',hasKit:false}],
  ['session expiry',{state:'expired',hasKit:false}],
  ['membership loss',{state:'signed_in',hasKit:true}],
])('clears private Crew text after navigating to a different cached page on %s',async(_label,account)=>{
  await evaluate.withPage(async page=>{
    await page.route('**/src/screens/bulletin/index.js*',route=>route.fulfill({contentType:'text/javascript',body:`
      export function createBulletinScreen(){const element=document.createElement('section');let active=false;
        return {element,update(){element.textContent='Recorded public bulletin';},setActive(value){active=value===true;},tick(){if(!active)throw new Error('Inactive screen tick');},close(){active=false;},dispose(){active=false;element.remove();}};}
    `}));
    await styles(page);const initial=record();initial.account.hasKit=true;
    initial.permissions={createCrew:false,joinCrew:false,muster:true};
    initial.crew={status:'active',code:'RECORDEDCREW',joinPreview:null,seats:[{seat:2,kind:'npc',
      name:'Recorded private crewmate',kit:{name:'Recorded private kit'}}]};
    const result=await page.evaluate(async({initial,account})=>{
      const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
      let view=initial;const listeners=new Set();
      const adapter={read:()=>structuredClone(view),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
      const screens=createCaseScreens({container:document.body,adapter});await screens.open('crew');
      const crew=document.querySelector('.case-crew');await screens.open('bulletin');
      const before={detached:!crew.isConnected,hasCode:crew.textContent.includes('RECORDEDCREW')};
      view={...view,revision:view.revision+1,account:{...view.account,...account},
        crew:{status:'none',code:null,joinPreview:null,seats:[]},
        permissions:{createCrew:false,joinCrew:false,muster:false}};
      for(const fn of listeners)fn({view:structuredClone(view)});
      const after={detached:!crew.isConnected,codes:crew.querySelectorAll('.crew-code').length,
        npcs:crew.querySelectorAll('.crew-seat[data-kind="npc"]').length,
        privateText:['RECORDEDCREW','Recorded private crewmate','Recorded private kit'].some(text=>crew.textContent.includes(text))};
      screens.dispose();return {before,after};
    },{initial,account});
    expect(result.before).toEqual({detached:true,hasCode:true});
    expect(result.after).toEqual({detached:true,codes:0,npcs:0,privateText:false});
  });
});
