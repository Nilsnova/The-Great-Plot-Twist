// Checks local placeholder screens and the shell using installed Chrome, sequentially.
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
const env=await openWorldBrowser({hmr:false}),{page}=env,prefix='captures/20261106_G8-A11y';
const report={checked:new Date().toISOString(),screens:[],errors:[],skipped:['Claude real-server panels absent from main'],manual:['VoiceOver','Physical phone','Image/canvas contrast and flash analysis','Other browser engines']};
async function audit(name,selector,context='gameplay'){
 const root=page.locator(selector).last();await root.waitFor({state:'visible'});const sizes=[];
 for(const width of [1280,375,320]){
  await page.setViewportSize({width,height:900});
  sizes.push(await root.evaluate(async(root,{width,context})=>{
   const h=await import('/scripts/a11y-helpers.js');
   const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]')&&el.getBoundingClientRect().width>1;
   const nameOf=el=>el.getAttribute('aria-label')??(el.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' '))??(el.labels?.length?[...el.labels].map(l=>l.textContent).join(' '):el.getAttribute('alt')??el.textContent.trim());
   const controls=[...root.querySelectorAll('button,input,select,a[href],summary,[role="img"]')].filter(visible);
   const missingNames=controls.filter(el=>!nameOf(el)).map(el=>el.tagName+'.'+el.className);
   const duplicates=h.duplicateNames(controls.filter(el=>el.matches('button')).map(nameOf));
   const smallTargets=width===375?controls.filter(el=>!el.disabled&&!el.matches('[role="img"]')&&!h.touchTargetMeetsMinimum(el.getBoundingClientRect())).map(el=>({name:nameOf(el),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})):[];
   const fonts=[],contrast=[],imageBackgrounds=new Set();let minimumContrast=21,textCount=0;
   for(const el of [root,...root.querySelectorAll('*')].filter(visible)){
    if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('option,script,style')||el.closest('.kit-sr-only,.presence-sr-only'))continue;
    textCount++;const s=getComputedStyle(el),identity=el.tagName.toLowerCase()+'.'+el.classList.toString().replaceAll(' ','.');
    const metadata=el.closest('button,label,select,output,nav,small,kbd,dt,dd,figcaption,.bulletin-day,.bulletin-next,.bulletin-resets summary,.case-caption,.case-eyebrow,.case-facts,.case-card-credit,.case-card-id,.case-seat-credit,.case-clock,.case-job-report,.partner-chart-caption,.partner-life-status,.case-cited-cards,.kit-badge');
    const minimum=h.minimumTextSize(el.closest('.kit-dialogue-text,.case-reveal-line')?'story':metadata?'metadata':context);
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
 const isDialog=await root.evaluate(root=>root.matches('dialog'));
 const focus=await root.evaluate(root=>{const controls=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);controls.forEach((el,i)=>el.dataset.a11yOrder=String(i));controls[0]?.focus();return {count:controls.length,positiveTabindex:controls.some(el=>el.tabIndex>0),steps:[]};});
 const steps=isDialog?focus.count-1:Math.min(1,focus.count-1);
 for(let i=1;i<=steps;i++){await page.keyboard.press('Tab');focus.steps.push(await root.evaluate((root,i)=>{const el=document.activeElement,s=getComputedStyle(el);return {domOrder:el.dataset.a11yOrder===String(i),inside:root.contains(el),visible:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0};},i));}
 if(await root.evaluate(root=>root.matches('dialog'))){await root.evaluate(root=>[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')].filter(el=>el.getClientRects().length).at(-1)?.focus());await page.keyboard.press('Tab');focus.trapped=await root.evaluate(root=>root.contains(document.activeElement));}
 report.screens.push({name,sizes,focus});console.log('Audited '+name);await writeFile(prefix+'-Checks.json',JSON.stringify(report,null,2));
}
try{
 await page.goto(env.url+'/case-lab.html?demo=1');await page.waitForFunction(()=>window.__caseLab);
 await page.evaluate(async()=>{const a=window.__caseLab.adapter;a.dev.rehearse('board');a.dev.give('C3',1);a.dev.give('C4',1);});
 for(const name of ['arrival','crew','board','search','partners','finale','accusation','reveal','relighting','rewards','log','hints','bulletin']){
  await page.evaluate(async name=>{const {adapter:a,screens}=window.__caseLab;if(name==='partners'){const partner=a.read().partners.find(p=>p.seat===2);const target=partner?.targets?.fetch?.[0];if(target)await a.orderPartner(2,'fetch',target.id);}if(name==='finale'){a.dev.rehearse('board');a.dev.rehearse('finale');}if(name==='accusation'){for(const [first,second] of [['C3','C4'],['C5','C6'],['C7','C8']]){a.dev.give(first,1);a.dev.give(second,2);await a.pin(first);a.dev.pinForSeat(second,2);await a.pair(first,second);}a.dev.rehearse('lock');await a.boardSchooner();}if(name==='reveal'){const suspect=a.read().accusation.suspects.find(s=>!s.cleared);const result=await a.accuse(suspect.id);if(!result.accepted)throw Error('Placeholder reveal setup failed: '+result.reason);}if(name==='relighting')a.dev.rehearse('relighting');if(name==='bulletin')a.dev.setBulletin('hook');await screens.open(name);},name);await audit(name,'.case-modal[open]','case');await page.keyboard.press('Escape');report.screens.at(-1).escapeClosed=await page.locator('.case-modal[open]').count()===0;
 }
 await stubIntro(page);await page.goto(env.url+'/?case=local&demo=1');await audit('title','.shell-screen[open]');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await audit('settings','.shell-screen[open]');await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();await audit('credits','.shell-screen[open]');await page.keyboard.press('Escape');report.creditsEscapeSettings=await page.locator('.shell-screen[open]').getAttribute('data-mode')==='settings';await page.keyboard.press('Escape');report.settingsEscapeTitle=await page.locator('.shell-screen[open]').getAttribute('data-mode')==='title';
 await page.getByRole('button',{name:'New game',exact:true}).click();await page.locator('.intro-modal[open] .intro-view').waitFor();await audit('intro','.intro-modal[open]');await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});report.screens.at(-1).escapeClosed=true;report.introEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));
 await page.waitForFunction(()=>window.__island);await page.evaluate(()=>window.__island.caseUi.close());
 await page.setViewportSize({width:375,height:900});await page.evaluate(()=>window.__island.audio.cue('build'));await page.locator('.sound-caption:not([hidden])').waitFor();
 report.worldCaption=await page.locator('.sound-caption:not([hidden])').evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('.bottom-bar').getBoundingClientRect();return {nonoverlap:a.bottom<=b.top,inside:a.top>=0&&a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,size:parseFloat(getComputedStyle(el).fontSize)};});
 await page.screenshot({path:prefix+'-world-caption-375.png'});
 await page.evaluate(()=>window.__island.caseUi.open('crew'));await page.evaluate(()=>window.__island.audio.cue('paper'));await page.locator('.case-modal[open] .sound-caption:not([hidden])').waitFor();
 report.modalCaption=await page.locator('.case-modal[open] .sound-caption:not([hidden])').evaluate(el=>{const a=el.getBoundingClientRect(),dialog=el.closest('dialog'),header=dialog.querySelector('.kit-modal-header').getBoundingClientRect(),body=dialog.querySelector('.kit-modal-body').getBoundingClientRect();return {between:a.top>=header.bottom&&a.bottom<=body.top,inside:a.top>=0&&a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,size:parseFloat(getComputedStyle(el).fontSize)};});
 await page.screenshot({path:prefix+'-modal-caption-375.png'});
 await audit('main-crew','.case-modal[open]','case');await page.keyboard.press('Escape');report.caseEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));await audit('world','.hud');
 await page.evaluate(()=>window.__plotTwist.accountHost.open());
 await audit('account','.account-modal[open]');await page.keyboard.press('Escape');report.accountEscapeCanvas=await page.evaluate(()=>document.activeElement?.matches('canvas'));
 await audit('presence','.presence-hud');
 for(const [name,place] of [['islet-world','home_islet'],['gulls-rest','gulls_rest']]){await page.evaluate(async place=>{const g=window.__island;g.world.setRelightingComplete(true);await g.world.goTo(place,{fast:true});},place);await audit(name,'.hud');}
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(async()=>{const {setPreferences}=await import('/src/settings/preferences.js');setPreferences({reducedMotion:false});window.__plotTwist.adapter.dev.rehearse('relighting');window.__island.settings.hour=23;});
 await page.waitForFunction(()=>window.__island.scene.getObjectByName('coastal-fireworks')?.visible===true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(async()=>{const {setPreferences}=await import('/src/settings/preferences.js');setPreferences({reducedMotion:true});});
 await page.waitForFunction(()=>window.__island.scene.getObjectByName('coastal-fireworks')?.visible===false);
 report.reducedMotion=await page.evaluate(()=>({wasActive:true,fireworksVisible:window.__island.scene.getObjectByName('coastal-fireworks').visible,runningAnimations:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName??'unknown')}));
}catch(error){report.errors.push(error.stack);}
finally{
 report.browserErrors=env.errors;report.externalRequests=env.external;
 report.failures=report.screens.flatMap(screen=>screen.sizes.flatMap(m=>['missingNames','duplicates','smallTargets','fonts','contrast'].filter(key=>m[key].length).map(key=>({screen:screen.name,width:m.width,check:key,count:m[key].length}))));
 for(const screen of report.screens){for(const m of screen.sizes){for(const key of ['overflow','documentOverflow'])if(m[key])report.failures.push({screen:screen.name,width:m.width,check:key});if(!m.fitsViewport)report.failures.push({screen:screen.name,width:m.width,check:'fitsViewport'});}if(screen.focus.positiveTabindex||screen.focus.steps.some(step=>!step.domOrder||!step.inside||!step.visible)||screen.focus.trapped===false||screen.escapeClosed===false)report.failures.push({screen:screen.name,check:'keyboard'});}
 for(const [name,caption] of [['world',report.worldCaption],['modal',report.modalCaption]])if(!caption||!caption.inside||caption.size<18||caption.nonoverlap===false||caption.between===false)report.failures.push({check:name+'Caption'});
 if(report.externalRequests.length)report.failures.push({check:'externalRequests'});for(const check of ['creditsEscapeSettings','settingsEscapeTitle','introEscapeCanvas','caseEscapeCanvas','accountEscapeCanvas'])if(report[check]!==true)report.failures.push({check});if(report.reducedMotion?.fireworksVisible||report.reducedMotion?.runningAnimations.length)report.failures.push({check:'reducedMotion'});
 await writeFile(prefix+'-Checks.json',JSON.stringify(report,null,2));await env.close();
}
console.log(JSON.stringify({screens:report.screens.length,failures:report.failures,errors:report.errors},null,2));
if(report.failures.length||report.errors.length||report.browserErrors.length)process.exitCode=1;
