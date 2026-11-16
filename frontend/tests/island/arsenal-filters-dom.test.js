import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it.each([{width:1280,height:720},{width:375,height:812}])('full-rack filters preserve actions and fit at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      for (const sheet of ['base','kit/kit','shell','styles','travel','readability','kit/components','devices','open-panels']) await window.g20Import(`/src/ui/${sheet}.css`);
      const {createArsenal} = await window.g20Import('/src/island/arsenal.js');
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const copies = Array.from({length:23},(_,i)=>({id:`copy-${i+1}`,no:i+1,weapon:i%2?'long_rifle':'pistols',
        holder:i<20?null:i===20?'me':'mate',holderName:'Captain Gull',you:i===20,away:false}));
      window.filterAnswer = {code:'ISLE-K7Q2M',capacity:20,stored:20,copies,waveRunning:false,coins:1000};
      window.filterReads = 0; window.filterActions = [];
      const api = {state:async()=>{ window.filterReads++; return {ok:true,data:structuredClone(window.filterAnswer)}; },
        take:async({copy})=>{ window.filterActions.push(copy); return {ok:false,code:'not_member',message:'You cannot take that weapon.'}; }};
      window.filterUi = createIslandUi({container:document.body});
      window.filterController = createArsenal({api,ui:window.filterUi,enabled:()=>true});
      window.filterController.open();
    });
    await page.waitForFunction(()=>document.querySelectorAll('.island-arsenal-copy').length===23);
    const controls = page.getByRole('group',{name:'Show weapons'});
    for (const button of await controls.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(size.width);
    }
    const carried = controls.getByRole('button',{name:'Carried (3)',exact:true});
    await carried.focus(); await page.keyboard.press('Enter');
    expect(await carried.getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.island-arsenal-copy').count()).toBe(3);
    expect(await page.locator('.island-arsenal-copy .kit-button').count()).toBe(0);
    await controls.getByRole('button',{name:'Available (20)',exact:true}).click();
    expect(await page.locator('.island-arsenal-copy').count()).toBe(20);
    expect(await page.locator('.island-arsenal-group').count()).toBe(2);
    expect(await page.locator('.island-arsenal-copy .island-arsenal-stats').count()).toBe(0); // Stats once per group.
    expect(await page.evaluate(()=>[window.filterReads,window.filterActions.length])).toEqual([1,0]);
    const first = page.locator('.island-arsenal-copy').first(), id = await first.getAttribute('data-copy');
    await first.getByRole('button').click();
    expect(await page.evaluate(()=>window.filterActions)).toEqual([id]);
    await page.evaluate(async()=>{
      window.filterAnswer.copies = window.filterAnswer.copies.filter(copy=>copy.holder);
      window.filterAnswer.stored = 0; await window.filterController.refresh();
    });
    expect(await page.getByRole('status').last().textContent()).toContain('No weapons are available');
    await page.getByRole('button',{name:'Show all',exact:true}).click();
    expect(await page.locator('.island-arsenal-copy').count()).toBe(3);
    expect(await page.evaluate(()=>[window.filterReads,window.filterActions.length])).toEqual([2,1]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); expect(await page.locator('dialog[open]').count()).toBe(0);
    await page.evaluate(()=>window.filterUi.dispose());
  });
});
