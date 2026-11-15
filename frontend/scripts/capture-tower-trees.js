// Captures the tower upgrade trees (decision D055) in the real game with the fake server (?islands=fake): the cards
// of a level-5 cannon (Drill to tier 2, Powder tier 1, so Powder's upper tiers are closed), a mortar (one tier) and a
// swivel-gun nest (fresh tree), and one of a level-3 cannon (the trunk still growing), at 1280x720 and 390x844.
//   node scripts/capture-tower-trees.js [output folder]     (default captures/tower-trees)
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/tower-trees';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const sizes = [[1280, 720], [390, 844]];
try {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  // The front door's cards until the player stands on the island (as scripts/capture-captain-tree.js).
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.waitForTimeout(400);
      await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]'));
  await page.evaluate(() => { window.__island.settings.hour = 11; });
  await page.evaluate(async () => {
    const island = window.__island.island;
    island.dev.setWaveBest(40); island.dev.setCoins(60000); await island.load();
    for (const [spot, kind, levels] of [['cannon_1', 'cannon', 4], ['cannon_2', 'mortar', 4], ['cannon_6', 'swivel', 4], ['cannon_5', 'cannon', 2]]) {
      await island.build(spot, kind);
      for (let level = 0; level < levels; level++) await island.upgrade(spot);
    }
    for (const [spot, path, tier] of [['cannon_1', 'a', 1], ['cannon_1', 'b', 1], ['cannon_1', 'a', 2], ['cannon_2', 'b', 1]]) await island.buyTree(spot, path, tier);
    island.ui.close();
  });
  for (const [width, height] of sizes) {
    await page.setViewportSize({width, height});
    for (const [spot, name, tap] of [['cannon_1', 'cannon-tree', null], ['cannon_1', 'cannon-tree-closed', 'b2'], ['cannon_2', 'mortar-tree', null],
      ['cannon_6', 'swivel-tree', null], ['cannon_5', 'cannon-level3', null]]) {
      await page.evaluate(id => { window.__island.island.ui.close(); window.__island.island.pick(id); }, spot);
      await page.locator('.island-card[open] .island-tree-step').first().waitFor();
      if (tap) await page.locator(`.island-card[open] .island-tree-step[data-step="${tap}"]`).click();
      await settle(page);
      const path = `${out}/${name}-${width}x${height}.png`;
      await page.screenshot({path});
      console.log(path);
    }
  }
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  console.log(await page.evaluate(() => ({dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.className), place: window.__island?.world?.current?.id})).catch(() => null));
  throw error;
} finally {
  await env.close?.();
}
