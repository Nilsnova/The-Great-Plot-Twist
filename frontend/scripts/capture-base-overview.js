// Real game + fake island transport, before (one detail card) and after (overview).
// node scripts/capture-base-overview.js [folder]
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const folder = process.argv[2] ?? 'captures/coc31-base-overview';
await mkdir(folder, {recursive: true});
const env = await openWorldBrowser(), {page} = env, shots = [];
const closeCards = async () => {
  for (let n = 0; n < 5 && await page.locator('dialog[open]').count(); n++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  }
};
try {
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Johannes`);
  await page.evaluate(() => {
    localStorage.clear(); sessionStorage.clear();
    // A progressed-base fixture represents a returning player who saw arrival.
    localStorage.setItem('plot_twist_island_arrival_v1', '1');
  });
  await page.reload(); await page.locator('#play').click();
  for (let n = 0; n < 12; n++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 40000});
    if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('.games-card[open]').count()) await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    else if (await page.locator('.island-card-lobby[open]').count()) await page.locator('.island-card-lobby[open] .island-lobby-start').click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(300);
  }
  await closeCards();
  await page.evaluate(async () => {
    const i = window.__island.island;
    window.__island.settings.hour = 12;
    i.dev.setWaveBest(30); i.dev.setCoins(6000); await i.load();
    for (const [id, kind, level] of [['cannon_1', 'cannon', 2], ['cannon_2', 'mortar', 1], ['cannon_6', 'swivel', 2],
      ['wall_1', 'wall', 1], ['wall_2', 'wall', 3], ['tower_1', 'watchtower', 2], ['house_1', 'house', 3]]) {
      await i.build(id, kind); for (let n = 1; n < level; n++) await i.upgrade(id);
    }
    await i.specialise('house_1', 'tavern'); i.ui.close();
  });
  await closeCards();
  // The fixture jumps campaign milestones, which can queue optional narration.
  // Use the real Skip controls before photographing the normal island UI.
  for (let n = 0; n < 25; n++) {
    await page.evaluate(() => (document.querySelector('dialog.cutscene[open] .cutscene-skip')
      ?? document.querySelector('.narrator-card:not([hidden]) .narrator-skip'))?.click());
    await page.waitForTimeout(100);
  }
  await closeCards(); await page.waitForTimeout(1000);
  assert.equal(await page.locator('dialog.cutscene[open]').count(), 0, 'arrival cutscene has finished');
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    await page.setViewportSize({width, height});
    for (const phase of ['before', 'after']) {
      await page.evaluate(phase => {
        const i = window.__island.island; i.ui.close();
        if (phase === 'before') i.pick('cannon_1'); else i.openOverview();
      }, phase);
      await page.locator('.island-card[open]').waitFor(); await settle(page);
      const rows = await page.locator('.base-overview-row').count();
      if (phase === 'after') assert.equal(rows, 7, 'every built building appears in the real overview');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal document overflow');
      const file = `${phase}-${width}x${height}.png`;
      await page.screenshot({path: `${folder}/${file}`}); shots.push({file, phase, width, height, rows});
    }
  }
  assert.deepEqual(env.pageErrors, []);
  await writeFile(`${folder}/report.json`, JSON.stringify({shots, pageErrors: env.pageErrors,
    note: 'Actual game UI using fake island data. Before is the unchanged single-building detail card; after is the new read-only base overview.'}, null, 2));
  console.log('4 screenshots passed; overview rows: 7; browser errors: 0; horizontal overflow: 0.');
} finally { await env.close(); }
