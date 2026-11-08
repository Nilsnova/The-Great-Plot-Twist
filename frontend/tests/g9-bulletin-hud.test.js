// Public Journal entry reaches the actual controller; unavailable/loading stay reachable and off stays quiet.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('connects the Journal bulletin control to the actual drawer and fences off/disposed callbacks',async()=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width:320,height:568});
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/styles.css');await window.g20Import('/src/ui/readability.css');await window.g20Import('/src/ui/devices.css');
      await window.g20Import('/src/ui/kit/kit.css');await window.g20Import('/src/screens/screens.css');
      const {createHud}=await window.g20Import('/src/ui/hud.js');
      const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
      const {createFakeCaseAdapter}=await window.g20Import('/src/adapter/fake/index.js');
      const {caseMethods}=await window.g20Import('/src/adapter/contract.js'),{on}=await window.g20Import('/src/core/events.js');
      const fake=createFakeCaseAdapter(),proof={calls:[],intents:[],events:[]};
      const adapter={...fake,...Object.fromEntries(caseMethods.map(name=>[name,(...args)=>{proof.intents.push(name);return fake[name](...args);}]))};
      const screens=createCaseScreens({container:document.body,adapter,retryBulletin:async()=>({ok:false})});
      const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){},caseScreen:name=>{
        proof.calls.push(name);proof.pending=screens.open(name);
      }});
      const update=()=>hud.setBulletin(fake.read()),stopView=fake.subscribe(update);update();hud.start();
      const button=document.querySelector('.bulletin-toggle');
      Object.assign(proof,{fake,screens,hud,button,retained:button.onclick,stopView,stopEvent:on('bulletin_opened',event=>proof.events.push({...event}))});
      window.bulletinHudProof=proof;
    });
    const journal=page.getByRole('button',{name:'Journal',exact:true}),button=page.locator('.bulletin-toggle'),tools=page.locator('.case-toolbar');
    expect(await button.getAttribute('hidden')).not.toBeNull();
    await page.evaluate(()=>window.bulletinHudProof.retained());expect(await page.evaluate(()=>window.bulletinHudProof.calls)).toEqual([]);
    for(const scenario of ['loading','unavailable','hook']){
      await page.evaluate(scenario=>window.bulletinHudProof.fake.dev.setBulletin(scenario),scenario);
      expect(await button.getAttribute('hidden')).toBeNull();expect(await tools.isHidden()).toBe(true);
      await journal.click();expect(await button.isVisible()).toBe(true);
      const layout=await button.evaluate(element=>{const rect=element.getBoundingClientRect();return {
        size:parseFloat(getComputedStyle(element).fontSize),width:rect.width,height:rect.height,
        left:rect.left,right:rect.right,overflow:document.documentElement.scrollWidth>innerWidth};});
      expect(layout.size).toBeGreaterThanOrEqual(16);expect(layout.width).toBeGreaterThanOrEqual(44);expect(layout.height).toBeGreaterThanOrEqual(44);
      expect(layout.left).toBeGreaterThanOrEqual(0);expect(layout.right).toBeLessThanOrEqual(320);expect(layout.overflow).toBe(false);
      await button.click();await page.evaluate(()=>window.bulletinHudProof.pending);
      expect(await tools.isHidden()).toBe(true);expect(await page.locator('.case-modal[open] .bulletin-screen').isVisible()).toBe(true);
      if(scenario==='unavailable')expect(await page.getByRole('button',{name:'Retry bulletin',exact:true}).isEnabled()).toBe(true);
      if(scenario==='hook'){
        const announce=page.getByRole('button',{name:/^Announce flash sequence/});expect(await announce.isEnabled()).toBe(true);await announce.click();
        await page.evaluate(()=>{window.bulletinHudProof.closedAnnouncement=document.querySelector('[data-focus="hook-announcements"]');});
      }
      await page.keyboard.press('Escape');expect(await page.locator('.case-modal[open]').count()).toBe(0);
      if(scenario==='hook')expect(await page.evaluate(()=>{const button=window.bulletinHudProof.closedAnnouncement;
        button.dispatchEvent(new MouseEvent('click',{bubbles:true}));return {disabled:button.disabled,
          message:button.closest('.bulletin-hook').querySelector('.bulletin-hook-status').textContent};}))
        .toEqual({disabled:true,message:'Flash announcements stopped.'});
    }
    const result=await page.evaluate(()=>{const p=window.bulletinHudProof;
      p.fake.dev.setBulletin('off');p.retained();const afterOff=p.calls.length;
      p.fake.dev.setBulletin('hook');p.hud.dispose();p.retained();p.button.click();
      const result={calls:p.calls,events:p.events,intents:p.intents,afterOff,afterDispose:p.calls.length,removed:!document.querySelector('.hud')};
      p.screens.dispose();p.fake.dispose();p.stopView();p.stopEvent();return result;
    });
    expect(result).toEqual({calls:['bulletin','bulletin','bulletin'],events:Array.from({length:3},()=>({type:'bulletin_opened'})),intents:[],afterOff:3,afterDispose:3,removed:true});
  });
});
