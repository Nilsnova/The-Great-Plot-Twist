// Actual Chromium boat scene + durable helpers with injected API replies, not provider acceptance.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const {createBoatGame} = await window.g20Import('/src/pirates/boat/scene.js');
    const {launchSharedBoatScene} = await window.g20Import('/src/island/shared-boat-scene.js');
    const {createSharedBoatApi} = await window.g20Import('/src/island/shared-boat-api.js');
    const {createBoatRoundSession} = await window.g20Import('/src/island/shared-boat-session.js');
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const origin = {mode:'island_shared',version:1,islandOwner:id(2),accountId:id(3),runEpoch:id(4)};
    const actor = id(1), receipts = new Map();let sequence=0, rounds=0, paid=options.paid??0;
    window.sharedBoatContext={...origin};window.sharedBoatCalls=[];window.sharedBoatApplied=[];
    window.sharedBoatLoseClaim=options.loseClaim===true;window.sharedBoatHoldClaim=options.holdClaim===true;
    const transport={async post(path,body,headers){
      window.sharedBoatCalls.push({path,body:structuredClone(body),headers});
      if(receipts.has(body.actionUid))return {ok:true,status:200,data:{...receipts.get(body.actionUid),repeat:true,currentEconomy:null}};
      if(path.endsWith('start')&&window.sharedBoatHoldStart){window.sharedBoatHoldStart=false;await new Promise(resolve=>{window.releaseSharedStart=resolve;});}
      const start=path.endsWith('start'),target=body.stars*12,coins=start?0:Math.max(0,target-paid);
      if(!start)paid=Math.max(paid,target);
      const result=start?{round:{id:id(20+ ++rounds),actorId:actor,islandOwner:origin.islandOwner,accountId:origin.accountId,runEpoch:origin.runEpoch,game:body.game,recordWave:30,maximumCoins:'36'}}:
        {roundId:body.roundId,game:'dash',recordWave:30,stars:body.stars,coins:String(coins),cumulativeCoins:String(paid),maximumCoins:'36',treasuryReceiptId:coins?id(80):null};
      const data={status:start?'started':'done',repeat:false,receipt:{receiptId:id(100+sequence),actionUid:body.actionUid,action:start?'boat:start':'boat:claim',actorId:actor,origin:{...origin},result},
        ...(!start?{currentEconomy:{...origin,revision:'2',treasury:{balanceCoins:String(200+paid),committedCoins:'0',availableCoins:String(200+paid)}}}:{})};
      receipts.set(body.actionUid,data);window.sharedBoatLastReply=data;
      if(!start&&window.sharedBoatLoseClaim){window.sharedBoatLoseClaim=false;return {ok:false,status:503,code:'database_unavailable',message:'Retry the original score.'};}
      if(!start&&window.sharedBoatHoldClaim){window.sharedBoatHoldClaim=false;await new Promise(resolve=>{window.releaseSharedClaim=resolve;});}
      return {ok:true,status:200,data};
    }};
    const api=createSharedBoatApi({transport,getEconomy:()=>window.sharedBoatContext,onEconomy:(...args)=>window.sharedBoatApplied.push(args)});
    window.sharedBoatSession=createBoatRoundSession({api,getEconomy:()=>window.sharedBoatContext,getActorId:()=>actor,storage:localStorage,makeUid:()=>`browser-boat-${String(++sequence).padStart(8,'0')}`});
    const launched=await launchSharedBoatScene({createBoatGame,session:window.sharedBoatSession,game:'dash',container:document.body,code:'ISLE-K7Q2M',autoplay:false});
    if(!launched.ok)throw new Error(launched.message);
    window.sharedBoatScene=launched.data;
    window.finishSharedBoat=()=>{for(let i=0;i<250;i++)window.sharedBoatScene.update(.1);};
    window.sharedPending=()=>Object.keys(localStorage).filter(key=>key.startsWith('plot_twist_shared_boat_v1:')).map(key=>JSON.parse(localStorage.getItem(key)));
  },options);
}

