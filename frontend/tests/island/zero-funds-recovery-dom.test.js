// Actual shared island cards at zero coins; all transport replies are explicit component fixtures.
import {expect,it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
const browser=browserHarness();

it.each([{width:1280,height:800},{width:375,height:812}])('keeps zero-funds member actions and owner-only recovery distinct at $width px',async viewport=>{
 await browser.withPage(async page=>{
  await page.setViewportSize(viewport);
  const result=await page.evaluate(async()=>{
   for(const path of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css','/src/ui/readability.css'])await window.g20Import(path);
   const {createIsland}=await window.g20Import('/src/island/index.js');
   const {createHud}=await window.g20Import('/src/ui/hud.js');
   const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
   const {fundedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
   const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
   const {actorId:owner,economy,metadata}=await window.g20Import('/tests/island/shared-session-fixture.js');
   const {on,emit}=await window.g20Import('/src/core/events.js');
   const member='99999999-9999-4999-8999-999999999999';
   const zero={...economy(),treasury:{balanceCoins:'0',committedCoins:'0',availableCoins:'0'}};
   const snapshot={...fundedFixture(zero),actorId:member,code:'ISLE-FR3ND',waveBest:30,nextWave:31,personalCaptain:personalReply()};
   snapshot.crew={gunner:0,carpenter:0,guard:0,lookout:0};
   snapshot.capabilities.session={available:true,reason:null};snapshot.capabilities.reset={available:true,reason:null};
   const base=createFakeIslandTransport();base.dev.setCoins(9000);base.dev.setWaveBest(30);
   let session,settings;const posts=[];
   const meta=()=>{const row=metadata();row.economy=zero;row.session.sessionId=session;row.session.connectionGeneration='1';row.session.leaderId=member;return row;};
   const hud=createHud(document.body,{start(){},focus(){},menu(){},hasIsland:()=>false},{storage:null});hud.start();
   const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>member,storage:localStorage,visitStorage:null,
    menu:()=>()=>{},settings:factory=>{settings=factory;return()=>{};},onCoins:(coins,options)=>{
     if(options?.shared)hud.setTreasury(options.economy,{replace:true});else hud.setCoins(coins);},
    transport:{get:async(path,...args)=>{
     if(path==='/api/captain')return {ok:true,data:personalReply()};
     if(path.startsWith('/api/island/visit/'))return {ok:true,data:snapshot};
     if(path.startsWith('/api/island/session?'))return {ok:true,data:meta()};
     return base.get(path,...args);
    },post:async(path,body,...args)=>{posts.push({path,body});
     if(path==='/api/island/session/attach'){session=body.sessionId;return {ok:true,data:meta()};}
     if(path==='/api/island/session/heartbeat')return {ok:true,data:meta()};
     return base.post(path,body,...args);
    }}});
   island.visit('ISLE-FR3ND');await island.load();await island.session.ensure();island.openCrew();
   hud.setCoins(77777);hud.setCaptain({account:{state:'signed_in'},captain:{coins:88888}});
   const card=document.querySelector('.island-card[open]'),section=settings();
   window.zeroRecovery={island,hud,section,posts};
   return {treasury:island.economy?.treasury,crewText:card?.textContent,
    disabled:[...card.querySelectorAll('[data-focus^="hire-"]')].every(button=>button.disabled),
    hud:document.querySelector('.hud-coins').textContent,owner,member,resetText:section.textContent,
    resetButtons:section.querySelectorAll('button').length,proof:!!island.session.proof(),
    overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  expect(result.treasury).toEqual({balanceCoins:'0',committedCoins:'0',availableCoins:'0'});
  expect(result.disabled).toBe(true);expect(result.crewText).toContain('Not enough island coins.');
  expect(result.hud).toContain('Island treasury');expect(result.hud).toContain('🪙 0');expect(result.hud).not.toMatch(/77,777|88,888|9,000/);
  expect(result.resetText).toContain('Only the host');expect(result.resetButtons).toBe(0);expect(result.proof).toBe(true);expect(result.overflow).toBe(false);
  if(process.env.MP_ECO_EVIDENCE_DIR){await mkdir(process.env.MP_ECO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.MP_ECO_EVIDENCE_DIR,`zero-funds-member-${viewport.width}.png`)});}
  const bell=await page.evaluate(()=>{const {island,posts}=window.zeroRecovery;island.pick('island_bell');const card=document.querySelector('.island-card[open]'),button=card.querySelector('[data-focus="bell"]');
   return {text:card.textContent,disabled:button.disabled,posts:posts.filter(row=>row.path==='/api/island/fresh-start'||row.path==='/api/waves/start').length};});
  expect(bell.text).toContain('wave 31');expect(bell.disabled).toBe(false);expect(bell.posts).toBe(0);
  await page.evaluate(()=>{window.zeroRecovery.island.dispose();window.zeroRecovery.hud.dispose();});
 });
});

it.each([{width:1280,height:800},{width:375,height:812}])('allows an owner to confirm an ordinary reset at zero funds at $width px',async viewport=>{
 await browser.withPage(async page=>{
  await page.setViewportSize(viewport);
  await page.evaluate(async()=>{
   for(const path of ['/src/ui/base.css','/src/ui/kit/kit.css'])await window.g20Import(path);
   const {createResetSection}=await window.g20Import('/src/island/reset.js');
   const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
   const {actorId,economy}=await window.g20Import('/tests/island/shared-session-fixture.js');
   const zero={...economy(),treasury:{balanceCoins:'0',committedCoins:'0',availableCoins:'0'}};
   window.zeroOwnerSubmissions=0;
   const section=createResetSection({read:()=>({kind:'owner',shared:true,actorId,code:'ISLE-K7Q2M',economy:zero}),
    reset:async()=>{window.zeroOwnerSubmissions++;return {ok:false,message:'This read-only component check sends no reset.'};}});
   window.zeroOwnerModal=createModal({title:'Settings',body:section});window.zeroOwnerModal.open();
  });
  const button=page.getByRole('button',{name:'Reset my island',exact:true});
  expect(await button.isDisabled()).toBe(true);
  await page.locator('.island-reset-code').fill('ISLE-K7Q2M');expect(await button.isEnabled()).toBe(true);
  const result=await page.evaluate(()=>({copy:document.querySelector('.island-reset-copy').textContent,
   scope:document.querySelector('.island-reset-scope').textContent,submissions:window.zeroOwnerSubmissions,
   overflow:document.documentElement.scrollWidth>innerWidth+1}));
  expect(result.copy).toContain('personal Captain');expect(result.copy).toContain('retired run');
  expect(result.scope).toContain('Available 🪙 0');expect(result.scope).toContain('Reserved 🪙 0');expect(result.submissions).toBe(0);expect(result.overflow).toBe(false);
  if(process.env.MP_ECO_EVIDENCE_DIR){await mkdir(process.env.MP_ECO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.MP_ECO_EVIDENCE_DIR,`zero-funds-owner-${viewport.width}.png`)});}
  await page.evaluate(()=>window.zeroOwnerModal.dispose());
 });
});
