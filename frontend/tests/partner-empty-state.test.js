// The initial empty partner view supplies a real next action without sending an order.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('renders an initial empty state with a keyboard-accessible Crew action and restores it after partner removal',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/kit/kit.css');
      const {createPartnerLifeScreen}=await window.g20Import('/src/screens/partners/index.js');
      const sent=[],navigated=[],screen=createPartnerLifeScreen({send:(...args)=>sent.push(args),navigate:name=>navigated.push(name)});
      screen.update({partners:[]});document.body.append(screen.element);window.partnerEmpty={screen,sent,navigated};
    });
    expect(await page.locator('.partner-life-empty').count()).toBe(1);
    expect(await page.locator('.partner-life-empty').textContent()).toBe('No partner seats are active.');
    const crew=page.getByRole('button',{name:'Open crew',exact:true});
    expect(await crew.count()).toBe(1);await crew.focus();await page.keyboard.press('Enter');
    await page.evaluate(()=>window.partnerEmpty.screen.update({partners:[]}));
    expect(await crew.evaluate(button=>button===document.activeElement)).toBe(true);
    await page.evaluate(()=>window.partnerEmpty.screen.update({partners:[{seat:2,name:'Recorded partner',archetype:'deckhand',orders:[],targets:{},canOrder:false}]}));
    expect(await page.locator('.partner-life-card').count()).toBe(1);expect(await crew.count()).toBe(0);
    await page.evaluate(()=>window.partnerEmpty.screen.update({partners:[]}));
    expect(await page.locator('.partner-life-card').count()).toBe(0);expect(await crew.count()).toBe(1);
    await crew.focus();await page.keyboard.press('Enter');
    expect(await page.evaluate(()=>({sent:window.partnerEmpty.sent,navigated:window.partnerEmpty.navigated})))
      .toEqual({sent:[],navigated:['crew','crew']});
    await page.evaluate(()=>window.partnerEmpty.screen.dispose());
  });
});
