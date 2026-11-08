// Recorded production prediction journeys: no live source, real account, local payout or settlement.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openPanelFixture,assertPanelPrivacy,waitForPanelSaved} from './online-panel-fixture.js';
import {enterPanelWorld,openPanelHotspot,closePanel,assertPanelReadable} from './online-panel-actions.js';
import {checkLocalPredictions} from './local-panel-journeys.js';
import {checkPanelFlagRefresh} from './panel-flag-journey.js';
const selector='.desk-modal[open]',folder='captures/20261107_G9-C3-predictions';
const credit='Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site.';
const safeCheck=(checks,value,label)=>{assert.ok(value,label);checks.push(label);};
export function createRecordedPredictions({now=Date.now}={}){
  const id=randomUUID(),stakes=[],attempts=new Map();let coins=300,writes=0,settles=0,mineReads=0,unknown=null,last=null;
  let sameUid=false,sameBody=false,readBeforeRetry=false,validBodies=true,manualReadBaseline=null;
  const question=()=>({id,text:'Will the recorded signal be seen?',topic:'science',decidedBy:'Recorded source',
    closesAt:new Date(now()+3600000).toISOString(),status:'open',canStake:true,outcome:null,settlement:null,settledAt:null,
    manifold:{state:'open',decidedAs:null,decidedAt:null},sides:[
      {side:'yes',label:'Yes',coins:34,players:2,payoutPerCoin:1.37},
      {side:'no',label:'No',coins:51,players:3,payoutPerCoin:1.91}],totalCoins:85,source:'cache',fetchedAt:new Date(now()).toISOString()});
  const receipt=body=>({questionId:id,side:body.side,amount:body.amount,coins:283});
  function apply(body){coins=283;stakes.push({questionId:id,text:question().text,side:body.side,amount:body.amount,
    placedAt:new Date(now()).toISOString(),status:'open',result:null,payout:null,settlement:null,outcome:null,settledAt:null});attempts.set(body.stakeId,receipt(body));}
  return {
    reset(){stakes.length=0;attempts.clear();coins=300;writes=settles=mineReads=0;unknown=last=null;sameUid=sameBody=readBeforeRetry=false;validBodies=true;manualReadBaseline=null;},
    planUnknown({applied=false}={}){unknown={applied};},
    markExplicitRetry(){manualReadBaseline=mineReads;readBeforeRetry=false;},
    snapshot:()=>({coins,stakeCount:stakes.length,stakeWrites:writes,settleWrites:settles,bodyValid:validBodies,
      sameUid,sameBody,readBeforeRetry,mineReads}),
    handle({method,path,body}){
      if(path==='/api/predictions'&&method==='GET')return {json:{questions:[question()],rules:{minStake:1,maxStake:50,dailyCap:200,cutPercent:5},
        attribution:credit,playMoney:'Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out.'}};
      if(path==='/api/predictions/mine'&&method==='GET'){mineReads++;return {json:{coins,stakedToday:stakes.length?17:0,
        leftToday:stakes.length?183:200,dailyCap:200,host:true,stakes:structuredClone(stakes)}};}
      if(path==='/api/predictions/settle'){settles++;return {status:403,json:{error:{code:'forbidden',message:'Recorded ordinary-player boundary.'}}};}
      if(path!=='/api/predictions/stake'||method!=='POST')return null;
      writes++;
      const valid=body&&Object.keys(body).sort().join(',')==='amount,questionId,side,stakeId'
        &&body.questionId===id&&['yes','no'].includes(body.side)&&body.amount===17
        &&typeof body.stakeId==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(body.stakeId);
      validBodies=validBodies&&Boolean(valid);
      if(!valid)return {status:422,json:{error:{code:'validation_error',message:'Recorded stake shape was refused.'}}};
      const serialized=JSON.stringify(body);
      if(last){sameUid=last.uid===body.stakeId;sameBody=last.body===serialized;readBeforeRetry=manualReadBaseline!==null&&mineReads>manualReadBaseline;}
      last={uid:body.stakeId,body:serialized,mineReads};
      manualReadBaseline=null;
      if(attempts.has(body.stakeId))return {status:409,json:{error:{code:'already_applied',message:'This stake was already placed.'}}};
      if(unknown){const planned=unknown;unknown=null;if(planned.applied)apply(body);return {abort:true};}
      apply(body);return {json:receipt(body)};
    },
  };
}
const openFixture=options=>openPanelFixture({area:'predictions',createService:createRecordedPredictions,...options});
async function prepareStake(env,{side='no'}={}){
  const card=env.page.locator(selector+' .desk-card').first();await card.locator('h3').waitFor();
  await card.getByRole('radio',{name:side==='yes'?'Yes':'No',exact:true}).check();
  await card.getByRole('spinbutton').fill('17');await card.getByRole('button',{name:'Stake Will the recorded signal be seen?',exact:true}).click();
  await card.getByRole('button',{name:'Confirm',exact:true}).waitFor();return card;
}
export async function recordedPredictionsGolden(env,{width=375,capture}={}){
  const {page}=env,checks=[];env.resetPanel();await page.setViewportSize({width,height:812});
  await enterPanelWorld(env,{area:'predictions'});await openPanelHotspot(env,'predictions');
  safeCheck(checks,env.moduleRequested('predictions'),'The enabled real hotspot loads its production prediction entry');
  safeCheck(checks,(await page.locator(selector+' .desk-pool').first().textContent()).includes('1.37'),
    'The question shows the server-supplied payout quote');
  let card=await prepareStake(env,{side:'yes'});await card.getByRole('button',{name:'Back',exact:true}).click();
  safeCheck(checks,env.panelSnapshot().stakeWrites===0&&env.panelSnapshot().coins===300,
    'Back cancels only the unsubmitted confirmation without an HTTP write or debit');
  card=await prepareStake(env);await card.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.desk-your-stake')?.textContent.includes('17 coins on NO'));
  safeCheck(checks,env.panelSnapshot().stakeCount===1&&env.panelSnapshot().coins===283&&env.panelSnapshot().bodyValid,
    'The server confirms one exact-shape stake and the authoritative coin balance');
  await page.locator(selector+' .desk-questions .desk-account').filter({hasText:'You have 283 coins.'}).waitFor();
  safeCheck(checks,(await page.locator(selector+' .desk-account').first().textContent()).includes('283'),
    'The kiosk displays the recorded own-account coin balance');
  await page.locator(selector).getByRole('tab',{name:'My stakes',exact:true}).click();
  await page.locator(selector+' .desk-stake-main').waitFor();
  safeCheck(checks,(await page.locator(selector+' .desk-stake-main').textContent()).includes('17 coins on NO'),
    'My stakes shows the authoritative holding');
  safeCheck(checks,await page.locator(selector).getByRole('tab',{name:'Presenter',exact:true}).count()===0,
    'An ordinary production player has no Presenter or settlement controls even when host is recorded');
  safeCheck(checks,!((await page.locator(selector).textContent()).includes(credit)),
    'Gameplay contains no prediction credit line; Settings Credits owns attribution');
  safeCheck(checks,/play money|simulation/i.test(await page.locator(selector+' .desk-play-money').textContent()),
    'The panel identifies simulated play coins');
  await assertPanelReadable(page,selector);await waitForPanelSaved(env);await capture?.('predictions-stake',page);
  await closePanel(page,selector);assertPanelPrivacy(env);return {checks};
}
export async function recordedUnknownPrediction(env,{applied=false}={}){
  env.resetPanel();await enterPanelWorld(env,{area:'predictions'});await openPanelHotspot(env,'predictions');
  const card=await prepareStake(env);env.panel.planUnknown({applied});
  const recoveryRead=env.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/predictions/mine'&&response.request().method()==='GET');
  await card.getByRole('button',{name:'Confirm',exact:true}).click();await recoveryRead;
  if(applied){
    await env.page.waitForFunction(()=>!!document.querySelector('.desk-your-stake'));
    assert.ok(env.panelSnapshot().stakeWrites===1&&env.panelSnapshot().stakeCount===1,'Read-back confirms an applied unknown stake without a second write');
  }else{
    await env.page.locator(selector+' .server-call[data-state="offline"]').waitFor();
    const beforeRetry=env.panelSnapshot();env.panel.markExplicitRetry();
    await card.getByRole('button',{name:'Confirm',exact:true}).click();
    await env.page.waitForFunction(()=>!!document.querySelector('.desk-your-stake'));
    const state=env.panelSnapshot();assert.ok(state.sameUid&&state.sameBody&&state.readBeforeRetry&&state.mineReads>beforeRetry.mineReads&&state.stakeWrites===2&&state.stakeCount===1,
      'An explicit retry reads mine first and sends the identical stake id and body exactly once');
  }
  assertPanelPrivacy(env);
}
export async function checkOnlinePredictionFlags(){
  for(const flag of [false,'true']){
    const env=await openFixture({flag});try{
      await enterPanelWorld(env,{area:'predictions'});await openPanelHotspot(env,'predictions',{opened:false});
      assert.ok(!env.moduleRequested('predictions'),'A false or string flag requests no prediction entry module');
      assert.ok(env.panelRequests.length===0,'A false or string flag sends no prediction HTTP');assertPanelPrivacy(env);
    }finally{await env.close();}
  }
}
export function createPredictionChaosJourney(){
  return {group:'predictions',paths:['/api/predictions/stake'],method:'POST',focus:'confirm',
    call:selector+' .server-call:not([hidden])',
    async setup(env){env.resetPanel();await enterPanelWorld(env,{area:'predictions'});await openPanelHotspot(env,'predictions');await prepareStake(env);await waitForPanelSaved(env);},
    trigger:({page})=>page.locator(selector).getByRole('button',{name:'Confirm',exact:true}).click(),
    snapshot:env=>({...env.panelSnapshot(),authTokenCalls:env.requests.filter(request=>request.path==='/auth/v1/token').length}),
    unchanged(env,before,fault){const after=env.panelSnapshot();assert.ok(after.coins===before.coins&&after.stakeCount===before.stakeCount,
      'A refused prediction action changes no authoritative coins or holding');
      assertPanelPrivacy(env);
      if(fault.status===401)assert.ok(env.checks.refreshed&&env.requests.filter(request=>request.path==='/auth/v1/token').length===before.authTokenCalls+1,
        'A2 renews exactly once before the final prediction expiry');},
    faultExpectation(fault){return {phase:fault.status===0?'offline':fault.status===401?'expired':fault.status===429?'rate_limited':'error',
      words:fault.status===0?/offline|no connection/i:fault.status===401?/sign in|session expired/i:fault.status===404?/desk.*closed|opens later/i:
        fault.status===429?/try again in \d+ s/i:fault.status===409?/Recorded service failure\./:/could not|answer|unavailable|wrong/i,
      ...(fault.status===401?{call:'.account-modal[open] .server-call:not([hidden])'}:{})};},
    async afterTrigger(env,fault){if(fault.status===401)await env.page.locator('.account-modal[open]').waitFor({state:'visible'});},
    async checkFocus({page},fault,check){
      const root=page.locator(fault.status===401?'.account-modal[open]':selector);
      const target=fault.status===401?root.locator('[data-focus="account-sign-in"]'):
        [404,429].includes(fault.status)?root.getByRole('link',{name:'Report a problem',exact:true}).last():
          root.getByRole('button',{name:[0,502,503].includes(fault.status)?'Confirm':'Stake Will the recorded signal be seen?',exact:true});
      await target.waitFor();check(await target.evaluate(element=>document.activeElement===element),'Prediction refusal focuses its next available public control');
    },
  };
}
export async function checkOnlinePredictionsChaos({checkChaos}={}){
  // A CLI parent passes its already-running function to avoid importing its unfinished module.
  const runChaos=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
  assert.ok(typeof runChaos==='function'&&runChaos.groupFaultExpectations===true,
    'Panel chaos requires shared driver group fault/focus/afterTrigger support before this is a verified gate');
  return runChaos({openFixture:()=>openFixture(),journeys:[createPredictionChaosJourney()],widths:[375,320],folder:folder+'-chaos'});
}
export async function checkOnlinePredictions({widths=[1280,375,320],extended=true}={}){
  const report={stage:'stream10-predictions',checks:[],requests:[],captures:[],saves:[]};await mkdir(folder,{recursive:true});
  try{
    if(extended){report.local=await checkLocalPredictions();report.checks.push('Independent development practice stakes pass at1280 and375');}
    if(extended){report.flagRefresh=await checkPanelFlagRefresh({openFixture:openFixture,area:'predictions'});
      report.checks.push(...report.flagRefresh.checks);report.requests.push(...report.flagRefresh.requests);report.saves.push(report.flagRefresh.save);}
    await checkOnlinePredictionFlags();report.checks.push('Strict false/string flags load no entry module or prediction route');
    for(const width of widths){const env=await openFixture();try{
      const result=await recordedPredictionsGolden(env,{width,capture:async(label,page)=>{const path=`${folder}/${label}-${width}.png`;await page.screenshot({path});report.captures.push(path);}});
      report.checks.push(...result.checks);
      if(extended&&width===375){await recordedUnknownPrediction(env);await recordedUnknownPrediction(env,{applied:true});report.checks.push('Unknown stake read-back and same-id explicit retry are authoritative');}
      assert.ok(env.pageErrors.length===0,'Prediction journeys have no uncaught browser errors');
    }finally{report.requests.push(...env.panelRequests);report.saves.push(env.panelSaveStats());await env.close();}}
    console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length},null,2));return report;
  }finally{await writeFile(folder+'/online-predictions.json',JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--chaos'))await checkOnlinePredictionsChaos();else await checkOnlinePredictions();
}
