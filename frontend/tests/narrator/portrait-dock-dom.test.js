import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('redocks the full combat caption after the active wave bar shrinks', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 320, height: 568});
    await page.evaluate(async () => {
      await window.g20Import('/src/ui/base.css');
      const {createNarratorCard} = await window.g20Import('/src/narrator/card.js');
      const root = document.createElement('main');
      document.body.append(root);
      function element(className, style, parent) {
        const node = document.createElement('div');
        node.className = className;
        node.style.cssText = style;
        parent.append(node);
        return node;
      }
      const visitorHud = element('pirate-hud', '', root);
      visitorHud.hidden = true;
      element('pirate-bar', '', visitorHud);
      const hud = element('pirate-hud', '', root);
      const bar = element('pirate-bar', 'position:fixed;top:93px;left:12px;width:296px;height:243px', hud);
      const attack = element('pirate-musket', 'position:fixed;top:346px;right:14px;width:120px;height:56px', hud);
      element('touch-stick-group', 'position:fixed;left:18px;bottom:82px;width:110px;height:141px', root);
      const card = createNarratorCard(root);
      card.element.style.setProperty('--narrator-dock-enabled', '1');
      card.show({id: 'wave', text: 'Watch the incoming pirate ships. Hold the island’s defenses at the shoreline and keep the captains clear of incoming shots until their ships turn away from the harbor.'});
      window.dockFixture = {attack, bar, card};
    });
    expect(await page.locator('.narrator-card.is-combat-fallback').count()).toBe(1);
    await page.evaluate(() => {
      const {bar, attack} = window.dockFixture;
      bar.style.height = '127px';
      attack.style.top = '231px';
    });
    await page.locator('.narrator-card.is-combat-docked').waitFor();
    const safe = await page.evaluate(() => {
      const {attack, bar, card} = window.dockFixture;
      const panel = card.element.getBoundingClientRect();
      const skip = card.element.querySelector('button').getBoundingClientRect();
      const clear = panel.top > attack.getBoundingClientRect().bottom && panel.top > bar.getBoundingClientRect().bottom;
      card.dispose();
      return {clear, bottom: panel.bottom, width: skip.width, height: skip.height};
    });
    expect(safe).toMatchObject({clear: true, width: 44, height: 44});
    expect(safe.bottom).toBeLessThanOrEqual(568);
  });
});
