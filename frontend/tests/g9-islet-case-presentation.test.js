// Real case/Crew/Finale component DOM with public recorded views and injected intent promises only.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
const STATION='islet_signal_station';
const build=page=>page.locator('[data-focus="build-islet_signal_station"]');
const call=page=>page.locator('.case-modal > .kit-modal-body > .case-screen-body > .server-call');

async function mount(page,{crewStatus='active',canBuild=true,coins=0}={}){
  await page.evaluate(async options=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
    const {createUnavailableCaseAdapter}=await window.g20Import('/src/adapter/unavailable.js');
    const {projectIsletDisplay}=await window.g20Import('/src/online/case-adapter/islet-view.js');
    const {createFakeIsletTransport}=await window.g20Import('/src/screens/islet/fake-transport.js');
    const {on}=await window.g20Import('/src/core/events.js');
    const empty=createUnavailableCaseAdapter(),base=empty.read();empty.dispose();
    const raw=(await createFakeIsletTransport().get('/api/islet')).data;
    const snapshot={...raw,schema:1,mode:'live',status:'ready',busyPlot:null};
    Object.assign(snapshot.spots.find(spot=>spot.plot==='islet_signal_station'),{
      name:'Recorded signal station',cost:{coins:275,timber:7},canBuild:options.canBuild,
    });
    snapshot.coins=options.coins;snapshot.timber=0;
    const seats=[1,2,3,4].map(seat=>({seat,kind:seat===1?'player':'npc',isYou:seat===1,
      name:seat===1?'Recorded captain':'Recorded partner',kit:{id:'stranger',name:'Recorded kit'}}));
    let view={...base,mode:'online',revision:1,now:0,notice:null,
      account:{...base.account,state:'signed_in',hasKit:true,canSignIn:true,connection:{state:'idle',message:''}},
      crew:{status:options.crewStatus,code:'RECORDED',mySeat:1,seats,joinPreview:null},
      permissions:{createCrew:false,joinCrew:false,muster:options.crewStatus==='forming'},
      captain:{...base.captain,coins:options.coins},
      finale:{...base.finale,lights:[],islet:null,isletFailure:null}};
    const proof=window.isletCaseProof={calls:[],opened:[],events:[],pending:[],snapshot};
    const listeners=new Set();
    function project(){const display=projectIsletDisplay(snapshot,{signedIn:view.account.state==='signed_in',crew:view.crew});
      view={...view,crew:{...view.crew,isletReminder:display.reminder},finale:{...view.finale,islet:display.station}};}
    function publish(){view={...view,revision:view.revision+1};for(const fn of listeners)fn({type:'case_updated',view:structuredClone(view)});}
    proof.patch=patch=>{view={...view,...patch,account:{...view.account,...patch.account},
      crew:{...view.crew,...patch.crew},finale:{...view.finale,...patch.finale}};publish();};
    proof.station=(fields,holdings={})=>{Object.assign(snapshot,holdings);
      Object.assign(snapshot.spots.find(spot=>spot.plot==='islet_signal_station'),fields);project();publish();};
    proof.failure=(reason,{seconds=3,until=Date.now()+seconds*1000}={})=>{
      const words={rate_limited:'Too many attempts. Try again in a moment.',not_connected:'Service unavailable. Try again in a moment.'};
      proof.patch({finale:{isletFailure:{reason,message:words[reason],
        ...(reason==='rate_limited'?{status:429,retryAfterSeconds:seconds,retryUntil:until}:{status:503})}}});
      return until;
    };
    proof.resolve=(index,result,{captured=false}={})=>{const held=proof.pending[index];
      held.resolve({...result,view:structuredClone(captured?held.captured:view)});};
    const adapter={read:()=>structuredClone(view),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},tick(){},
      muster(){proof.calls.push(['muster']);view={...view,crew:{...view.crew,status:'active'},
        permissions:{...view.permissions,muster:false}};project();publish();
        return Promise.resolve({accepted:true,reason:null,message:'Recorded muster confirmed.',view:structuredClone(view)});},
      buildLight(id){proof.calls.push(['buildLight',id]);const captured=structuredClone(view);
        return new Promise(resolve=>proof.pending.push({resolve,captured}));}};
    project();
    proof.eventStops=['plot_clicked','arrived','islet_changed'].map(type=>on(type,event=>proof.events.push({type:event.type})));
    proof.screens=createCaseScreens({container:document.body,adapter,now:()=>Date.now(),
      openIslet:(...args)=>{proof.opened.push(args);proof.screens.close();}});
    proof.read=()=>structuredClone(view);
    proof.start=()=>{const control=document.querySelector('[data-focus="build-islet_signal_station"]');control.focus();
      proof.inflight=proof.screens.send('buildLight','islet_signal_station');};
  },{crewStatus,canBuild,coins});
}
async function open(page,name='finale'){await page.evaluate(name=>window.isletCaseProof.screens.open(name),name);}
async function freezeClock(page){await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+20));}
async function dispose(page){await page.evaluate(async()=>{
  const proof=window.isletCaseProof;proof.screens.dispose();for(const stop of proof.eventStops)stop();
  for(const held of proof.pending)held.resolve({accepted:false,reason:'disposed',message:'Recorded closure.',view:proof.read()});
  await proof.inflight;
});}

