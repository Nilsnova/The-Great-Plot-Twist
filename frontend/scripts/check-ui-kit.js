// Real keyboard/focus, reduced-motion and hostile-text checks for reusable components.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openWorldBrowser } from './world-browser-tools.js';
const production = process.env.KIT_PRODUCTION === '1';
const env = await openWorldBrowser({ preview:production }), { page } = env;
const report = { checked:new Date().toISOString(), production, checks:[] };
const check = (ok,label) => { assert.ok(ok,label); report.checks.push(label); };
try {
  await page.goto(env.url+'/ui-kit.html'); await page.locator('.kit-dialogue').waitFor();
  check(await page.locator('.kit-panel').count() === 15,'Gallery shows nine component groups and six request states');
  await page.getByRole('button',{name:'Open a panel',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'visible'}); await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check(await page.getByRole('button',{name:'Open a panel',exact:true}).evaluate(el=>el===document.activeElement),'Modal Escape restores the invoking focus');
  await page.getByRole('tab',{name:'Inventory',exact:true}).click(); await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab',{name:'Crew',exact:true}).getAttribute('aria-selected') === 'true','Tab arrows activate and focus the selected panel');
  await page.locator('.kit-dialogue').getByRole('button',{name:'Show full text'}).click();
  check(await page.locator('.kit-choice:disabled').count() === 0,'Skip reveals the full line and enables choices');
  await page.keyboard.press('2'); await page.locator('.kit-dialogue').getByRole('button',{name:'Show full text'}).click();
  check((await page.locator('.kit-dialogue-text').textContent()).includes('You turn the notebook'),'Numbered keyboard choice updates the dialogue once');
  check(await page.locator('.kit-clue-card[data-state=new]').count() === 1 && await page.locator('.kit-clue-card[data-state=pinned]').count() === 1 && await page.locator('.kit-clue-card[data-state=used]').count() === 1,'Clue states are presented without board logic');
  check(await page.locator('.kit-mini-chart[data-halted=true] .kit-badge').textContent() === 'Trading halted','Halted sparkline has a readable status');
  check(await page.locator('progress').evaluate(el=>el.value===.6),'Native progress exposes the supplied ratio');
  check(await page.locator('.kit-hud-bar').textContent().then(text=>text.includes('🪙 1,240')&&text.includes('NPC partner')),'HUD formats supplied balance and distinguishes NPC seats');
  await page.getByRole('button',{name:'Show a toast'}).click();
  check(await page.locator('.kit-toast').textContent() === 'Your field notes are ready.','Toast announces plain status text');
  await page.screenshot({path:`captures/20261105_G4-UI-Kit${production?'-Production':''}.png`,fullPage:true});
  if (!production) {
    const safety = await page.evaluate(async () => {
      const kit = await import('/src/ui/kit/index.js');
      const text = '<img src="invalid" onerror="window.__unsafe=true">';
      const dialogue = kit.createDialogue({speaker:text,text,choices:[{id:'safe',label:text}]}); document.body.append(dialogue.element); dialogue.complete();
      const button = kit.createButton({label:text}); document.body.append(button.element);
      const table = kit.createTable({columns:[{key:'value',label:text}],rows:[{value:text}]}); document.body.append(table.element);
      const safe = !dialogue.element.querySelector('img') && !button.element.querySelector('img') && !table.element.querySelector('img') && dialogue.element.textContent.includes(text);
      dialogue.dispose();button.dispose();table.dispose();return safe;
    });
    check(safety,'Supplied HTML-like text stays literal in dialogue, choices, buttons and tables');
    check(await page.evaluate(async()=>{
      const {createDialogue,createModal,createButton}=await import('/src/ui/kit/index.js');
      const dialogue=createDialogue({speaker:'Quiet',text:'A still sea.',choices:[]});document.body.append(dialogue.element);dialogue.complete();
      const focused=document.activeElement===dialogue.element.querySelector('.kit-dialogue-text');dialogue.dispose();
      const opener=createButton({label:'Open temporary dialog'});document.body.append(opener.element);opener.element.focus();
      const modal=createModal({title:'Temporary'});modal.open();modal.dispose();const restored=document.activeElement===opener.element;opener.dispose();return focused&&restored;
    }),'Empty-choice dialogue keeps focus and disposing an open modal restores its opener');
    await page.emulateMedia({reducedMotion:'reduce'});
    check(await page.evaluate(async()=>{
      const {createDialogue}=await import('/src/ui/kit/dialogue.js');
      const dialogue=createDialogue({speaker:'Field notes',text:'A quiet harbor.',choices:[{id:'done',label:'Continue'}]});
      const done=dialogue.element.querySelector('.kit-dialogue-text').textContent==='A quiet harbor.' && !dialogue.element.querySelector('.kit-choice').disabled;dialogue.dispose();return done;
    }),'Reduced-motion dialogue reveals text immediately');
  }
  for (const [width,height] of [[1365,768],[700,900]]) {
    await page.setViewportSize({width,height});
    check(await page.locator('.kit-button,.kit-choice,.kit-dialogue-text,.kit-table td').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=14)),`Text remains readable at ${width}×${height}`);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Gallery has no horizontal overflow at ${width}×${height}`);
  }
  check(env.errors.length===0,'No browser errors'); check(env.external.length===0,'No external requests');console.log(JSON.stringify(report,null,2));
} finally { await writeFile(`captures/20261105_G4-UI-Checks${production?'-Production':''}.json`,JSON.stringify(report,null,2));await env.close(); }
