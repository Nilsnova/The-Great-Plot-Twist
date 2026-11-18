// The home island with the production flags (fake server): between waves and during a wave, desktop 1280x800
// and phone 375x812 at deviceScaleFactor 2. Used for before/after evidence of art integrations.
//   node scripts/capture-home-island-waves.mjs <output folder> <prefix>
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = (process.argv[2] ?? 'captures/home-island-waves').replace(/\/?$/, '/'), prefix = process.argv[3] ?? 'shot';
const FLAGS = 'live_presence,market,arena,sign_in,demo,sports,islands,placement,wall_recovery,arsenal,rescue,defenses_v2,'
  + 'tower_health,pathing,more_tower_spots,ship_fire,tower_obstacles,structure_recovery';
// [spot, kind, [[path, tier], ...]]: level-5 towers, some with upgrade paths so the path marks show.
const TOWERS = [['cannon_1', 'cannon', [['a', 1], ['a', 2]]], ['cannon_2', 'mortar', [['b', 1]]], ['cannon_3', 'harpoon', []],
  ['cannon_4', 'swivel', [['a', 1]]], ['cannon_5', 'culverin', []]];
const WALLS = ['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6'];
await mkdir(out, {recursive: true});
const env = await openWorldBrowser();
const errors = [], metrics = [];
// Mean frame interval over 3 s plus the renderer's draw calls and textures (software WebGL: compare runs, not devices).
const measure = page => page.evaluate(() => new Promise(resolve => {
  const info = window.__island.renderer.info, times = []; let last = performance.now();
  const step = now => { times.push(now - last); last = now; if (times.length < 90) requestAnimationFrame(step);
    else resolve({frameMs: +(times.slice(10).reduce((a, b) => a + b, 0) / (times.length - 10)).toFixed(1), calls: info.render.calls,
      triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries}); };
  requestAnimationFrame(step);
}));
try {
  for (const [width, height, label] of [[1280, 800, 'desktop-1280x800'], [375, 812, 'phone-375x812']]) {
    const context = await env.browser.newContext({viewport: {width, height}, deviceScaleFactor: 2});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils&fakeflags=${FLAGS}`);
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('.shell-screen[open]').waitFor();
    await page.locator('#play').click();
    for (let i = 0; i < 14; i++) {
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
    await page.addStyleTag({content: '.connection-banner,.u-toast,.demo-toast{display:none!important}'});
    await page.evaluate(async ([towers, walls]) => {
      const island = window.__island.island;
      island.dev.setWaveBest(30); island.dev.setCoins(400000); await island.load();
      for (const [spot, kind, steps] of towers) {
        await island.build(spot, kind);
        for (let level = 1; level < 5; level++) await island.upgrade(spot);
        for (const [path, tier] of steps) await island.buyTree(spot, path, tier);
      }
      for (const [i, spot] of walls.entries()) { await island.build(spot, 'wall'); for (let level = 1; level <= i % 5; level++) await island.upgrade(spot); }
      island.ui.close(); await island.load();
    }, [TOWERS, WALLS]);
    const clearDialogs = async () => {
      for (let i = 0; i < 30; i++) {
        if (!await page.locator('dialog[open]').count()) { await page.waitForTimeout(1500); if (!await page.locator('dialog[open]').count()) return; }
        const buttons = ['Skip all', 'Skip', 'Got it'].map(name => page.locator('dialog[open]').getByRole('button', {name: new RegExp(`^${name}`)}));
        let clicked = false;
        for (const item of buttons) if (!clicked && await item.count()) { await item.first().click().catch(() => {}); clicked = true; }
        if (!clicked) await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    };
    await clearDialogs();
    await page.evaluate(() => { const g = window.__island; g.player.position.set(-4, g.world.current.groundHeight?.(-4, 0) ?? 1.03, 0); g.view.setPlace(g.world.current.id, g.player.position); });
    await page.waitForTimeout(1500); await clearDialogs(); await settle(page);
    metrics.push({label, phase: 'between', ...await measure(page)});
    await page.screenshot({path: `${out}${prefix}-between-waves-${label}.png`}); console.log(`${out}${prefix}-between-waves-${label}.png`);
    await page.evaluate(() => window.__island.island.ringBell());
    await page.waitForFunction(() => (window.__island.waves.island.wave?.state?.ships?.length ?? 0) > 0, null, {timeout: 60000, polling: 200});
    await page.waitForFunction(() => (window.__island.waves.island.wave?.state?.boarders?.length ?? 0) > 0, null, {timeout: 60000, polling: 200}).catch(() => {});
    await page.waitForTimeout(1500); await clearDialogs(); await settle(page);
    const marks = await page.evaluate(() => window.__island.waves.island.wave?.renderer?.marks?.() ?? null);
    console.log(label, 'wave marks:', JSON.stringify(marks));
    metrics.push({label, phase: 'wave', ...await measure(page)});
    await page.screenshot({path: `${out}${prefix}-during-wave-${label}.png`}); console.log(`${out}${prefix}-during-wave-${label}.png`);
    await context.close();
  }
  console.log('metrics', JSON.stringify(metrics));
  if (errors.length) console.log('page errors:', errors); else console.log('no page errors');
} finally {
  await env.close();
}
