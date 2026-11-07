// Recorded arena service and production UI journeys. Private ids and intent values never enter reports.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openPanelFixture,assertPanelPrivacy,waitForPanelSaved} from './online-panel-fixture.js';
import {enterPanelWorld,openPanelHotspot,assertPanelReadable,closePanel} from './online-panel-actions.js';
import {checkLocalArena} from './local-panel-journeys.js';
import {checkPanelFlagRefresh} from './panel-flag-journey.js';

const dialog='.duel-modal[open]',call=dialog+' .server-call';
const rules={signals:[{id:'flash',cost:2,beats:'shade'},{id:'shade',cost:0,beats:'mirror'},{id:'mirror',cost:1,beats:'flash'}],
  roundChoices:[3,5],oilPerRound:1,stakeChoices:[0,10,25,50,100],cutPercent:5,answerHours:24,maxWaiting:3,pairDailyLimit:3};
const failure=(status,code)=>({status,json:{error:{code,message:'Recorded arena refusal.'}}});
const copy=value=>structuredClone(value);

export function createRecordedArena({now=Date.now}={}){
  const clock=()=>typeof now==='function'?now():now;
  let records,completed,coins,heldCoins,counts,planned,unknown,sequence,lastList;
  const stamp=()=>new Date(clock()).toISOString();
  function summary(extra={}){return {id:randomUUID(),status:'open',isOpen:false,you:'opponent',
    challengerName:'Recorded Rival',opponentName:'Recorded Captain',rounds:3,oil:3,stake:0,cutPercent:5,winnerTakes:0,
    createdAt:stamp(),expiresAt:new Date(clock()+86400000).toISOString(),closedAt:null,score:null,yourResult:null,
    coinsChange:null,heldStake:0,canAnswer:true,canWithdraw:false,canDecline:true,...extra};}
  function reset(){
    records=new Map();completed=new Map();coins=120;heldCoins=0;planned=unknown=null;sequence=lastList=0;
    counts={challengeCount:0,answerCount:0,cancelCount:0,listReads:0,detailReads:0,duelPosts:0,movePosts:0,cancelPosts:0,
      bodyKeysValid:true,privateAuthorized:true,winnerFieldsSent:false,uidReused:null,sameRetryBody:null,readBeforeRetry:null};
    for(const duel of [summary(),summary({isOpen:true,you:'visitor',opponentName:null,canDecline:false})])
      records.set(duel.id,{...duel,yourSignals:null,reveal:null});
  }
  function list(){
    lastList=sequence;counts.listReads++;
    const all=[...records.values()],plain=duel=>{const {yourSignals,reveal,...item}=duel;return copy(item);};
    return {rules,coins,heldCoins,serverTime:stamp(),incoming:all.filter(d=>d.status==='open'&&d.you==='opponent').map(plain),
      openChallenges:all.filter(d=>d.status==='open'&&d.you==='visitor').map(plain),
      yours:all.filter(d=>d.status==='open'&&d.you==='challenger').map(plain),
      recent:all.filter(d=>d.status!=='open'&&d.you!=='visitor').map(plain)};
  }
  const detail=duel=>({duel:copy(duel),coins,serverTime:stamp()});
  function bodyOkay(kind,body){
    const keys=Object.keys(body??{}).sort(),allowed=kind==='challenge'?['actionUid','opponentName','rounds','signals','stake']
      :kind==='answer'?['actionUid','signals']:[];
    const valid=keys.every(key=>allowed.includes(key))&&(kind==='cancel'?body==null
      :typeof body?.actionUid==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(body.actionUid)
        &&Array.isArray(body.signals)&&body.signals.every(signal=>['flash','shade','mirror'].includes(signal))
        &&(kind!=='challenge'||[3,5].includes(body.rounds)&&rules.stakeChoices.includes(body.stake)&&body.signals.length===body.rounds));
    counts.bodyKeysValid&&=valid;counts.winnerFieldsSent||=keys.some(key=>/winner|result|score|payout|coins/i.test(key));return valid;
  }
  function apply(kind,duel,body){
    if(kind==='challenge'){
      if(body.stake>coins)return failure(409,'insufficient_funds');
      duel={...summary({you:'challenger',isOpen:!body.opponentName,challengerName:'Recorded Captain',
        opponentName:body.opponentName??null,rounds:body.rounds,oil:body.rounds,stake:body.stake,
        winnerTakes:Math.floor(body.stake*1.9),heldStake:body.stake,canAnswer:false,canWithdraw:true,canDecline:false}),
        yourSignals:[...body.signals],reveal:null};
      coins-=body.stake;heldCoins+=body.stake;counts.challengeCount++;records.set(duel.id,duel);
    }else if(kind==='answer'){
      if(duel.status!=='open')return failure(409,'duel_closed');
      if(body.signals.length!==3||body.signals.some(signal=>signal!=='shade'))return failure(422,'validation_error');
      // Fixed recorded server outcome; no client rule function or submitted winner is consulted.
      Object.assign(duel,{status:'finished',you:'opponent',opponentName:'Recorded Captain',closedAt:stamp(),
        yourSignals:[...body.signals],score:{you:0,them:2},yourResult:'lost',coinsChange:0,
        canAnswer:false,canDecline:false,reveal:[{round:1,yours:'shade',theirs:'flash',point:'them'},
          {round:2,yours:'shade',theirs:'flash',point:'them'},{round:3,yours:'shade',theirs:'shade',point:'even'}]});
      counts.answerCount++;
    }else if(duel.status==='open'){
      if(duel.you==='visitor')return failure(403,'not_your_duel');
      coins+=duel.heldStake;heldCoins-=duel.heldStake;Object.assign(duel,{status:'withdrawn',heldStake:0,
        closedAt:stamp(),coinsChange:0,canWithdraw:false,canAnswer:false,canDecline:false});
      if(duel.you==='opponent')duel.status='declined';counts.cancelCount++;
    }
    return {json:detail(duel)};
  }
  reset();
  return {reset,planUnknown({applied=false}={}){planned={applied:applied===true};},
    snapshot(){return {coins,heldCoins,duelCount:records.size,...counts,
      unknownReadCompleted:!!unknown&&lastList>unknown.sequence};},
    handle({method,path,body,authorized}){
      if(!/^\/api\/duels(?:\/|$)/.test(path))return null;
      sequence++;if(!authorized){counts.privateAuthorized=false;return failure(401,'unauthorized');}
      if(method==='GET'&&path==='/api/duels')return {json:list()};
      const match=path.match(/^\/api\/duels\/([^/]+)(?:\/(move|cancel))?$/);
      const duel=match?records.get(decodeURIComponent(match[1])):null;
      if(method==='GET'&&match&&!match[2]){counts.detailReads++;return duel?{json:detail(duel)}:failure(404,'no_such_duel');}
      const kind=method!=='POST'?null:path==='/api/duels'?'challenge':match?.[2]==='move'?'answer':match?.[2]==='cancel'?'cancel':null;
      if(!kind)return null;
      counts[kind==='challenge'?'duelPosts':kind==='answer'?'movePosts':'cancelPosts']++;
      if(!bodyOkay(kind,body))return failure(422,'validation_error');
      if(kind!=='challenge'&&!duel)return failure(404,'no_such_duel');
      if(unknown&&!unknown.retried){
        unknown.retried=true;counts.uidReused=body?.actionUid===unknown.uid;
        counts.sameRetryBody=JSON.stringify(body)===unknown.body;counts.readBeforeRetry=lastList>unknown.sequence&&lastList<sequence;
      }
      const uid=body?.actionUid;
      if(uid&&completed.has(uid))return copy(completed.get(uid));
      const selected=planned;planned=null;
      if(selected)unknown={uid,body:JSON.stringify(body),sequence,retried:false};
      const result=selected&&!selected.applied?null:apply(kind,duel,body);
      if(uid&&result?.status!==409&&result?.status!==422&&result)completed.set(uid,copy(result));
      return selected?failure(503,'database_unavailable'):result;
    },
  };
}

