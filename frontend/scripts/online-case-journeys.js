// Native case pages over schematic server responses. No app hooks or synthetic engine actions.
import assert from 'node:assert/strict';
import {signInFromTitle} from './online-chaos-signin.js';
import {openCrewFromHud,assertEngineReplay} from './online-browser-actions.js';
import {assertPanelReadable} from './online-panel-actions.js';
import {assertCasePrivacy} from './online-case-fixture.js';
const modal=page=>page.locator('.case-modal[open]');
const board=page=>modal(page).locator('.case-board');
const writes=env=>env.caseRequests.filter(row=>row.method==='POST');
async function closeNativePanels(page){
  for(const selector of ['.intro-modal[open]','.case-modal[open]']){
    if(await page.locator(selector).isVisible()){await page.keyboard.press('Escape');await page.locator(selector).waitFor({state:'hidden'});}
  }
  const room=page.locator('.interiors-scene:not([hidden])');
  if(await room.count()){await page.getByRole('button',{name:'Leave room',exact:true}).click();await room.waitFor({state:'hidden'});}
}
export async function enterRecordedCase(env,{width=375}={}){
  const {page}=env;env.resetCrew('two');env.resetCase();
  await page.setViewportSize({width,height:812});await page.emulateMedia({reducedMotion:'reduce'});
  await signInFromTitle(env);
  if(await page.locator('.account-modal[open]').isVisible()){await page.keyboard.press('Escape');await page.locator('.account-modal').waitFor({state:'hidden'});}
  await page.locator('#play').click();
  await page.locator('.hud.exploring').waitFor();await closeNativePanels(page);await openCrewFromHud(page);
  await page.waitForFunction(()=>document.querySelectorAll('.case-modal[open] .crew-seat[data-kind="player"]').length===2);
  await modal(page).getByRole('button',{name:'Muster with NPC partners',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.case-modal[open] .crew-seat[data-kind="npc"]').length===2);
  await choosePage(page,'board');
  await board(page).locator('[data-card="C1"]').waitFor();
  assert.ok(env.caseRequests.some(row=>row.path==='/api/case'&&row.method==='GET'),'The earned case came from its private production GET');
}
async function activate(page,control,width){
  if(width>375){await control.focus();await control.press('Enter');return;}
  await control.click({trial:true});const box=await control.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44);
  const native=await page.context().newCDPSession(page);
  try{await native.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
    await native.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  finally{await native.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await native.detach();}
}
async function pinFirst(page,width=1280){await activate(page,board(page).getByRole('button',{name:'Pin my card · C1 Recorded earned card C1',exact:true}),width);}
async function ready(page){
  // A subsequent view tick replaces an empty success with the current notice or idle state.
  await modal(page).locator('.server-call:is([data-state="ready"],[data-state="notice"],[data-state="idle"])').waitFor({state:'attached'});
}
async function choosePage(page,name){await modal(page).getByRole('combobox',{name:'Case page',exact:true}).selectOption(name);}

async function visitPier(env){
  const {page}=env;await page.keyboard.press('Escape');await modal(page).waitFor({state:'hidden'});
  await page.locator('canvas[tabindex="0"]').first().focus();
  await page.keyboard.down('KeyS');
  try{await page.waitForFunction(()=>{const prompt=document.querySelector('.hud .interact');return prompt?.dataset.zone==='ferry_pier'&&!prompt.hidden;},null,{timeout:12000});}
  finally{await page.keyboard.up('KeyS');}
  const interact=page.locator('.touch-actions').getByRole('button',{name:'Interact',exact:true});
  if(await interact.isVisible())await interact.click();else await page.keyboard.press('KeyE');
  await modal(page).locator('.case-search .case-route').waitFor();
}
export async function recordedCaseGolden(env,{width=375,capture,worldLocked=false}={}){
  const {page}=env,checks=[];await enterRecordedCase(env,{width});
  const beforeReplay=await assertEngineReplay(page);
  assert.equal(await board(page).locator('[data-card]').count(),2);checks.push('Only the two server-earned cards are displayed');
  assert.equal(await board(page).locator('[data-card="C1"] p').filter({hasText:'Supplied earned text for C1.'}).count(),1);
  assert.equal(await board(page).locator('.case-deduction[data-complete="true"]').count(),0);
  await assertPanelReadable(page,'.case-modal[open]');await capture?.('earned-board',page);
  const beforePin=writes(env).length;await pinFirst(page,width);
  await board(page).locator('[data-card="C1"][data-state="pinned"]').waitFor();
  await ready(page);
  assert.equal(writes(env).length,beforePin+1);checks.push('Pin uses one published POST and displays the server-confirmed pin');
  await board(page).getByRole('combobox',{name:'First card',exact:true}).selectOption('C1');
  await board(page).getByRole('combobox',{name:'Second card',exact:true}).selectOption('C2');
  const beforePair=writes(env).length;await board(page).getByRole('button',{name:'Pair cards',exact:true}).click();
  await board(page).locator('.case-deduction[data-complete="true"]').waitFor();
  assert.equal(writes(env).length,beforePair+1);assert.equal(await board(page).locator('[data-card][data-state="used"]').count(),2);
  checks.push('Pair displays the supplied deduction without calculating its outcome');
  const beforeInspect=writes(env).length;await visitPier(env);
  assert.equal(writes(env).length,beforeInspect,'Inspecting a world spot sends no case write');
  assert.equal(await modal(page).locator('.case-route-status').textContent(),'Supplied ready search status.');
  const beforeSearch=writes(env).length;await modal(page).getByRole('button',{name:/Start free search/}).click();
  await modal(page).locator('.case-job-report').filter({hasText:'Supplied completed search report.'}).waitFor();
  assert.equal(writes(env).length,beforeSearch+1);await ready(page);
  checks.push('Search completes only when a later authoritative GET supplies the earned result');
  await assertPanelReadable(page,'.case-modal[open]');await capture?.('recorded-pier',page);
  await choosePage(page,'partners');const partner=modal(page).locator('.partner-life-card[data-seat="3"]');
  await partner.getByRole('combobox',{name:'Order',exact:true}).selectOption('fetch');
  await partner.getByRole('combobox',{name:'Target',exact:true}).selectOption('C3');
  const beforeOrder=writes(env).length;await partner.getByRole('button',{name:'Send order · Seat 3',exact:true}).click();
  await partner.locator('.partner-life-report').filter({hasText:'Supplied partner completion.'}).waitFor();
  assert.equal(writes(env).length,beforeOrder+1);await ready(page);checks.push('Partner order displays the supplied completion with one allowed unpaid intent');
  await choosePage(page,'finale');await modal(page).getByRole('button',{name:'Call nightfall',exact:true}).click();
  await modal(page).locator('.case-night-clock').filter({hasText:/Night/}).waitFor();await ready(page);
  await modal(page).getByRole('button',{name:'1. Recorded light 1',exact:true}).click();
  await modal(page).getByRole('button',{name:'Take this post · 1 minute · Recorded light 1',exact:true}).click();await ready(page);
  const bearing=modal(page).getByRole('slider',{name:'Recorded light 1 bearing in degrees',exact:true});
  await bearing.focus();await bearing.press('Home');await bearing.press('ArrowRight');
  await modal(page).getByRole('button',{name:'Lock this beam · Recorded light 1',exact:true}).click();
  // Reduced-motion cinematics finish through their existing native lifecycle; no app state is touched.
  await page.waitForFunction(()=>!document.querySelector('.cinematic-modal[open]')
    &&document.querySelector('.case-modal[open] .case-finale [data-focus="night-board"]:not([hidden])'),null,{timeout:35000});
  checks.push('Nightfall, post and one native bearing intent display the server-supplied three-light success');
  await modal(page).getByRole('button',{name:'Board the schooner',exact:true}).click();
  const accusation=modal(page).locator('.case-accusation');
  await accusation.getByRole('button',{name:'Board the schooner',exact:true}).click();await ready(page);
  const accuse=accusation.getByRole('button',{name:'Present this accusation',exact:true});
  const beforeAccuse=writes(env).length;await accuse.click();
  await modal(page).locator('.case-notice').filter({hasText:'Recorded server accusation refusal.'}).waitFor();
  assert.equal(writes(env).length,beforeAccuse+1);assert.equal(await modal(page).locator('.case-reveal').count(),0);
  await accuse.click();const retry=modal(page).locator('[data-focus="retry-server-call"]');await retry.waitFor();
  assert.equal(writes(env).length,beforeAccuse+2,'The unknown accusation is not automatically repeated');
  const held=writes(env).at(-1);await retry.click();
  await page.waitForFunction(()=>!document.querySelector('.cinematic-modal[open]')
    &&document.querySelector('.case-modal[open] .case-accusation [data-focus="open-reveal"]'),null,{timeout:35000});
  await modal(page).getByRole('button',{name:'Open the reveal',exact:true}).click();
  await modal(page).locator('.case-reveal .case-reveal-line').waitFor();
  const last=writes(env).at(-1);assert.ok(last.sameUid&&last.sameBody,'The explicit accusation retry retains its held UID and body');
  assert.ok(env.caseRequests.some(row=>row.path==='/api/case'&&row.method==='GET'&&row.sequence>held.sequence&&row.sequence<last.sequence),
    'Unknown accusation retry reads current case before repeating');
  const beforePages=writes(env).length;await modal(page).getByRole('button',{name:'Next line',exact:true}).click();
  await modal(page).getByRole('button',{name:'Finish the reveal',exact:true}).click();
  assert.equal(writes(env).length,beforePages,'Reveal paging remains presentation-only');
  const completion=worldLocked?'Your case is complete.':'The coast is relit.';
  await modal(page).locator('.case-reveal > p').filter({hasText:completion}).waitFor();
  assert.equal((await modal(page).locator('.case-reveal > p').textContent()).trim(),completion,
    'Completing a case reports only the authoritative public coast state');
  await modal(page).getByRole('button',{name:'See the coast',exact:true}).click();
  await modal(page).locator('.case-relighting').getByRole('heading',{name:worldLocked?'The Wall of Lights':'The Relighting',exact:true}).waitFor({timeout:35000});
  assert.ok(env.caseRequests.some(row=>row.path==='/api/world'&&!row.authorized),'The coast is read through the anonymous world boundary');
  checks.push(worldLocked?'A completed case with a locked world keeps the public coast dark':'A completed case displays the independently confirmed relit coast');
  checks.push('Refused and unknown accusations retain authority; accepted reveal paging and the public coast stay server-backed');
  for(const path of ['/api/board/pin','/api/board/pair','/api/case/search','/api/crews/me/orders','/api/finale/nightfall','/api/finale/post','/api/finale/signal','/api/case/accuse'])
    assert.ok(env.caseRequests.some(row=>row.path===path&&row.method==='POST'),'Every core case route is exercised');
  assert.deepEqual(await assertEngineReplay(page),beforeReplay,'Case pages preserve the original engine replay');
  assertCasePrivacy(env);return {checks:[...checks,'Case controls preserve engine replay, production CSP and private request boundaries']};
}
export async function recordedCaseUnknown(env){
  const {page}=env;await enterRecordedCase(env);env.abortNextPin();const before=writes(env).length;
  await pinFirst(page);const retry=modal(page).locator('[data-focus="retry-server-call"]');await retry.waitFor();
  assert.equal(writes(env).length,before+1,'A failed pin is not automatically repeated');
  const first=writes(env).at(-1);await retry.click();
  await board(page).locator('[data-card="C1"][data-state="pinned"]').waitFor();
  const sent=writes(env).slice(before);assert.equal(sent.length,2);
  assert.ok(sent[1].sameUid&&sent[1].sameBody,'Explicit retry retains the original UID and body');
  assert.ok(env.caseRequests.some(row=>row.method==='GET'&&row.path==='/api/case'&&row.sequence>first.sequence&&row.sequence<sent[1].sequence),
    'Explicit retry reads authoritative case state before repeating the held intent');
  assertCasePrivacy(env);return {checks:['Unknown pin outcome waits for explicit Retry, reads back, then repeats the same UID and body once']};
}