it('shows the first-muster reminder and opens the actual callback without another intent or fabricated world event',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{crewStatus:'forming'});await open(page,'crew');
    expect(await page.locator('.crew-islet-reminder').count()).toBe(0);
    await page.getByRole('button',{name:'Muster with NPC partners',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.crew-islet-reminder')&&document.querySelector('.case-screen-body > .server-call')?.dataset.state==='ready');
    expect(await page.locator('.crew-islet-reminder').textContent()).toContain('Build your signal station before nightfall');
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['muster']]);
    await page.locator('.crew-islet-reminder').getByRole('button',{name:'Open your islet',exact:true}).click();
    expect(await page.evaluate(()=>({opened:window.isletCaseProof.opened,calls:window.isletCaseProof.calls,
      events:window.isletCaseProof.events,active:window.isletCaseProof.screens.active})))
      .toEqual({opened:[[]],calls:[['muster']],events:[],active:false});
    await dispose(page);
  });
});

it('renders the server station price and permission and keeps the existing buildLight intent and detached-control guards',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{coins:0});await open(page);
    expect(await page.locator('.case-islet-light .case-caption').textContent()).toBe('Cost: 275 coins and 7 timber');
    expect(await build(page).textContent()).toBe('Build the recorded signal station for 275 coins and 7 timber');
    expect(await build(page).isEnabled()).toBe(true);
    await page.evaluate(()=>{window.oldIsletBuild=document.querySelector('[data-focus="build-islet_signal_station"]');
      window.isletCaseProof.station({canBuild:false},{coins:99999,timber:99999});window.oldIsletBuild.click();});
    expect(await build(page).isDisabled()).toBe(true);expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([]);
    await page.evaluate(()=>window.isletCaseProof.station({canBuild:true,cost:{coins:1,timber:0}}));
    expect(await build(page).textContent()).toBe('Build the recorded signal station for 1 coin');
    await build(page).click();expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION]]);
    await page.evaluate(()=>{window.oldFinaleBuild=document.querySelector('[data-focus="build-islet_signal_station"]');
      window.oldFinaleOpen=document.querySelector('[data-focus="finale-open-islet"]');window.isletCaseProof.screens.dispose();
      window.oldFinaleBuild.click();window.oldFinaleOpen.click();});
    expect(await page.evaluate(()=>({calls:window.isletCaseProof.calls,opened:window.isletCaseProof.opened,
      nodes:document.querySelectorAll('.case-finale').length}))).toEqual({calls:[['buildLight',STATION]],opened:[],nodes:0});
    await dispose(page);
  });
});

it('shows early 429 before the final receipt and preserves exact milliseconds through final completion and fractional reopen',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await open(page);await freezeClock(page);
    await page.evaluate(()=>{const proof=window.isletCaseProof;proof.start();proof.deadline=proof.failure('rate_limited');});
    expect(await call(page).getAttribute('data-state')).toBe('rate_limited');
    expect(await call(page).textContent()).toContain('3 s.');
    expect(await call(page).getByRole('link',{name:'Report a problem',exact:true}).isVisible()).toBe(true);
    expect(await call(page).getByRole('button',{name:/^Retry/}).isDisabled()).toBe(true);
    expect(await page.evaluate(()=>window.isletCaseProof.pending.length)).toBe(1);
    await page.clock.runFor(1500);
    await page.evaluate(async()=>{const proof=window.isletCaseProof;
      proof.resolve(0,{accepted:false,reason:'rate_limited',message:'Recorded server wait.',retryAfterSeconds:3});await proof.inflight;
      proof.screens.close();await proof.screens.open('finale');});
    expect(await call(page).textContent()).toContain('2 s.');expect(await build(page).getAttribute('aria-disabled')).toBe('true');
    await build(page).dispatchEvent('click');
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION]]);
    await page.clock.runFor(1499);expect(await call(page).getByRole('button',{name:/^Retry/}).isDisabled()).toBe(true);
    await page.clock.runFor(1);expect(await call(page).getByRole('button',{name:/^Retry/}).isEnabled()).toBe(true);
    expect(await build(page).getAttribute('aria-disabled')).toBeNull();
    expect(await page.evaluate(()=>window.isletCaseProof.calls.length)).toBe(1);
    await call(page).getByRole('button',{name:/^Retry/}).dispatchEvent('click');
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION],['buildLight',STATION]]);
    await dispose(page);
  });
});

