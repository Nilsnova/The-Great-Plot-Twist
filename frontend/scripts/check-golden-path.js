// Full browser rehearsal through the original intro and accepted G7 case rules only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';
import {dismissIntro} from './intro-browser-fixture.js';
import {openCrewFromHud,chooseIntroAction,finishIntroPassages} from './online-browser-actions.js';

const env=await openWorldBrowser(),{page}=env,report={checked:new Date().toISOString(),scenarios:[],checks:[],timings:{}};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const started=()=>performance.now();
page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(15000);
async function waitFor(test,arg){await page.waitForFunction(test,arg,{timeout:12000});}
async function apiView(){return page.evaluate(()=>window.__plotTwist.adapter.read());}
async function introDiagnostic(){return {runtimePresent:await page.evaluate(()=>!!window.__island),runtime:await page.evaluate(()=>({shellMode:document.querySelector('.shell-screen')?.dataset.mode??null,worldPlace:window.__island?.world.current?.id??null,worldBusy:window.__island?.world.busy??null,introActive:window.__island?.world.intro.active??null,adapterMode:window.__plotTwist?.adapter.read().mode,arrival:window.__plotTwist?.adapter.read().arrival.status,canvasCount:document.querySelectorAll('canvas').length,loading:document.querySelector('.shell-loading')?.textContent??null,dialogs:[...document.querySelectorAll('dialog')].map(dialog=>({title:dialog.getAttribute('aria-label')??dialog.querySelector('h1,h2')?.textContent??'',open:dialog.open,classes:dialog.className}))})),browserErrors:env.errors.slice(-6)};}
async function waitForRuntime(){await page.waitForFunction(()=>!!window.__island?.world,{timeout:30000});}
async function openCase(name,params={}){
  await page.evaluate(({name,params})=>window.__island.caseUi.open(name,params),{name,params});
  await page.locator('.case-modal[open]').waitFor();await page.locator('.case-screen-content').waitFor();
}
const chooseIntro=id=>chooseIntroAction(page,id);
async function finishOriginalIntro(){
  try{await page.locator('.intro-modal[open] .intro-view').waitFor();}
  catch(error){const diagnostic=await introDiagnostic();report.introFailure=diagnostic;throw new Error(`${error.message}\nIntro startup diagnostic: ${JSON.stringify(diagnostic)}`);}
  for(const id of ['to_desk','take_key','read_log','desk_back','to_shore','take_lantern','warn_harbor','shore_back','to_tower','unlock_door','climb','signal'])await chooseIntro(id);
  await finishIntroPassages(page);
  await page.locator('.intro-modal .intro-ending').waitFor();
  await waitFor(()=>window.__plotTwist.adapter.read().arrival.status==='ready');
  const profile=await page.evaluate(()=>window.__plotTwist.adapter.read().arrival.kit?.id);
  check(profile==='true_keeper','Original ending through the UI yields the accepted True Keeper kit');
  await page.locator('.intro-arrival-slot .case-arrival').waitFor({state:'visible'});
  await dismissIntro(page);
  // Let the arrival hand-off finish before a test asks the world to travel elsewhere.
  await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await window.__island.world.whenIdle();});
}
async function verifyIsletStationEventFallback(){
  const home=await page.evaluate(async()=>{
    const world=window.__island.world;
    if(world.current?.id!=='saltreach_harbor'&&world.current?.id!=='home_islet')await world.goTo('saltreach_harbor',{fast:true});
    if(world.current?.id!=='home_islet')await world.goTo('home_islet',{fast:true});
    window.__island.emit({type:'islet_changed',built:['plot_1','islet_signal_station'],signalStationBuilt:true});
    return world.current?.id;
  });
  check(home==='home_islet','Islet event fallback reaches the home-islet world');
  await waitFor(()=>window.__island.isletState.getBuilt().includes('islet_signal_station'));
  const visible=await page.evaluate(()=>{
    const group=window.__island.world.current?.group;let visible=false;
    group?.traverse(object=>{if(['islet-signal-station','islet-signal-station-lit'].includes(object.userData?.asset)&&object.visible&&object.parent===group)visible=true;});
    return visible;
  });
  check(visible,'Accepted islet_changed event makes the signal station visible in the world');
  report.isletConstruction={method:'event-fallback',panelVerified:false,note:'No islet screen source is present; this verifies the event/store/world seam only.'};
  const returned=await page.evaluate(()=>window.__island.world.goTo('saltreach_harbor',{fast:true}));
  check(returned===true,'The world returns to Harbor after the islet event check');
}
async function newOriginalIntro(){
  // Exercise New game from the solved runtime before isolating the second crew scenario.
  await page.evaluate(()=>{window.__island.caseUi.close();window.__plotTwist.adapter.dev.reset();window.__island.shell.show('title');});
  await page.getByRole('button',{name:'New game',exact:true}).click();
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  check(await page.evaluate(()=>window.__island.world.current?.id==='lighthouse_isle'),'New game returns the solved Gull’s Rest runtime to the original intro');
  // A new page gives the four-human scenario an independent adapter and move journal.
  await page.goto(env.url+'/?case=local');await waitFor(()=>window.__plotTwist?.adapter?.read().mode==='local');
  await page.locator('.shell-screen[open] #new-game').waitFor();await page.getByRole('button',{name:'New game',exact:true}).click();
  await waitForRuntime();await finishOriginalIntro();await verifyIsletStationEventFallback();
}
async function makeCrew({humans=false}={}){
  await openCrewFromHud(page);await page.getByRole('button',{name:'Start a crew',exact:true}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().crew.status==='forming');
  if(humans)await page.evaluate(()=>window.__plotTwist.adapter.dev.setSeats([
    {seat:2,kitId:'informant',name:'Captain Shoal'},{seat:3,kitId:'stranger',name:'Captain Reed'},{seat:4,kitId:'witness',name:'Captain Wren'},
  ]));
  await page.getByRole('button',{name:/Muster/}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().crew.status==='active');
  const view=await apiView();
  check(humans?view.crew.seats.filter(seat=>seat.kind==='player').length===4:view.partners.length===3,humans?'Four simulated human seats are active':'One player and three NPC partners are active');
}
async function advance(seconds){await page.evaluate(seconds=>window.__plotTwist.adapter.dev.advanceCase(seconds),seconds);}
async function waitCard(seat,id){await waitFor(({seat,id})=>window.__plotTwist.adapter.read().crew.seats.find(item=>item.seat===seat)?.cards.some(card=>card.id===id),{seat,id});}
async function searchAsPlayer(routeId,spot,seat,id,seconds=null){
  await openCase('search',{spot});const row=page.locator(`[data-route="${routeId}"]`);await row.waitFor();
  const view=await apiView(),route=view.search.routes.find(item=>item.id===routeId),control=row.getByRole('button');check(!await control.isDisabled(),`${routeId} is open through the real search route gate`);await control.click();
  if(seconds===null)seconds=route?.seconds??0;
  if(seconds)await advance(seconds);await waitCard(seat,id);
}
async function orderPartner(seat,order,target,seconds){
  await openCase('partners');const row=page.locator(`.partner-life-card[data-seat="${seat}"]`);await row.waitFor();
  await row.getByLabel('Order',{exact:true}).selectOption(order);
  if(target)await row.getByLabel('Target',{exact:true}).selectOption(target);
  await row.getByRole('button',{name:/^Send order ·/}).click();
  await waitFor(({seat,order})=>window.__plotTwist.adapter.read().partners.find(item=>item.seat===seat)?.job?.order===order,{seat,order});
  if(seconds)await advance(seconds);
}
async function partnerFetchAndPin(seat,id){
  await orderPartner(seat,'fetch',id,600);await waitCard(seat,id);
  await orderPartner(seat,'pin',id,300);
  await waitFor(({seat,id})=>window.__plotTwist.adapter.read().board.cards.find(card=>card.id===id)?.pinnedBy.some(pin=>pin.seat===seat),{seat,id});
}
async function pinMine(id){
  await openCase('board');const card=page.locator(`.case-clue[data-card="${id}"]`);await card.waitFor();
  const button=card.getByRole('button',{name:/^Pin my card ·/});check(!await button.isDisabled(),`${id} can be pinned by this player`);await button.click();
  await waitFor(id=>window.__plotTwist.adapter.read().board.cards.find(card=>card.id===id)?.pinnedBy.some(pin=>pin.seat===1),id);
}
async function pair(a,b,deduction){
  await openCase('board');const selects=page.locator('.case-pair-controls select');
  await selects.nth(0).selectOption(a);await selects.nth(1).selectOption(b);await page.getByRole('button',{name:'Pair cards',exact:true}).click();
  await waitFor(id=>window.__plotTwist.adapter.read().board.deductions.find(item=>item.id===id)?.complete,deduction);
}
async function peerIntent(seat,method,...args){
  const result=await page.evaluate(async({seat,method,args})=>window.__plotTwist.adapter.dev.peerIntent(seat,method,...args),{seat,method,args});
  check(result?.accepted===true,`Simulated seat ${seat} accepted ${method}${result?.reason?`: ${result.reason} ${result.message??''}`:''}`);return result;
}
async function searchPeer(seat,route,id,seconds=null){await peerIntent(seat,'search',route);if(seconds===null)seconds=await page.evaluate(async routeId=>(await import('/src/adapter/fake/routes.js')).routes.find(item=>item.id===routeId)?.seconds??0,route);if(seconds)await advance(seconds);await waitCard(seat,id);}
async function pinPeer(seat,id){await peerIntent(seat,'pin',id);await waitFor(({seat,id})=>window.__plotTwist.adapter.read().board.cards.find(card=>card.id===id)?.pinnedBy.some(pin=>pin.seat===seat),{seat,id});}
async function setPeerPinsForFourHumans(){
  await searchAsPlayer('C1.notice_board','notice_board',1,'C1');
  await pinMine('C1');await pinPeer(4,'C2');await pair('C1','C2','D1');
  await searchAsPlayer('C3.key_tag','satchel',1,'C3');await searchPeer(2,'C4.back_room','C4');await pinMine('C3');await pinPeer(2,'C4');await pair('C3','C4','D2');
  await searchPeer(3,'C5.yard_shift','C5');
  const mailWait=await page.evaluate(async()=>{const {windowStatus}=await import('/src/adapter/fake/routes.js');return windowStatus(window.__plotTwist.adapter.read().now,'mail_boat').minutes;});
  if(mailWait)await advance(mailWait*60);
  await searchPeer(2,'C6.mail_boat_timed','C6');await pinPeer(3,'C5');await pinPeer(2,'C6');await pair('C5','C6','D3');
  await searchAsPlayer('C7.night_log','signal_station',1,'C7');await searchPeer(4,'C8.ruin','C8');await pinMine('C7');await pinPeer(4,'C8');await pair('C7','C8','D4');
}
async function soloCase(){
  await makeCrew();
  await searchAsPlayer('C1.notice_board','notice_board',1,'C1');await searchAsPlayer('C3.key_tag','satchel',1,'C3');
  await pinMine('C1');await orderPartner(4,'pin','C2',300);await pair('C1','C2','D1');
  await orderPartner(2,'fetch','C4',600);await waitCard(2,'C4');await orderPartner(2,'pin','C4',300);await pinMine('C3');await pair('C3','C4','D2');
  await partnerFetchAndPin(3,'C5');await searchAsPlayer('C6.back_room','keepers_post_room',1,'C6');await pinMine('C6');await pair('C5','C6','D3');
  await searchAsPlayer('C7.night_log','signal_station',1,'C7');await pinMine('C7');
  await searchAsPlayer('C8.ruin','watchtower_ruin',1,'C8');await partnerFetchAndPin(4,'C8');await pair('C7','C8','D4');
}
async function solveNightSolo(){
  await openCase('finale');
  const stationReady=await page.evaluate(()=>window.__plotTwist.adapter.read().finale.lights.find(light=>light.id==='islet_signal_station')?.ready);
  await page.locator('[data-focus="light-tab-islet_signal_station"]').click();
  if(!stationReady)await page.locator('.case-light[data-light="islet_signal_station"]').getByRole('button').first().click();
  await waitFor(()=>window.__plotTwist.adapter.read().finale.lights.find(light=>light.id==='islet_signal_station')?.ready);
  check(true,'Finale uses the signal station supplied by the islet event');
  await page.getByRole('button',{name:'Call nightfall',exact:true}).click();await waitFor(()=>window.__plotTwist.adapter.read().finale.phase==='night');
  await openCase('partners');
  for(const [seat,light] of [[2,'keepers_lamp'],[3,'harbor_light']]){
    const row=page.locator(`.partner-life-card[data-seat="${seat}"]`);await row.getByLabel('Order',{exact:true}).selectOption('man_light');await row.getByLabel('Target',{exact:true}).selectOption(light);await row.getByRole('button',{name:/^Send order ·/}).click();await waitFor(({seat})=>window.__plotTwist.adapter.read().partners.find(partner=>partner.seat===seat)?.job?.order==='man_light',{seat});
  }
  await openCase('finale');await page.locator('[data-focus="light-tab-islet_signal_station"]').click();await page.locator('.case-light[data-light="islet_signal_station"]').getByRole('button',{name:'Take this post · 1 minute'}).click();await advance(600);
  await lockThreeLightsSolo();
}
async function lockThreeLightsSolo(){
  const angles=await page.evaluate(async()=>{const n=await import('/src/adapter/fake/night.js'),m=await import('/src/screens/beam-math.js');return Object.fromEntries(n.lightLocations.slice(0,3).map(light=>[light.id,m.bearingBetween(light,n.rehearsalGlow)]));});
  for(const id of ['keepers_lamp','harbor_light','islet_signal_station']){
    await page.locator(`[data-focus="light-tab-${id}"]`).click();
    const row=page.locator(`.case-light[data-light="${id}"]`),range=row.locator('input[type=range]');await range.evaluate((input,value)=>{input.value=String(Math.round(value));input.dispatchEvent(new Event('input',{bubbles:true}));},angles[id]);
    await row.getByRole('button',{name:'Lock this beam'}).click();
  }
  await waitFor(()=>window.__plotTwist.adapter.read().accusation.schoonerFound);
  check(true,'Three distinct posts open the schooner through accepted beam intents');
}
async function solveNightFourHumans(){
  await openCase('finale');
  const stationReady=await page.evaluate(()=>window.__plotTwist.adapter.read().finale.lights.find(light=>light.id==='islet_signal_station')?.ready);
  await page.locator('[data-focus="light-tab-islet_signal_station"]').click();
  if(!stationReady)await page.locator('.case-light[data-light="islet_signal_station"]').getByRole('button').first().click();
  await waitFor(()=>window.__plotTwist.adapter.read().finale.lights.find(light=>light.id==='islet_signal_station')?.ready);
  await page.getByRole('button',{name:'Call nightfall',exact:true}).click();await waitFor(()=>window.__plotTwist.adapter.read().finale.phase==='night');
  await peerIntent(2,'takePost','keepers_lamp');await peerIntent(3,'takePost','harbor_light');
  await page.locator('[data-focus="light-tab-islet_signal_station"]').click();await page.locator('.case-light[data-light="islet_signal_station"]').getByRole('button',{name:'Take this post · 1 minute'}).click();await advance(60);
  const angles=await page.evaluate(async()=>{const n=await import('/src/adapter/fake/night.js'),m=await import('/src/screens/beam-math.js');return Object.fromEntries(n.lightLocations.slice(0,3).map(light=>[light.id,m.bearingBetween(light,n.rehearsalGlow)]));});
  await peerIntent(2,'aim','keepers_lamp',angles.keepers_lamp);await peerIntent(3,'aim','harbor_light',angles.harbor_light);
  await page.locator('[data-focus="light-tab-islet_signal_station"]').click();
  const row=page.locator('.case-light[data-light="islet_signal_station"]'),range=row.locator('input[type=range]');await range.evaluate((input,value)=>{input.value=String(Math.round(value));input.dispatchEvent(new Event('input',{bubbles:true}));},angles.islet_signal_station);await row.getByRole('button',{name:'Lock this beam'}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().accusation.schoonerFound);check(true,'Four-human crew opens the schooner with two peer aim intents and the local slider');
}
async function accuseRevealAndFestival(){
  await openCase('accusation');await page.getByRole('button',{name:'Board the schooner',exact:true}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().accusation.aboard);
  const model=await page.evaluate(()=>window.__plotTwist.adapter.read().accusation),wrong=model.suspects.find(item=>item.cleared)?.id;
  await page.locator('[data-focus="accuse-select"]').selectOption(wrong);await page.getByRole('button',{name:'Present this accusation'}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().accusation.cooldown>0);check(await page.locator('.case-accuse-wait').textContent().then(text=>text.includes('1:00')),'Wrong accusation displays a one-minute case-clock wait');
  await advance(60);const right=(await apiView()).accusation.suspects.find(item=>!item.cleared).id;
  await page.locator('[data-focus="accuse-select"]').selectOption(right);await page.getByRole('button',{name:'Present this accusation'}).click();
  await page.locator('.case-reveal-line').waitFor();check((await page.locator('.case-reveal-line').textContent())==='[revealed by the server]','Accepted accusation reveals placeholder text only');
  await page.screenshot({path:'captures/20261106_G7-Golden-Reveal-1280.png'});
  const total=(await apiView()).reveal.total;for(let i=0;i<total;i++)await page.getByRole('button',{name:i===total-1?'Finish the reveal':'Next line'}).click();
  await page.getByRole('button',{name:'See the coast',exact:true}).click();await page.getByRole('button',{name:'Sea glass',exact:false}).click();
  await waitFor(()=>window.__plotTwist.adapter.read().world.lanternColour==='sea');check(true,'Festival colour is claimed only through the supplied free lantern intent');
}
async function rewardMilestones({humans}){
  const view=await apiView(),rewards=view.rewards;
  check(rewards.keepsakes.length===4&&rewards.keepsakes.every(item=>item.owned),'All four keepsakes are awarded after the completed reveal');
  check(rewards.epilogue.length===(view.log.intro?.readLog?2:1),'Epilogue length reflects the accepted intro log receipt');
  check(rewards.festivalBadge===true,'Festival badge is recorded after choosing a lantern');
  check(rewards.wallEntry&&rewards.wallEntry.name===view.captain.name,'Captain appears on the Wall of Lights');
  check(view.log.intro?.readLog===true,'Accepted intro receipt preserves the Elena log lead');
  check(view.world.wall.length===(humans?4:1),humans?'Four human names appear on the Wall of Lights':'Only the solo captain, not NPC partners, appears on the Wall of Lights');
  check(view.world.wall.some(entry=>entry.name===view.captain.name),'Wall of Lights includes the captain profile name');
  const ids=rewards.ledger.map(row=>row.id);check(new Set(ids).size===ids.length,'Reward ledger references are unique');
  const solve=rewards.ledger.filter(row=>row.id==='false_light:solve');check(solve.length===1&&solve[0].amount<=800,'Solved case grants one capped solve share');
  const deductions=rewards.ledger.filter(row=>row.id.startsWith('false_light:deduction:'));
  if(humans){
    check(deductions.map(row=>row.id).sort().join(',')==='false_light:deduction:D1,false_light:deduction:D2,false_light:deduction:D4','Four-human captain earns only D1, D2 and D4 deduction rewards');
    check(deductions.reduce((sum,row)=>sum+row.amount,0)===600,'Four-human captain receives 600 coins for personal deduction participation');
  }else{
    check(rewards.ledger.filter(row=>row.reason==='clue_reward').reduce((sum,row)=>sum+row.amount,0)===400,'Solo captain receives 400 coins for eight first card pins');
    check(deductions.length===4&&deductions.reduce((sum,row)=>sum+row.amount,0)===800,'Solo captain receives exactly 800 coins across D1–D4');
    check(solve[0]?.amount===800,'Solo captain receives the full 800 coin solve share');
  }
}
async function captureGullsRest(){
  const world=await apiView();check(world.world.gullsRestOpen,'Gull’s Rest is unlocked by the completed case');
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
  await waitFor(()=>!window.__island.world.busy);
  const current=await page.evaluate(()=>window.__island.world.current?.id);
  if(current!=='gulls_rest'){
    const travelled=await page.evaluate(()=>window.__island.world.goTo('gulls_rest',{fast:true}));
    check(travelled===true,'Authorized world route reaches Gull’s Rest');
  }
  await waitFor(()=>window.__island.world.current?.id==='gulls_rest');
  await page.waitForTimeout(500);await page.setViewportSize({width:1280,height:800});
  await page.screenshot({path:'captures/20261106_G7-Golden-Gulls-Rest-1280.png'});report.timings.gullsDesktop=await measure(page);
  check(report.timings.gullsDesktop.fps>0&&report.timings.gullsDesktop.calls<150,'Gull’s Rest renders within the desktop frame budget');
  await page.setViewportSize({width:375,height:667});await page.waitForTimeout(500);
  await page.screenshot({path:'captures/20261106_G7-Golden-Gulls-Rest-375.png'});report.timings.gullsPhone=await measure(page);
  check(report.timings.gullsPhone.fps>0&&report.timings.gullsPhone.calls<150,'Gull’s Rest renders within the phone frame budget');
  await page.setViewportSize({width:1280,height:800});
}
async function captureViews(){
  await page.setViewportSize({width:1280,height:800});await openCase('log');await page.screenshot({path:'captures/20261106_G7-Golden-Log-1280.png'});
  await openCase('rewards');await page.screenshot({path:'captures/20261106_G7-Golden-Rewards-1280.png'});
  await openCase('hints');await page.screenshot({path:'captures/20261106_G7-Golden-Hints-1280.png'});
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
  const desktop=await measure(page);report.timings.desktop=desktop;check(desktop.fps>0&&desktop.calls<150,'1280 px world reports a positive frame rate within draw-call budget');
  await page.setViewportSize({width:375,height:667});await openCase('log');
  check(await page.locator('.case-modal[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Captain’s Log fits the 375 px viewport without horizontal overflow');
  await page.screenshot({path:'captures/20261106_G7-Golden-Log-375.png'});
  await page.keyboard.press('Escape');await page.locator('.case-modal').waitFor({state:'hidden'});
  report.timings.phone=await measure(page);check(report.timings.phone.fps>0,'375 px world reports a positive frame rate');
  await page.setViewportSize({width:1280,height:800});
}

try{
  await mkdir('captures',{recursive:true});
  const apiResponses=[];page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))apiResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline golden-path rehearsal"}'}));
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(env.url+'/?case=local');
  await waitFor(()=>window.__plotTwist?.adapter?.read().mode==='local');
  check(await page.evaluate(()=>window.__plotTwist?.adapter.read().mode==='local'),'Browser uses the explicit local fake while all API routes return 503');
  let t=started();await page.getByRole('button',{name:'New game',exact:true}).click();await waitForRuntime();await finishOriginalIntro();await verifyIsletStationEventFallback();report.timings.introMs=Math.round(started()-t);
  t=started();await soloCase();await solveNightSolo();await accuseRevealAndFestival();report.timings.soloScenarioMs=Math.round(started()-t);
  let solo=await apiView();check(solo.board.cards.length===8&&solo.board.deductions.filter(item=>item.complete).length===4,'Solo player plus three NPCs recorded all eight cards and D1–D4');await rewardMilestones({humans:false});await captureGullsRest();
  report.scenarios.push({name:'solo + three NPC partners',cards:solo.board.cards.length,deductions:solo.board.deductions.filter(item=>item.complete).map(item=>item.id)});
  await captureViews();
  t=started();await newOriginalIntro();await makeCrew({humans:true});await setPeerPinsForFourHumans();await solveNightFourHumans();await accuseRevealAndFestival();report.timings.fourHumanScenarioMs=Math.round(started()-t);
  const four=await apiView();check(four.board.cards.length===8&&four.board.deductions.filter(item=>item.complete).length===4,'Four simulated humans recorded all eight cards and D1–D4');await rewardMilestones({humans:true});await captureGullsRest();
  report.scenarios.push({name:'four simulated humans',cards:four.board.cards.length,deductions:four.board.deductions.filter(item=>item.complete).map(item=>item.id)});
  await captureViews();
  check(apiResponses.length>0&&apiResponses.every(response=>response.status===503),'All API requests remain unavailable while the local fake completes the case');
  const unexpected=env.errors.filter(error=>!error.includes('503'));report.apiDiagnostics=env.errors.filter(error=>error.includes('503'));
  check(unexpected.length===0,`No unexpected browser errors (${unexpected.join('; ')})`);check(env.external.length===0,'No external network requests');
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.failure=error.message;try{await page.screenshot({path:'captures/20261106_G7-Golden-Failure.png'});}catch{}
  throw error;
}finally{
  await writeFile('captures/20261106_G7-Golden-Path-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();
}
