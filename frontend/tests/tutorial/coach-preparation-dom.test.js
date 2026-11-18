import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('keeps every pre-wave guide action above the stick on a short phone', async () => {
  await browser.withPage(async (initial, origin) => {
    const context = await initial.context().browser().newContext({
      viewport: {width: 320, height: 568}, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.route(origin + '/coach-preparation', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>',
      }));
      await page.goto(origin + '/coach-preparation');
      await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
      await page.waitForFunction(() => typeof window.g20Import === 'function');

      const steps = await page.evaluate(async () => {
        for (const file of ['base', 'styles', 'readability', 'devices']) await window.g20Import(`/src/ui/${file}.css`);
        const {createHud} = await window.g20Import('/src/ui/hud.js');
        const {createCoach} = await window.g20Import('/src/tutorial/coach.js');
        const {createTouchControls} = await window.g20Import('/src/controls/touch.js');
        const {GUIDE_STEPS, guideStart, guideView} = await window.g20Import('/src/ui/first-quests.js');
        const game = document.createElement('main'); document.body.append(game);
        const hud = createHud(game, {start() {}, focus() {}, menu() {}, hasIsland: () => true});
        hud.setCoinSource('island'); hud.setCoins(100); hud.start(); hud.update(null, {});
        const touch = createTouchControls(game, {setVirtual() {}, press() {}}, {});
        touch.update(null, true);
        const coach = createCoach(game, {parent: game.querySelector('.hud-right')});
        window.showStep = index => {
          const step = GUIDE_STEPS[index];
          hud.setGuide(guideView({...guideStart(), step: index}));
          coach.show({step: `Step ${index + 1} of ${GUIDE_STEPS.length}`, title: step.label, caption: step.caption, keys: step.keys});
        };
        return GUIDE_STEPS.slice(0, 5).map((step, index) => ({index, title: step.label}));
      });
      const read = region => region.evaluate(panel => {
        const copy = panel.querySelector('.coach-caption');
        const stick = document.querySelector('.touch-stick').getBoundingClientRect();
        const hit = node => {
          const box = node.getBoundingClientRect();
          return box.height >= 44 && node.contains(document.elementFromPoint(box.x + box.width / 2, box.bottom - 5));
        };
        return {clearance: stick.top - panel.getBoundingClientRect().bottom,
          targetHits: [...panel.querySelectorAll('button')].map(hit), hint: !panel.querySelector('.coach-scroll-hint').hidden,
          available: copy.clientHeight, full: copy.scrollHeight, tabIndex: copy.tabIndex, font: getComputedStyle(copy).fontSize};
      });
      for (const {index, title} of steps) {
        await page.evaluate(index => showStep(index), index);
        const region = page.getByRole('region', {name: title});
        await expect.poll(async () => (await read(region)).clearance).toBeGreaterThanOrEqual(7.5);
        const measured = await read(region);
        const overflow = measured.full > measured.available + 1;
        expect(measured.targetHits).toEqual([true, true]);
        expect(measured.font).toBe('16px');
        expect(measured.hint).toBe(overflow);
        expect(measured.tabIndex).toBe(overflow ? 0 : -1);
        if (index === 0) expect(overflow).toBe(false);
        if (overflow) {
          const copy = region.locator('.coach-caption');
          await copy.focus();
          await page.keyboard.press('End');
          await expect.poll(() => copy.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 2)).toBe(true);
          expect((await read(region)).targetHits).toEqual([true, true]);
        }
      }
    } finally {await context.close();}
  });
});
