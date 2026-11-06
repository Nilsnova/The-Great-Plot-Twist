// One-shot local transport faults at visible screens; gameplay snapshots must survive each one.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';

const env=await openWorldBrowser(),{page}=env,report={checked:new Date().toISOString(),checks:[],faults:[],timings:{}};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const reasons=['offline','not_connected','session_expired','save_conflict','rate_limited','feature_off'];
page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(15000);
async function waitFor(test,arg){await page.waitForFunction(test,arg,{timeout:12000});}
async function waitForRuntime(){await page.waitForFunction(()=>!!window.__island?.world,{timeout:30000});}
async function read(){return page.evaluate(()=>window.__plotTwist.adapter.read());}
async function openCase(name,params={}){await page.evaluate(({name,params})=>window.__island.caseUi.open(name,params),{name,params});await page.locator('.case-modal[open]').waitFor();}
async function setFault(reason){await page.evaluate(reason=>window.__plotTwist.adapter.dev.failNext(reason),reason);}
async function checkBulletinFailureStates(){
  const before=core(await read());
  await page.evaluate(()=>window.__plotTwist.adapter.dev.setBulletin('off'));
  check((await read()).bulletin.status==='off','Bulletin-off state is explicit');
  await openCase('bulletin');
  check(await page.locator('.bulletin-screen').evaluate(element=>element.hidden),'Off bulletin renders no empty prompt');
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__plotTwist.adapter.dev.setBulletin('unavailable'));
  await openCase('bulletin');
  check((await page.locator('.bulletin-status').textContent()).toLowerCase().includes('unavailable'),'Unavailable bulletin has a clear status');
  check(await page.locator('.bulletin-lines').evaluate(element=>element.hidden),'Unavailable bulletin does not retain stale forecast lines');
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__plotTwist.adapter.dev.setBulletin('missing-tonight'));
  await openCase('bulletin');
  const line=(await page.locator('.bulletin-lines li').first().textContent()).trim();
  check(line.startsWith('Tonight: no forecast.'),'Missing tonight data stays no forecast in the bulletin UI');
  check(!(await read()).bulletin.weather.tonight,'Missing tonight data is not inferred from tomorrow or local weather');
  check(JSON.stringify(before)===JSON.stringify(core(await read())),'Bulletin off, unavailable and missing-tonight states leave gameplay unchanged');
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
}
async function checkIsletEventNeverArrives(){
  await page.evaluate(async()=>{const world=window.__island.world;if(world.current?.id!=='saltreach_harbor'&&world.current?.id!=='home_islet')await world.goTo('saltreach_harbor',{fast:true});if(world.current?.id!=='home_islet')await world.goTo('home_islet',{fast:true});});
  await page.waitForTimeout(400);
  const state=await page.evaluate(()=>{let station=null;window.__island.world.current?.group.traverse(object=>{if(object.userData?.asset==='islet-signal-station')station=object;});return {built:window.__island.isletState.getBuilt(),stationVisible:!!station?.visible};});
  check(!state.built.includes('islet_signal_station')&&!state.stationVisible,'Without an islet_changed event, the cabin remains the last-good world state and no station appears');
  await page.evaluate(()=>window.__island.world.goTo('saltreach_harbor',{fast:true}));
}
function core(view){return {profile:view.arrival.status,coins:view.captain.coins,ledger:view.rewards.ledger.map(row=>[row.id,row.amount]),crew:view.crew.seats.map(seat=>[seat.seat,seat.kind,seat.cards.map(card=>card.id)]),pins:view.board.pinHighlights.map(pin=>[pin.cardId,pin.seat]),deductions:view.board.deductions.filter(item=>item.complete).map(item=>item.id),jobs:view.search.jobs.map(job=>[job.id,job.done]),partnerJobs:view.partners.map(partner=>[partner.seat,partner.job?.id,partner.job?.done]),phase:view.finale.phase,aboard:view.accusation.aboard,solved:view.reveal.available,index:view.reveal.index,colour:view.world.lanternColour};}
async function unchanged(before,label){check(JSON.stringify(core(before))===JSON.stringify(core(await read())),`${label}: core gameplay state is unchanged`);}
async function recoverAccount(reason,keepOpen=false){
  if(reason==='session_expired'){
    await page.locator('.account-modal[open]').waitFor();
    await page.locator('.account-modal[open]').getByRole('button',{name:/Sign in.*with GitHub/}).click();
    await waitFor(()=>window.__plotTwist.adapter.read().account.state==='signed_in');
  }
  if(reason==='save_conflict'){
    await page.locator('.account-modal[open]').waitFor();
    await page.locator('.account-modal[open]').getByRole('button',{name:'Keep this device',exact:true}).click();
    await waitFor(()=>window.__plotTwist.adapter.read().account.save.state!=='conflict');
  }
  if((reason==='session_expired'||reason==='save_conflict')&&!keepOpen){await page.keyboard.press('Escape');await page.locator('.account-modal').waitFor({state:'hidden'});}
}
async function faultMatrix(screen,trigger,{notice='.case-modal[open] .case-notice',keepAccount=false}={}){
  for(const reason of reasons){
    const before=await read();await setFault(reason);await trigger();
    await waitFor(reason=>window.__plotTwist.adapter.read().notice?.reason===reason,reason);
    await unchanged(before,`${screen} ${reason}`);
    const message=(await page.locator(notice).last().textContent().catch(()=>''))?.trim()??'';
    check(message.length>8&&!/TypeError|Error:|stack trace/i.test(message),`${screen} ${reason} shows a player-safe notice`);
    report.faults.push({screen,reason});await recoverAccount(reason,keepAccount);
  }
}
async function chooseIntro(id){const skip=page.locator('.intro-modal .kit-dialogue').getByRole('button',{name:'Show full text'});if(await skip.isVisible())await skip.click();const choice=page.locator(`.intro-modal [data-choice="${id}"]`);await choice.waitFor({state:'visible'});await choice.click();}
async function playIntro({failEnd=false}={}){
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  for(const id of ['to_desk','take_key','read_log','desk_back','to_shore','take_lantern','warn_harbor','shore_back','to_tower','unlock_door','climb'])await chooseIntro(id);
  if(failEnd)await setFault('offline');await chooseIntro('untie');await page.locator('.intro-modal .intro-ending').waitFor();
  if(failEnd){await waitFor(()=>window.__plotTwist.adapter.read().notice?.reason==='offline');check((await read()).arrival.status==='pending','Failed arrival completion does not create a kit');await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});await page.evaluate(()=>window.__island.shell.show('title'));await page.getByRole('button',{name:'New game',exact:true}).click();await waitForRuntime();await playIntro();return;}
  await waitFor(()=>window.__plotTwist.adapter.read().arrival.status==='ready');
}
async function searchAndPinPreparation(){
  await openCase('search',{spot:'satchel'});const c3=page.locator('[data-route="C3.key_tag"]'),search=c3.getByRole('button');
  await faultMatrix('search',()=>search.click());await search.click();await waitFor(()=>window.__plotTwist.adapter.read().crew.seats[0].cards.some(card=>card.id==='C3'));
  await page.evaluate(()=>window.__plotTwist.adapter.dev.give('C1',1));await openCase('board');
  const pinC1=page.locator('.case-clue[data-card="C1"]').getByRole('button',{name:'Pin my card'});
  await faultMatrix('board.pin',()=>pinC1.click());await pinC1.click();await waitFor(()=>window.__plotTwist.adapter.read().board.cards.find(card=>card.id==='C1')?.pinnedBy.some(pin=>pin.seat===1));
}
async function partnerPreparation(){
  await openCase('partners');const row=page.locator('.partner-life-card[data-seat="2"]');
  await row.getByLabel('Order',{exact:true}).selectOption('fetch');await row.getByLabel('Target',{exact:true}).selectOption('C4');
  const send=row.getByRole('button',{name:/^Send order ·/});await faultMatrix('partners.orderPartner',()=>send.click());await send.click();
  await waitFor(()=>window.__plotTwist.adapter.read().partners.find(partner=>partner.seat===2)?.job?.order==='fetch');
  await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(600));await waitFor(()=>window.__plotTwist.adapter.read().crew.seats.find(seat=>seat.seat===2)?.cards.some(card=>card.id==='C4'));
  await openCase('partners');const pinRow=page.locator('.partner-life-card[data-seat="2"]');await pinRow.getByLabel('Order',{exact:true}).selectOption('pin');await pinRow.getByLabel('Target',{exact:true}).selectOption('C4');
  const pinSend=pinRow.getByRole('button',{name:/^Send order ·/});await faultMatrix('partners.orderPartner.pin',()=>pinSend.click());await pinSend.click();await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(300));
  await waitFor(()=>window.__plotTwist.adapter.read().board.cards.find(card=>card.id==='C4')?.pinnedBy.some(pin=>pin.seat===2));
  await page.evaluate(()=>{const d=window.__plotTwist.adapter.dev;d.give('C2',2);d.pinForSeat('C2',2);});
}
async function pairPreparation(){
  await openCase('board');const selects=page.locator('.case-pair-controls select');await selects.nth(0).selectOption('C1');await selects.nth(1).selectOption('C2');
  const pair=page.getByRole('button',{name:'Pair cards',exact:true});await faultMatrix('board.pair',()=>pair.click());await pair.click();await waitFor(()=>window.__plotTwist.adapter.read().board.deductions.find(item=>item.id==='D1')?.complete);
  await page.evaluate(async()=>{const a=window.__plotTwist.adapter,d=a.dev;for(const [id,seat] of [['C5',3],['C6',4],['C7',1],['C8',4]]){d.give(id,seat);d.pinForSeat(id,seat);}d.pinForSeat('C3',1);await a.pair('C3','C4');await a.pair('C5','C6');await a.pair('C7','C8');});
}
async function nightPreparation(){
  await openCase('finale');const light=page.locator('.case-light[data-light="islet_signal_station"]'),build=light.getByRole('button').first();await faultMatrix('finale.buildLight',()=>build.click());await build.click();
  const nightfall=page.getByRole('button',{name:'Call nightfall',exact:true});await faultMatrix('finale.callNightfall',()=>nightfall.click());await nightfall.click();await waitFor(()=>window.__plotTwist.adapter.read().finale.phase==='night');
  const partners=await page.evaluate(async()=>{const a=window.__plotTwist.adapter;return [await a.orderPartner(2,'man_light','keepers_lamp'),await a.orderPartner(3,'man_light','harbor_light')];});
  check(partners.every(result=>result.accepted),'Partner light orders are accepted for the night setup');
  await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(600));const takePost=light.getByRole('button',{name:'Take this post · 1 minute'});await faultMatrix('finale.takePost',()=>takePost.click());await takePost.click();await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(60));
  const angles=await page.evaluate(async()=>{const n=await import('/src/adapter/fake/night.js'),m=await import('/src/screens/beam-math.js');return Object.fromEntries(n.lightLocations.slice(0,3).map(item=>[item.id,m.bearingBetween(item,n.rehearsalGlow)]));});
  for(const id of ['keepers_lamp','harbor_light']){const result=await page.evaluate(async({id,degrees})=>window.__plotTwist.adapter.aim(id,degrees),{id,degrees:angles[id]});check(result.accepted,`Partner beam ${id} is aimed`);}
  const row=page.locator('.case-light[data-light="islet_signal_station"]'),range=row.locator('input[type=range]');await range.evaluate((input,value)=>{input.value=String(Math.round(value));input.dispatchEvent(new Event('input',{bubbles:true}));},angles.islet_signal_station);
  const lock=row.getByRole('button',{name:'Lock this beam'});await faultMatrix('finale.aim',()=>lock.click());await lock.click();await waitFor(()=>window.__plotTwist.adapter.read().accusation.schoonerFound);
}
async function solveRemainder(){
  await openCase('accusation');const board=page.getByRole('button',{name:'Board the schooner'});await faultMatrix('accusation.boardSchooner',()=>board.click());await board.click();await waitFor(()=>window.__plotTwist.adapter.read().accusation.aboard);
  const model=await read(),wrong=model.accusation.suspects.find(item=>item.cleared)?.id;await page.locator('[data-focus="accuse-select"]').selectOption(wrong);
  const accuse=page.getByRole('button',{name:'Present this accusation',exact:true});await faultMatrix('accusation.accuse',()=>accuse.click());await accuse.click();await waitFor(()=>window.__plotTwist.adapter.read().accusation.cooldown>0);
  await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(60));const right=(await read()).accusation.suspects.find(item=>!item.cleared).id;await page.locator('[data-focus="accuse-select"]').selectOption(right);await accuse.click();await page.locator('.case-reveal-line').waitFor();
  const next=page.getByRole('button',{name:'Next line',exact:true});await faultMatrix('reveal.nextReveal',()=>next.click());await next.click();await waitFor(()=>window.__plotTwist.adapter.read().reveal.index===1);
  const total=(await read()).reveal.total;for(let i=1;i<total;i++)await page.getByRole('button',{name:i===total-1?'Finish the reveal':'Next line'}).click();
  await page.getByRole('button',{name:'See the coast',exact:true}).click();const lantern=page.getByRole('button',{name:'Sea glass',exact:false});await faultMatrix('relighting.claimLantern',()=>lantern.click());await lantern.click();await waitFor(()=>window.__plotTwist.adapter.read().world.lanternColour==='sea');
}

