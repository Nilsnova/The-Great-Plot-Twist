// Actual owner reset UI + island API preserve the old request when a lost response precedes a new GET.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const browser=browserHarness();
it('explains retired funds/personal preservation and confirms the original reset after replacement was read',async()=>{
 const result=await browser(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {actorId,economy}=await window.g20Import('/tests/island/shared-session-fixture.js');
  const {resetReply}=await window.g20Import('/tests/island/shared-reset-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot={...sharedFixture(),actorId,economy:economy()};snapshot.capabilities.reset={available:true,reason:null};
  const posts=[];let replaced=false,settings;
  const transport={get:async path=>path==='/api/island'?{ok:true,data:{...snapshot,economy:replaced?{...economy(),accountId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',runEpoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}:economy()}}:{ok:false,status:409},
   post:async(path,body)=>{posts.push({path,body});if(path!=='/api/island/fresh-start')return {ok:false,status:409};replaced=true;return posts.length===1?{ok:false,status:503}:{ok:true,data:resetReply(body)};}};
  const island=createIsland({container:document.body,emit,on,mode:'live',transport,getActorId:()=>actorId,storage:localStorage,visitStorage:null,menu:()=>()=>{},settings:factory=>{settings=factory;return()=>{};}});
  await island.load();const section=settings();document.body.append(section);const before=section.textContent;
  await island.resetIsland('ISLE-K7Q2M');await island.load();const freshAccount=island.economy.accountId;
  const retry=settings();document.body.append(retry);const retryText=retry.textContent;
  const confirmed=await island.resetIsland('ISLE-K7Q2M');const result={before,retryText,posts,freshAccount,currentAccount:island.economy.accountId,confirmed:confirmed.ok,ignored:confirmed.ignored===true};
  island.dispose();return result;
 });
 expect(result.before).toContain('personal Captain');expect(result.before).toContain('pending wager');expect(result.before).toContain('retired run');
 expect(result.retryText).toContain('Confirm original reset');expect(result.retryText).toContain('33333333');expect(result.posts).toHaveLength(2);
 expect(result.posts[1].body).toEqual(result.posts[0].body);expect(result.freshAccount).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');expect(result.currentAccount).toBe(result.freshAccount);
 expect(result.confirmed).toBe(true);expect(result.ignored).toBe(true);
});
it('shows the saved original scope and disables duplicate new reset submission after confirmation',async()=>{
 await browser.withPage(async page=>{
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(async()=>{
   await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
   const {createResetSection}=await window.g20Import('/src/island/reset.js');const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
   const {economy,actorId}=await window.g20Import('/tests/island/shared-session-fixture.js');const {resetReply}=await window.g20Import('/tests/island/shared-reset-fixture.js');
   window.submissions=0;const section=createResetSection({read:()=>({kind:'owner',shared:true,actorId,code:'ISLE-K7Q2M',pending:true,economy:economy()}),
    reset:async()=>{window.submissions++;return {ok:true,data:resetReply({actionUid:'original_reset_uid_001'})};}});
   window.modal=createModal({title:'Settings',body:section});window.modal.open();
  });
  await page.locator('.island-reset-code').fill('ISLE-K7Q2M');const button=page.getByRole('button',{name:'Confirm original reset',exact:true});
  expect(await button.isEnabled()).toBe(true);expect(await page.locator('.island-reset-copy').textContent()).toContain('personal Captain');
  expect(await page.locator('.island-reset-scope').textContent()).toContain('Saved original run 33333333');
  if(process.env.MP_ECO_EVIDENCE_DIR){await mkdir(process.env.MP_ECO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.MP_ECO_EVIDENCE_DIR,'shared-reset-phone.png')});}
  await button.click();await page.getByRole('button',{name:'Reset confirmed',exact:true}).waitFor();
  expect(await page.locator('.island-reset-code').isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'Reset confirmed',exact:true}).isDisabled()).toBe(true);
  expect(await page.evaluate(()=>window.submissions)).toBe(1);expect(await page.locator('.island-reset-status').textContent()).toContain('Original reset confirmed');
  await page.evaluate(()=>window.modal.dispose());
 });
});
it('keeps new funds unavailable after a confirmed reset when the authoritative reload fails',async()=>{
 const result=await browser(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {actorId,economy}=await window.g20Import('/tests/island/shared-session-fixture.js');const {resetReply}=await window.g20Import('/tests/island/shared-reset-fixture.js');const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot={...sharedFixture(),actorId,economy:economy()};snapshot.capabilities.reset={available:true,reason:null};let confirmed=false,posts=0;const funds=[];
  const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actorId,storage:localStorage,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},onCoins:(coins,meta)=>funds.push({coins,shared:meta.shared,economy:meta.economy}),
   transport:{get:async path=>path==='/api/island'&&!confirmed?{ok:true,data:snapshot}:{ok:false,status:503},post:async(_path,body)=>{posts++;confirmed=true;return {ok:true,data:resetReply(body)};}}});
  await island.load();const answer=await island.resetIsland('ISLE-K7Q2M'),after=island.economy;await island.api.freshStart({confirmCode:'ISLE-K7Q2M'});
  const result={confirmed:answer.ok,after,last:funds.at(-1),posts};island.dispose();return result;
 });
 expect(result.confirmed).toBe(true);expect(result.after).toBeNull();expect(result.last).toMatchObject({coins:null,shared:true,economy:null});expect(result.posts).toBe(1);
});
