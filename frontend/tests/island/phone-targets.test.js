// B2: real island buttons remain thumb-sized, reachable and wired at phone/desktop widths.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
const sizes = [{width:375,height:812}, {width:390,height:844}, {width:1280,height:720}];

async function render(page, size, battle = false) {
  await page.setViewportSize(size);
  await page.evaluate(async battle => {
    await window.g20Import('/src/ui/kit/kit.css');
    const {createIslandUi} = await window.g20Import('/src/island/ui.js');
    const {buildCardModel} = await window.g20Import('/src/island/card-model.js');
    const {unlocksFor} = await window.g20Import('/src/island/td-rules.js');
    window.phoneCalls = [];
    const ui = window.phoneUi = createIslandUi({container:document.body});
    ui.visit({text:"Captain Longname's game",label:'Players & invite',action:'lobby'}, () => window.phoneCalls.push('lobby'));
    ui.buildCard(buildCardModel({spotId:'cannon_1',slot:'tower',
      spot:{id:'cannon_1',kind:'cannon',built:true,level:1,cost:30},
      coins:100,unlocks:unlocksFor(10),movable:true,battle}), {
      hire:() => window.phoneCalls.push('hire'), move:() => window.phoneCalls.push('move'),
      demolish:() => window.phoneCalls.push('demolish'),
    });
  }, battle);
}

it.each(sizes)('keeps island actions at least 44px and usable at $width x $height', async size => {
  await browser.withPage(async page => {
    await render(page, size);
    for (const selector of ['.island-hire','.island-move','.island-teardown']) {
      const button = page.locator(selector);
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      await button.focus(); expect(await button.evaluate(node => node === document.activeElement)).toBe(true);
      await button.click();
    }
    expect(await page.evaluate(() => {
      const card = document.querySelector('dialog[open]');
      return card.scrollWidth <= card.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.locator('dialog[open]').count()).toBe(0);
    const lobby = page.locator('.island-visit button'), box = await lobby.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    await lobby.click();
    expect(await page.evaluate(() => window.phoneCalls)).toEqual(['hire','move','demolish','lobby']);
  });
});

it('preserves disabled Move and Tear down actions during a wave', async () => {
  await browser.withPage(async page => {
    await render(page, sizes[0], true);
    for (const selector of ['.island-move','.island-teardown']) {
      const button = page.locator(selector);
      expect(await button.isDisabled()).toBe(true);
      await button.evaluate(node => node.click());
    }
    expect(await page.evaluate(() => window.phoneCalls)).toEqual([]);
  });
});
