// Production L4-v2 checks use public gestures, generated PKCE and intercepted recorded answers only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openMarketFixture} from './online-market-fixture.js';
import {enterRecordedMarket,recordedMarketGolden,recordedMarketUnapplied,createRecordedMarketChaosJourney} from './online-market-journeys.js';

export async function checkOnlineMarket({widths=[1280,375],folder='captures/20261107_G9-C3-market'}={}){
 const report={stage:'stream9',checks:[],requests:[],proofs:[],pending:[
  'Seven-fault market common-call, focus and physical-path coverage runs separately through checkOnlineMarketChaos.']};
 await mkdir(folder,{recursive:true});
 try{
  for(const width of widths){
   const env=await openMarketFixture(),{page}=env;
   try{
    await page.setViewportSize({width,height:812});
    for(const flag of [false,'true',1]){
     // Keep the raw public board enabled to expose a missing client flag policy, including cached/stale boards.
     env.resetMarket({flag,tradingEnabled:true});const before=env.marketRequests.length;
     await enterRecordedMarket(env);const screen=page.locator('.market-modal[open]');
     const later=screen.locator('.market-prices .market-soon');await later.waitFor({state:'visible'});
     assert.equal(await later.textContent(),'Trading opens later.','The public price board uses the approved trading-closed caption.');
     assert.ok(await env.assertPublicMarketPrice(),'A non-true market flag still displays the recorded public quote.');
     assert.ok(await screen.locator('.market-prices .market-simulation').isVisible()
      &&await screen.locator('.market-prices .market-simulation').textContent()===env.marketSimulationNote,
      'The public price pane keeps its simulation notice while trading is closed.');
     assert.equal(await screen.getByRole('button',{name:/^Open a position in /}).count(),0,
      'A non-true market flag exposes no open-position control.');
     await screen.getByRole('tab',{name:'Your positions',exact:true}).click();
     await screen.locator('.market-positions .market-refresh-note,.market-positions .market-blocked')
      .filter({hasText:/^(?:Trading opens later\.|The Island Exchange is not open yet\.|Sign in to trade on the Island Exchange\.)$/})
      .first().waitFor({state:'visible'});
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     assert.ok(await screen.locator('.market-positions .market-simulation').isVisible()
      &&await screen.locator('.market-positions .market-simulation').textContent()===env.marketSimulationNote,
      'The blocked positions pane keeps the same simulation notice.');
     assert.equal(await screen.locator('.market-position,.market-closed').count(),0,'Closed trading exposes no private position or receipt.');
     assert.equal(await screen.locator('.market-account').isVisible(),false,'Closed trading exposes no private account balance.');
     const phase=env.marketRequests.slice(before),board=phase.filter(request=>request.path==='/api/market');
     assert.ok(board.length>0&&board.every(request=>request.method==='GET'&&!request.authorized),
      'A non-true market flag keeps the price board available through anonymous reads.');
     assert.equal(phase.filter(request=>request.path!=='/api/market').length,0,
      'A non-true market flag starts no private portfolio read or write across either pane.');
     assert.ok(env.marketChunkCount()>0,'The public market module remains available while only trading is gated.');
     report.checks.push('A false, string or numeric market flag keeps anonymous prices and both notices, with no private read or write.');
    }
    const result=await recordedMarketGolden(env,{width,async capture(label){
     await page.screenshot({path:`${folder}/${label}-${width}.png`});}});
    report.checks.push(...result.checks);report.proofs.push({phase:'golden',...env.marketProof()});
    const unapplied=await recordedMarketUnapplied(env,{width,async capture(label){
     await page.screenshot({path:`${folder}/${label}-${width}.png`});}});
    report.checks.push(...unapplied.checks);
    assert.ok(env.checks.pkce&&env.checks.exchanged,'The market journeys sign in through bundled intercepted GitHub PKCE.');
    assert.ok(!env.requests.some(request=>request.path==='/api/auth/exchange'),'Market journeys never use the retired exchange route.');
    assert.equal(env.pageErrors.length,0,'Market journeys have no uncaught browser errors.');
    const allowed=new Map();
    for(const failure of env.marketFailures){const key=failure.path+':'+failure.status;allowed.set(key,(allowed.get(key)??0)+1);}
    for(const error of env.consoleErrors){
     const key=error.path+':'+error.status,count=allowed.get(key)??0;
     assert.ok(error.resource&&count>0,'Every HTTP console error consumes one explicitly intercepted market refusal.');
     allowed.set(key,count-1);
    }
    assert.equal(env.errors.length,env.consoleErrors.length,'No other browser error is hidden by the controlled HTTP faults.');
    assert.ok(env.external.every(value=>new URL(value).origin==='https://placeholder.supabase.co'),
     'Every external request remains on the intercepted generated-auth origin.');
    report.proofs.push({phase:'unapplied',...env.marketProof()});report.requests.push(...env.marketRequests);
   }catch(error){
    // The intercepted fixture contains only generic records; retain the actual failing UI for diagnosis.
    await page.screenshot({path:`${folder}/failure-${width}.png`}).catch(()=>{});
    const safePaths=new Set(['/api/market','/api/market/portfolio','/api/market/open','/api/market/close']);
    report.failure={type:['AssertionError','TypeError','Error'].includes(error.name)?error.name:'Error',
     pageErrorTypes:env.pageErrors.map(name=>['Error','TypeError','SyntaxError','ReferenceError'].includes(name)?name:'Error'),
     console:env.consoleErrors.map(value=>({path:safePaths.has(value.path)?value.path:'other',
      status:Number.isInteger(value.status)&&value.status>=400&&value.status<=599?value.status:null,resource:value.resource===true}))};
    throw error;
   }finally{await env.close();}
  }
  return report;
 }finally{await writeFile(folder+'/online-market.json',JSON.stringify(report,null,2)+'\n');}
}

// A CLI parent injects its already-running function; only a standalone runner lazily imports it.
export async function checkOnlineMarketChaos({checkChaos,widths=[375,320],
 folder='captures/20261107_G9-C3-market-chaos'}={}){
 const runChaos=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
 assert.ok(typeof runChaos==='function'&&runChaos.groupFaultExpectations===true,
  'Market chaos requires the genuine group attention, fault words, focus and cooldown driver.');
 return runChaos({openFixture:openMarketFixture,journeys:[createRecordedMarketChaosJourney()],widths,folder});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--chaos'))await checkOnlineMarketChaos();
 else{const report=await checkOnlineMarket();
  console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length,pending:report.pending}));}
}
