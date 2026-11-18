// The path plates (src/art/path-marks.js) in the real game with the fake server (?islands=fake): six level-5 towers with
// different trees on the island between waves, then the same towers in a wave (drawn by src/pirates/render.js).
//   node scripts/capture-path-visuals-live.js [output folder] [1280x800] [deviceScaleFactor]
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? new URL('../../docs/evidence/path-visuals/', import.meta.url).pathname;
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number), dpr = Number(process.argv[4] ?? 2);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser();
const context = await env.browser.newContext({viewport: {width, height}, deviceScaleFactor: dpr});
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
// [spot, kind, [[path, tier], ...]]: bought in order, as the Bloons rule allows.
const TOWERS = [['cannon_1', 'cannon', [['a', 1], ['a', 2], ['a', 3], ['b', 1]]], ['cannon_2', 'mortar', [['b', 1], ['b', 2]]],
  ['cannon_3', 'harpoon', [['a', 1], ['a', 2]]], ['cannon_4', 'swivel', [['a', 1], ['b', 1]]], ['cannon_5', 'cannon', [['b', 1], ['b', 2], ['b', 3]]],
  ['cannon_6', 'mortar', []]];
try {
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
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
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && window.__island.waves && !document.querySelector('dialog[open]'));
  await page.evaluate(() => { window.__island.settings.hour = 11; });
  // The offline QA server has no /api/config: hide its connection banner and the story toasts so the art shows.
  await page.addStyleTag({content: '.connection-banner,.u-toast,.demo-toast{display:none!important}'});
  const built = await page.evaluate(async towers => {
    const island = window.__island.island;
    island.dev.setWaveBest(50); island.dev.setCoins(400000); await island.load();
    for (const [spot, kind, steps] of towers) {
      await island.build(spot, kind);
      for (let level = 1; level < 5; level++) await island.upgrade(spot);
      for (const [path, tier] of steps) await island.buyTree(spot, path, tier);
    }
    island.ui.close();
    await island.load();
    return window.__island.scene.getObjectByName('island').children.filter(node => node.name.startsWith('island-mark:')).map(node => `${node.name}=${node.userData.mark}`);
  }, TOWERS);
  console.log('island marks:', built.join(' '));
  // Any cutscene or card the builds opened (a milestone) goes first.
  const clearDialogs = async () => {
    for (let i = 0; i < 30; i++) {
      if (!await page.locator('dialog[open]').count()) { await page.waitForTimeout(1500); if (!await page.locator('dialog[open]').count()) return; }
      const button = ['Skip all', 'Skip', 'Got it'].map(name => page.locator('dialog[open]').getByRole('button', {name: new RegExp(`^${name}`)}));
      let clicked = false;
      for (const item of button) if (!clicked && await item.count()) { await item.first().click().catch(() => {}); clicked = true; }
      if (!clicked) await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  };
  await clearDialogs();
  // Stand in the middle of the towers (their meshes' ground points).
  const where = await page.evaluate(() => window.__island.scene.getObjectByName('island').children
    .filter(node => /^island-(cannon|mortar|harpoon|swivel):cannon_/.test(node.name)).map(node => [node.name, node.userData.ground.x, node.userData.ground.z]));
  console.log('towers at:', JSON.stringify(where));
  // The west towers (cannon_1 a3+b1, cannon_5 b3) side by side; the wave camera then shows the whole island.
  const west = where.filter(item => /cannon_[15]$/.test(item[0]));
  const [cx, cz] = west.reduce(([x, z], item) => [x + item[1] / west.length, z + item[2] / west.length + 1.5 / west.length], [0, 0]);
  await page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [cx, cz]);
  await page.waitForTimeout(800); await settle(page);
  const name = `${width}x${height}`;
  await clearDialogs();
  await page.screenshot({path: `${out}island-live-${name}.png`}); console.log(`${out}island-live-${name}.png`);
  await page.evaluate(() => window.__island.island.ringBell());
  await page.waitForFunction(() => (window.__island.waves.island.wave?.state?.ships?.length ?? 0) > 0, null, {timeout: 60000, polling: 200});
  await page.waitForTimeout(4000); await clearDialogs(); await settle(page);
  const marks = await page.evaluate(() => window.__island.waves.island.wave?.renderer?.marks?.() ?? null);
  console.log('wave marks:', JSON.stringify(marks));
  await page.screenshot({path: `${out}wave-live-${name}.png`}); console.log(`${out}wave-live-${name}.png`);
  if (errors.length) console.log('page errors:', errors);
} finally {
  await context.close();
  await env.close();
}
