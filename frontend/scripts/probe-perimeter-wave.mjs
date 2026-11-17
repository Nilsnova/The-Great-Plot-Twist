// Fast diagnostic only: paid ring preparation uses public controllers, not the final full UI evidence.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
import {boot, manage, settleCards} from './perimeter-game-ui.mjs';
import {capturePerimeterWave} from './perimeter-game-wave.mjs';
const root = resolve(process.argv[2]), out = resolve(process.argv[3]); await mkdir(out, {recursive: true});
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const fixture = JSON.parse(await readFile(join(root, 'tests/pirates/fixtures/perimeter-ring.json'), 'utf8'));
const cells = (fixture.cells ?? fixture.ring).map(([x, z]) => ({x, z}));
const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error', cacheDir: await mkdtemp(join(tmpdir(), 'perimeter-wave-probe-')),
  define: {__BUILD_STAMP__: JSON.stringify({sha: source, builtAt: new Date().toISOString()})}, server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser, page; const errors = [], external = [];
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  page = await browser.newPage({viewport: {width: 1280, height: 720}});
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()), route.abort()));
  await stubOfflineApi(page); await page.addInitScript(() => {
    localStorage.setItem('plot_twist_front_door_v1', '1'); localStorage.setItem('plot_twist_island_arrival_v1', '1');
    localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
  });
  await page.clock.install(); await boot(page, `${base}/?islands=fake&fakeworld=perimeter_probe&fakeplayer=me&fakeflags=perimeter_walls,wall_recovery`);
  await page.evaluate(async () => {
    const g = window.__island; await g.island.dev.setCoins(5000); await g.island.dev.setWaveBest(7); await g.island.load();
    g.settings.hour = 11; g.settings.fastTime = false; g.player.position.set(8.5, 1.03, 12.8); g.view.setPlace('home_islet', g.player.position);
  });
  await settleCards(page); await manage(page);
  await page.evaluate(async cells => {
    const i = window.__island.island;
    for (let start = 0; start < cells.length; start += 32) {
      if (!await i.startWalls()) throw new Error('probe could not enter real builder');
      for (const p of cells.slice(start, start + 32)) if (!i.wallBuilder.tap(p.x, p.z)) throw new Error('probe draft refused');
      const quote = await i.wallBuilder.quote(); if (!quote?.ok) throw new Error(`probe quote refused: ${quote?.message}`);
      const built = await i.wallBuilder.confirm(); if (!built?.ok) throw new Error(`probe payment refused: ${built?.message}`);
    }
  }, cells);
  const wave = await capturePerimeterWave(page, out, 1280, 720);
  const cannon = await page.evaluate(async () => (await import('/scripts/cannon-style-fixture.js')).verifyCannonStyle());
  assert.equal(cannon.results.length, 40); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(join(out, 'probe-report.json'), JSON.stringify({source, fixture: 'public-controller paid preparation; actual nearby-captain normal bell; fast diagnostic only',
    wave, cannon: cannon.results, pageErrors: errors, externalRequests: external}, null, 2) + '\n');
  console.log('PASS: normal bell preserved frozen102-wall demo, actual live joins breached correctly and40 shared cannon frames passed');
} catch (error) {
  const observed = await page?.evaluate(() => {
    const g = window.__island, w = g?.waves?.island?.wave;
    return {apiDemo: g?.island?.flow?.current?.wave?.perimeterDemo ?? null, controllerInfo: w?.info ?? null, state: w?.state ?? null};
  }).catch(() => null);
  await writeFile(join(out, 'probe-failure.json'), JSON.stringify({source, error: error.message, observed, errors, external}, null, 2) + '\n'); throw error;
} finally { await browser?.close(); await server.close(); }