it.each([false,true])('accepts a server-built readback while the operation remains pending, with prior failure %s',async priorFailure=>{
  await evaluate.withPage(async page=>{
    await mount(page);await open(page);
    await page.evaluate(priorFailure=>{const proof=window.isletCaseProof;proof.start();if(priorFailure)proof.failure('not_connected');},priorFailure);
    if(priorFailure)expect(await call(page).getAttribute('data-state')).toBe('error');
    await page.evaluate(()=>{const proof=window.isletCaseProof;proof.station({state:'built',canBuild:false,cost:null},{signalStationBuilt:true});
      proof.patch({finale:{isletFailure:null}});});
    expect(await call(page).getAttribute('data-state')).toBe('ready');
    expect(await call(page).textContent()).toContain('Your signal station is built.');
    expect(await build(page).count()).toBe(0);expect(await page.locator('.case-islet-light .case-caption').textContent()).toBe('Standing');
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION]]);
    await page.evaluate(async()=>{const proof=window.isletCaseProof;proof.resolve(0,{accepted:true,reason:null,message:'Recorded confirmation.'});await proof.inflight;});
    expect(await call(page).getAttribute('data-state')).toBe('ready');expect(await page.evaluate(()=>window.isletCaseProof.events)).toEqual([]);
    await dispose(page);
  });
});

it('keeps a closed call clear, adopts only the current held wait on deliberate reopen, and ignores the old final receipt',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await open(page);await freezeClock(page);
    await page.evaluate(()=>{const proof=window.isletCaseProof;proof.start();proof.screens.close();proof.failure('rate_limited');});
    expect(await call(page).isHidden()).toBe(true);expect(await call(page).getAttribute('data-state')).toBe('idle');
    await open(page);expect(await call(page).getAttribute('data-state')).toBe('rate_limited');
    expect(await build(page).getAttribute('aria-disabled')).toBe('true');
    await page.evaluate(async()=>{const proof=window.isletCaseProof;
      proof.resolve(0,{accepted:false,reason:'offline',message:'Old recorded offline receipt.'},{captured:true});await proof.inflight;});
    expect(await call(page).getAttribute('data-state')).toBe('rate_limited');
    expect(await call(page).textContent()).not.toContain('Old recorded offline receipt');
    expect(await page.evaluate(()=>window.isletCaseProof.screens.view.finale.isletFailure.reason)).toBe('rate_limited');
    await dispose(page);
  });
});

it.each([
  ['sign-out',{state:'signed_out',hasKit:false}],['expiry',{state:'expired',hasKit:false}],
  ['cleared profile',{state:'signed_in',hasKit:false}],
])('does not restore build feedback or an old private view after %s',async(_label,account)=>{
  await evaluate.withPage(async page=>{
    await mount(page);await open(page);
    await page.evaluate(account=>{const proof=window.isletCaseProof;proof.start();proof.failure('not_connected');
      proof.patch({account,crew:{status:'none',code:null,seats:[],isletReminder:null},finale:{islet:null,isletFailure:null}});},account);
    expect(await call(page).isHidden()).toBe(true);expect(await build(page).count()).toBe(0);
    await page.evaluate(async()=>{const proof=window.isletCaseProof;
      proof.resolve(0,{accepted:false,reason:'not_connected',message:'Old private failure.'},{captured:true});await proof.inflight;});
    expect(await call(page).isHidden()).toBe(true);
    expect(await page.evaluate(()=>({account:window.isletCaseProof.screens.view.account.state,
      hasKit:window.isletCaseProof.screens.view.account.hasKit,station:window.isletCaseProof.screens.view.finale.islet})))
      .toEqual({account:account.state,hasKit:false,station:null});
    expect(await page.locator('.case-modal').textContent()).not.toContain('Old private failure');
    await dispose(page);
  });
});


