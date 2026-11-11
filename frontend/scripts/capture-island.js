// Captures your island with the fake server (?islands=fake): Play lands on the island, the markers, a
// build card, the bell countdown and the invite card, at 1280x720 and 375x812.
//   node scripts/capture-island.js [output folder]     (default captures/island)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/island';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await settle(page); await page.screenshot({path: `${out}/${name}.png`}); console.log(`${out}/${name}.png`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, 1.03, z); g.view.setPlace('home_islet', g.player.position); }, [x, z]);
try {
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    await page.setViewportSize({width, height});
    await page.goto(`${env.url}/?islands=fake`);
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('.shell-screen[open]').waitFor();
    await page.locator('#play').click();
    // Lore intro, then the island arrival cutscene, then the goal card.
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.goal-card[open]'), null, {timeout: 30000});
      if (await page.locator('.goal-card[open]').count()) break;
      if (i === 1) await shot(`arrival-cutscene-${width}`);
      await page.getByRole('button', {name: 'Skip', exact: true}).click();
      await page.waitForTimeout(300);
    }
    await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]'));
    await page.evaluate(() => { window.__island.settings.hour = 11; });
    await page.waitForTimeout(500);
    await stand(0, 0);
    await shot(`island-markers-${width}`);
    await stand(-11, -12.5);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card[open]').waitFor();
    await shot(`build-card-${width}`);
    await page.locator('.island-card[open] .island-card-body .kit-button').click();
    await page.waitForFunction(() => window.__island.island.island?.spots.find(spot => spot.id === 'cannon_1').built);
    await shot(`built-cannon-${width}`);
    // Short of coins: 70 are left after the cannon, so set 20 to show the disabled card.
    await page.evaluate(async () => { const island = window.__island.island; island.dev.setCoins(20); await island.load(); });
    await stand(6.5, -4.8);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card[open]').waitFor();
    await shot(`build-card-house-${width}`);
    await page.keyboard.press('Escape');
    await stand(8, 11.4);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card-bell[open]').waitFor();
    await shot(`bell-card-${width}`);
    await page.locator('.island-card[open] .island-card-body .kit-button').click();
    await page.locator('.island-banner:not([hidden])').waitFor();
    await page.waitForTimeout(2200);
    await shot(`countdown-${width}`);
    await stand(-5.6, 7.2);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card-invite[open]').waitFor();
    await shot(`invite-card-${width}`);
    await page.keyboard.press('Escape');
    // A visit by code: the friend's buildings, no markers, the visit banner.
    await page.evaluate(async () => { const island = window.__island.island; island.visit('ISLE-FR3ND'); await island.load(); });
    await stand(0, -9);
    await shot(`visit-friend-${width}`);
    await page.evaluate(() => window.__island.island.sailHome());
    await page.keyboard.press('KeyM');
    await page.locator('.sea-chart[open]').waitFor();
    await shot(`sea-chart-${width}`);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text)), [], 'No browser errors');
  console.log('external requests:', env.external.length);
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  console.log(await page.evaluate(() => ({place: window.__island?.world.current?.id, player: window.__island?.player.position, dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.className), active: document.activeElement?.tagName + '.' + document.activeElement?.className, zones: window.__island?.world.current?.zones.map(zone => zone.id).join()})).catch(() => null));
  throw error;
} finally { await env.close(); }
