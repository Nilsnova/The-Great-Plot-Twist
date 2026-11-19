// Explicit owned-island deletion disclosure after a synthetic server classification; no account is deleted.
import {it,expect} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from './g20-browser.js';
const browser=browserHarness();
async function mount(page,owner){
 await page.evaluate(async owner=>{
  await window.g20Import('/src/ui/kit/kit.css');
  const {createAccountScreen}=await window.g20Import('/src/screens/account/index.js');
  const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
  window.sent=[];window.screen=createAccountScreen({send:async(name,...args)=>{
   window.sent.push([name,...args]);return owner&&window.sent.length===1
    ?{accepted:false,reason:'owned_island_confirmation_required',message:'Confirm your owned island deletion.'}:{accepted:true};
  }});
  window.accountView={account:{state:'signed_in',captainName:'Captain Lantern'},visiting:{ownerName:'Another captain'}};
  window.screen.update(window.accountView);window.modal=createModal({title:'Your captain',body:window.screen.element});window.modal.open();
 },owner);
 await page.getByRole('button',{name:'Delete my data',exact:true}).click();
 await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();
}
it('requires a separate explicit account-and-owned-island confirmation after the server refusal',async()=>{
 await browser.withPage(async page=>{
  await page.setViewportSize({width:375,height:812});await mount(page,true);
  const confirm=page.getByRole('button',{name:'Delete account and island',exact:true});await confirm.waitFor();
  expect(await page.locator('.account-delete-confirm').textContent()).toContain('not be transferred');
  expect(await page.locator('.account-delete-confirm').textContent()).toContain('Other players keep their personal Captains');
  expect(await page.evaluate(()=>window.sent)).toEqual([['deleteMyData',{confirm:true}]]);
  if(process.env.MP_ECO_EVIDENCE_DIR){await mkdir(process.env.MP_ECO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.MP_ECO_EVIDENCE_DIR,'owned-island-delete-phone.png')});}
  await confirm.click();expect(await page.evaluate(()=>window.sent)).toEqual([
   ['deleteMyData',{confirm:true}],['deleteMyData',{confirm:true,confirmOwnedIslandDeletion:true}],
  ]);
  await page.evaluate(()=>{window.screen.dispose();window.modal.dispose();});
 });
});
it('cancels the ownership disclosure and never infers ownership from a visited island',async()=>{
 await browser.withPage(async page=>{
  await mount(page,true);await page.getByRole('button',{name:'Keep my data',exact:true}).click();
  expect(await page.getByRole('button',{name:'Delete account and island',exact:true}).count()).toBe(0);
  expect(await page.evaluate(()=>window.sent)).toEqual([['deleteMyData',{confirm:true}]]);
  await page.evaluate(()=>{window.screen.dispose();window.modal.dispose();});
  await mount(page,false);expect(await page.getByRole('button',{name:'Delete account and island',exact:true}).count()).toBe(0);
  expect(await page.evaluate(()=>window.sent)).toEqual([['deleteMyData',{confirm:true}]]);
  await page.evaluate(()=>{window.screen.dispose();window.modal.dispose();});
 });
});

it('clears extra consent on close before the same account screen is reopened',async()=>{
 await browser.withPage(async page=>{
  await mount(page,true);await page.evaluate(()=>{window.screen.close();window.screen.update(window.accountView);});
  expect(await page.getByRole('button',{name:'Delete account and island',exact:true}).count()).toBe(0);
  await page.getByRole('button',{name:'Delete my data',exact:true}).click();
  expect(await page.getByRole('button',{name:'Confirm deletion',exact:true}).count()).toBe(1);
  expect(await page.evaluate(()=>window.sent)).toEqual([['deleteMyData',{confirm:true}]]);
  await page.evaluate(()=>{window.screen.dispose();window.modal.dispose();});
 });
});
