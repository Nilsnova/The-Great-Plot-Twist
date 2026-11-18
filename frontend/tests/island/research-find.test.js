import {join} from 'node:path';
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it.each([
  {device: 'desktop', viewport: {width: 1280, height: 720}, isMobile: false, hasTouch: false},
  {device: 'phone', viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true},
  {device: 'small-phone', viewport: {width: 320, height: 640}, isMobile: true, hasTouch: true},
])('finds a confirmed research defense and blocks stale Find on $device', async ({device, ...context}) => {
  await browser.withPage(async (page, base) => {
    const press = button => context.hasTouch ? button.tap() : button.press('Enter');
    const take = async stage => {
      if (!process.env.SHOTS_DIR) return;
      await page.locator('.hud-arrival').waitFor({state: 'hidden'});
      await page.waitForFunction(() => !document.querySelector('.u-toast'));
      await page.screenshot({path: join(process.env.SHOTS_DIR, `${device}-research-${stage}.png`)});
    };
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1');
      localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.goto(`${base}/?islands=fake&fakeflags=more_tower_spots`);
    await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
    await page.waitForFunction(() => typeof window.g20Import === 'function');
    await press(page.locator('#play'));
    await press(page.getByRole('button', {name: 'Create a game', exact: true}));
    await press(page.getByRole('button', {name: 'Start', exact: true}));
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    const expected = await page.evaluate(async () => {
      const {island} = window.__island;
      const {setPreferences} = await window.g20Import('/src/settings/preferences.js');
      const {checkMove, positionsOf} = await window.g20Import('/src/island/placement.js');
      setPreferences({tutorials: false, narrator: false, reducedMotion: true});
      island.dev.setWaveBest(16); island.dev.setCoins(5000); await island.refreshDefended();
      for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_8', 'cannon']]) {
        if (!(await island.api.build({spot, kind})).ok) throw new Error(`Build failed for ${spot}`);
      }
      if (!(await island.api.upgrade({spot: 'cannon_8'})).ok || !(await island.api.research({branch: 'cannon'})).ok) throw new Error('Research fixture failed');
      await island.refreshDefended();
      const spots = positionsOf(island.island.spots), {x, z} = spots.cannon_8;
      const moved = [{x, z: z + 3}, {x: x - 3, z}].find(at => checkMove('cannon_8', at.x, at.z, spots).ok);
      if (!moved || !(await island.api.move({spot: 'cannon_8', ...moved})).ok) throw new Error('Move fixture failed');
      await island.refreshDefended();
      const snapshot = island.island;
      window.findWrites = [];
      for (const method of ['build', 'upgrade', 'move', 'research', 'specialise']) {
        const send = island.api[method];
        island.api[method] = (...args) => { window.findWrites.push(method); return send(...args); };
      }
      island.pick('island_techhub');
      return snapshot;
    });

    const tech = page.getByRole('dialog', {name: 'Tech hub'});
    const picker = tech.getByRole('combobox', {name: 'Defense to find'});
    const find = tech.getByRole('button', {name: 'Find Cannon #8', exact: true});
    if (device === 'small-phone') {
      await press(tech.locator('[data-option="cannon-1"]'));
      expect(await tech.locator('.island-tech-detail strong').textContent()).toBe('Tower skills');
    }
    expect(await picker.locator('option').allTextContents()).toEqual(['Cannon #1', 'Cannon #8']);
    await picker.selectOption('cannon_8');
    if (!context.hasTouch) {
      await picker.focus(); await page.keyboard.press('Tab');
      expect(await find.evaluate(element => document.activeElement === element)).toBe(true);
    }
    expect(await picker.inputValue()).toBe('cannon_8');
    const stale = await find.elementHandle();
    await page.evaluate(() => window.__island.island.setBattle(true));
    expect(await picker.count()).toBe(0);
    await stale.evaluate(element => element.click());
    expect(await tech.isVisible()).toBe(true);
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    await page.evaluate(async () => {
      const {island} = window.__island;
      island.setBattle(false);
      island.visit('FR3ND');
      await island.load();
      island.openTechHub();
    });
    expect(await tech.isVisible()).toBe(true);
    expect(await picker.count()).toBe(0);
    await page.evaluate(async () => { await window.__island.island.sailHome(); window.__island.island.openTechHub(); });
    await stale.evaluate(element => element.click());
    expect(await tech.isVisible()).toBe(true);
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);

    await find.focus();
    await page.evaluate(() => window.__island.island.refreshDefended());
    // A concurrent island refresh can replace a control between resolving a locator and reading its box.
    const afterRefresh = await tech.evaluate(panel => {
      const button = panel.querySelector('[data-focus="tech-find-defense"]');
      const select = panel.querySelector('[data-focus="tech-find-choice"]');
      return {
        focused: document.activeElement === button, selected: select?.value,
        buttonHeight: button?.getBoundingClientRect().height ?? 0,
        selectHeight: select?.getBoundingClientRect().height ?? 0,
        fits: panel.scrollWidth <= panel.clientWidth,
      };
    });
    expect(afterRefresh).toMatchObject({focused: true, selected: 'cannon_8', fits: true});
    expect(afterRefresh.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(afterRefresh.selectHeight).toBeGreaterThanOrEqual(44);
    await take('tech');
    await press(find);

    const selection = page.getByRole('region', {name: 'Selected building'});
    await selection.waitFor();
    expect(await tech.count()).toBe(0);
    expect(await selection.getByText('Level 2', {exact: true}).isVisible()).toBe(true);
    expect(await selection.getByRole('button', {name: 'Close', exact: true})
      .evaluate(element => document.activeElement === element)).toBe(true);
    const result = await page.evaluate(() => ({anchor: window.__island.island.selection,
      snapshot: window.__island.island.island, writes: window.findWrites}));
    const spot = expected.spots.find(({id}) => id === 'cannon_8');
    expect(result.anchor).toMatchObject({spotId: spot.id, kind: 'cannon', level: 2, x: spot.x, z: spot.z});
    expect(result.snapshot.spots).toEqual(expected.spots);
    expect(result.snapshot.coins).toBe(expected.coins);
    expect(result.writes).toEqual([]);
    if (process.env.SHOTS_DIR) await page.waitForTimeout(300);
    await take('selected');

    if (!context.hasTouch) {
      await page.evaluate(() => window.__island.island.openTechHub());
      const beforeReservation = await find.elementHandle();
      const reserved = await page.evaluate(async () => {
        const {island} = window.__island;
        const answer = await island.ringBell();
        island.openTechHub();
        return answer.ok && !!island.flow.current;
      });
      expect(reserved).toBe(true);
      expect(await picker.count()).toBe(0);
      await beforeReservation.evaluate(element => element.click());
      expect(await tech.isVisible()).toBe(true);
      expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    }
  }, context);
}, 60000);
