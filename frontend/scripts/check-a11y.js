// Checks local placeholder screens and the shell using installed Chrome, sequentially.
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {auditRequestStates} from './a11y-request-states.js';
import {auditCrewShortViewport} from './a11y-crew-short.js';
import {auditIsletPanel} from './a11y-islet.js';
import {auditMarketPanel} from './a11y-market.js';
import {auditPredictionsPanel} from './a11y-predictions.js';
import {auditArenaPanel} from './a11y-arena.js';
const env=await openWorldBrowser({hmr:false}),{page}=env,prefix='captures/20261106_G8-A11y';
const report={checked:new Date().toISOString(),screens:[],errors:[],skipped:[],manual:['VoiceOver','Physical phone','Image/canvas contrast and flash analysis','Other browser engines']};
async function audit(name,selector,context='gameplay'){
 const root=page.locator(selector).last();await root.waitFor({state:'visible'});const sizes=[];
 for(const width of [1280,375,320]){
  await page.setViewportSize({width,height:900});
  sizes.push(await root.evaluate(async(root,{width,context})=>{
   const h=await import('/scripts/a11y-helpers.js');
   const visible=el=>h.renderedForAudit(el);
   const nameOf=el=>el.getAttribute('aria-label')??(el.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' '))??(el.labels?.length?[...el.labels].map(l=>l.textContent).join(' '):el.getAttribute('alt')??el.textContent.trim());
   const controls=[...root.querySelectorAll('button,input,select,a[href],summary,[role="img"]')].filter(visible);
   const missingNames=controls.filter(el=>!nameOf(el)).map(el=>el.tagName+'.'+el.className);
   const duplicates=h.duplicateNames(controls.filter(el=>el.matches('button')).map(nameOf));
   const smallTargets=width===375?controls.filter(el=>!el.disabled&&!el.matches('[role="img"]')&&!h.touchTargetMeetsMinimum(h.touchRectForAudit(el))).map(el=>({name:nameOf(el),width:h.touchRectForAudit(el).width,height:h.touchRectForAudit(el).height})):[];
   const fonts=[],contrast=[],imageBackgrounds=new Set();let minimumContrast=21,textCount=0;
   for(const el of [root,...root.querySelectorAll('*')].filter(visible)){
    if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('option,script,style')||el.closest('.kit-sr-only,.presence-sr-only'))continue;
    textCount++;const s=getComputedStyle(el),identity=el.tagName.toLowerCase()+'.'+el.classList.toString().replaceAll(' ','.');
    const metadata=el.closest('button,a[href],label,select,output,nav,small,kbd,dt,dd,figcaption,.bulletin-day,.bulletin-next,.bulletin-resets summary,.case-caption,.case-eyebrow,.case-facts,.case-card-credit,.case-card-id,.case-seat-credit,.case-clock,.case-job-report,.partner-chart-caption,.partner-life-status,.case-cited-cards,.kit-badge');
    const minimum=h.minimumTextSize(el.closest('.kit-dialogue-text,.case-reveal-line,.intro-original,.intro-notes,.intro-journal-ending-notes')?'story':metadata?'metadata':context);
    if(parseFloat(s.fontSize)<minimum)fonts.push({element:identity,size:parseFloat(s.fontSize),minimum});
    if(el.closest(':disabled'))continue;
    let bg={r:255,g:255,b:255,a:1},unknownBackground=false;const ancestors=[];for(let n=el;n;n=n.parentElement)ancestors.unshift(n);
    for(const n of ancestors){const paint=getComputedStyle(n),c=h.parseColour(paint.backgroundColor);if(c)bg=h.compositeColour(c,bg);else unknownBackground=true;if(paint.backgroundImage!=='none')imageBackgrounds.add(identity);}
    const fg=h.parseColour(s.color);if(fg)for(const n of ancestors)fg.a*=Number(getComputedStyle(n).opacity);const ratio=fg&&!unknownBackground?h.contrastRatio(fg,bg):null;
    if(ratio!==null)minimumContrast=Math.min(minimumContrast,ratio);if(ratio===null||ratio<4.5)contrast.push({element:identity,ratio,colour:s.color,background:bg});
   }
   return {width,textCount,minimumContrast,missingNames,duplicates,smallTargets,fonts,contrast,imageBackgrounds:[...imageBackgrounds],overflow:h.hasHorizontalOverflow(root),documentOverflow:h.hasHorizontalOverflow(document.documentElement),fitsViewport:h.withinViewport(root.getBoundingClientRect(),{width,height:innerHeight})};
  },{width,context}));
  if(width===375)await page.screenshot({path:`${prefix}-${name}-375.png`});
 }
 await page.setViewportSize({width:1280,height:900});
 const isDialog=await root.evaluate(root=>root.matches('dialog,[role="dialog"]'));
 const focus=await root.evaluate(async root=>{const h=await import('/scripts/a11y-helpers.js');const candidates=h.focusCandidatesForAudit(root),controls=h.tabbableForAudit(root);root.querySelectorAll('[data-a11y-order]').forEach(el=>delete el.dataset.a11yOrder);controls.forEach((el,i)=>el.dataset.a11yOrder=String(i));controls[0]?.focus();return {count:controls.length,positiveTabindex:candidates.some(el=>el.tabIndex>0),order:controls.map(el=>({tag:el.tagName,class:el.className,dataFocus:el.dataset.focus??null,order:el.dataset.a11yOrder})),steps:[]};});
 const steps=isDialog?focus.count-1:Math.min(1,focus.count-1);
 for(let i=1;i<=steps;i++){await page.keyboard.press('Tab');focus.steps.push(await root.evaluate(async(root,i)=>{const h=await import('/scripts/a11y-helpers.js');const el=document.activeElement;return {domOrder:el.dataset.a11yOrder===String(i),inside:root.contains(el),visible:h.visibleFocusForAudit(el),expectedOrder:String(i),actual:{tag:el.tagName,class:el.className,dataFocus:el.dataset.focus??null,order:el.dataset.a11yOrder??null}};},i));}
 if(isDialog){await root.evaluate(async root=>{const h=await import('/scripts/a11y-helpers.js');h.tabbableForAudit(root).at(-1)?.focus();});await page.keyboard.press('Tab');focus.trapped=await root.evaluate(root=>root.contains(document.activeElement));focus.trapTarget=await root.evaluate(()=>{const el=document.activeElement;return {tag:el.tagName,class:el.className,dataFocus:el.dataset.focus??null,order:el.dataset.a11yOrder??null};});}
 report.screens.push({name,sizes,focus});console.log('Audited '+name);await writeFile(prefix+'-Checks.json',JSON.stringify(report,null,2));
}
try{
 await page.goto(env.url+'/case-lab.html?demo=1');await page.waitForFunction(()=>window.__caseLab);
 report.crewShort=await auditCrewShortViewport(page,{capture:prefix+'-crew-short-375x400.png'});
 await page.evaluate(async()=>{const a=window.__caseLab.adapter;a.dev.rehearse('board');a.dev.give('C3',1);a.dev.give('C4',1);});
 for(const name of ['arrival','crew','board','search','partners','finale','accusation','reveal','relighting','rewards','log','hints','bulletin']){
  await page.evaluate(async name=>{const {adapter:a,screens}=window.__caseLab;if(name==='partners'){const partner=a.read().partners.find(p=>p.seat===2);const target=partner?.targets?.fetch?.[0];if(target)await a.orderPartner(2,'fetch',target.id);}if(name==='finale'){a.dev.rehearse('board');a.dev.rehearse('finale');}if(name==='accusation'){for(const [first,second] of [['C3','C4'],['C5','C6'],['C7','C8']]){a.dev.give(first,1);a.dev.give(second,2);await a.pin(first);a.dev.pinForSeat(second,2);await a.pair(first,second);}a.dev.rehearse('lock');await a.boardSchooner();}if(name==='reveal'){const suspect=a.read().accusation.suspects.find(s=>!s.cleared);const result=await a.accuse(suspect.id);if(!result.accepted)throw Error('Placeholder reveal setup failed: '+result.reason);}if(name==='relighting')a.dev.rehearse('relighting');if(name==='bulletin')a.dev.setBulletin('hook');await screens.open(name);},name);await audit(name,'.case-modal[open]','case');await page.keyboard.press('Escape');report.screens.at(-1).escapeClosed=await page.locator('.case-modal[open]').count()===0;
 }
 await stubIntro(page);await page.goto(env.url+'/?case=local&demo=1');await audit('title','.shell-screen[open]');
 await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.join-form').waitFor();await audit('join','.shell-screen[open]');await page.keyboard.press('Escape');report.joinEscapeTitle=await page.locator('.shell-screen[open]').getAttribute('data-mode')==='title';
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.preferences').waitFor();await audit('settings','.shell-screen[open]');await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();await audit('credits','.shell-screen[open]');await page.keyboard.press('Escape');report.creditsEscapeSettings=await page.locator('.shell-screen[open]').getAttribute('data-mode')==='settings';await page.keyboard.press('Escape');report.settingsEscapeTitle=await page.locator('.shell-screen[open]').getAttribute('data-mode')==='title';
 await page.locator('#play').click();await page.locator('dialog.cutscene[open]').waitFor();await audit('cutscene','dialog.cutscene[open]');
 await page.getByRole('button',{name:'Skip',exact:true}).click();await page.locator('.goal-card[open]').waitFor({timeout:30000});await audit('goal-card','.goal-card[open]');
 await page.getByRole('button',{name:'Got it',exact:true}).click();await page.waitForFunction(()=>window.__island?.world.current?.id==='saltreach_harbor'&&document.activeElement?.matches('canvas'));report.frontDoorHarbor=true;
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Lighthouse prologue',exact:true}).click();await page.locator('.intro-modal[open] .intro-view').waitFor();await audit('intro','.intro-modal[open]');
 await page.locator('.intro-journal>summary').click();await page.locator('.intro-journal[open]').waitFor();await audit('intro-journal','.intro-modal[open]');await page.keyboard.press('Escape');report.journalEscapeIntro=await page.evaluate(()=>!document.querySelector('.intro-journal')?.open&&document.querySelector('.intro-modal')?.open);
 await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});report.screens.at(-1).escapeClosed=true;report.introEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));
 const room=page.locator('.interiors-scene:not([hidden])');await room.waitFor();await page.waitForFunction(()=>document.querySelector('.interiors-scene:not([hidden])')?.dataset.state==='ready');await audit('interior-cottage','.interiors-scene:not([hidden])');await room.getByRole('button',{name:'Leave room',exact:true}).click();await room.waitFor({state:'hidden'});report.interiorExitCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas:not(.interiors-canvas)'));
 await page.waitForFunction(()=>window.__island);await page.evaluate(()=>window.__island.caseUi.close());
 await page.setViewportSize({width:375,height:900});await page.evaluate(()=>window.__island.audio.cue('build'));await page.locator('.sound-caption:not([hidden])').waitFor();
 report.worldCaption=await page.locator('.sound-caption:not([hidden])').evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('.bottom-bar').getBoundingClientRect();return {nonoverlap:a.bottom<=b.top,inside:a.top>=0&&a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,size:parseFloat(getComputedStyle(el).fontSize)};});
 await page.screenshot({path:prefix+'-world-caption-375.png'});
 await page.evaluate(()=>window.__island.caseUi.open('crew'));await page.evaluate(()=>window.__island.audio.cue('paper'));await page.locator('.case-modal[open] .sound-caption:not([hidden])').waitFor();
 report.modalCaption=await page.locator('.case-modal[open] .sound-caption:not([hidden])').evaluate(el=>{const a=el.getBoundingClientRect(),dialog=el.closest('dialog'),header=dialog.querySelector('.kit-modal-header').getBoundingClientRect(),body=dialog.querySelector('.kit-modal-body').getBoundingClientRect();return {between:a.top>=header.bottom&&a.bottom<=body.top,inside:a.top>=0&&a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,size:parseFloat(getComputedStyle(el).fontSize)};});
 await page.screenshot({path:prefix+'-modal-caption-375.png'});
 await audit('main-crew','.case-modal[open]','case');await page.keyboard.press('Escape');report.caseEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));await audit('world','.hud');
 await page.getByRole('button',{name:'Controls',exact:true}).click();await page.locator('.controls:not([hidden])').waitFor();await audit('world-controls','.hud');await page.getByRole('button',{name:'Journal',exact:true}).click();await page.locator('.case-toolbar:not([hidden])').waitFor();await audit('world-journal','.hud');await page.keyboard.press('Escape');report.hudJournalEscape=await page.evaluate(()=>document.querySelector('.case-toolbar')?.hidden&&document.activeElement?.matches('.journal-toggle'));
 await page.evaluate(()=>window.__plotTwist.accountHost.open());
 await audit('account','.account-modal[open]');
 for(const state of ['signing_in','signed_in','expired','error']){
  await page.evaluate(state=>window.__plotTwist.adapter.dev.setAccount({state,signInReadyAt:null,sessionExpiresAt:null,saveState:'idle'}),state);
  await audit('account-'+state,'.account-modal[open]');
 }
 await page.evaluate(()=>window.__plotTwist.adapter.dev.setAccount({state:'signed_in',saveState:'conflict',
  deviceSave:{state:'saved',label:'Device progress',kind:'intro',actions:['to_desk'],place:'lighthouse_isle'},
  cloudSave:{state:'saved',label:'Cloud progress',kind:'intro',actions:['to_shore'],place:'lighthouse_isle'}}));
 await audit('account-conflict','.account-modal[open]');
 await page.locator('.account-modal[open]').getByRole('button',{name:'Delete my data',exact:true}).click();
 await audit('account-delete','.account-modal[open]');
 await page.evaluate(()=>window.__plotTwist.adapter.dev.setAccount({state:'signed_out',saveState:'idle',
  deviceSave:{state:'idle',kind:null},cloudSave:{state:'idle',kind:null}}));
 await page.keyboard.press('Escape');report.accountEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));
 await auditRequestStates(page,audit);
 await audit('presence','.presence-hud');
 for(const [name,place] of [['islet-world','home_islet'],['gulls-rest','gulls_rest']]){await page.evaluate(async place=>{const g=window.__island;g.world.setRelightingComplete(true);await g.world.goTo(place,{fast:true});},place);await audit(name,'.hud');}
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(async()=>{const {setPreferences}=await import('/src/settings/preferences.js');setPreferences({reducedMotion:false});window.__plotTwist.adapter.dev.rehearse('relighting');window.__island.settings.hour=23;});
 await page.waitForFunction(()=>window.__island.scene.getObjectByName('coastal-fireworks')?.visible===true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(async()=>{const {setPreferences}=await import('/src/settings/preferences.js');setPreferences({reducedMotion:true});});
 await page.waitForFunction(()=>window.__island.scene.getObjectByName('coastal-fireworks')?.visible===false);
 report.reducedMotion=await page.evaluate(()=>({wasActive:true,fireworksVisible:window.__island.scene.getObjectByName('coastal-fireworks').visible,runningAnimations:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName??'unknown')}));
 report.isletPanel=await auditIsletPanel(page,{url:env.url,audit,capture:prefix+'-islet-short-375x400.png'});
 report.marketPanel=await auditMarketPanel(page,{url:env.url,audit,capture:prefix+'-market-short-375x400.png'});
 report.predictionsPanel=await auditPredictionsPanel(page,{url:env.url,audit,capture:prefix+'-predictions-short-375x400.png'});
 report.arenaPanel=await auditArenaPanel(page,{url:env.url,audit,capture:prefix+'-arena-short-375x400.png'});
}catch(error){report.errors.push(error.stack);}
finally{
 report.browserErrors=env.errors;report.externalRequests=env.external;
 report.failures=report.screens.flatMap(screen=>screen.sizes.flatMap(m=>['missingNames','duplicates','smallTargets','fonts','contrast'].filter(key=>m[key].length).map(key=>({screen:screen.name,width:m.width,check:key,count:m[key].length}))));
 for(const [check,passed] of Object.entries(report.crewShort?.checks??{crewShortAudit:false}))if(!passed)report.failures.push({screen:'crew-short-local',width:375,height:400,check});
 for(const [check,passed] of Object.entries(report.isletPanel?.checks??{isletPanelAudit:false}))if(!passed)report.failures.push({screen:'islet-short-local',width:375,height:400,check});
 for(const [check,passed] of Object.entries(report.marketPanel?.checks??{marketPanelAudit:false}))if(!passed)report.failures.push({screen:'market-short-local',width:375,height:400,check});
 for(const [check,passed] of Object.entries(report.predictionsPanel?.checks??{predictionsPanelAudit:false}))if(!passed)report.failures.push({screen:'predictions-short-local',width:375,height:400,check});
 for(const [check,passed] of Object.entries(report.arenaPanel?.checks??{arenaPanelAudit:false}))if(!passed)report.failures.push({screen:'arena-short-local',width:375,height:400,check});
 for(const screen of report.screens){for(const m of screen.sizes){for(const key of ['overflow','documentOverflow'])if(m[key])report.failures.push({screen:screen.name,width:m.width,check:key});if(!m.fitsViewport)report.failures.push({screen:screen.name,width:m.width,check:'fitsViewport'});}if(screen.focus.positiveTabindex||screen.focus.steps.some(step=>!step.domOrder||!step.inside||!step.visible)||screen.focus.trapped===false||screen.escapeClosed===false)report.failures.push({screen:screen.name,check:'keyboard'});}
 for(const [name,caption] of [['world',report.worldCaption],['modal',report.modalCaption]])if(!caption||!caption.inside||caption.size<18||caption.nonoverlap===false||caption.between===false)report.failures.push({check:name+'Caption'});
 if(report.externalRequests.length)report.failures.push({check:'externalRequests'});for(const check of ['joinEscapeTitle','frontDoorHarbor','creditsEscapeSettings','settingsEscapeTitle','journalEscapeIntro','introEscapeCanvas','interiorExitCanvas','hudJournalEscape','caseEscapeCanvas','accountEscapeCanvas'])if(report[check]!==true)report.failures.push({check});if(report.reducedMotion?.fireworksVisible||report.reducedMotion?.runningAnimations.length)report.failures.push({check:'reducedMotion'});
 await writeFile(prefix+'-Checks.json',JSON.stringify(report,null,2));await env.close();
}
console.log(JSON.stringify({screens:report.screens.length,failures:report.failures,errors:report.errors},null,2));
if(report.failures.length||report.errors.length||report.browserErrors.length)process.exitCode=1;