try{
  await mkdir('captures',{recursive:true});const apiResponses=[];page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))apiResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline chaos rehearsal"}'}));await page.emulateMedia({reducedMotion:'reduce'});await page.goto(env.url+'/?case=local');await waitFor(()=>window.__plotTwist?.adapter?.read().mode==='local');
  await page.evaluate(async()=>window.__plotTwist.adapter.signIn());await waitFor(()=>window.__plotTwist.adapter.read().account.state==='signed_in');await page.evaluate(()=>window.__plotTwist.accountHost.open());await page.locator('.account-modal[open]').waitFor();
  const reroll=page.getByRole('button',{name:'Change captain name once'});await faultMatrix('account.rerollName',()=>reroll.click(),{notice:'.account-modal[open] .account-feedback',keepAccount:true});await reroll.click();await waitFor(()=>window.__plotTwist.adapter.read().account.canReroll===false);await page.keyboard.press('Escape');await page.locator('.account-modal').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'New game',exact:true}).click();await waitForRuntime();await playIntro({failEnd:true});
  await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});await page.evaluate(()=>window.__island.shell.show('title'));await page.getByRole('button',{name:'New game',exact:true}).click();await waitForRuntime();await playIntro();
  await openCase('crew');const create=page.getByRole('button',{name:'Start a crew',exact:true});await faultMatrix('crew.createCrew',()=>create.click());await create.click();await waitFor(()=>window.__plotTwist.adapter.read().crew.status==='forming');
  const muster=page.getByRole('button',{name:/Muster/});await faultMatrix('crew.muster',()=>muster.click());await muster.click();await waitFor(()=>window.__plotTwist.adapter.read().crew.status==='active');
  await checkBulletinFailureStates();await checkIsletEventNeverArrives();
  await searchAndPinPreparation();await partnerPreparation();await pairPreparation();await nightPreparation();await solveRemainder();
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'captures/20261106_G7-Chaos-Recovered-1280.png'});
  report.timings.desktop=await measure(page);check(report.timings.desktop.fps>0&&report.timings.desktop.calls<150,'1280 px chaos recovery remains responsive');
  await page.setViewportSize({width:375,height:667});await openCase('log');await page.screenshot({path:'captures/20261106_G7-Chaos-Log-375.png'});
  check(await page.locator('.case-modal[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'375 px log remains readable after recovery');report.timings.phone=await measure(page);check(report.timings.phone.fps>0,'375 px chaos recovery reports a positive frame rate');
  await page.setViewportSize({width:1280,height:800});const unexpected=env.errors.filter(error=>!error.includes('503'));report.apiDiagnostics=env.errors.filter(error=>error.includes('503'));
  check(apiResponses.length>0&&apiResponses.every(response=>response.status===503),'All API requests remain unavailable during the local fake run');check(unexpected.length===0,`No unexpected browser errors (${unexpected.join('; ')})`);check(env.external.length===0,'No external network requests');
  console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.message;try{await page.screenshot({path:'captures/20261106_G7-Chaos-Failure.png'});}catch{}throw error;}
finally{await writeFile('captures/20261106_G7-Chaos-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();}
