import { expect, it } from 'vitest';
import { browserHarness } from '../g20-browser.js';

const browser = browserHarness();

it.each([[320, 568, false], [375, 812, true]])('gives the combat Guide its own touch targets at %s×%s', async (width, height, large) => {
  await browser.withPage(async (firstPage, origin) => {
    const context = await firstPage.context().browser().newContext({ viewport: {width, height}, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.route(origin + '/coach', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>',
      }));
      await page.goto(origin + '/coach');
      await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
      await page.waitForFunction(() => typeof window.g20Import === 'function');
      await page.evaluate(async large => {
        for (const file of ['base', 'styles', 'readability', 'devices']) await window.g20Import(`/src/ui/${file}.css`);
        const {createHud} = await window.g20Import('/src/ui/hud.js');
        const {createWaveHud} = await window.g20Import('/src/pirates/hud.js');
        const {createCoach} = await window.g20Import('/src/tutorial/coach.js');
        const {createNarratorCard} = await window.g20Import('/src/narrator/card.js');
        const {createTouchControls} = await window.g20Import('/src/controls/touch.js');
        const game = document.createElement('main'), canvas = document.createElement('canvas');
        canvas.tabIndex = 0;
        game.append(canvas); document.body.append(game);
        const focus = () => canvas.focus();
        const hud = createHud(game, {start() {}, focus, menu() {}, hasIsland: () => true});
        hud.setCoinSource('island'); hud.setCoins(399270); hud.start();
        hud.update(null, {waveStatus: {bestWave: 0, currentWave: 1}});
        const touch = createTouchControls(game, {setVirtual() {}, press() {}}, {});
        touch.update('island_bell', true, 'Ring the harbor bell', true);
        const wave = createWaveHud({container: game});
        wave.bar({wave: 1, shipsLeft: 3, boardersLeft: 1, islandHp: 70, maxIslandHp: 100});
        wave.goalHint(true);
        wave.musket({ready: true, share: 1, label: 'Musket'});
        wave.danger({key: 'heart-critical', title: 'Heart under fire', line: 'Stop the ships firing at the heart.', critical: true});
        const narrator = createNarratorCard(game, {large: () => large});
        if (large) narrator.show({id: 'danger', text: 'Boarders ashore! Hold them before the heart.'});
        window.coachActions = [];
        const coach = createCoach(game, {parent: game.querySelector('.hud-right'), focusGame: focus,
          onSkipStep: () => coachActions.push('step'), onSkipAll: () => {coachActions.push('all'); coach.hide();}});
        const view = {step: 'Step 6 of 7', title: 'Fire your musket', caption: 'Click or tap toward a ship, or press F, to fire your musket.', keys: 'F'};
        coach.show(view);
        window.beginCombatCoach = () => coach.show({...view, inCombat: true});
        await document.fonts.ready;
      }, large);

      const guide = page.getByRole('button', {name: 'Guide', exact: true});
      await expect.poll(() => guide.isVisible()).toBe(false);
      expect(await page.getByRole('heading', {name: 'Fire your musket'}).isVisible()).toBe(true);
      await page.evaluate(() => beginCombatCoach());

      const assertClear = (target, selectors) => target.evaluate((node, selectors) => {
        const box = node.getBoundingClientRect(), hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
        return {minimum: box.width >= 44 && box.height >= 44, hit: node.contains(hit), clear: selectors.every(selector => {
          const other = document.querySelector(selector)?.getBoundingClientRect();
          return !other?.width || !other?.height || box.right <= other.left || box.left >= other.right
            || box.bottom <= other.top || box.top >= other.bottom;
        })};
      }, selectors);
      await expect.poll(() => assertClear(guide, ['.hud-coins', '.hud-menu', '.pirate-bar'])).toEqual({minimum: true, hit: true, clear: true});
      await guide.press('Enter');
      const panel = page.getByRole('region', {name: 'Fire your musket'});
      await expect.poll(() => assertClear(panel, ['.pirate-bar', '.pirate-musket', '.touch-stick-group', '.narrator-card'])).toEqual({minimum: true, hit: true, clear: true});
      expect(await guide.getAttribute('aria-expanded')).toBe('true');
      expect(await panel.evaluate(node => node === document.activeElement)).toBe(true);
      for (const [name, called] of [['Skip step', 'step'], ['Skip tutorial', 'all']]) {
        const action = panel.getByRole('button', {name, exact: true});
        await action.scrollIntoViewIfNeeded();
        await expect.poll(() => assertClear(action, ['.pirate-bar', '.pirate-musket', '.touch-stick-group'])).toEqual({minimum: true, hit: true, clear: true});
        await action.tap();
        expect(await page.evaluate(called => coachActions.at(-1) === called, called)).toBe(true);
      }
      expect(await guide.isVisible()).toBe(false);
      expect(await page.locator('canvas').evaluate(node => node === document.activeElement)).toBe(true);
    } finally {
      await context.close();
    }
  });
});
