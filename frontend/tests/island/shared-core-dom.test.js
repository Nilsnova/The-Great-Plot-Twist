// Receipt-first and coherent-read browser regressions. Used by the island integration suite.
import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();
it('keeps a committed build successful when hydration fails and disables stale quotes',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture,receipt}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot=sharedFixture();snapshot.personalCaptain=personalReply();
  let fail=false;const calls=[];
  const transport={get:async path=>{
   calls.push(path);
   if(path==='/api/captain')return {ok:false,status:503};
   if(path==='/api/island')return fail?{ok:false,status:503}:{ok:true,data:snapshot};
   return {ok:false,status:409,code:'economy_path_unavailable'};
  },post:async(path,body)=>{calls.push({path,body});fail=true;return {ok:true,data:receipt(snapshot,body,'build')};}};
  const events=[],stop=on('island_built',event=>events.push(event));
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{}});
  await island.load();await island.build('wall_1','wall');
  island.openCrew();const card=document.querySelector('.island-card[open]');
  const result={events:events.length,code:island.island.code,profile:island.island.captain,stale:island.island.quotesStale,
   disabled:card.querySelector('[data-focus="hire-gunner"]').disabled,text:document.body.textContent,calls};
  island.dispose();stop();return result;
 });
 expect(result.events).toBe(1);expect(result.code).toBe('ISLE-K7Q2M');expect(result.profile.progressionVersion).toBe(1);
 expect(result.stale).toBe(true);expect(result.disabled).toBe(true);expect(result.text).toContain('built');
 expect(result.calls.filter(call=>typeof call==='object')).toHaveLength(1);
 expect(result.calls).not.toContain('/api/island/arsenal');expect(result.calls.some(call=>typeof call==='string'&&call.startsWith('/api/waves'))).toBe(false);
});
it('invalidates refused shared quotes until a coherent read succeeds',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot=sharedFixture();let fail=false,reads=0;
  const transport={get:async path=>path==='/api/island'?(reads++,fail?{ok:false,status:503}:{ok:true,data:snapshot}):{ok:false,status:409},
   post:async()=>{fail=true;return {ok:false,status:409,code:'stale_construction_quote',message:'Refresh this quote.'};}};
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{}});
  await island.load();await island.build('wall_1','wall');island.openCrew();
  const result={reads,stale:island.island.quotesStale,disabled:document.querySelector('[data-focus="hire-gunner"]').disabled};
  island.dispose();return result;
 });
 expect(result.reads).toBe(2);expect(result.stale).toBe(true);expect(result.disabled).toBe(true);
});
it('keeps shared session and reset controls unavailable before their client contracts are installed',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot=sharedFixture(),posts=[];let settings;
  const island=createIsland({container:document.body,emit,on,mode:'fake',storage:null,visitStorage:null,menu:()=>()=>{},settings:factory=>{settings=factory;return()=>{};},
   transport:{get:async path=>path==='/api/island'?{ok:true,data:snapshot}:{ok:false,status:409},post:async(...args)=>{posts.push(args);return {ok:false,status:409};}}});
  await island.load();island.pick('island_bell');
  const card=document.querySelector('.island-card[open]'),reset=settings();
  const result={bellDisabled:card.querySelector('[data-focus="bell"]').disabled,resetButton:!!reset.querySelector('button'),posts};
  island.dispose();return result;
 });
 expect(result.bellDisabled).toBe(true);expect(result.resetButton).toBe(false);expect(result.posts).toEqual([]);
});
it('rechecks visited-game membership after the authenticated identity changes',async()=>{
 const joins=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport();let generation=1,changed,joins=0;
  const island=createIsland({container:document.body,emit,on,mode:'fake',storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},
   authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};},
   transport:{get:(...args)=>base.get(...args),post:(path,body)=>{if(path==='/api/games/join')joins++;return base.post(path,body);}}});
  island.visit('ISLE-FR3ND');await island.load();generation=2;changed();await island.load();
  island.dispose();return joins;
 });
 expect(joins).toBe(2);
});
it('does not let an old join completion erase a newer identity join in progress',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport();let generation=1,changed,joins=0;const release=[];
  const island=createIsland({container:document.body,emit,on,mode:'fake',storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},
   authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};},
   transport:{get:(...args)=>base.get(...args),post:(path,body)=>{
    if(path!=='/api/games/join')return base.post(path,body);
    joins++;const answer=base.post(path,body);
    return joins>2?answer:new Promise(resolve=>release.push(async()=>resolve(await answer)));
   }}});
  island.visit('ISLE-FR3ND');const old=island.load();generation=2;changed();const fresh=island.load(),newIdentityJoins=joins;
  await release[0]();await old;const repeated=island.load();
  if(release[1])await release[1]();await Promise.all([fresh,repeated]);
  island.dispose();return {joins,newIdentityJoins};
 });
 expect(result).toEqual({joins:2,newIdentityJoins:2});
});
it('reads a legacy home Captain while defending a shared island without treating its wallet as the treasury',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport(),snapshot=sharedFixture();snapshot.code='ISLE-FR3ND';
  const transport={get:path=>path==='/api/captain'?Promise.resolve({ok:true,data:personalReply()}):path.startsWith('/api/island/visit/')?Promise.resolve({ok:true,data:snapshot}):base.get(path),post:(path,body)=>base.post(path,body)};
  const money=[],island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},onCoins:value=>money.push(value)});
  island.visit('ISLE-FR3ND');await island.load();island.openCaptain();
  const result={profile:island.island.captain,home:island.island.code,visit:island.visiting.code,money:money.at(-1),card:document.querySelector('.island-card[open]').textContent};
  island.dispose();return result;
 });
 expect(result.home).not.toBe(result.visit);expect(result.profile.progressionVersion).toBe(1);expect(result.card).toContain('Skill points: 3');
 expect(result.card).not.toContain('Upgrade');expect(result.money).toBe('9007199254741000');
});
it('clears actor projections on sign-out, rejects late replies, and retains personal adoption for the returning actor',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture,receipt}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  let generation=1,changed,release,shared=true,absent=false;
  const base=createFakeIslandTransport(),snapshot=sharedFixture();snapshot.personalCaptain=personalReply();
  const transport={get:path=>path==='/api/captain'?Promise.resolve(absent?{ok:false,status:409,code:'captain_not_initialized'}:{ok:true,data:personalReply()}):path==='/api/island'&&shared?Promise.resolve({ok:true,data:snapshot}):base.get(path),
   post:(path,body)=>path==='/api/island/build'?new Promise(resolve=>{release=()=>resolve({ok:true,data:receipt(snapshot,body,'build')});}):base.post(path,body)};
  const money=[],island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};},onCoins:value=>money.push(value)});
  await island.load();const pending=island.build('wall_1','wall');generation=2;changed();
  const cleared={own:island.island,treasury:money.at(-1),weapon:island.arsenal.weapon(),card:document.querySelector('.island-card[open]')?.textContent??null};
  release();await pending;const late=island.island;
  generation=3;shared=false;absent=true;changed();await island.load();island.openCaptain();
  const returned=document.querySelector('.island-card[open]').textContent;
  island.dispose();return {cleared,late,returned};
 });
 expect(result.cleared).toMatchObject({own:null,treasury:null,weapon:null,card:null});expect(result.late).toBeNull();
 expect(result.returned).toContain('Captain progress unavailable');expect(result.returned).not.toContain('Upgrade');
});
it('allows proven unadopted personal progression for a new actor but never restores paid progress for the previous adopted actor',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport();base.dev.setCoins(9000);base.dev.setWaveBest(9);
  let generation=1,changed,adopted=true,code='ISLE-K7Q2M';
  const transport={get:async path=>{
   if(path==='/api/captain')return adopted?{ok:true,data:personalReply()}:{ok:false,status:409,code:'captain_not_initialized'};
   const answer=await base.get(path);return path==='/api/island'&&answer.ok?{...answer,data:{...answer.data,code}}:answer;
  },post:(path,body)=>base.post(path,body)};
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};}});
  await island.load();generation=2;adopted=false;code='ISLE-FR3ND';changed();await island.load();island.openCaptain();
  const newcomer=document.querySelector('.island-card[open]').textContent;
  generation=3;code='ISLE-K7Q2M';changed();await island.load();island.openCaptain();
  const returning=document.querySelector('.island-card[open]').textContent;
  island.dispose();return {newcomer,returning};
 });
 expect(result.newcomer).toContain('Upgrade');expect(result.newcomer).not.toContain('Captain progress unavailable');
 expect(result.returning).toContain('Captain progress unavailable');expect(result.returning).not.toContain('Upgrade');
});
it('gates unsupported shared market and match entry while keeping weather and legacy Harbor entry',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport();base.dev.setWaveBest(20);
  const snapshot=sharedFixture(),opened=[];
  const transport={get:path=>path==='/api/island'?Promise.resolve({ok:true,data:snapshot}):base.get(path),post:(path,body)=>base.post(path,body)};
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},openHarborStall:id=>opened.push(id)});
  await island.load();island.openHarbor();
  const shared={market:!!document.querySelector('[data-focus="stall-market"]'),match:!!document.querySelector('[data-focus="stall-match"]'),weather:!!document.querySelector('[data-focus="stall-weather"]')};
  document.querySelector('[data-focus="stall-weather"]').click();island.dispose();
  const legacy=createIsland({container:document.body,emit,on,mode:'fake',transport:base,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},openHarborStall:id=>opened.push(id)});
  await legacy.load();legacy.openHarbor();document.querySelector('[data-focus="stall-market"]').click();legacy.dispose();
  return {shared,opened};
 });
 expect(result.shared).toEqual({market:false,match:false,weather:true});expect(result.opened).toEqual(['weather','market']);
});

it('keeps installed shared Harbor entries available from the accepted capability snapshot',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport(),snapshot=sharedFixture(),opened=[];
  for(const name of ['market','match'])snapshot.capabilities[name]={available:true,reason:null};
  const transport={get:path=>path==='/api/island'?Promise.resolve({ok:true,data:snapshot}):base.get(path),post:(...args)=>base.post(...args)};
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},openHarborStall:id=>opened.push(id)});
  await island.load();island.openHarbor();
  document.querySelector('[data-focus="stall-market"]').click();
  island.openHarbor();document.querySelector('[data-focus="stall-match"]').click();
  const economy=island.economy;island.dispose();return {opened,economy};
 });
 expect(result.opened).toEqual(['market','match']);expect(result.economy.mode).toBe('island_shared');
});
