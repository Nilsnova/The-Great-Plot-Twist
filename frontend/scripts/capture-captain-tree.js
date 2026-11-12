// Captures the captain tree (docs/GAME-V3.md "Captain tree and roles") with the fake server (?islands=fake):
// the skill tree with fork nodes, the role choice card and the lobby with role icons, at 1280x800.
//   node scripts/capture-captain-tree.js [output folder]     (default captures/captain-tree)
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/captain-tree';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async (name, selector = null) => {
  await settle(page);
  const path = `${out}/${name}.png`;
  if (selector) await page.locator(selector).screenshot({path}); else await page.screenshot({path});
  console.log(path);
};
try {
  await page.setViewportSize({width: 1280, height: 800});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  // The front door's cards until the player stands on the island (as scripts/check-multiplayer.js).
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
  // Wave 20 won (10 points), captain level 3, a rich purse; two forks chosen on the Marksman path.
  await page.evaluate(async () => {
    const island = window.__island.island;
    island.dev.setWaveBest(20); island.dev.setCoins(2000); island.dev.setCaptain(3); await island.load();
    for (const skill of ['steady_aim', 'hot_shot', 'quick_hands', 'cutlass']) await island.learnSkill(skill);
  });
  await page.evaluate(() => window.__island.island.openCaptain('skills'));
  await page.locator('.island-card-captain[open] .island-tree').waitFor();
  await shot('01-skill-tree-forks', '.island-card-captain[open]');
  await page.locator('.island-card-captain[open] .island-branch-marksman').scrollIntoViewIfNeeded();
  await shot('01b-skill-tree-marksman-path', '.island-card-captain[open] .island-branch-marksman');
  await page.locator('.island-card-captain[open] .island-role').scrollIntoViewIfNeeded();
  await page.locator('.island-card-captain[open] .island-role-choice[data-role="engineer"]').click();
  await shot('02-role-choice', '.island-card-captain[open] .island-role');
  // The lobby: a game with crew mates who chose their roles.
  await page.evaluate(async () => {
    const island = window.__island.island;
    island.ui.close();
    await island.takeRole('gunner');
    await island.api.createGame();
    island.dev.addCrew('crew_ann', 'Ann', 'medic'); island.dev.addCrew('crew_bo', 'Bo', 'engineer'); island.dev.addCrew('crew_cy', 'Cy', null);
    island.enterGame?.({code: 'ISLE-K7Q2M', role: 'host'});
    island.openLobby();
  });
  await page.locator('.island-card-lobby[open] .island-lobby-role').first().waitFor({timeout: 15000});
  await shot('03-lobby-role-icons', '.island-card-lobby[open]');
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  console.log(await page.evaluate(() => ({dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.className), place: window.__island?.world?.current?.id})).catch(() => null));
  throw error;
} finally {
  await env.close?.();
}