const openArenaFixture=options=>openPanelFixture({area:'arena',createService:createRecordedArena,startPlace:'smugglers_cove',...options});
async function waitForSnapshot(env,predicate){
  const deadline=Date.now()+10000;
  while(!predicate(env.panelSnapshot())){
    assert.ok(Date.now()<deadline,'The recorded arena service reaches the expected bounded state');await env.page.waitForTimeout(25);
  }
}
async function pickShade(page,selector){
  const root=page.locator(selector),groups=root.locator('.duel-round');assert.equal(await groups.count(),3,'The recorded duel offers three rounds');
  for(let i=0;i<3;i++)await groups.nth(i).locator('input[type=radio][value=shade]').check();
}
async function prepareChallenge(page){
  const root=page.locator(dialog);await root.getByRole('tab',{name:'New challenge',exact:true}).click();
  await root.getByRole('radio',{name:'Any captain (open challenge)',exact:true}).check();
  await root.getByRole('radio',{name:'3 rounds',exact:true}).check();await root.getByRole('radio',{name:'Friendly',exact:true}).check();
  await pickShade(page,dialog+' .duel-form');return root.getByRole('button',{name:'Seal and send',exact:true});
}
async function openRecordedArena(env){
  await enterPanelWorld(env,{area:'arena'});await openPanelHotspot(env,'arena');
  await env.page.locator(dialog+' .duel-wallet').waitFor({state:'visible'});await waitForPanelSaved(env);
}
async function finishReveal(page,capture){
  const root=page.locator(dialog+' .duel-reveal:not([hidden])');await root.waitFor();
  await root.locator('.duel-banner').filter({hasText:'You lose 0 to 2. Friendly duel, no coins.'}).waitFor();
  const table=root.getByRole('table',{name:'Every round',exact:true});await table.waitFor({state:'visible'});
  const rows=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent.trim())));
  assert.ok(JSON.stringify(rows)===JSON.stringify([['1','Shade','Flash','Their point'],['2','Shade','Flash','Their point'],
    ['3','Shade','Shade','Nobody scores']]),'The visible round table preserves all three recorded server signals and points');
  await capture?.();
  await root.getByRole('button',{name:'Back to the ring',exact:true}).click();
}
export async function recordedArenaGolden(env,{width=375,capture}={}){
  const {page}=env;await page.setViewportSize({width,height:812});await openRecordedArena(env);
  assert.ok(env.moduleRequested('arena'),'The enabled public hotspot loads its production arena entry');
  const before=env.panelSnapshot(),root=page.locator(dialog);
  await root.getByRole('tab',{name:'Rules',exact:true}).click();
  assert.ok(await root.locator('.duel-rules p').filter({hasText:/Simulation, play money\./}).isVisible(),
    'The published Rules card visibly identifies simulation and play money');
  await root.getByRole('tab',{name:'Challenges',exact:true}).click();
  assert.equal(await root.locator('.duel-answer:not([hidden])').count(),0,'Opponent choices remain sealed before answering');
  await root.locator('.duel-section').filter({hasText:'Named challenges to you'}).getByRole('button',{name:'Answer challenge 1 from Recorded Rival',exact:true}).click();
  await pickShade(page,dialog+' .duel-answer');await root.getByRole('button',{name:'Seal and answer',exact:true}).click();
  await finishReveal(page,async()=>{await waitForPanelSaved(env);await capture?.(page,'arena-reveal',width);});await root.getByRole('tab',{name:'Your duels',exact:true}).click();
  await root.getByRole('button',{name:/^Replay:/}).click();await finishReveal(page);
  const send=await prepareChallenge(page);await send.click();
  await root.locator('.duel-sealed').filter({hasText:'Your sealed signals:'}).waitFor();
  await root.getByRole('button',{name:'Withdraw',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.duel-modal[open] .duel-history button[data-focus^="withdraw-"]'));
  const after=env.panelSnapshot();assert.equal(after.answerCount-before.answerCount,1,'One recorded duel is answered');
  assert.equal(after.challengeCount-before.challengeCount,1,'One open challenge is recorded');assert.equal(after.cancelCount-before.cancelCount,1,'One challenge is withdrawn');
  assert.equal(after.coins,before.coins,'A friendly server result awards no coins');assert.equal(after.heldCoins,0,'No friendly stake is held');
  assert.ok(after.bodyKeysValid&&!after.winnerFieldsSent,'Duel bodies contain choices and ids without outcome fields');
  const writes=env.panelRequests.filter(request=>request.method==='POST');
  assert.deepEqual(writes.map(request=>request.path),['/api/duels/:duel/move','/api/duels','/api/duels/:duel/cancel']);
  assert.deepEqual(writes.map(request=>request.bodyKeys),[['actionUid','signals'],['actionUid','rounds','signals','stake'],[]]);
  await assertPanelReadable(page,dialog);await waitForPanelSaved(env);await capture?.(page,'arena-result',width);await page.setViewportSize({width:320,height:667});
  await assertPanelReadable(page,dialog);await closePanel(page,dialog);
  await page.waitForFunction(()=>document.activeElement===document.querySelector('canvas[tabindex="0"]:not(.interiors-canvas)'));
  assert.ok(await page.locator('canvas[tabindex="0"]:not(.interiors-canvas)').evaluate(element=>document.activeElement===element),'Closing the arena returns focus to the game');
  assertPanelPrivacy(env);return {checks:['Recorded answer, server result, Replay, open challenge and withdrawal at '+width,
    'Arena uses exact private routes and bodies, readable controls, and canvas focus return.']};
}
export async function recordedUnknownArena(env,{applied=false}={}){
  await openRecordedArena(env);const send=await prepareChallenge(env.page);env.panel.planUnknown({applied});await send.click();
  await env.page.locator(call).filter({hasText:/may have gone through; checking/}).waitFor();
  await waitForSnapshot(env,snapshot=>snapshot.unknownReadCompleted);
  const before=env.panelSnapshot();assert.equal(before.duelPosts,1,'An uncertain write is never repeated automatically');
  assert.ok(before.unknownReadCompleted,'The client reads the list before offering a write retry');
  await env.page.locator(call).getByRole('button',{name:'Retry duel request',exact:true}).click();
  await waitForSnapshot(env,snapshot=>snapshot.duelPosts===2&&snapshot.challengeCount===1);
  await env.page.locator(dialog).getByRole('tab',{name:'Your duels',exact:true}).click();
  await env.page.locator(dialog+' .duel-sealed').waitFor();
  const after=env.panelSnapshot();assert.equal(after.duelPosts,2,'Only the explicit Retry resends the challenge');
  assert.equal(after.challengeCount,1,'An uncertain challenge is recorded once');
  assert.ok(after.uidReused&&after.sameRetryBody&&after.readBeforeRetry,'Retry follows a read and keeps the same intent UID and body');
  assert.equal(after.coins,120,'No uncertain friendly challenge awards coins');assertPanelPrivacy(env);
}

export function faultExpectation(fault){
  if(fault.status===401)return {phase:'expired',words:/session expired|sign in again/i,call:'.account-modal[open] .server-call'};
  if(fault.status===429)return {phase:'rate_limited',words:/try again in \d+ s/i};
  if(fault.status===404)return {phase:'error',words:/ring is closed for now/i};
  if(fault.status===409)return {phase:'error',words:/something went wrong.*try again/i};
  return {phase:'error',words:/duel may have gone through; checking/i};
}
export function createArenaChaosJourney(){
  return {group:'arena',paths:['/api/duels'],method:'POST',call,focus:'arena-seal-and-send',
    control:dialog+' .duel-form > button',faultExpectation,
    async setup(env){env.resetPanel();await openRecordedArena(env);await prepareChallenge(env.page);},
    async trigger({page}){const send=page.locator(dialog).getByRole('button',{name:'Seal and send',exact:true});await send.focus();await send.click();},
    async afterTrigger(env,fault){if(fault.status===401){await env.page.locator(dialog).waitFor({state:'hidden'});await env.page.locator('.account-modal[open]').waitFor({state:'visible'});}},
    async snapshot(env){return {...env.panelSnapshot(),authTokenCalls:env.requests.filter(request=>request.path==='/auth/v1/token').length,journal:await env.page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'))};},
    async unchanged(env,before,fault){
      assertPanelPrivacy(env);
      const after=env.panelSnapshot();for(const key of ['coins','heldCoins','challengeCount','answerCount','cancelCount'])
        assert.equal(after[key],before[key],'A refused arena action changes no recorded balance or duel');
      assert.ok(await env.page.evaluate(expected=>localStorage.getItem('plot_twist_intro_moves_v1')===expected,before.journal),'Arena refusals preserve device progress');
      if(fault.status===401)assert.ok(env.checks.refreshed&&env.requests.filter(request=>request.path==='/auth/v1/token').length===before.authTokenCalls+1,
        'A2 renews exactly once before the final arena expiry');
    },
    async checkFocus({page},fault,check){
      const selector=fault.status===401?'.account-modal[open]':dialog;
      await page.waitForFunction(selector=>{const root=document.querySelector(selector),active=document.activeElement;
        return !!root&&root.contains(active)&&!active.closest('[hidden],[inert]')&&!active.disabled
          &&(active.matches('button,a[href],input,select,textarea')||active.matches('[tabindex]'));},selector);
      check(true,'Arena refusal keeps focus on an available control or its attention dialog');
    },
    async dispose({page}){if(await page.locator(dialog).count())await closePanel(page,dialog);},
  };
}

const folder='captures/20261107_G9-C3-arena';
export async function checkOnlineArena({widths=[1280,375],extended=true,log=true}={}){
  const report={stage:'stream10-arena',outcome:'running',checks:[],requests:[],captures:[],saves:[]};await mkdir(folder,{recursive:true});
  async function run(operation,options){const env=await openArenaFixture(options),errors=[];env.page.on('pageerror',error=>errors.push(error.name));
    try{const result=await operation(env);report.checks.push(...result?.checks??[]);assert.equal(errors.length,0,'Arena journeys have no uncaught browser error');}
    finally{report.requests.push(...env.panelRequests);report.saves.push(env.panelSaveStats());await env.close();}}
  try{
    if(extended){report.local=await checkLocalArena();report.checks.push('Independent development practice duels pass at1280 and375');}
    if(extended){report.flagRefresh=await checkPanelFlagRefresh({openFixture:openArenaFixture,area:'arena'});
      report.checks.push(...report.flagRefresh.checks);report.requests.push(...report.flagRefresh.requests);report.saves.push(report.flagRefresh.save);}
    for(const width of widths)await run(env=>recordedArenaGolden(env,{width,async capture(page,label,width){const path=`${folder}/${label}-${width}.png`;await page.screenshot({path});report.captures.push(path);}}));
    if(extended){
      for(const applied of [false,true])await run(async env=>{await recordedUnknownArena(env,{applied});report.checks.push('Unknown arena write reads first and reuses UID; recorded applied='+applied);});
      for(const flag of [false,'true'])await run(async env=>{await enterPanelWorld(env,{area:'arena'});await openPanelHotspot(env,'arena',{opened:false});
        assert.equal(env.moduleRequested('arena'),false,'A non-true arena flag loads no arena entry');assert.equal(env.panelRequests.length,0,'A closed ring sends no duel request');
        assertPanelPrivacy(env);report.checks.push('Non-true arena flag blocks import and HTTP');},{flag});
    }
    report.outcome='passed';if(log)console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length}));return report;
  }catch(error){report.outcome='failed';report.failureType=error.name;throw error;}
  finally{await writeFile(folder+'/online-arena.json',JSON.stringify(report,null,2)+'\n');}
}
export async function checkOnlineArenaChaos({checkChaos,...options}={}){
  // A CLI parent passes its already-running function to avoid importing its unfinished module.
  const runChaos=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
  assert.ok(typeof runChaos==='function'&&runChaos.groupFaultExpectations===true,
    'Arena chaos requires the shared driver to honor group fault expectations, afterTrigger, and semantic checkFocus for every status');
  return runChaos({openFixture:openArenaFixture,journeys:[createArenaChaosJourney()],folder:folder+'-chaos',...options});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--chaos'))await checkOnlineArenaChaos();
  else{const width=process.argv.find(argument=>argument.startsWith('--width='))?.slice(8);
    await checkOnlineArena({widths:width?[Number(width)]:undefined,extended:!process.argv.includes('--golden-only')});}
}
