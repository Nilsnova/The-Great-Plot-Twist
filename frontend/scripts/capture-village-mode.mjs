// Local fake-transport evidence; root argument may point to an archived main frontend.
// node scripts/capture-village-mode.mjs <frontend-root> <output-dir> [manage]
import assert from 'node:assert/strict';
import {mkdir, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';

const root = resolve(process.argv[2] ?? '.'), out = resolve(process.argv[3] ?? '/tmp/coc49-evidence');
const manage = process.argv[4] === 'manage';
await mkdir(out, {recursive: true});
const server = await createServer({configFile: false, root, envDir: false, logLevel: 'error',
  cacheDir: await mkdtemp(join(tmpdir(), 'coc49-capture-')), define: {__BUILD_STAMP__: JSON.stringify({sha: 'local-evidence', builtAt: '2026-11-17T00:00:00Z'})},
  server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser;
const evidence = {transport: 'existing local fake island API; not live backend/login', managing: manage, root, screens: []};
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const context = await browser.newContext({viewport: {width, height}}), page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(base)) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await stubOfflineApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1'); localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    console.log(`${width}: open local game`);
    await page.goto(`${base}/?islands=fake&fakeplayer=coc49-evidence`);
    await page.locator('#play').click();
    await page.getByRole('button', {name: 'Create a game', exact: true}).click();
    await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    await page.evaluate(async () => {
      const g = window.__island; await g.island.build('cannon_1', 'cannon');
      g.settings.hour = 11; g.player.position.set(-7, 1.03, -11); g.view.setPlace('home_islet', g.player.position); g.renderer.domElement.focus();
    });
    let modeName = null;
    if (manage) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: 'Manage village', exact: true}).click();
      await page.locator('.island-village-mode:not([hidden])').waitFor();
      modeName = `mode-${width}x${height}.png`;
      const bounds = await page.locator('.island-village-mode').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
      assert.equal(await page.locator('.island-village-mode button').evaluate(button => {
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true, 'The visible Exit button is not covered by narrator captions or another overlay');
      await page.screenshot({path: join(out, modeName)});
    }
    console.log(`${width}: select distant cannon`);
    const at = await page.evaluate(() => {
      const g = window.__island, rect = g.renderer.domElement.getBoundingClientRect();
      const point = g.player.position.clone().set(-12.5, 14.5 * .72 + .7, 0).project(g.camera);
      return {x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2};
    });
    await page.mouse.click(at.x, at.y);
    if (manage) await page.locator('.island-card-build[open]').waitFor();
    const state = await page.evaluate(() => ({managing: window.__island.island.managing === true, card: !!document.querySelector('.island-card-build[open]')}));
    assert.equal(state.card, manage); assert.equal(state.managing, manage);
    const name = `${manage ? 'after' : 'before'}-${width}x${height}.png`;
    await page.screenshot({path: join(out, name)});
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    evidence.screens.push({width, height, name, modeName, state, errors, externalRequests: external.length});
    await context.close();
  }
  await writeFile(join(out, 'capture-results.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('2 viewports verified; browser errors: 0; external requests: 0');
} finally { await browser?.close(); await server.close(); }
