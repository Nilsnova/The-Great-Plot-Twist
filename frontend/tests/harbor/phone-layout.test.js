// B2: actual Harbor/menu geometry and controls at both phone sizes plus desktop, with controlled data.
import {expect,it} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from '../g20-browser.js';
import {PHONE_SCENES} from './phone-fixtures.js';
const browser = browserHarness();
const sizes = [{width:375,height:812},{width:390,height:844},{width:1280,height:720}];
const cases = PHONE_SCENES.flatMap(name => sizes.map(size => ({name,...size})));

async function open(page, name, size) {
  await page.setViewportSize(size);
  await page.evaluate(async name => {
    const {openPhoneFixture} = await window.g20Import('/tests/harbor/phone-fixtures.js');
    await openPhoneFixture(name);
  },name);
  const ready = {pause:'.shell-menu',settings:'.preferences',credits:'.shell-credits',market:'.harbor-asset',match:'.harbor-match'};
  await page.locator(ready[name] ?? 'dialog[open]').last().waitFor();
}

it.each(cases)('$name fits and has readable targets at $width x $height', async ({name,...size}) => {
  await browser.withPage(async page => {
    await open(page,name,size);
    const result = await page.locator('dialog[open]').evaluate(root => {
      const box = root.getBoundingClientRect();
      const controls = [...root.querySelectorAll('button,a[href],input')].filter(node => node.getClientRects().length);
      const small = controls.filter(node => {
        const target = node.matches('input[type=radio]') ? node.closest('label') : node;
        const b=target.getBoundingClientRect();return b.width < 44 || b.height < 44;
      }).map(node => node.getAttribute('aria-label') ?? node.textContent.trim());
      const clipped = [...root.querySelectorAll('.harbor-choice')].filter(button => {
        const b=button.getBoundingClientRect(), range=document.createRange();range.selectNodeContents(button);
        return [...range.getClientRects()].some(text => text.left < b.left || text.right > b.right);
      }).map(node => node.textContent);
      const fragmented = [];
      for (const button of root.querySelectorAll('.harbor-match .harbor-sides .harbor-choice')) {
        for (const node of button.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          for (const word of node.textContent.matchAll(/\S+/g)) {
            const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
            if (range.getClientRects().length > 1) fragmented.push(word[0]);
          }
        }
      }
      return {bounded:box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        overflow:root.scrollWidth > root.clientWidth + 1,small,clipped,fragmented};
    });
    if (process.env.B2_HARBOR_CAPTURE) {
      const folder=process.env.B2_HARBOR_CAPTURE;await mkdir(folder,{recursive:true});
      await page.screenshot({path:`${folder}/${name}-${size.width}x${size.height}.png`});
      await writeFile(`${folder}/${name}-${size.width}x${size.height}.json`,JSON.stringify(result,null,2));
    }
    expect(result).toEqual({bounded:true,overflow:false,small:[],clipped:[],fragmented:[]});
    await page.keyboard.press('Tab');
    expect(await page.locator('dialog[open]').evaluate(root => root.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    if (name === 'credits') await page.locator('.preferences').waitFor();
    else if (name === 'settings') await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
    else expect(await page.locator('dialog[open]').count()).toBe(0);
  });
});

it('opens each unlocked island Harbor stand once without changing its identifier', async () => {
  await browser.withPage(async page => {
    await open(page,'harbor',sizes[0]);
    for (const id of ['market','match','weather']) await page.locator(`[data-stall=${id}] button`).click();
    expect(await page.evaluate(() => window.phoneFixture.calls.opened)).toEqual(['market','match','weather']);
  });
});

it.each(['market','match'])('%s selections stay local until one explicit confirmation', async name => {
  await browser.withPage(async page => {
    await open(page,name,sizes[0]);
    const item=page.locator(name === 'market' ? '.harbor-asset' : '.harbor-match').first();
    const confirm=item.locator('.harbor-confirm');expect(await confirm.isDisabled()).toBe(true);
    const coinRows=await item.locator('.harbor-stakes [data-stake]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    expect(new Set(coinRows).size).toBe(1);
    await item.locator('.harbor-sides [data-side]').first().click();
    await item.locator('[data-stake="10"]').click();
    const read=()=>page.evaluate(name => (name === 'market' ? window.phoneFixture.adapter.requests : window.phoneFixture.adapter.calls)
      .filter(row => row[0] === (name === 'market' ? 'place' : 'stake')),name);
    expect(await read()).toEqual([]);expect(await confirm.isEnabled()).toBe(true);
    await confirm.click();expect(await read()).toHaveLength(1);
    const sent=(await read())[0][1];expect(name === 'market' ? sent.stake : sent.amount).toBe(10);
  });
});

it('closes pause before selecting Harbor and saves preferences only in the test browser', async () => {
  await browser.withPage(async page => {
    await open(page,'pause',sizes[0]);
    await page.getByRole('button',{name:'Harbor',exact:true}).click();
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.phoneFixture.calls.opened)).toEqual(['harbor']);
    await page.evaluate(() => window.phoneFixture.card.openSettings());
    await page.locator('.preferences').waitFor();
    await page.locator('[data-preference=quality] label').filter({hasText:'Low'}).click();
    expect(await page.locator('[data-preference=quality] input[value=low]').isChecked()).toBe(true);
    expect(await page.locator('.preferences-status').textContent()).toContain('Saved in this browser.');
  });
});

it.each(sizes.slice(0,2))('keeps every help page reachable at $width x $height', async size => {
  await browser.withPage(async page => {
    await open(page,'help',size);
    const count=await page.evaluate(async () => (await window.g20Import('/src/tutorial/pages.js')).TUTORIAL_PAGES.length);
    const seen=[];
    for (let i=0;i<count;i++) {
      const card=page.locator('.tutorial-card[open]');seen.push(await card.getAttribute('data-page'));
      expect(await card.evaluate(root => root.scrollWidth <= root.clientWidth)).toBe(true);
      const next=card.locator('.tutorial-next');await next.scrollIntoViewIfNeeded();
      expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await next.click();
    }
    expect(new Set(seen).size).toBe(count);
    expect(await page.locator('dialog[open]').count()).toBe(0);
  });
});