it('Again waits for a fresh server round before restarting the actual scene', async () => {
  await browser.withPage(async page => {
    await mount(page,{paid:36});
    await page.evaluate(()=>window.finishSharedBoat());
    await page.waitForFunction(()=>window.sharedBoatCalls.some(item=>item.path.endsWith('claim'))&&window.sharedPending().length===0);
    expect(await page.locator('.boat-result-line').textContent()).toContain('Island cap reached');
    if(process.env.MP_ECO_BOAT_CAPTURE)await page.screenshot({path:process.env.MP_ECO_BOAT_CAPTURE});
    await page.evaluate(()=>{window.sharedBoatHoldStart=true;});
    await page.locator('.boat-again').click();
    await page.waitForFunction(()=>typeof window.releaseSharedStart==='function');
    expect(await page.evaluate(()=>({phase:window.sharedBoatScene.phase,disabled:document.querySelector('.boat-again').disabled,rounds:document.querySelectorAll('.boat-game').length})))
      .toEqual({phase:'result',disabled:true,rounds:1});
    await page.evaluate(()=>window.releaseSharedStart());
    await page.waitForFunction(()=>window.sharedBoatScene.phase==='intro');
    const result=await page.evaluate(()=>({starts:window.sharedBoatCalls.filter(item=>item.path.endsWith('start')).map(item=>item.body.actionUid),pending:window.sharedPending()}));
    expect(result.starts).toHaveLength(2);expect(new Set(result.starts).size).toBe(2);
    expect(result.pending).toHaveLength(1);expect(result.pending[0].round.id).toBe('00000000-0000-4000-8000-000000000022');
  });
});

it('Again confirms an unknown original completion before creating the next round', async () => {
  await browser.withPage(async page => {
    await mount(page,{loseClaim:true});await page.evaluate(()=>window.finishSharedBoat());
    await page.waitForFunction(()=>document.querySelector('.boat-result-line').textContent.includes('Retry the original'));
    await page.locator('.boat-again').click();
    await page.waitForFunction(()=>window.sharedBoatScene.phase==='intro');
    const calls=await page.evaluate(()=>window.sharedBoatCalls);
    const claims=calls.filter(item=>item.path.endsWith('claim'));
    expect(claims).toHaveLength(2);expect(claims[0].body).toEqual(claims[1].body);
    expect(calls.map(item=>item.path.split('/').at(-1))).toEqual(['start','claim','claim','start']);
  });
});

it('a completed pending claim survives scene disposal and cannot project another island treasury', async () => {
  await browser.withPage(async page => {
    await mount(page,{holdClaim:true});await page.evaluate(()=>window.finishSharedBoat());
    await page.waitForFunction(()=>typeof window.releaseSharedClaim==='function');
    const before=await page.evaluate(()=>{window.sharedBoatScene.dispose();window.sharedBoatContext={...window.sharedBoatContext,accountId:'00000000-0000-4000-8000-000000000099'};return window.sharedPending();});
    expect(before).toHaveLength(1);expect(before[0].phase).toBe('claim');
    await page.evaluate(()=>window.releaseSharedClaim());
    await page.waitForFunction(()=>window.sharedPending().length===0);
    expect(await page.locator('.boat-game').count()).toBe(0);
    expect(await page.evaluate(()=>window.sharedBoatApplied.length)).toBe(0);
  });
});

it('actual page reload retries the saved original score and UID from localStorage', async () => {
  await browser.withPage(async page => {
    await mount(page,{loseClaim:true});await page.evaluate(()=>window.finishSharedBoat());
    await page.waitForFunction(()=>document.querySelector('.boat-result-line').textContent.includes('Retry the original'));
    const saved=await page.evaluate(()=>({record:window.sharedPending()[0],reply:window.sharedBoatLastReply,body:window.sharedBoatCalls.at(-1).body}));
    await page.reload();
    await page.addScriptTag({type:'module',content:'window.g20Import=path=>import(path);'});
    await page.waitForFunction(()=>typeof window.g20Import==='function');
    const recovered=await page.evaluate(async saved=>{
      const {createSharedBoatApi}=await window.g20Import('/src/island/shared-boat-api.js');
      const {createBoatRoundSession}=await window.g20Import('/src/island/shared-boat-session.js');
      let sent=null;
      const api=createSharedBoatApi({transport:{async post(path,body){sent={path,body};return {ok:true,status:200,data:{...saved.reply,repeat:true,currentEconomy:null}};}},getEconomy:()=>saved.record.origin});
      const session=createBoatRoundSession({api,getEconomy:()=>saved.record.origin,getActorId:()=>saved.record.actorId,storage:localStorage});
      const result=await session.recover();
      return {ok:result.ok,sent,pending:Object.keys(localStorage).filter(key=>key.startsWith('plot_twist_shared_boat_v1:')).length};
    },saved);
    expect(recovered.ok).toBe(true);expect(recovered.sent.path).toBe('/api/island/boat/claim');
    expect(recovered.sent.body).toEqual(saved.body);expect(recovered.pending).toBe(0);
  });
});
