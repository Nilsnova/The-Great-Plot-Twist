import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

async function mount(page) {
  await page.evaluate(async () => {
    for (const path of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css', '/src/ui/devices.css']) await window.g20Import(path);
    localStorage.clear();
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    window.hudEvents = await window.g20Import('/src/core/events.js');
    window.hudMenu = await window.g20Import('/src/shell/menu-extras.js');
    const game = document.createElement('main');game.id = 'game';document.body.append(game);
    const canvas = document.createElement('canvas');canvas.tabIndex = 0;game.append(canvas);
    window.hudHasIsland = true;
    window.referenceHud = createHud(game, {start() {}, focus() {canvas.focus();}, menu() {}, hasIsland: () => window.hudHasIsland});
    window.referenceHud.setCoinSource('island');window.referenceHud.setCoins(7180);
    window.referenceHud.start();await document.fonts.ready;
  });
}

it('shows truthful wave labels while preserving confirmed coins and captain Menu context', async () => {
  await evaluate.withPage(async page => {
    await mount(page);
    const result = await page.evaluate(() => {
      const hud = window.referenceHud, text = () => document.querySelector('.hud-wave-value').textContent;
      hud.setCaptainLevel(3);hud.update(null, {waveStatus: {bestWave: 40, currentWave: null}});
      const best = text(), menu = window.hudMenu.menuStatus();
      hud.setCaptain({account: {state: 'signed_in'}, captain: {coins: 999}});
      hud.update(null, {waveStatus: {bestWave: 40, currentWave: 41}});const running = text();
      window.hudEvents.emit({type: 'wave_finished', survived: true, wave: 41});
      hud.update(null, {waveStatus: {bestWave: 40, currentWave: null}});const unconfirmed = text();
      hud.update(null, {waveStatus: {bestWave: 41, currentWave: null}});
      const out = {best, running, unconfirmed, confirmed: text(), menu,
        coins: document.querySelector('.hud-coins-value').textContent, label: document.querySelector('.hud-coins').getAttribute('aria-label'),
        captainChip: !!document.querySelector('.hud-captain')};
      hud.dispose();return out;
    });
    expect(result).toMatchObject({best: 'Best wave 40', running: 'Wave 41', unconfirmed: 'Best wave 40', confirmed: 'Best wave 41',
      coins: '🪙 7,180', label: '7,180 coins · Best won wave 41', captainChip: false});
    expect(result.menu).toContain('Captain level 3');
  });
});

it('hides Goals only temporarily, applies real progress, and preserves the folded preference', async () => {
  await evaluate.withPage(async page => {
    await mount(page);
    await page.locator('.quest-fold').click();
    const result = await page.evaluate(() => {
      const hud = window.referenceHud, strip = document.querySelector('.quest-strip');
      const key = 'tgpt:quests:folded', before = localStorage.getItem(key);
      hud.setManaging(true);const hidden = strip.hidden;
      window.hudEvents.emit({type: 'island_built', kind: 'cannon'});
      window.hudEvents.emit({type: 'wave_finished', survived: true, wave: 1});
      hud.update(null, {managing: true});
      const during = {hidden: strip.hidden, folded: strip.dataset.folded, preference: localStorage.getItem(key), done: hud.quests.done};
      hud.setManaging(false);
      const out = {before, hidden, during, after: {hidden: strip.hidden, folded: strip.dataset.folded, preference: localStorage.getItem(key), done: hud.quests.done}};
      hud.dispose();return out;
    });
    expect(result.before).toBe('1');expect(result.hidden).toBe(true);
    expect(result.during).toEqual({hidden: true, folded: 'true', preference: '1', done: 2});
    expect(result.after).toEqual({hidden: false, folded: 'true', preference: '1', done: 2});
  });
});

it('preserves an unfolded hint and restores only the normal currently available Goals view', async () => {
  await evaluate.withPage(async page => {
    await mount(page);
    await page.locator('.quest-item[data-current=true]').click();
    const result = await page.evaluate(() => {
      const hud = window.referenceHud, strip = document.querySelector('.quest-strip'), hint = document.querySelector('.quest-hint');
      const before = hint.textContent;hud.setManaging(true);
      const hidden = strip.hidden;hud.setManaging(false);
      const restored = {shown: !strip.hidden, hint: !hint.hidden && hint.textContent === before, folded: strip.dataset.folded, preference: localStorage.getItem('tgpt:quests:folded')};
      hud.setManaging(true);window.hudHasIsland = false;hud.setManaging(false);
      const noIsland = strip.hidden;hud.dispose();return {hidden, restored, noIsland};
    });
    expect(result).toEqual({hidden: true, restored: {shown: true, hint: true, folded: 'false', preference: null}, noIsland: true});
  });
});

it('removes focus from suppressed Goals and keeps unknown values distinct from a real zero', async () => {
  await evaluate.withPage(async page => {
    await mount(page);await page.locator('.quest-fold').focus();
    const result = await page.evaluate(() => {
      const hud = window.referenceHud;hud.update(null, {managing: true, waveStatus: {bestWave: null, currentWave: null}});
      const unknown = document.querySelector('.hud-wave-value').textContent;
      const focusedCanvas = document.activeElement.tagName === 'CANVAS';
      hud.setCoins(NaN);const coins = document.querySelector('.hud-coins-value').textContent;
      hud.update(null, {managing: false, waveStatus: {bestWave: 0, currentWave: null}});
      const zero = document.querySelector('.hud-wave-value').textContent;
      hud.update(null, {});const legacyCoins = document.querySelector('.hud-coins').textContent;
      hud.dispose();return {unknown, focusedCanvas, coins, zero, legacyCoins};
    });
    expect(result).toEqual({unknown: 'Best wave …', focusedCanvas: true, coins: '🪙 7,180', zero: 'Best wave 0', legacyCoins: '🪙 7,180'});
  });
});

it('keeps large confirmed balances, Menu and restored Goals clear at desktop and phone sizes', async () => {
  await evaluate.withPage(async page => {
    await mount(page);
    for (const [width, height] of [[1280, 720], [375, 812], [320, 568]]) {
      await page.setViewportSize({width, height});
      for (const coins of [7180, 2147483647]) {
        await page.evaluate(coins => {
          window.referenceHud.setCoins(coins);window.referenceHud.update(null, {managing: false, waveStatus: {bestWave: 40, currentWave: null}});
        }, coins);
        await page.waitForFunction(() => document.querySelector('.quest-strip').getBoundingClientRect().top >= document.querySelector('.hud-coins').getBoundingClientRect().bottom);
        const out = await page.evaluate(() => {
          const purse = document.querySelector('.hud-coins'), menu = document.querySelector('.hud-menu'), strip = document.querySelector('.quest-strip');
          const r = purse.getBoundingClientRect(), m = menu.getBoundingClientRect(), q = strip.getBoundingClientRect();
          const text = document.createRange();text.selectNodeContents(document.querySelector('.hud-coins-value'));const t = text.getBoundingClientRect();
          return {left: r.left, right: r.right, menuLeft: m.left, menuRight: m.right, menuWidth: m.width, menuHeight: m.height,
            purseBottom: r.bottom, stripTop: q.top, textFits: t.left >= r.left && t.right <= r.right && t.bottom <= r.bottom,
            font: parseFloat(getComputedStyle(document.querySelector('.hud-wave')).fontSize), overflow: document.documentElement.scrollWidth > innerWidth};
        });
        expect(out.left).toBeGreaterThanOrEqual(8);expect(out.right + 8).toBeLessThanOrEqual(out.menuLeft);
        expect(out.menuRight).toBeLessThanOrEqual(width - 8);expect(out.menuWidth).toBeGreaterThanOrEqual(44);expect(out.menuHeight).toBeGreaterThanOrEqual(44);
        expect(out.stripTop).toBeGreaterThanOrEqual(out.purseBottom);expect(out.textFits).toBe(true);expect(out.font).toBeGreaterThanOrEqual(17);expect(out.overflow).toBe(false);
      }
    }
    await page.evaluate(() => window.referenceHud.dispose());
  });
});