it.each([
  ['sign-out',{state:'signed_out',hasKit:false}],['expiry',{state:'expired',hasKit:false}],
])('admits a new account build after %s and keeps its send owned while an old receipt settles',async(_label,account)=>{
  await evaluate.withPage(async page=>{
    await mount(page);await open(page);
    await build(page).click();
    expect(await page.evaluate(()=>window.isletCaseProof.pending.length)).toBe(1);
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION]]);
    await page.evaluate(account=>{
      const proof=window.isletCaseProof;
      proof.patch({account,crew:{status:'none',code:null,seats:[],isletReminder:null},
        finale:{islet:null,isletFailure:null}});
    },account);
    expect(await build(page).count()).toBe(0);expect(await call(page).isHidden()).toBe(true);
    await page.evaluate(()=>{
      const proof=window.isletCaseProof;
      const seats=proof.pending[0].captured.crew.seats.map(seat=>({...seat,
        name:seat.isYou?'Current recorded captain':'Current recorded partner'}));
      proof.patch({account:{state:'signed_in',hasKit:true},crew:{status:'active',code:'CURRENT-RECORDED',mySeat:1,seats},
        captain:{...proof.read().captain,name:'Current recorded captain'},finale:{isletFailure:null}});
      proof.station({name:'Current recorded station',canBuild:true,cost:{coins:1,timber:0}});
    });
    expect(await build(page).isEnabled()).toBe(true);
    expect(await build(page).textContent()).toBe('Build the current recorded station for 1 coin');
    await build(page).click();
    expect(await page.evaluate(()=>window.isletCaseProof.pending.length)).toBe(2);
    expect(await page.evaluate(()=>window.isletCaseProof.calls)).toEqual([['buildLight',STATION],['buildLight',STATION]]);
    expect(await build(page).evaluate(element=>document.activeElement===element)).toBe(true);
    const before=await page.evaluate(()=>{const view=window.isletCaseProof.screens.view;return {
      revision:view.revision,mode:view.mode,account:view.account.state,hasKit:view.account.hasKit,
      crewCode:view.crew.code,station:view.finale.islet,focus:document.activeElement?.dataset.focus};});
    await build(page).dispatchEvent('click');
    expect(await page.evaluate(()=>window.isletCaseProof.calls.length)).toBe(2);
    await page.evaluate(()=>window.isletCaseProof.resolve(0,{accepted:false,reason:'not_connected',
      message:'Old recorded account failure.'},{captured:true}));
    // A rendered frame follows all receipt/normalization/finally microtasks, without reading private busy state.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await page.evaluate(()=>{const view=window.isletCaseProof.screens.view;return {
      revision:view.revision,mode:view.mode,account:view.account.state,hasKit:view.account.hasKit,
      crewCode:view.crew.code,station:view.finale.islet,focus:document.activeElement?.dataset.focus};});
    expect(after).toEqual(before);
    expect(await build(page).evaluate(element=>document.activeElement===element)).toBe(true);
    expect(['pending','loading','slow']).toContain(await call(page).getAttribute('data-state'));
    expect(await call(page).textContent()).not.toMatch(/Service unavailable|Old recorded account failure/);
    await build(page).dispatchEvent('click');
    expect(await page.evaluate(()=>({calls:window.isletCaseProof.calls.length,pending:window.isletCaseProof.pending.length})))
      .toEqual({calls:2,pending:2});
    await page.evaluate(()=>window.isletCaseProof.resolve(1,{accepted:true,reason:null,message:'Current recorded confirmation.'}));
    await page.waitForFunction(()=>document.querySelector('.case-screen-body > .server-call')?.dataset.state==='ready');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expect(await page.evaluate(()=>window.isletCaseProof.calls.length)).toBe(2);
    await build(page).click();
    expect(await page.evaluate(()=>window.isletCaseProof.pending.length)).toBe(3);
    expect(await page.evaluate(()=>({calls:window.isletCaseProof.calls,account:window.isletCaseProof.screens.view.account.state,
      crewCode:window.isletCaseProof.screens.view.crew.code,events:window.isletCaseProof.events,opened:window.isletCaseProof.opened})))
      .toEqual({calls:[['buildLight',STATION],['buildLight',STATION],['buildLight',STATION]],
        account:'signed_in',crewCode:'CURRENT-RECORDED',events:[],opened:[]});
    await dispose(page);
  });
});
