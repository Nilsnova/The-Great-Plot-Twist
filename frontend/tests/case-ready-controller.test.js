// Actual native controller with injected display snapshots; no fake case actions or HTTP.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
async function mount(page,caseReady=false){
  await page.evaluate(async caseReady=>{
    const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
    const {createUnavailableCaseAdapter}=await window.g20Import('/src/adapter/unavailable.js');
    const {caseMethods}=await window.g20Import('/src/adapter/contract.js');
    const disconnected=createUnavailableCaseAdapter(),base=disconnected.read();disconnected.dispose();
    let view={...base,mode:'real',revision:1,account:{...base.account,state:'signed_in',hasKit:true},
      crew:{...base.crew,status:'active',code:'RECORDED',caseReady},
      bulletin:{status:'ready',day:null,lines:[{kind:'notice',text:'Recorded public bulletin.'}],
        weather:null,exchange:null,chapterTwoHook:null}};
    const listeners=new Set(),proof={intents:[],writes:0};
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){proof.writes++;return original.apply(this,args);};
    const adapter={read:()=>structuredClone(view),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
      ...Object.fromEntries(caseMethods.map(name=>[name,async()=>{proof.intents.push(name);return {
        accepted:false,reason:'not_connected',message:'Recorded unavailable action.',view:structuredClone(view)};}]))};
    const screens=createCaseScreens({container:document.body,adapter});
    proof.publish=value=>{view={...view,revision:view.revision+1,crew:{...view.crew,caseReady:value}};
      for(const listener of listeners)listener({type:'case_updated',view:structuredClone(view)});};
    proof.screens=screens;proof.cleanup=()=>{try{screens.dispose();}finally{listeners.clear();Storage.prototype.setItem=original;}};
    window.caseReadyProof=proof;
  },caseReady);
}
async function unchanged(page){
  expect(await page.evaluate(()=>({intents:window.caseReadyProof.intents,writes:window.caseReadyProof.writes})))
    .toEqual({intents:[],writes:0});
}

it.each(['board','search','partners','finale','accusation','reveal'])('routes an explicit %s open to Crew when the authoritative case is unavailable',async name=>{
  await evaluate.withPage(async page=>{
    await mount(page,false);
    try{
      // The search parameter proves readiness is checked before inspectSpot can dispatch.
      await page.evaluate(name=>window.caseReadyProof.screens.open(name,{spot:'recorded_spot'}),name);
      await page.locator('.case-modal[open] .case-crew').waitFor();
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('crew');
      expect(await page.locator('.case-modal[open] .case-page-picker').inputValue()).toBe('crew');
      expect(await page.locator('.case-board,.case-search,.case-partners,.case-finale,.case-accusation,.case-reveal').count()).toBe(0);
      await unchanged(page);
    }finally{await page.evaluate(()=>window.caseReadyProof?.cleanup());}
  });
});

it('replaces an open Board with Crew on case loss and waits for a manual Board visit after readiness returns',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,true);
    try{
      await page.evaluate(()=>window.caseReadyProof.screens.open('board'));
      await page.locator('.case-modal[open] .case-board').waitFor();
      await page.evaluate(()=>window.caseReadyProof.publish(false));
      await page.locator('.case-modal[open] .case-crew').waitFor();
      expect(await page.locator('.case-modal[open] .case-board').count()).toBe(0);
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('crew');
      await page.evaluate(()=>window.caseReadyProof.publish(true));
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('crew');
      expect(await page.locator('.case-modal[open] .case-crew').isVisible()).toBe(true);
      await page.locator('.case-modal[open] .case-nav').getByRole('button',{name:'Board',exact:true}).click();
      await page.locator('.case-modal[open] .case-board').waitFor();
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('board');
      await unchanged(page);
    }finally{await page.evaluate(()=>window.caseReadyProof?.cleanup());}
  });
});

it('keeps the public Bulletin available while caseReady is false, including later unavailable-case updates',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,false);
    try{
      await page.evaluate(()=>window.caseReadyProof.screens.open('bulletin'));
      const bulletin=page.locator('.case-modal[open] .bulletin-screen');await bulletin.waitFor();
      expect(await bulletin.locator('.bulletin-lines').textContent()).toContain('Recorded public bulletin.');
      await page.evaluate(()=>window.caseReadyProof.publish(false));
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('bulletin');
      expect(await bulletin.isVisible()).toBe(true);
      expect(await page.locator('.case-modal[open] .case-crew').count()).toBe(0);
      await unchanged(page);
    }finally{await page.evaluate(()=>window.caseReadyProof?.cleanup());}
  });
});

it('preserves the optional readiness field for existing adapters that do not publish it',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,true);
    try{
      await page.evaluate(()=>window.caseReadyProof.publish(undefined));
      await page.evaluate(()=>window.caseReadyProof.screens.open('board'));
      await page.locator('.case-modal[open] .case-board').waitFor();
      expect(await page.evaluate(()=>window.caseReadyProof.screens.screenName)).toBe('board');
      await unchanged(page);
    }finally{await page.evaluate(()=>window.caseReadyProof?.cleanup());}
  });
});
