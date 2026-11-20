import {join} from 'node:path';
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it.each([
  {device: 'desktop', viewport: {width: 1280, height: 720}, isMobile: false, hasTouch: false},
  {device: 'phone', viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true},
])('shows the capstone tradeoff before refusal, acceptance and separate equip on $device', async ({device, ...context}) => {
  await browser.withPage(async (page, base) => {
    const press = button => context.hasTouch ? button.tap() : button.press('Enter');
    const take = async stage => {
      if (!process.env.SHOTS_DIR) return;
      await page.locator('.hud-arrival').waitFor({state: 'hidden'});
      await page.waitForFunction(() => !document.querySelector('.u-toast'));
      await page.screenshot({path: join(process.env.SHOTS_DIR, `${device}-capstone-${stage}.png`)});
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
    await page.evaluate(async () => {
      const {island} = window.__island, {setPreferences} = await window.g20Import('/src/settings/preferences.js');
      setPreferences({tutorials: false, narrator: false, reducedMotion: true});
      island.dev.setWaveBest(25); island.dev.setCoins(5000); await island.refreshDefended();
      const steps = [island.api.build({spot: 'cannon_1', kind: 'cannon'}), island.api.build({spot: 'cannon_8', kind: 'cannon'})];
      if (!(await Promise.all(steps)).every(answer => answer.ok)) throw new Error('Build fixture failed');
      for (const step of [{branch: 'cannon'}, {branch: 'cannon', tier: 2, choice: 'rapid_2'}, {branch: 'cannon', tier: 3, choice: 'broadside'}]) {
        if (!(await island.api.research(step)).ok) throw new Error('Research fixture failed');
      }
      for (const [spot, spec] of [['cannon_1', 'broadside'], ['cannon_8', 'rapid']]) {
        if (!(await island.api.specialise({spot, spec})).ok) throw new Error('Equip fixture failed');
      }
      island.dev.setCoins(2000); await island.refreshDefended();
      window.capstoneAnswers = [];
      const research = island.api.research;
      island.api.research = async input => {
        const answer = await research(input); window.capstoneAnswers.push(answer.ok ? 'accepted' : answer.code); return answer;
      };
      window.capstoneState = () => ({coins: island.island.coins, choice: island.campaign.research.tiers.cannon.tier3,
        specs: island.island.spots.filter(row => ['cannon_1', 'cannon_8'].includes(row.id)).map(row => [row.id, row.spec ?? null])});
      island.pick('cannon_1');
    });
    const equipped = page.getByRole('button', {name: 'Broadside, your skill', exact: true});
    expect(await equipped.isDisabled()).toBe(true);
    expect(await equipped.locator('.island-spec-cost').count()).toBe(0);

    await page.evaluate(() => window.__island.island.openTechHub());
    const tech = page.getByRole('dialog', {name: 'Tech hub'});
    if (context.hasTouch) await press(tech.locator('.island-branch-tab', {hasText: 'Cannon'}));
    await press(tech.locator('[data-option="grapeshot"]'));
    const compare = tech.getByRole('region', {name: 'Capstone comparison'});
    const read = selector => compare.locator(selector).allTextContents();
    expect(await read('.island-capstone-choice strong')).toEqual(['Broadside', 'Grapeshot']);
    expect(await read('.island-capstone-price')).toEqual(['Researched', 'Research · 🪙 630']);
    expect(await read('.island-capstone-loss')).toEqual(['A switch removes Broadside from #1.']);
    expect(await read('.island-capstone-equip')).toEqual(['Equip the new capstone for 🪙 600 per defense after research.']);
    const switchButton = tech.getByRole('button', {name: 'Change to it Grapeshot, 🪙 630', exact: true});
    const switchTarget = '[data-focus="research-grapeshot"]';
    // Island refreshes replace the action inside the dialog, so look up and measure it together.
    const layout = await tech.evaluate((dialog, target) => ({
      hitHeight: dialog.querySelector(target)?.getBoundingClientRect().height,
      overflow: dialog.scrollWidth > dialog.clientWidth,
    }), switchTarget);
    expect(layout.hitHeight).toBeGreaterThanOrEqual(44);
    expect(layout.overflow).toBe(false);
    await switchButton.focus();
    await page.evaluate(() => window.__island.island.refreshDefended());
    expect(await tech.evaluate((dialog, target) => document.activeElement === dialog.querySelector(target), switchTarget)).toBe(true);
    await take('compare');

    await page.evaluate(() => window.__island.island.dev.setCoins(5));
    await press(switchButton);
    await tech.locator('.island-message[role="alert"]').getByText(/This costs 630 coins/).waitFor();
    expect(await switchButton.isDisabled()).toBe(true);
    expect(await page.evaluate(() => window.capstoneState())).toEqual({coins: 5, choice: 'broadside', specs: [['cannon_1', 'broadside'], ['cannon_8', 'rapid']]});
    expect(await read('.island-capstone-loss')).toEqual(['A switch removes Broadside from #1.']);
    await take('refused');

    await page.evaluate(async () => { const {island} = window.__island; island.dev.setCoins(2000); await island.refreshDefended(); });
    await press(switchButton);
    await page.waitForFunction(() => window.capstoneState().choice === 'grapeshot');
    expect(await page.evaluate(() => window.capstoneState())).toEqual({coins: 1370, choice: 'grapeshot', specs: [['cannon_1', null], ['cannon_8', 'rapid']]});
    expect(await read('.island-capstone-choice strong')).toEqual(['Grapeshot', 'Broadside']);
    expect(await read('.island-capstone-loss')).toEqual(['Grapeshot is equipped on 0 buildings.']);
    expect(await tech.getByRole('button', {name: 'Researched', exact: true}).isDisabled()).toBe(true);
    expect(await page.evaluate(() => window.capstoneAnswers)).toEqual(['insufficient_funds', 'accepted']);
    await take('accepted');

    await page.evaluate(() => window.__island.island.pick('cannon_1'));
    const buy = page.getByRole('button', {name: 'Grapeshot, 🪙 600', exact: true});
    await press(buy);
    await page.waitForFunction(() => window.capstoneState().specs[0][1] === 'grapeshot');
    expect(await page.evaluate(() => window.capstoneState())).toEqual({coins: 770, choice: 'grapeshot', specs: [['cannon_1', 'grapeshot'], ['cannon_8', 'rapid']]});
    const nowEquipped = page.getByRole('button', {name: 'Grapeshot, your skill', exact: true});
    expect(await nowEquipped.isDisabled()).toBe(true);
    expect(await nowEquipped.locator('.island-spec-cost').count()).toBe(0);
  }, context);
}, 60000);
