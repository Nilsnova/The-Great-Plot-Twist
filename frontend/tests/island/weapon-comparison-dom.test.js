import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it.each([{width:1280,height:720},{width:375,height:812}])('comparison is optional, keyboard usable and read-only at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      for (const sheet of ['base','kit/kit','shell','styles','travel','readability','kit/components','devices','open-panels']) await window.g20Import(`/src/ui/${sheet}.css`);
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {ARSENAL} = await window.g20Import('/src/island/spots.js');
      const {on,emit} = await window.g20Import('/src/core/events.js');
      const base = createFakeIslandTransport({coins:1000});
      base.dev.setWaveBest(10); base.dev.setCaptain(3);
      await base.api.arsenalBuy({weapon:'pistols',actionUid:'compare-setup-1'});
      await base.api.arsenalBuy({weapon:'long_rifle',actionUid:'compare-setup-2'});
      window.comparisonWrites = [];
      const transport = {...base,post:(path,body)=>{ window.comparisonWrites.push(path); return base.post(path,body); }};
      window.compareIsland = createIsland({container:document.body,emit,on,mode:'fake',transport,arsenalOn:()=>true,
        storage:null,menu:()=>()=>{}});
      await window.compareIsland.load(); await window.compareIsland.learnSkill('steady_aim');
      window.compareIsland.pick(ARSENAL.id);
    });
    const details = page.locator('.island-arsenal-rack [data-weapon="long_rifle"] details');
    await details.waitFor();
    expect(await details.evaluate(node=>node.open)).toBe(false);
    const summary = details.locator('summary');
    expect(await summary.textContent()).toBe('Compare with Pistols');
    const before = await page.evaluate(()=>window.comparisonWrites.length);
    await summary.scrollIntoViewIfNeeded();
    expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await summary.focus(); await page.keyboard.press('Enter');
    expect(await details.evaluate(node=>node.open)).toBe(true);
    expect(await details.locator('dd').first().textContent()).toBe('29.25 · 21.12 more');
    expect(await details.textContent()).toContain('Goes through to a second ship');
    await page.evaluate(()=>window.compareIsland.load());
    expect(await details.evaluate(node=>node.open)).toBe(true);
    expect(await page.evaluate(()=>window.comparisonWrites.length)).toBe(before);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await summary.focus(); await page.keyboard.press('Enter');
    expect(await details.evaluate(node=>node.open)).toBe(false);
    await page.keyboard.press('Escape');
    expect(await page.locator('dialog[open]').count()).toBe(0);
    await page.evaluate(()=>window.compareIsland.dispose());
  });
});
